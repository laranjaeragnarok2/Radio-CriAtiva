# Requisitos e Guia de Instalação para o MVP da Rádio Online (AzuraCast)

Este guia descreve os requisitos de infraestrutura e o processo passo a passo para implantar o **AzuraCast** como seu backend de streaming de rádio online e integrá-lo com este portal web.

> [!IMPORTANT]
> **Configuração Atual (SERVIDOR LOCAL ATIVO)**:
> O AzuraCast foi instalado e está rodando diretamente no seu computador!
> * **Endereço do Painel**: Acesse **[http://localhost](http://localhost)** no seu navegador para configurar a conta de administrador e criar sua primeira estação de rádio.
> * **Conexão Local no `index.js`**:
>   - **URL de Streaming**: `http://localhost:8000/radio.mp3` (ou a porta/ponto de montagem criado).
>   - **URL da API (Now Playing)**: `http://localhost/api/nowplaying/1` (substitua `1` pelo ID da sua estação).

---


## 1. Requisitos do Servidor (VPS)

Para rodar o AzuraCast com estabilidade para o seu MVP, você precisará contratar uma VPS (Virtual Private Server). Provedores recomendados pela relação custo-benefício incluem Hetzner, DigitalOcean, Linode (Akamai), ou OVH.

### Especificações Recomendadas para o MVP:
* **Sistema Operacional**: Ubuntu 22.04 LTS ou 24.04 LTS (Instalação Limpa/Clean).
* **Processador (CPU)**: 1 vCPU (Arquitetura 64-bit x86/amd64). *Nota: Processadores ARM como Apple Silicon ou Raspberry Pi não são suportados de forma estável.*
* **Memória RAM**: 2 GB RAM (Mínimo absoluto). Se planeja rodar mais de uma estação ou usar playlists muito grandes com transição cruzada pesada, 4 GB de RAM é o ideal.
* **Armazenamento**: 20 GB a 40 GB SSD (depende do tamanho do seu acervo musical inicial).
* **Rede**: Porta de rede de 1 Gbps com tráfego mensal de pelo menos 1 TB.

### Portas de Rede Necessárias (Devem estar abertas no Firewall):
* `80` e `443` TCP (Para acesso web HTTP/HTTPS e Let's Encrypt).
* `8000` a `8500` TCP/UDP (Usadas pelo Icecast/Liquidsoap para conexões de DJs ao vivo e streams adicionais).

---

## 2. Passo a Passo de Instalação do AzuraCast

A instalação do AzuraCast é automatizada através do Docker. Siga os passos abaixo conectando-se ao seu servidor VPS via SSH.

### Passo 1: Preparar o ambiente
Atualize os pacotes do sistema:
```bash
sudo apt update && sudo apt upgrade -y
sudo apt install curl git -y
```

### Passo 2: Baixar e rodar o script do AzuraCast
Execute os seguintes comandos para criar o diretório e rodar o instalador oficial:
```bash
sudo mkdir -p /var/azuracast
cd /var/azuracast
sudo curl -fsSL https://raw.githubusercontent.com/AzuraCast/AzuraCast/main/docker.sh -o docker.sh
sudo chmod a+x docker.sh
sudo ./docker.sh install
```
*O instalador irá perguntar se você deseja instalar o Docker e Docker Compose. Responda **Sim (Y)**. O processo pode levar de 5 a 15 minutos dependendo da velocidade da VPS.*

### Passo 3: Configurar o Domínio e SSL
Após a instalação, configure os apontamentos de DNS do seu domínio (ex: `radio.meuhub.com` e `stream.meuhub.com`) para o IP público da VPS.
Em seguida, execute no terminal:
```bash
sudo ./docker.sh setup-release
```
Durante este setup ou através do painel administrativo, você poderá inserir o seu domínio e habilitar o certificado **Let's Encrypt SSL** para garantir conexões seguras por HTTPS.

---

## 3. Configurações Básicas no Painel AzuraCast

Uma vez concluída a instalação, acesse `https://seu-dominio.com` no navegador para criar a conta de superadministrador.

1. **Criar a Estação**: Dê um nome à sua rádio, selecione o fuso horário correto e escolha o software de áudio (recomenda-se manter o padrão: **Liquidsoap** como AutoDJ e **Icecast** como servidor de transmissão).
2. **Playlists do AutoDJ**: No menu da estação, acesse *Playlists* para criar as listas de reprodução automáticas (programação padrão, rotação geral, blocos comerciais, etc.).
3. **Enviar Músicas**: Vá em *Music Files* para enviar seus arquivos MP3/AAC diretamente pelo navegador ou via SFTP.
4. **Configurar DJs/Apresentadores**: Ative a opção *DJs/Streamers* nas configurações da estação. Crie contas individuais para cada artista. O painel fornecerá os dados de conexão (IP, porta e senha) para eles transmitirem ao vivo usando softwares como:
   * **Butt (Broadcast Using This Tool)** (Windows/Mac/Linux) - Recomendado para transmissões simples.
   * **Mixxx** (Windows/Mac/Linux) - Software completo de DJ.
   * **BroadcastMySelf** (Android) - Para transmitir a partir do celular.

---

## 4. Integração com este Portal Frontend

Para conectar o portal web (que criamos neste projeto) com a sua VPS do AzuraCast:

### 1. Obter a URL do Streaming de Áudio
No painel da sua estação no AzuraCast, acesse **Profile** (Perfil) e localize os **Mount Points** (Pontos de Montagem). Você verá URLs como:
`https://sua-radio.com/radio/8000/radio.mp3` ou `https://sua-radio.com/listen/nome-da-radio/radio.mp3`.
Substitua a URL padrão no arquivo `index.js` (variável `STREAM_URL`) por esta URL do seu servidor.

### 2. Obter e Configurar a API "Now Playing"
O AzuraCast disponibiliza uma API pública muito rápida para metadados de execução (música atual, artista, ouvintes, histórico).
* **Endpoint da API**: `https://sua-radio.com/api/nowplaying/1` (onde `1` é o ID ou shortcode da sua estação).
* Substitua a URL correspondente no arquivo `index.js` (variável `API_URL`).

### 3. Ajustar o CORS (Cross-Origin Resource Sharing)
Para permitir que o seu portal frontend (que pode estar hospedado em outro local, ex: Vercel, Netlify ou Github Pages) acesse os metadados da rádio sem erros de segurança:
1. No painel do AzuraCast, vá em **System Administration** (Administração do Sistema) -> **Settings** (Configurações).
2. Localize o campo de cabeçalhos de segurança ou configurações de API e certifique-se de que conexões externas de origens diferentes estão permitidas (CORS ativado). *Por padrão, as APIs públicas do AzuraCast já vêm com cabeçalhos `Access-Control-Allow-Origin: *` liberados.*

---

## 5. Roteiro de Evolução: Hub Descentralizado de Artistas

O MVP atual conta com a rádio online e o manual de uso para artistas. A visão de longo prazo deste projeto prevê as seguintes etapas de aprimoramento:

1. **Submissão Direta**: Criar uma interface onde artistas parceiros possam fazer upload de faixas diretamente no portal, que passará por uma curadoria antes de ir para a playlist do AutoDJ.
2. **Hospedagem Descentralizada (IPFS)**: Utilizar redes como IPFS (InterPlanetary File System) para armazenar os arquivos de música, garantindo que o catálogo não fique centralizado em um único servidor e possa ser distribuído ponto a ponto (P2P).
3. **Propriedade e Direitos Autorais**: Integração com licenças flexíveis (Creative Commons) e exibição do perfil de redes sociais/carteiras de criptomoedas dos artistas para receber doações e apoio financeiro direto dos ouvintes (microtransações/gorjetas).
4. **Governança Comunitária**: Criação de uma DAO (Organização Autônoma Descentralizada) ou conselho coletivo para decidir a programação diária e a distribuição de recursos da rádio de forma transparente.
