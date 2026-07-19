/* index.js - Aplicativo de Rádio e Hub de Artistas */

// --- CONFIGURAÇÃO DA RÁDIO (Substitua pelas suas URLs do AzuraCast) ---
const STREAM_URL = 'https://4372f1297fc296.lhr.life/listen/radio_criativa/radio.mp3'; // Stream segura via túnel localhost.run
const API_URL = 'https://4372f1297fc296.lhr.life/api/nowplaying/1'; // API de metadados via túnel localhost.run

// --- ELEMENTOS DO DOM ---
const audio = document.getElementById('audio-stream');
const btnPlayPause = document.getElementById('btn-play-pause');
const playIcon = document.getElementById('play-icon');
const btnMute = document.getElementById('btn-mute');
const muteIcon = document.getElementById('mute-icon');
const volumeSlider = document.getElementById('volume-slider');
const vinylDisk = document.getElementById('vinyl-disk');
const artworkWrapper = document.getElementById('artwork-disk-wrapper');
const streamIndicator = document.getElementById('stream-indicator');
const indicatorText = document.getElementById('indicator-text');
const listenerCountEl = document.getElementById('listener-count');
const trackTitleEl = document.getElementById('player-track-title');
const trackArtistEl = document.getElementById('player-track-artist');
const albumArtEl = document.getElementById('player-album-art');
const canvas = document.getElementById('player-visualizer');

// Elementos Web3 & IPFS no Player
const btnConnectWallet = document.getElementById('btn-connect-wallet');
const trackIpfsCidEl = document.getElementById('track-ipfs-cid');
const trackLicenseEl = document.getElementById('track-license');

// Elementos de Submissão de Música
const musicForm = document.getElementById('music-upload-form');
const successBox = document.getElementById('submit-success-box');
const dragDropZone = document.getElementById('drag-drop-zone');
const fileInput = document.getElementById('audio-file-input');
const fileLabel = document.getElementById('file-info-label');
const btnSubmitTrack = document.getElementById('btn-submit-track');
const btnSubmitAnother = document.getElementById('btn-submit-another');
const resultIpfsCid = document.getElementById('result-ipfs-cid');
const resultTxHash = document.getElementById('result-tx-hash');

// Elementos de Chat
const chatForm = document.getElementById('chat-form');
const chatMessagesContainer = document.getElementById('chat-messages-container');
const chatNickname = document.getElementById('chat-nickname');
const chatText = document.getElementById('chat-text');

// Elementos de Navegação
const navButtons = document.querySelectorAll('.nav-btn');
const tabContents = document.querySelectorAll('.tab-content');

// --- ESTADOS DO APLICATIVO ---
let isPlaying = false;
let isMuted = false;
let currentVolume = 0.8;
let audioContext = null;
let analyser = null;
let dataArray = null;
let bufferLength = 0;
let source = null;
let visualizerAnimationId = null;
let useProceduralVisualizer = false;
let isWalletConnected = false;

// Banco de dados simulado com dados de descentralização para o player
const mockTracks = [
    { 
        title: "Sons do Amanhã", 
        artist: "Ana Terra (Artista do Hub)", 
        art: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?q=80&w=400&auto=format&fit=crop",
        ipfs: "QmT78z5x5S1N8VjEDiWk...bBLnCBXimGi",
        license: "CC BY-NC-SA 4.0"
    },
    { 
        title: "Frequência Livre", 
        artist: "DJ Kael (Live Set)", 
        art: "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?q=80&w=400&auto=format&fit=crop",
        ipfs: "QmYwAPzwh35EDiWkqq12...cMcokXy8k27",
        license: "CC BY-ND 4.0"
    },
    { 
        title: "Sintonia P2P", 
        artist: "Os Sintéticos", 
        art: "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?q=80&w=400&auto=format&fit=crop",
        ipfs: "QmPxZg5X53bB92RPBLnC...Gi12RPBim3e",
        license: "Domínio Público (CC0)"
    },
    { 
        title: "Luzes de Neon", 
        artist: "Banda Lofi Club", 
        art: "https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=400&auto=format&fit=crop",
        ipfs: "QmN8Vj12RPBLnCBXimGi...27s31EDiWk",
        license: "CC BY-NC 4.0"
    }
];
let currentMockIndex = 0;

