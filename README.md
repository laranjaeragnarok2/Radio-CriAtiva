# Rádio CriAtiva - Portal de Rádio Livre & Hub de Artistas

Este é o portal web oficial da **Rádio CriAtiva**, um hub moderno para transmissão de rádio online integrada ao **AzuraCast**, focado em artistas independentes e no futuro da descentralização.

O design possui uma estética premium retro anos 90 com elementos futuristas de Web3, simulando um deck de fita cassete funcional, chat interativo de ouvintes e um portal para artistas enviarem suas produções.

---

## 📻 Funcionalidades do MVP

1. **Player de Cassete Retro**: Interface visual inspirada nos decks de fita dos anos 90, com animação realista de rotação de fita, botões físicos e equalizador LED baseado na Web Audio API.
2. **Metadados em Tempo Real (Now Playing)**: Exibição da faixa atual, artista, capa do álbum e quantidade de ouvintes ativos sincronizados diretamente com a API do AzuraCast (ou simulada).
3. **Mural da Comunidade (Chat)**: Um chat simulado em tempo real que simula a interação de ouvintes da comunidade para fins de demonstração.
4. **Portal de Submissão de Músicas**: Interface de drag & drop para que artistas enviem suas faixas e configurem suas licenças (ex: Creative Commons).
5. **Integração com Web3 e IPFS (Demonstração)**: Simulação de conexão com carteiras Ethereum (ex: MetaMask) e publicação/geração de IDs IPFS (CIDs) e hashes de transação blockchain para música descentralizada.
6. **Servidor Local de Importação de Playlists**: Um serviço em Python para baixar e injetar faixas do YouTube/SoundCloud diretamente na playlist de AutoDJ do AzuraCast local.

---

## 🛠️ Arquitetura Técnica

O projeto é dividido em três camadas principais:
* **Frontend**: SPA construído inteiramente com HTML5 semântico, CSS3 (Vanilla com HSL, degradês e microanimações) e JavaScript ES6+.
* **Servidor de Transmissão (Backend)**: Instalação do [AzuraCast](https://www.azuracast.com/) via Docker contendo Liquidsoap (AutoDJ) e Icecast (Streaming).
* **Daemon de Download (`import_server.py`)**: Um servidor web local leve em Python 3 para automação de download via `yt-dlp` e gerenciamento de arquivos de mídia dentro do container Docker.

---

## 🚀 Instalação e Execução

### 1. Backend da Rádio (AzuraCast)
Consulte o guia detalhado de infraestrutura e instalação do servidor em [REQUISITOS.md](file:///home/horyu/Projetos/independent-radio-portal/REQUISITOS.md). Ele ensina como rodar o AzuraCast localmente ou implantá-lo em uma VPS de produção.

### 2. Frontend
Como é um projeto Vanilla HTML/JS, basta abrir o arquivo [index.html](file:///home/horyu/Projetos/independent-radio-portal/index.html) diretamente no seu navegador, ou rodar através de qualquer servidor de desenvolvimento local, por exemplo:
```bash
# Se tiver Python instalado
python3 -m http.server 8000
```
Depois acesse `http://localhost:8000`.

### 3. Servidor de Download e Importação (`import_server.py`)
Para que o botão de importar URLs no painel da rádio funcione, o script Python de download local precisa estar rodando:

#### Pré-requisitos
Certifique-se de que o `yt-dlp` esteja instalado na sua máquina:
```bash
sudo curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp
sudo chmod a+rx /usr/local/bin/yt-dlp
```

#### Configuração de Segurança (.env)
Crie um arquivo `.env` no diretório raiz do projeto (este arquivo já é ignorado pelo `.gitignore`) com a sua senha de privilégios de administrador:
```env
SUDO_PASSWORD=sua_senha_local
```

#### Executar o Servidor de Importação
Inicie o script Python no terminal:
```bash
python3 import_server.py
```
O servidor escutará na porta `8081` para receber solicitações de downloads de mídia do front-end.

---

## 🔒 Boas Práticas e Segurança Aplicadas

Este projeto foi auditado e ajustado seguindo critérios rigorosos de segurança:

1. **Proteção Contra Vazamento de Credenciais**:
   * A senha de administrador/sudo que anteriormente ficava exposta estaticamente no código foi removida.
   * O sistema agora lê a senha localmente a partir de variáveis de ambiente carregadas via arquivo `.env`.
   * O `.gitignore` foi configurado para proibir o upload de qualquer arquivo `.env`, `.env.local` ou chaves de ambiente.
2. **Execução Segura de Subprocessos**:
   * O script Python foi modificado para não usar execução com shell (`shell=True`), eliminando vulnerabilidades de Command Injection.
   * A senha do sudo agora é enviada de forma privada e segura através de stdin (`input`), não sendo visível em logs de processos do sistema (`ps`).
   * Os argumentos do `yt-dlp` utilizam o delimitador `--` para prevenir ataques de injeção de parâmetros nas opções da CLI.
3. **Prevenção de XSS via DOM**:
   * No frontend, todos os títulos e nomes de arquivos baixados da internet são higienizados por uma função escapadora de caracteres especiais (`escapeHTML`) antes de serem adicionados via `innerHTML`.
4. **Validação de Inputs**:
   * O servidor de importação valida que os links submetidos começam estritamente por esquemas autorizados (`http` ou `https`), mitigando riscos de SSRF e acesso a caminhos locais (Local File Inclusion).

> [!WARNING]
> **Histórico do Git**: Como commits anteriores expuseram a senha local no histórico de commits do repositório, recomenda-se alterar a senha do usuário Linux na sua máquina ou, se desejar purgar a credencial por completo do Git, recriar o repositório ou rodar ferramentas de limpeza de histórico (como `git filter-repo`).

---

## 🔮 Roteiro de Descentralização

O desenvolvimento contínuo da Rádio CriAtiva visa descentralizar a música independente:
* **Web3 real**: Integração com a carteira MetaMask e contratos inteligentes da rede Ethereum/EVM para doações de microtransações diretas ao artista atual por meio de cripto.
* **Hospedagem IPFS**: Distribuição P2P de arquivos de áudio dos artistas usando o IPFS, garantindo resiliência contra censura e alta disponibilidade de download.
* **Governança Comunitária (DAO)**: Votação baseada em tokens da comunidade para curadoria e decisão da grade de programação da rádio.
