#!/usr/bin/env python3
import http.server
import socketserver
import json
import subprocess
import os
import shutil
import glob
import urllib.parse

PORT = 8081
DOWNLOAD_DIR = "/home/horyu/Projetos/independent-radio-portal/temp_downloads"

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


class ImportHandler(http.server.BaseHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def do_POST(self):
        if self.path == '/import':
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            
            try:
                data = json.loads(post_data.decode('utf-8'))
                url = data.get('url')
                
                if not url:
                    self.send_error_response("URL não fornecida.")
                    return
                
                # Validar se a URL é HTTP/HTTPS para evitar SSRF e caminhos locais indesejados
                if not is_valid_url(url):
                    self.send_error_response("URL inválida ou protocolo não suportado (apenas HTTP/HTTPS).")
                    return
                
                # Verificar se a senha do SUDO está configurada
                sudo_password = os.environ.get("SUDO_PASSWORD")
                if not sudo_password:
                    self.send_error_response("Configuração incompleta: SUDO_PASSWORD não configurada no servidor (.env).")
                    return

                # Criar diretório temporário
                os.makedirs(DOWNLOAD_DIR, exist_ok=True)
                
                # 1. Baixar o áudio via yt-dlp de forma segura
                print(f"[Import Server] Baixando URL: {url}")
                yt_cmd = [
                    "yt-dlp",
                    "-x",
                    "--audio-format", "mp3",
                    "--audio-quality", "0",
                    "-o", f"{DOWNLOAD_DIR}/%(title)s.%(ext)s",
                    "--",
                    url
                ]
                
                download_result = subprocess.run(yt_cmd, capture_output=True, text=True)
                
                if download_result.returncode != 0:
                    print(f"[Import Server] Erro no download: {download_result.stderr}")
                    self.send_error_response(f"Erro ao baixar do YouTube: {download_result.stderr}")
                    return
                
                # Identificar arquivos baixados
                downloaded_files = glob.glob(f"{DOWNLOAD_DIR}/*.mp3")
                if not downloaded_files:
                    self.send_error_response("Nenhum arquivo MP3 foi gerado.")
                    return
                
                print(f"[Import Server] Arquivos baixados: {downloaded_files}")
                
                # 2. Copiar para o container Docker
                # Nota: Copiamos o conteúdo da pasta de downloads temporários para a pasta de mídia da rádio
                # Executado de forma segura sem shell=True, enviando a senha via stdin
                cp_cmd = [
                    "sudo", "-S", "docker", "cp",
                    f"{DOWNLOAD_DIR}/.",
                    "azuracast:/var/azuracast/stations/radio_criativa/media/"
                ]
                subprocess.run(cp_cmd, input=f"{sudo_password}\n", text=True, check=True)
                
                # 3. Ajustar as permissões de arquivos no container
                # O proprietário dos arquivos de mídia deve ser o usuário azuracast (UID 1000)
                chown_cmd = [
                    "sudo", "-S", "docker", "exec", "-u", "0", "azuracast",
                    "chown", "-R", "azuracast:azuracast",
                    "/var/azuracast/stations/radio_criativa/media/"
                ]
                subprocess.run(chown_cmd, input=f"{sudo_password}\n", text=True, check=True)
                
                # 4. Acionar o reprocessamento de mídia no AzuraCast (atualiza banco de dados)
                reprocess_cmd = [
                    "sudo", "-S", "docker", "exec", "-u", "azuracast", "azuracast",
                    "azuracast_cli", "azuracast:media:reprocess"
                ]
                subprocess.run(reprocess_cmd, input=f"{sudo_password}\n", text=True, check=True)
                
                # Limpar diretório temporário
                shutil.rmtree(DOWNLOAD_DIR)
                
                # Enviar resposta de sucesso
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                response = {
                    "status": "success",
                    "message": "Playlist/Mídia importada e indexada no AzuraCast com sucesso!",
                    "files": [os.path.basename(f) for f in downloaded_files]
                }
                self.wfile.write(json.dumps(response).encode('utf-8'))
                print("[Import Server] Importação concluída com sucesso!")
                
            except Exception as e:
                print(f"[Import Server] Erro interno: {str(e)}")
                self.send_error_response(f"Erro interno do servidor: {str(e)}")
        else:
            self.send_response(404)
            self.end_headers()

    def do_GET(self):
        if self.path == '/stream':
            import urllib.request
            stream_url = "http://localhost/listen/radio_criativa/radio.mp3"
            try:
                req = urllib.request.Request(stream_url)
                # Faz requisição simples para o AzuraCast (sem Range)
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
                        # Conexão encerrada pelo navegador (player pausado)
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
    # Carregar variáveis de ambiente do arquivo .env local se existir
    load_dotenv()
    
    # Garantir que a pasta temporária de downloads esteja limpa ao iniciar
    if os.path.exists(DOWNLOAD_DIR):
        shutil.rmtree(DOWNLOAD_DIR)
    
    handler = ImportHandler
    with socketserver.TCPServer(("", PORT), handler) as httpd:
        print(f"[Import Server] Servidor de Importação ativo na porta {PORT}...")
        httpd.serve_forever()
