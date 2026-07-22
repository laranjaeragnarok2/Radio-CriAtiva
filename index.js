/* index.js - Aplicativo de Rádio e Hub de Artistas */

// --- CONFIGURAÇÃO DA RÁDIO ---
const HOSTNAME = window.location.hostname;
const isLocal = HOSTNAME === 'localhost' || 
                HOSTNAME === '127.0.0.1' || 
                HOSTNAME.startsWith('192.168.') || 
                HOSTNAME.startsWith('10.') || 
                HOSTNAME.endsWith('.local');

const STREAM_URL = isLocal 
    ? `http://${HOSTNAME}:8081/stream` 
    : 'https://icecast.radiofrance.fr/fip-midfi.mp3'; // Fallback público no GitHub Pages

const API_URL = isLocal 
    ? `http://${HOSTNAME}/api/nowplaying/1` 
    : 'https://demo.azuracast.com/api/nowplaying/1'; // Fallback público no GitHub Pages

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
let currentSelectedAvatar = "🎧";
let vuPeakValues = new Array(20).fill(0); // Para retenção de picos no VU Meter

// --- GERENCIADOR DE SKINS / TEMAS RETRO ---
function initSkinTheme() {
    const savedSkin = localStorage.getItem('radioSkin') || 'vaporwave';
    setSkinTheme(savedSkin);

    document.querySelectorAll('.skin-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            const skin = chip.getAttribute('data-skin');
            setSkinTheme(skin);
        });
    });
}

function setSkinTheme(skinName) {
    document.body.setAttribute('data-theme', skinName);
    localStorage.setItem('radioSkin', skinName);
    
    document.querySelectorAll('.skin-chip').forEach(chip => {
        if (chip.getAttribute('data-skin') === skinName) {
            chip.classList.add('active');
        } else {
            chip.classList.remove('active');
        }
    });
}
document.addEventListener('DOMContentLoaded', initSkinTheme);

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
                if (playIcon) playIcon.className = 'fa-solid fa-pause';
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
        if (playIcon) playIcon.className = 'fa-solid fa-play';
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
    // Forçar o uso do visualizador procedural para evitar bloqueios de CORS / Brave Shields
    useProceduralVisualizer = true;
    
    if (audioContext) return; // Já inicializado
    
    try {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        audioContext = new AudioContextClass();
    } catch (e) {
        console.warn("Web Audio API não pôde ser inicializada:", e);
    }
}

// Limpa o canvas para o estado original
function clearCanvas() {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
}

// Desenha o espectro dinâmico (Estilo Equalizador Retro 90s com VU Meter e Peak Hold)
function drawVisualizer() {
    if (!isPlaying) return;
    
    visualizerAnimationId = requestAnimationFrame(drawVisualizer);
    
    const ctx = canvas.getContext('2d');
    const width = canvas.width = canvas.offsetWidth;
    const height = canvas.height = canvas.offsetHeight;
    
    ctx.clearRect(0, 0, width, height);
    
    const numBars = 20; // Número de colunas no Equalizador
    const barWidth = Math.max(2, Math.floor(width / numBars) - 2);
    
    if (!useProceduralVisualizer && analyser) {
        try {
            analyser.getByteFrequencyData(dataArray);
            for (let i = 0; i < numBars; i++) {
                const dataIndex = Math.floor((i / numBars) * bufferLength);
                const value = dataArray[dataIndex];
                const percent = value / 255;
                const barHeight = percent * height;
                
                drawLEDColumn(ctx, i * (barWidth + 2), height, barWidth, barHeight, i);
            }
        } catch (corsError) {
            useProceduralVisualizer = true;
        }
    }
    
    // Fallback: Animação de equalizador pulsante procedural estilo VU Meter
    if (useProceduralVisualizer) {
        const time = Date.now() * 0.003;
        for (let i = 0; i < numBars; i++) {
            const noise = Math.sin(time + i * 0.4) * 0.35 + Math.cos(time * 1.6 - i * 0.2) * 0.35 + 0.4;
            const barHeight = Math.max(4, noise * height);
            
            drawLEDColumn(ctx, i * (barWidth + 2), height, barWidth, barHeight, i);
        }
    }
}