// --- FUNÇÃO AUXILIAR DE SEGURANÇA ---
function escapeHTML(str) {
    if (!str) return '';
    return str.replace(/[&<>'"]/g, 
        tag => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            "'": '&#39;',
            '"': '&quot;'
        }[tag] || tag)
    );
}

// --- 1. CONTROLE DE NAVEGAÇÃO SPA ---
navButtons.forEach(btn => {
    btn.addEventListener('click', () => {
        const targetTab = btn.getAttribute('data-target');
        switchTab(targetTab);
    });
});

function switchTab(tabId) {
    // Atualizar classe ativa dos botões
    navButtons.forEach(b => {
        if (b.getAttribute('data-target') === tabId) {
            b.classList.add('active');
        } else {
            b.classList.remove('active');
        }
    });

    // Atualizar aba visível com animação
    tabContents.forEach(tab => {
        if (tab.id === tabId) {
            tab.classList.add('active-tab');
        } else {
            tab.classList.remove('active-tab');
        }
    });

    // Sincronizar link ativo no menu do manual se aplicável
    if (tabId === 'manual-tab') {
        const firstManualLink = document.querySelector('.manual-menu a');
        if (firstManualLink) firstManualLink.classList.add('active');
    }
}

// Suporte para links internos na navegação do Manual do Artista
document.querySelectorAll('.manual-menu a').forEach(link => {
    link.addEventListener('click', (e) => {
        e.preventDefault();
        const targetId = link.getAttribute('href');
        const targetEl = document.querySelector(targetId);
        
        // Atualizar links ativos
        document.querySelectorAll('.manual-menu a').forEach(l => l.classList.remove('active'));
        link.classList.add('active');

        // Scroll suave
        targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
});

// --- 2. CONTROLES DO PLAYER DE ÁUDIO ---
audio.volume = currentVolume;

btnPlayPause.addEventListener('click', togglePlay);

// Botões auxiliares do deck de fita cassete (Stop e Pause)
const btnStop = document.getElementById('btn-stop');
const btnPause = document.getElementById('btn-pause');
if (btnStop) {
    btnStop.addEventListener('click', () => {
        if (isPlaying) {
            togglePlay();
        }
    });
}
if (btnPause) {
    btnPause.addEventListener('click', () => {
        if (isPlaying) {
            togglePlay();
        }
    });
}

btnMute.addEventListener('click', toggleMute);
volumeSlider.addEventListener('input', handleVolumeSlider);

function togglePlay() {
    if (!isPlaying) {
        // Inicializar contexto de áudio na primeira interação do usuário (exigência dos navegadores)
        initAudioContext();
        
        // Define o source se estiver vazio para poupar largura de banda enquanto pausado
        if (!audio.src || audio.src === window.location.href) {
            audio.src = STREAM_URL;
        }
        
        audio.play()
            .then(() => {
                isPlaying = true;
                playIcon.className = 'fa-solid fa-pause';
                btnPlayPause.title = 'Pausar';
                artworkWrapper.classList.add('playing');
                streamIndicator.className = 'live-indicator online';
                indicatorText.innerText = 'NO AR';
                
                // Iniciar animação do visualizador
                drawVisualizer();
            })
            .catch(err => {
                console.error("Erro ao reproduzir o áudio:", err);
                alert("Não foi possível conectar ao servidor de streaming. Verifique sua conexão.");
            });
    } else {
        audio.pause();
        // Limpar o src força o navegador a parar de baixar o fluxo contínuo em background
        audio.src = ''; 
        audio.load();
        
        isPlaying = false;
        playIcon.className = 'fa-solid fa-play';
        btnPlayPause.title = 'Reproduzir';
        artworkWrapper.classList.remove('playing');
        streamIndicator.className = 'live-indicator offline';
        indicatorText.innerText = 'REPRODUZIR';
        
        // Parar visualizador
        if (visualizerAnimationId) {
            cancelAnimationFrame(visualizerAnimationId);
        }
        clearCanvas();
    }
}

function toggleMute() {
    if (!isMuted) {
        audio.muted = true;
        isMuted = true;
        muteIcon.className = 'fa-solid fa-volume-xmark';
        volumeSlider.value = 0;
    } else {
        audio.muted = false;
        isMuted = false;
        muteIcon.className = 'fa-solid fa-volume-high';
        volumeSlider.value = currentVolume * 100;
    }
}

function handleVolumeSlider() {
    const val = volumeSlider.value;
    currentVolume = val / 100;
    audio.volume = currentVolume;
    
    if (val == 0) {
        isMuted = true;
        muteIcon.className = 'fa-solid fa-volume-xmark';
    } else {
        isMuted = false;
        audio.muted = false;
        if (val < 40) {
            muteIcon.className = 'fa-solid fa-volume-low';
        } else {
            muteIcon.className = 'fa-solid fa-volume-high';
        }
    }
}

// --- 3. AUDIO WEB API & VISUALIZADOR ---
function initAudioContext() {
    if (audioContext) return; // Já inicializado
    
    try {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        audioContext = new AudioContextClass();
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 128; // Tamanho ideal para visualizações rápidas
        bufferLength = analyser.frequencyBinCount;
        dataArray = new Uint8Array(bufferLength);
        
        // Conectar o áudio ao Analyser
        source = audioContext.createMediaElementSource(audio);
        source.connect(analyser);
        analyser.connect(audioContext.destination);
    } catch (e) {
        console.warn("Web Audio API bloqueada por políticas de CORS do servidor de streaming ou não suportada. Usando visualizador procedural alternativo.", e);
        useProceduralVisualizer = true;
    }
}

// Limpa o canvas para o estado original
function clearCanvas() {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
}

// Desenha o espectro dinâmico (Estilo Equalizador Retro 90s)
function drawVisualizer() {
    if (!isPlaying) return;
    
    visualizerAnimationId = requestAnimationFrame(drawVisualizer);
    
    const ctx = canvas.getContext('2d');
    const width = canvas.width = canvas.offsetWidth;
    const height = canvas.height = canvas.offsetHeight;
    
    ctx.clearRect(0, 0, width, height);
    
    const numBars = 20; // Número de colunas no Equalizador
    const barWidth = Math.floor(width / numBars) - 2;
    
    if (!useProceduralVisualizer && analyser) {
        try {
            analyser.getByteFrequencyData(dataArray);
            
            for (let i = 0; i < numBars; i++) {
                // Mapeia o espectro para o número de colunas
                const dataIndex = Math.floor((i / numBars) * bufferLength);
                const value = dataArray[dataIndex];
                const percent = value / 255;
                const barHeight = percent * height;
                
                drawLEDColumn(ctx, i * (barWidth + 2), height, barWidth, barHeight);
            }
        } catch (corsError) {
            useProceduralVisualizer = true;
        }
    }
    
    // Fallback: Animação de equalizador pulsante procedural
    if (useProceduralVisualizer) {
        const time = Date.now() * 0.003;
        for (let i = 0; i < numBars; i++) {
            // Simula ruído de equalização baseado em seno/cosseno
            const noise = Math.sin(time + i * 0.4) * 0.35 + Math.cos(time * 1.6 - i * 0.2) * 0.35 + 0.4;
            const barHeight = Math.max(4, noise * height);
            
            drawLEDColumn(ctx, i * (barWidth + 2), height, barWidth, barHeight);
        }
    }
}

// Auxiliar: Desenha colunas de LEDs segments (Verde -> Amarelo -> Vermelho)
function drawLEDColumn(ctx, x, y, width, height) {
    const numSegments = 10;
    const segmentHeight = Math.floor(y / numSegments) - 1;
    const activeSegments = Math.ceil(height / (y / numSegments));
    
    for (let j = 0; j < numSegments; j++) {
        const segmentY = y - (j * (segmentHeight + 1)) - segmentHeight;
        
        let color = "rgba(57, 255, 20, 0.08)"; // Verde apagado
        if (j < activeSegments) {
            if (j < 6) {
                color = "#39ff14"; // Verde ativo
            } else if (j < 8) {
                color = "#ffff00"; // Amarelo ativo
            } else {
                color = "#ff0055"; // Vermelho ativo
            }
        } else {
            // Apagado
            if (j < 6) color = "rgba(57, 255, 20, 0.08)";
            else if (j < 8) color = "rgba(255, 255, 0, 0.08)";
            else color = "rgba(255, 0, 85, 0.08)";
        }
        
        ctx.fillStyle = color;
        ctx.fillRect(x, segmentY, width, segmentHeight);
    }
}

// --- 4. POLLING DE METADADOS DA RÁDIO (NOW PLAYING) ---
// Quando tiver a URL oficial do AzuraCast, descomente a função real abaixo e apague a simulação.
/*
function fetchNowPlaying() {
    fetch(API_URL)
        .then(response => response.json())
        .then(data => {
            // Exemplo da estrutura JSON padrão do AzuraCast
            const song = data.now_playing.song;
            trackTitleEl.innerText = song.title;
            trackArtistEl.innerText = song.artist;
            if (song.art) {
                albumArtEl.src = song.art;
            }
            listenerCountEl.innerHTML = `<i class="fa-solid fa-headphones"></i> ${data.listeners.unique} ouvintes`;
        })
        .catch(err => console.error("Erro ao buscar metadados do AzuraCast:", err));
}
setInterval(fetchNowPlaying, 15000); // Roda a cada 15 segundos
*/

// SIMULAÇÃO de Metadados Rodando no AutoDJ (Para demonstração visual)
function runMockMetadata() {
    // Escolhe uma faixa da lista mockada
    const track = mockTracks[currentMockIndex];
    trackTitleEl.innerText = track.title;
    trackArtistEl.innerText = track.artist;
    albumArtEl.src = track.art;
    
    // Atualizar badges descentralizadas
    if (trackIpfsCidEl) trackIpfsCidEl.innerText = track.ipfs;
    if (trackLicenseEl) trackLicenseEl.innerText = track.license;
    
    // Simular número aleatório de ouvintes
    const randomListeners = Math.floor(Math.random() * 25) + 5;
    listenerCountEl.innerHTML = `<i class="fa-solid fa-headphones"></i> ${randomListeners} ouvintes`;
    
    // Avançar índice
    currentMockIndex = (currentMockIndex + 1) % mockTracks.length;
}

// Iniciar simulação e rodar a cada 20 segundos
runMockMetadata();
setInterval(runMockMetadata, 20000);

// --- 5. CHAT / MURAL DA COMUNIDADE (SIMULADOR INTERATIVO) ---
const botReplies = [
    "Que som incrível! Alguém sabe o nome do artista?",
    "Apoio total à iniciativa de rádio livre. Parabéns!",
    "Saudações de Curitiba! Sintonizado por aqui.",
    "O manual ajudou demais, já estou baixando o Butt para o meu programa no próximo domingo!",
    "Design maravilhoso desse player!",
    "Esse hub de artistas descentralizado tem muito futuro. Ansioso pelo IPFS!"
];

chatForm.addEventListener('submit', (e) => {
    e.preventDefault();
    
    const nick = chatNickname.value.trim();
    const message = chatText.value.trim();
    
    if (nick && message) {
        // Adicionar mensagem do usuário
        appendChatMessage(nick, message);
        
        // Limpar apenas o campo da mensagem
        chatText.value = '';
        
        // Simular uma resposta de outro ouvinte aleatoriamente após 1.5s
        setTimeout(() => {
            const randomNick = ["DreadLock", "Leticia_Musica", "CryptoArt", "SomLivre", "Caio_Mixer"][Math.floor(Math.random() * 5)];
            const randomReply = botReplies[Math.floor(Math.random() * botReplies.length)];
            appendChatMessage(randomNick, randomReply);
        }, 1500 + Math.random() * 1500);
    }
});

function appendChatMessage(sender, text) {
    const msgDiv = document.createElement('div');
    msgDiv.className = 'chat-msg';
    
    const senderSpan = document.createElement('div');
    senderSpan.className = 'chat-msg-user';
    senderSpan.innerText = sender;
    
    const textP = document.createElement('p');
    textP.innerText = text;
    
    msgDiv.appendChild(senderSpan);
    msgDiv.appendChild(textP);
    
    chatMessagesContainer.appendChild(msgDiv);
    
    // Rolagem automática para a última mensagem
    chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
}

// Botões auxiliares de cópia de link de stream
document.querySelectorAll('.copy-link-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const url = btn.getAttribute('data-url');
        navigator.clipboard.writeText(url)
            .then(() => {
                const originalText = btn.innerHTML;
                btn.innerHTML = '<i class="fa-solid fa-check"></i> Copiado!';
                btn.classList.add('btn-primary');
                setTimeout(() => {
                    btn.innerHTML = originalText;
                    btn.classList.remove('btn-primary');
                }, 2000);
            })
            .catch(err => {
                console.error("Falha ao copiar link:", err);
            });
    });
});

