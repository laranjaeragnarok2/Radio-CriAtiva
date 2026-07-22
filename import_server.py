#!/usr/bin/env python3
import http.server
import socketserver
import json
import subprocess
import os
import shutil
import glob
import urllib.parse
import urllib.request
import threading
import time
import re

PORT = 8081
DOWNLOAD_DIR_BASE = "/home/horyu/Projetos/independent-radio-portal/temp_downloads"

# Armazenamento de tarefas de importação em segundo plano
TASKS = {}
TASKS_LOCK = threading.Lock()

def load_dotenv(dotenv_path=".env"):
    if os.path.exists(dotenv_path):
        with open(dotenv_path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#"):
                    continue
                if "=" in line:
                    key, val = line.split("=", 1)
                    key = key.strip()
                    val = val.strip().strip("'\"")
                    os.environ[key] = val

def is_valid_url(url_str):
    try:
        parsed = urllib.parse.urlparse(url_str)
        return parsed.scheme in ('http', 'https') and bool(parsed.netloc)
    except Exception:
        return False

def run_async_import(task_id, url, sudo_password):
    task_dir = os.path.join(DOWNLOAD_DIR_BASE, task_id)
    try:
        os.makedirs(task_dir, exist_ok=True)
        
        with TASKS_LOCK:
            TASKS[task_id]["status"] = "downloading"
            TASKS[task_id]["percent"] = 5
            TASKS[task_id]["message"] = "Iniciando o download do áudio..."
        
        print(f"[Import Server Task {task_id}] Baixando URL: {url}")
        
        yt_cmd = [
            "yt-dlp",
            "-x",
            "--audio-format", "mp3",
            "--audio-quality", "0",
            "--newline",
            "-o", f"{task_dir}/%(title)s.%(ext)s",
            "--",
            url
        ]
        
        process = subprocess.Popen(yt_cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
        
        # Expressão regular para capturar percentual do yt-dlp: [download] 45.2% of ...
        percent_regex = re.compile(r'\[download\]\s+(\d+(?:\.\d+)?)%')
        
        for line in iter(process.stdout.readline, ''):
            if not line:
                break
            match = percent_regex.search(line)
            if match:
                parsed_pct = float(match.group(1))
                # Normaliza para a escala 5% - 75%
                calc_pct = round(5 + (parsed_pct * 0.70), 1)
                with TASKS_LOCK:
                    TASKS[task_id]["percent"] = calc_pct
                    TASKS[task_id]["message"] = f"Baixando mídia... ({parsed_pct:.1f}%)"
        
        process.wait()
        
        if process.returncode != 0:
            raise Exception("Ocorreu uma falha ao baixar a mídia com o yt-dlp.")
        
        downloaded_files = glob.glob(f"{task_dir}/*.mp3")
        if not downloaded_files:
            raise Exception("Nenhum arquivo MP3 foi gerado após o download.")
        
        with TASKS_LOCK:
            TASKS[task_id]["status"] = "copying"
            TASKS[task_id]["percent"] = 80
            TASKS[task_id]["message"] = "Enviando mídias para o servidor AzuraCast..."
        
        print(f"[Import Server Task {task_id}] Copiando {len(downloaded_files)} arquivo(s)...")
        
        cp_cmd = [
            "sudo", "-S", "docker", "cp",
            f"{task_dir}/.",
            "azuracast:/var/azuracast/stations/radio_criativa/media/"
        ]
        subprocess.run(cp_cmd, input=f"{sudo_password}\n", text=True, check=True)
        
        chown_cmd = [
            "sudo", "-S", "docker", "exec", "-u", "0", "azuracast",
            "chown", "-R", "azuracast:azuracast",
            "/var/azuracast/stations/radio_criativa/media/"
        ]
        subprocess.run(chown_cmd, input=f"{sudo_password}\n", text=True, check=True)
        
        with TASKS_LOCK:
            TASKS[task_id]["status"] = "indexing"
            TASKS[task_id]["percent"] = 90
            TASKS[task_id]["message"] = "Indexando faixas no banco do AzuraCast..."
        
        reprocess_cmd = [
            "sudo", "-S", "docker", "exec", "-u", "azuracast", "azuracast",
            "azuracast_cli", "azuracast:media:reprocess"
        ]
        subprocess.run(reprocess_cmd, input=f"{sudo_password}\n", text=True, check=True)
        
        filenames = [os.path.basename(f) for f in downloaded_files]
        with TASKS_LOCK:
            TASKS[task_id]["status"] = "completed"
            TASKS[task_id]["percent"] = 100
            TASKS[task_id]["message"] = f"Importação concluída com sucesso! ({len(filenames)} faixas adicionadas)"
            TASKS[task_id]["files"] = filenames
            
        print(f"[Import Server Task {task_id}] Sucesso!")
        
    except Exception as err:
        print(f"[Import Server Task {task_id}] Erro: {err}")
        with TASKS_LOCK:
            TASKS[task_id]["status"] = "error"
            TASKS[task_id]["percent"] = 0
            TASKS[task_id]["error"] = str(err)
            TASKS[task_id]["message"] = f"Falha na importação: {str(err)}"
    finally:
        if os.path.exists(task_dir):
            shutil.rmtree(task_dir, ignore_errors=True)


class ImportHandler(http.server.BaseHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def do_POST(self):
        if self.path == '/import':
            content_length = int(self.headers.get('Content-Length', 0))
            post_data = self.rfile.read(content_length)
            
            try:
                data = json.loads(post_data.decode('utf-8'))
                url = data.get('url')
                
                if not url:
                    self.send_error_response("URL não fornecida.")
                    return
                
                if not is_valid_url(url):
                    self.send_error_response("URL inválida ou protocolo não suportado (apenas HTTP/HTTPS).")
                    return
                
                sudo_password = os.environ.get("SUDO_PASSWORD")
                if not sudo_password:
                    self.send_error_response("Configuração incompleta: SUDO_PASSWORD não configurada no servidor (.env).")
                    return

                task_id = f"task_{int(time.time())}"
                
                with TASKS_LOCK:
                    TASKS[task_id] = {
                        "id": task_id,
                        "url": url,
                        "status": "queued",
                        "percent": 0,
                        "message": "Tarefa adicionada à fila de importação...",
                        "files": [],
                        "error": None
                    }
                
                # Inicia tarefa em segundo plano
                t = threading.Thread(target=run_async_import, args=(task_id, url, sudo_password), daemon=True)
                t.start()
                
                self.send_response(202)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                response = {
                    "status": "queued",
                    "task_id": task_id,
                    "message": "Importação iniciada em segundo plano."
                }
                self.wfile.write(json.dumps(response).encode('utf-8'))
                
            except Exception as e:
                self.send_error_response(f"Erro interno ao criar tarefa: {str(e)}")
                
        elif self.path == '/api/notify-live':
            content_length = int(self.headers.get('Content-Length', 0))
            post_data = self.rfile.read(content_length)
            try:
                data = json.loads(post_data.decode('utf-8'))
                webhook_url = data.get('webhook_url', '').strip()
                dj_name = data.get('dj_name', 'DJ Anônimo')
                show_title = data.get('show_title', 'Sessão ao Vivo')
                platform = data.get('platform', 'discord').lower()
                
                payload = {
                    "username": "Rádio CriAtiva Live Bot",
                    "avatar_url": "https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=200",
                    "content": f"🚨 **ESTAMOS AO VIVO NA RÁDIO CRIATIVA!** 🎙️📻\n\n**Apresentador**: {dj_name}\n**Programa**: {show_title}\n**Sintonize agora**: http://localhost (ou ouça no portal)",
                    "embeds": [
                        {
                            "title": f"📻 {show_title} - com {dj_name}",
                            "description": "Transmission started live from our independent analog decks!",
                            "color": 16711935,
                            "fields": [
                                {"name": "Status", "value": "🟢 NO AR", "inline": True},
                                {"name": "Frequência", "value": "90.9 MHz / Web", "inline": True}
                            ]
                        }
                    ]
                }
                
                # Se houver webhook real, faz a requisição
                sent_real = False
                if webhook_url and is_valid_url(webhook_url):
                    req_data = json.dumps(payload).encode('utf-8')
                    req = urllib.request.Request(webhook_url, data=req_data, headers={'Content-Type': 'application/json', 'User-Agent': 'RadioCriAtivaBot/1.0'})
                    try:
                        with urllib.request.urlopen(req, timeout=5) as res:
                            sent_real = True
                    except Exception as err:
                        print(f"[Import Server] Erro ao enviar webhook real: {err}")
                
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                res_data = {
                    "status": "success",
                    "sent_real": sent_real,
                    "message": "Notificação ao vivo disparada e formatada com sucesso!",
                    "payload": payload
                }
                self.wfile.write(json.dumps(res_data).encode('utf-8'))
                
            except Exception as e:
                self.send_error_response(f"Erro ao processar notificação: {str(e)}")
        else:
            self.send_response(404)
            self.end_headers()

    def do_GET(self):
        parsed_url = urllib.parse.urlparse(self.path)
        
        if parsed_url.path == '/import-status':
            query_params = urllib.parse.parse_qs(parsed_url.query)
            task_id = query_params.get('task_id', [None])[0]
            
            if not task_id or task_id not in TASKS:
                self.send_error_response("Tarefa de importação não encontrada.")
                return
            
            with TASKS_LOCK:
                task_data = dict(TASKS[task_id])
                
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps(task_data).encode('utf-8'))
            
        elif parsed_url.path == '/stream':
            stream_url = "http://localhost/listen/radio_criativa/radio.mp3"
            try:
                req = urllib.request.Request(stream_url)
                with urllib.request.urlopen(req) as response:
                    self.send_response(200)
                    self.send_header('Content-Type', 'audio/mpeg')
                    self.send_header('Accept-Ranges', 'none')
                    self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
                    self.send_header('Pragma', 'no-cache')
                    self.send_header('Expires', '0')
                    self.send_header('Access-Control-Allow-Origin', '*')
                    self.end_headers()
                    
                    try:
                        while True:
                            chunk = response.read(1024 * 8)
                            if not chunk:
                                break
                            self.wfile.write(chunk)
                    except (ConnectionResetError, BrokenPipeError):
                        pass
            except Exception as e:
                print(f"[Import Server] Erro no proxy de stream: {e}")
                self.send_response(500)
                self.end_headers()
        else:
            self.send_response(404)
            self.end_headers()

    def send_error_response(self, message):
        self.send_response(400)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        response = {
            "status": "error",
            "message": message
        }
        self.wfile.write(json.dumps(response).encode('utf-8'))

if __name__ == '__main__':
    load_dotenv()
    
    if os.path.exists(DOWNLOAD_DIR_BASE):
        shutil.rmtree(DOWNLOAD_DIR_BASE, ignore_errors=True)
    
    handler = ImportHandler
    with socketserver.TCPServer(("", PORT), handler) as httpd:
        print(f"[Import Server] Servidor de Importação ativo na porta {PORT}...")
        httpd.serve_forever()