// Auxiliar: Desenha colunas de LEDs segments com gradientes e retenção de picos (Peak Hold)
function drawLEDColumn(ctx, x, y, width, height, columnIndex) {
    const numSegments = 10;
    const segmentHeight = Math.max(1, Math.floor(y / numSegments) - 1);
    const activeSegments = Math.ceil(height / (y / numSegments));
    
    // Atualiza retenção de pico (Peak Hold)
    if (activeSegments > vuPeakValues[columnIndex]) {
        vuPeakValues[columnIndex] = activeSegments;
    } else {
        vuPeakValues[columnIndex] = Math.max(0, vuPeakValues[columnIndex] - 0.15); // Decaimento suave
    }
    
    const currentPeak = Math.floor(vuPeakValues[columnIndex]);
    
    for (let j = 0; j < numSegments; j++) {
        const segmentY = y - (j * (segmentHeight + 1)) - segmentHeight;
        
        let color = "rgba(57, 255, 20, 0.08)";
        if (j < activeSegments) {
            if (j < 6) {
                color = "#39ff14"; // Verde ativo
            } else if (j < 8) {
                color = "#ffff00"; // Amarelo ativo
            } else {
                color = "#ff0055"; // Vermelho ativo
            }
        } else if (j === currentPeak && j > 0) {
            color = "#00ffff"; // Cor Neon do Pico
        }
        
        ctx.fillStyle = color;
        ctx.fillRect(x, segmentY, width, segmentHeight);
    }
}

function fetchNowPlaying() {
    fetch(API_URL)
        .then(response => response.json())
        .then(data => {
            const song = data.now_playing.song;
            trackTitleEl.innerText = song.title;
            trackArtistEl.innerText = song.artist;
            
            if (song.art) {
                let artUrl = song.art;
                // Ajustar URL da imagem caso acesse de outro dispositivo local
                if (artUrl.includes('//localhost')) {
                    artUrl = artUrl.replace('//localhost', `//${HOSTNAME}`);
                }
                albumArtEl.src = artUrl;
            }
            
            // Badges Web3 / IPFS dinâmicas (se houver no AzuraCast, senão limpa ou simula)
            if (trackIpfsCidEl) {
                trackIpfsCidEl.innerText = song.custom_fields?.ipfs || "QmT78z5x5S1N8VjEDiWk...bBLnCBXimGi";
            }
            if (trackLicenseEl) {
                trackLicenseEl.innerText = song.custom_fields?.license || "CC BY-NC-SA 4.0";
            }
            
            // Ouvintes reais
            const uniqueListeners = data.listeners.unique || 0;
            listenerCountEl.innerHTML = `<i class="fa-solid fa-headphones"></i> ${uniqueListeners} ouvintes`;
        })
        .catch(err => {
            console.warn("Erro ao buscar metadados do AzuraCast (usando simulação como fallback):", err);
            // Se falhar a API (ex: sem rede), roda o fallback da simulação
            runMockMetadata();
        });
}

// Iniciar a busca de metadados reais a cada 5 segundos
fetchNowPlaying();
setInterval(fetchNowPlaying, 5000);

// SIMULAÇÃO de Metadados Rodando no AutoDJ (Para demonstração visual como fallback)
function runMockMetadata() {
    const track = mockTracks[currentMockIndex];
    trackTitleEl.innerText = track.title;
    trackArtistEl.innerText = track.artist;
    albumArtEl.src = track.art;
    
    if (trackIpfsCidEl) trackIpfsCidEl.innerText = track.ipfs;
    if (trackLicenseEl) trackLicenseEl.innerText = track.license;
    
    const randomListeners = Math.floor(Math.random() * 25) + 5;
    listenerCountEl.innerHTML = `<i class="fa-solid fa-headphones"></i> ${randomListeners} ouvintes`;
    
    currentMockIndex = (currentMockIndex + 1) % mockTracks.length;
}

// --- 5. CHAT / MURAL DA COMUNIDADE (INTERATIVO COM AVATARES & LOCALSTORAGE) ---
const botReplies = [
    "Que som incrível! Alguém sabe o nome do artista?",
    "Apoio total à iniciativa de rádio livre. Parabéns!",
    "Saudações de Curitiba! Sintonizado por aqui.",
    "O manual ajudou demais, já estou baixando o Butt para o meu programa no próximo domingo!",
    "Design maravilhoso desse player cassete!",
    "Esse hub de artistas descentralizado tem muito futuro."
];