// --- 6. SIMULAÇÃO DE WEB3 (CONECTAR CARTEIRA) ---
if (btnConnectWallet) {
    btnConnectWallet.addEventListener('click', () => {
        if (!isWalletConnected) {
            btnConnectWallet.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Conectando...';
            btnConnectWallet.disabled = true;
            
            setTimeout(() => {
                isWalletConnected = true;
                btnConnectWallet.disabled = false;
                btnConnectWallet.classList.add('connected');
                btnConnectWallet.innerHTML = '<i class="fa-solid fa-circle-check"></i> 0x71C5...7e8d';
                btnConnectWallet.title = 'Carteira Conectada (0x71C5...7e8d)';
                
                // Exibe no mural
                appendChatMessage("Portal Web3", "Sua carteira ethereum 0x71C5...7e8d foi conectada com sucesso ao Hub de Artistas!");
            }, 1200);
        } else {
            // Desconectar
            isWalletConnected = false;
            btnConnectWallet.classList.remove('connected');
            btnConnectWallet.innerHTML = '<i class="fa-solid fa-wallet"></i> Conectar Carteira';
            btnConnectWallet.title = 'Conectar Carteira Web3';
        }
    });
}

// --- 7. SIMULAÇÃO DO PORTAL DE SUBMISSÃO (IPFS & DRAG-DROP) ---
if (dragDropZone && fileInput) {
    // Abrir seletor ao clicar no drag & drop
    dragDropZone.addEventListener('click', () => {
        fileInput.click();
    });

    // Atualizar label ao selecionar arquivo
    fileInput.addEventListener('change', () => {
        if (fileInput.files.length > 0) {
            const file = fileInput.files[0];
            const sizeMB = (file.size / (1024 * 1024)).toFixed(2);
            fileLabel.innerHTML = `<strong>${escapeHTML(file.name)}</strong> (${sizeMB} MB) selecionado.`;
            dragDropZone.style.borderColor = 'var(--accent-blue)';
        }
    });

    // Efeitos visuais do Drag & Drop
    ['dragenter', 'dragover'].forEach(eventName => {
        dragDropZone.addEventListener(eventName, (e) => {
            e.preventDefault();
            dragDropZone.classList.add('dragover');
        }, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dragDropZone.addEventListener(eventName, (e) => {
            e.preventDefault();
            dragDropZone.classList.remove('dragover');
        }, false);
    });

    dragDropZone.addEventListener('drop', (e) => {
        const dt = e.dataTransfer;
        const files = dt.files;
        if (files.length > 0) {
            fileInput.files = files;
            const file = files[0];
            const sizeMB = (file.size / (1024 * 1024)).toFixed(2);
            fileLabel.innerHTML = `<strong>${escapeHTML(file.name)}</strong> (${sizeMB} MB) soltado com sucesso.`;
            dragDropZone.style.borderColor = 'var(--accent-blue)';
        }
    });
}

// Envio do formulário
if (musicForm) {
    musicForm.addEventListener('submit', (e) => {
        e.preventDefault();
        
        const artist = document.getElementById('artist-name').value;
        const track = document.getElementById('track-name').value;
        const license = document.getElementById('track-license-select').value;
        
        btnSubmitTrack.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Processando e publicando no IPFS...';
        btnSubmitTrack.disabled = true;
        
        setTimeout(() => {
            // Gerar hashes simulados aleatórios
            const chars = 'abcdef0123456789';
            let randomCid = 'Qm';
            for (let i = 0; i < 44; i++) {
                randomCid += chars.charAt(Math.floor(Math.random() * chars.length));
            }
            let randomTx = '0x';
            for (let i = 0; i < 64; i++) {
                randomTx += chars.charAt(Math.floor(Math.random() * chars.length));
            }
            
            // Adicionar à nossa lista local de músicas mockadas para que possa tocar no player local
            mockTracks.push({
                title: track,
                artist: `${artist} (Enviada pelo Hub)`,
                art: "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?q=80&w=400&auto=format&fit=crop",
                ipfs: randomCid.substring(0, 20) + '...',
                license: license + ' 4.0'
            });
            
            // Preencher box de sucesso
            resultIpfsCid.innerText = randomCid;
            resultTxHash.innerText = randomTx;
            
            // Ocultar formulário, exibir sucesso
            musicForm.classList.add('hidden');
            successBox.classList.remove('hidden');
            
            // Resetar botão
            btnSubmitTrack.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Publicar no Hub Descentralizado';
            btnSubmitTrack.disabled = false;
        }, 2200);
    });
}

// Botão para enviar outra música
if (btnSubmitAnother) {
    btnSubmitAnother.addEventListener('click', () => {
        musicForm.reset();
        fileLabel.innerHTML = 'Nenhum arquivo selecionado (Limite: 25MB)';
        dragDropZone.style.borderColor = 'rgba(255, 255, 255, 0.15)';
        successBox.classList.add('hidden');
        musicForm.classList.remove('hidden');
    });
}

// Ajustar todos os links do Dashboard para usar o host atual ou localhost se estiver hospedado online (híbrido)
document.querySelectorAll('.btn-dashboard-link').forEach(link => {
    const host = window.location.hostname;
    if (host.includes('github.io') || host.includes('vercel.app')) {
        link.href = 'http://localhost';
    } else {
        link.href = `http://${host}`;
    }
});

// Injetar o Host/IP atual nas instruções de configuração do encoder
const ipPlaceholder = document.querySelector('.server-ip-placeholder');
if (ipPlaceholder) {
    ipPlaceholder.innerText = window.location.hostname;
}

// Botões auxiliares de cópia de comandos do terminal
document.querySelectorAll('.copy-cmd-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const cmd = btn.getAttribute('data-cmd');
        navigator.clipboard.writeText(cmd)
            .then(() => {
                const originalHTML = btn.innerHTML;
                btn.innerHTML = '<i class="fa-solid fa-check" style="color:var(--accent-green)"></i>';
                btn.style.borderColor = 'var(--accent-green)';
                setTimeout(() => {
                    btn.innerHTML = originalHTML;
                    btn.style.borderColor = '';
                }, 1500);
            })
            .catch(err => {
                console.error("Falha ao copiar comando:", err);
            });
    });
});

