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

## 🔮 Roteiro de Aprimoramentos & Descentralização

O desenvolvimento contínuo da **Rádio CriAtiva** está dividido em quatro fases incrementais de infraestrutura, interface e inovação descentralizada:

### Fase 1: Estabilização de Transmissão e Contingência 🛠️
* **Configuração de Contingência (Fallback)**: Upload de vinhetas e músicas institucionais sob o menu `Arquivo Fallback Personalizado` no AzuraCast. Garante áudio contínuo e metadados descritivos customizados mesmo quando o DJ estiver offline.
* **AutoDJ Automatizado**: Configuração de playlists locais na aba `Mídia` e ativação do AutoDJ para transição suave (crossfade) quando a live do Mixxx for interrompida.
* **Sincronização de Relógio de Áudio**: Ajuste fino do motor de áudio no Mixxx para alinhamento estrito de latência e redução de Xruns.

### Fase 2: Experiência Visual e Interatividade 🎨
* **Equalizador LED Dinâmico**: Otimização do analisador de áudio no front-end para usar buffers de FFT (Fast Fourier Transform) mais precisos na simulação das luzes LED do cassete.
* **Mural Dinâmico com Websockets**: Substituição do chat simulado por uma integração real baseada em Websockets conectados a uma sala de chat persistente de ouvintes.
* **Customizador de Fita Cassete**: Recurso para o ouvinte alterar cores de adesivos e skins da fita (Vaporwave, Synthwave, Dark Mode).

### Fase 3: Automação Administrativa & Bots 🤖
* **Injeção Inteligente de Faixas**: Melhorar o `import_server.py` com uma fila assíncrona de download de URLs do YouTube/Soundcloud e notificação de progresso no painel administrativo do portal.
* **Bot de Notificações Discord/Telegram**: Disparador automático via Webhooks do AzuraCast para anunciar em redes sociais e chats da rádio assim que o DJ entrar "AO VIVO".
* **Relatórios e Analytics**: Painel administrativo simplificado integrado para visualizar histórico de faixas tocadas e audiência geolocalizada.

### Fase 4: Descentralização Completa (Web3 & IPFS) 🌐
* **Conexão Real Web3**: Integração funcional com a extensão MetaMask para validação de carteira de ouvintes e artistas.
* **Hospedagem IPFS P2P**: Upload das músicas enviadas no Portal do Artista diretamente para a rede descentralizada IPFS usando Pinning Services (Pinata, Web3.Storage), retornando a CID criptográfica.
* **Dicas e Doações On-Chain**: Smart contracts na rede Polygon/Ethereum para permitir micro-doações em tempo real (dips/tips em cripto) diretamente da carteira do ouvinte para a carteira cadastrada do artista que está tocando.

---

## 📡 Solução Técnica de Rede: Correção de Reprodução (Chromium Bypass)

Os navegadores baseados em Chromium (Brave, Google Chrome, Opera) possuem um comportamento restritivo ao lidar com fluxos de áudio MP3 transmitidos por servidores Icecast em conexões locais. O Icecast responde a sondagens de cabeçalhos de faixa (Range Requests) retornando um tamanho sobressalente inválido, interpretado pelo navegador como um arquivo inacessível de **18 Exabytes**, travando a reprodução e gerando erro de fonte não suportada (`NotSupportedError`).

### A Solução Aplicada no Proxy do Servidor:
Configuramos a rota de entrega de fluxo do Nginx (`nginx.conf` da estação dentro do container Docker) e o nosso proxy (`import_server.py`) para **interceptar e anular** requisições de range do navegador:
1. Removemos o cabeçalho `Range` de entrada.
2. Ocultamos os cabeçalhos `Accept-Ranges` e `Content-Range` de saída do Icecast.
3. Forçamos a injeção do cabeçalho `Accept-Ranges: none` na resposta.

Isso faz com que o navegador processe a transmissão como um fluxo de áudio contínuo e progressivo, eliminando qualquer travamento ou ruído em qualquer navegador do ecossistema.

---

## 🎙️ Guia de Resolução de Problemas: Microfone Craquelando no Linux

Se o seu microfone apresentar um som craquelado, robótico ou com estalos e cortes frequentes na transmissão do Mixxx, isso indica a ocorrência de **Xruns (Buffer Underruns)**: o processador não está conseguindo enviar as amostras de áudio no tempo estipulado pelo buffer.

### Como Diagnosticar e Corrigir:

1. **Ajustar o Buffer de Áudio (Tamanho do Bloco)**:
   * Vá em **Opções** -> **Preferências** -> **Hardware de Som**.
   * Localize a configuração de **Buffer de Áudio**.
   * Se estiver em `auto` ou em um valor baixo (como `256` ou `512` quadros), altere para um valor estático mais alto, como **`1024 quadros (21.3 ms)`** ou **`2048 quadros (42.7 ms)`**.
   * *Buffers maiores dão mais estabilidade e fôlego à CPU, eliminando estalos na voz.*

2. **Sincronizar a Taxa de Amostragem (Sample Rate)**:
   * Garanta que a **Taxa de Amostragem** do Mixxx (em Hardware de Som) está em **`44100 Hz`** (padrão de estúdio e da maioria das placas/microfones USB comuns).
   * Se a sua placa de áudio do sistema (PipeWire/PulseAudio) estiver operando em 44100Hz e o Mixxx estiver configurado para 48000Hz (ou vice-versa), haverá reamostragem pesada em tempo real no canal do microfone, causando o craquelado. Mude ambos para **`44100 Hz`**.

3. **Mudar a API de Som**:
   * Se você estiver usando a API `JACK Connection Kit` sem ter um servidor JACK profissional rodando no sistema, mude a **API de Som** para **`PulseAudio`** ou **`ALSA`**. A API PulseAudio gerencia o compartilhamento do dispositivo e a reamostragem automática muito melhor para microfones domésticos.