// Gerenciador de Avatares & Emojis no Form do Chat
document.querySelectorAll('.avatar-chip').forEach(chip => {
    chip.addEventListener('click', () => {
        document.querySelectorAll('.avatar-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        currentSelectedAvatar = chip.getAttribute('data-avatar');
    });
});

document.querySelectorAll('.emoji-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const emoji = btn.getAttribute('data-emoji');
        chatText.value += ` ${emoji}`;
        chatText.focus();
    });
});

// Carregar histórico de mensagens salvas
function loadChatHistory() {
    const saved = localStorage.getItem('radio_chat_history');
    if (saved) {
        try {
            const msgs = JSON.parse(saved);
            chatMessagesContainer.innerHTML = '';
            msgs.forEach(m => appendChatMessage(m.nick, m.text, m.avatar, m.badge, false));
        } catch (e) {
            console.warn("Erro ao carregar histórico de mensagens:", e);
        }
    }
}
loadChatHistory();

chatForm.addEventListener('submit', (e) => {
    e.preventDefault();
    
    const nick = chatNickname.value.trim();
    const message = chatText.value.trim();
    
    if (nick && message) {
        appendChatMessage(nick, message, currentSelectedAvatar, 'Ouvinte', true);
        chatText.value = '';
        
        setTimeout(() => {
            const randomBot = [
                { nick: "DreadLock", avatar: "🎸", badge: "Ouvinte" },
                { nick: "DJ Kael", avatar: "🎙️", badge: "DJ" },
                { nick: "Leticia_Musica", avatar: "🎧", badge: "Ouvinte" },
                { nick: "SomLivreBot", avatar: "🤖", badge: "Bot" }
            ][Math.floor(Math.random() * 4)];
            
            const randomReply = botReplies[Math.floor(Math.random() * botReplies.length)];
            appendChatMessage(randomBot.nick, randomReply, randomBot.avatar, randomBot.badge, true);
        }, 1500 + Math.random() * 1500);
    }
});

function appendChatMessage(sender, text, avatar = "🎧", badge = "Ouvinte", saveToLocal = true) {
    const msgDiv = document.createElement('div');
    msgDiv.className = 'chat-msg';
    
    const badgeClass = badge.toLowerCase() === 'dj' ? 'badge-dj' : (badge.toLowerCase() === 'bot' ? 'badge-bot' : 'badge-listener');
    
    const headerDiv = document.createElement('div');
    headerDiv.className = 'chat-msg-header';
    headerDiv.innerHTML = `
        <span class="chat-msg-avatar">${avatar}</span>
        <span class="chat-msg-user">${escapeHTML(sender)}</span>
        <span class="chat-badge ${badgeClass}">${badge}</span>
    `;
    
    const textP = document.createElement('p');
    textP.innerText = text;
    
    msgDiv.appendChild(headerDiv);
    msgDiv.appendChild(textP);
    
    chatMessagesContainer.appendChild(msgDiv);
    chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;

    if (saveToLocal) {
        saveChatMessageToLocal(sender, text, avatar, badge);
    }
}

function saveChatMessageToLocal(sender, text, avatar, badge) {
    try {
        let history = JSON.parse(localStorage.getItem('radio_chat_history') || '[]');
        history.push({ nick: sender, text, avatar, badge, time: Date.now() });
        if (history.length > 30) history = history.slice(-30); // Limita a 30 mensagens
        localStorage.setItem('radio_chat_history', JSON.stringify(history));
    } catch (e) {
        console.warn("Não foi possível salvar no localStorage:", e);
    }
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

// --- 5. IMPORTAÇÃO DE PLAYLISTS/URLS DO YOUTUBE (COM POLLING DE PROGRESSO REAL) ---
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

// Elementos da Barra de Progresso Real
const progressPercentEl = document.getElementById('import-progress-percent');
const progressFillEl = document.getElementById('import-progress-fill');
const progressMsgEl = document.getElementById('import-progress-msg');

let activeImportPollInterval = null;

if (urlImportForm) {
    urlImportForm.addEventListener('submit', (e) => {
        e.preventDefault();
        
        const url = importUrlInput.value.trim();
        if (!url) return;
        
        // Resetar barra de progresso visual
        updateImportProgressBar(0, "Iniciando tarefa de importação no servidor...");
        
        // Exibir status de carregamento, ocultar form
        urlImportForm.classList.add('hidden');
        importStatusBox.classList.remove('hidden');
        importSpinner.classList.remove('hidden');
        importSuccessDetails.classList.add('hidden');
        importErrorDetails.classList.add('hidden');
        
        // Enviar requisição para o servidor local de importação (porta 8081)
        fetch('http://localhost:8081/import', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: url })
        })
        .then(response => {
            if (!response.ok) {
                return response.json().then(errData => {
                    throw new Error(errData.message || 'Falha ao iniciar a importação no servidor.');
                });
            }
            return response.json();
        })
        .then(data => {
            const taskId = data.task_id;
            if (taskId) {
                // Iniciar polling de progresso da tarefa em segundo plano
                pollImportProgress(taskId);
            } else {
                throw new Error("ID de tarefa não retornado pelo servidor.");
            }
        })
        .catch(err => {
            importSpinner.classList.add('hidden');
            importErrorDetails.classList.remove('hidden');
            importErrorMsg.innerText = err.message || 'Erro de conexão com o servidor de download local (porta 8081). Certifique-se de que o daemon import_server.py está rodando.';
        });
    });
}