// --- 5. IMPORTAÇÃO DE PLAYLISTS/URLS DO YOUTUBE ---
const urlImportForm = document.getElementById('url-import-form');
const importUrlInput = document.getElementById('import-url-input');
const importStatusBox = document.getElementById('import-status-box');
const importSpinner = document.getElementById('import-spinner');
const importSuccessDetails = document.getElementById('import-success-details');
const importSuccessMsg = document.getElementById('import-success-msg');
const importErrorDetails = document.getElementById('import-error-details');
const importErrorMsg = document.getElementById('import-error-msg');
const btnResetImport = document.getElementById('btn-reset-import');
const btnRetryImport = document.getElementById('btn-retry-import');

if (urlImportForm) {
    urlImportForm.addEventListener('submit', (e) => {
        e.preventDefault();
        
        const url = importUrlInput.value.trim();
        if (!url) return;
        
        // Exibir status de carregamento, ocultar form
        urlImportForm.classList.add('hidden');
        importStatusBox.classList.remove('hidden');
        importSpinner.classList.remove('hidden');
        importSuccessDetails.classList.add('hidden');
        importErrorDetails.classList.add('hidden');
        
        // Enviar requisição para o servidor local de importação
        fetch('http://localhost:8081/import', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ url: url })
        })
        .then(response => {
            if (!response.ok) {
                return response.json().then(errData => {
                    throw new Error(errData.message || 'Falha ao processar a requisição no servidor.');
                });
            }
            return response.json();
        })
        .then(data => {
            // Sucesso!
            importSpinner.classList.add('hidden');
            importSuccessDetails.classList.remove('hidden');
            
            const escapedFiles = data.files ? data.files.map(escapeHTML) : [];
            const fileList = escapedFiles.join('<br>• ');
            importSuccessMsg.innerHTML = `Mídia(s) baixada(s) e indexada(s) com sucesso na rádio:<br><strong style="color:var(--accent-green)">• ${fileList}</strong>`;
        })
        .catch(err => {
            // Falha
            importSpinner.classList.add('hidden');
            importErrorDetails.classList.remove('hidden');
            importErrorMsg.innerText = err.message || 'Erro de conexão com o servidor de download local (porta 8081). Certifique-se de que o daemon está ativo.';
        });
    });
}

function resetImportForm() {
    if (urlImportForm) {
        urlImportForm.reset();
        urlImportForm.classList.remove('hidden');
    }
    if (importStatusBox) {
        importStatusBox.classList.add('hidden');
    }
}

if (btnResetImport) btnResetImport.addEventListener('click', resetImportForm);
if (btnRetryImport) btnRetryImport.addEventListener('click', resetImportForm);