function pollImportProgress(taskId) {
    if (activeImportPollInterval) clearInterval(activeImportPollInterval);
    
    activeImportPollInterval = setInterval(() => {
        fetch(`http://localhost:8081/import-status?task_id=${taskId}`)
            .then(res => res.json())
            .then(task => {
                const percent = task.percent || 0;
                const message = task.message || "Processando...";
                
                updateImportProgressBar(percent, message);
                
                if (task.status === 'completed') {
                    clearInterval(activeImportPollInterval);
                    setTimeout(() => {
                        importSpinner.classList.add('hidden');
                        importSuccessDetails.classList.remove('hidden');
                        const escapedFiles = task.files ? task.files.map(escapeHTML) : [];
                        const fileList = escapedFiles.length > 0 ? escapedFiles.join('<br>• ') : 'Mídia baixada com sucesso';
                        importSuccessMsg.innerHTML = `Mídia(s) baixada(s) e indexada(s) com sucesso na rádio:<br><strong style="color:var(--accent-green)">• ${fileList}</strong>`;
                    }, 500);
                } else if (task.status === 'error') {
                    clearInterval(activeImportPollInterval);
                    importSpinner.classList.add('hidden');
                    importErrorDetails.classList.remove('hidden');
                    importErrorMsg.innerText = task.error || task.message || 'Ocorreu um erro durante a importação.';
                }
            })
            .catch(err => {
                console.warn("Erro no polling de status:", err);
            });
    }, 800);
}

function updateImportProgressBar(percent, message) {
    if (progressPercentEl) progressPercentEl.innerText = `${Math.round(percent)}%`;
    if (progressFillEl) progressFillEl.style.width = `${percent}%`;
    if (progressMsgEl) progressMsgEl.innerText = message;
}

function resetImportForm() {
    if (activeImportPollInterval) clearInterval(activeImportPollInterval);
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

// --- 6. DISPARADOR / TESTADOR DE WEBHOOKS DE LIVE NOTIFICATION ---
const webhookNotifyForm = document.getElementById('webhook-notify-form');
const webhookResponseBox = document.getElementById('webhook-response-box');

if (webhookNotifyForm) {
    webhookNotifyForm.addEventListener('submit', (e) => {
        e.preventDefault();
        
        const djName = document.getElementById('webhook-dj-name').value.trim();
        const showTitle = document.getElementById('webhook-show-title').value.trim();
        const webhookUrl = document.getElementById('webhook-url-input').value.trim();
        
        const btn = document.getElementById('btn-trigger-webhook');
        const origHTML = btn.innerHTML;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Disparando Alerta...';
        btn.disabled = true;
        
        fetch('http://localhost:8081/api/notify-live', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                dj_name: djName,
                show_title: showTitle,
                webhook_url: webhookUrl,
                platform: 'discord'
            })
        })
        .then(res => res.json())
        .then(data => {
            btn.innerHTML = origHTML;
            btn.disabled = false;
            
            if (webhookResponseBox) {
                webhookResponseBox.classList.remove('hidden');
                webhookResponseBox.innerHTML = `<strong>Status:</strong> ${data.message}<br><br><code>${JSON.stringify(data.payload, null, 2)}</code>`;
            }
        })
        .catch(err => {
            btn.innerHTML = origHTML;
            btn.disabled = false;
            if (webhookResponseBox) {
                webhookResponseBox.classList.remove('hidden');
                webhookResponseBox.innerText = `Erro ao disparar webhook: ${err.message || err}`;
            }
        });
    });
}


