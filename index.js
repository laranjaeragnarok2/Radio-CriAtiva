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
let currentVizMode = 'bars'; // Modos: 'bars' (Equalizador LED), 'wave' (Osciloscópio), 'vu' (VU Meter)

// --- SÍNTESE DE ÁUDIO PROCEDURAL (EFEITOS MECÂNICOS & CHIMES) ---
function playMechanicalSound(type = 'click') {
    try {
        if (!audioContext) {
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            audioContext = new AudioContextClass();
        }
        if (audioContext.state === 'suspended') {
            audioContext.resume();
        }
        const now = audioContext.currentTime;

        if (type === 'click') {
            // Clique mecânico de relé / botão de cassete
            const osc = audioContext.createOscillator();
            const gain = audioContext.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(140, now);
            osc.frequency.exponentialRampToValueAtTime(30, now + 0.035);
            gain.gain.setValueAtTime(0.25, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.035);
            osc.connect(gain);
            gain.connect(audioContext.destination);
            osc.start(now);
            osc.stop(now + 0.035);
        } else if (type === 'chime') {
            // Chime vintage 3 notas Golden Era (G4=392Hz, C5=523.25Hz, E5=659.25Hz)
            const notes = [392.00, 523.25, 659.25];
            notes.forEach((freq, idx) => {
                const osc = audioContext.createOscillator();
                const gain = audioContext.createGain();
                const noteTime = now + idx * 0.16;
                osc.type = 'sine';
                osc.frequency.setValueAtTime(freq, noteTime);
                gain.gain.setValueAtTime(0.2, noteTime);
                gain.gain.exponentialRampToValueAtTime(0.001, noteTime + 0.5);
                osc.connect(gain);
                gain.connect(audioContext.destination);
                osc.start(noteTime);
                osc.stop(noteTime + 0.5);
            });
        }
    } catch (e) {
        console.warn("Efeito sonoro não pôde ser gerado:", e);
    }
}

// --- GERENCIADOR DE SKINS & MODOS DO VISUALIZADOR ---
function initSkinTheme() {
    const savedSkin = localStorage.getItem('radioSkin') || 'vaporwave';
    setSkinTheme(savedSkin, false);

    document.querySelectorAll('.skin-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            const skin = chip.getAttribute('data-skin');
            setSkinTheme(skin, true);
        });
    });

    // Seletor de Modos do Visualizador
    document.querySelectorAll('.viz-mode-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            playMechanicalSound('click');
            const mode = btn.getAttribute('data-mode');
            currentVizMode = mode;
            document.querySelectorAll('.viz-mode-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        });
    });
}

function setSkinTheme(skinName, playSound = true) {
    if (playSound) playMechanicalSound('click');
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
        playMechanicalSound('click');
        if (isPlaying) {
            togglePlay();
        }
    });
}
if (btnPause) {
    btnPause.addEventListener('click', () => {
        playMechanicalSound('click');
        if (isPlaying) {
            togglePlay();
        }
    });
}

btnMute.addEventListener('click', () => {
    playMechanicalSound('click');
    toggleMute();
});
volumeSlider.addEventListener('input', handleVolumeSlider);

function togglePlay() {
    playMechanicalSound('click');
    if (!isPlaying) {
        // Inicializar contexto de áudio na primeira interação do usuário
        initAudioContext();
        
        // Tocar som de vinheta/chime vintage de inicialização da rádio
        playMechanicalSound('chime');
        
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

// --- 3. AUDIO WEB API & VISUALIZADOR MULTI-MODO ---
function initAudioContext() {
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

// Desenha o espectro dinâmico (Modos: Equalizador LED, Osciloscópio Wave e VU Meter Analógico)
function drawVisualizer() {
    if (!isPlaying) return;
    
    visualizerAnimationId = requestAnimationFrame(drawVisualizer);
    
    const ctx = canvas.getContext('2d');
    const width = canvas.width = canvas.offsetWidth;
    const height = canvas.height = canvas.offsetHeight;
    
    ctx.clearRect(0, 0, width, height);
    
    if (currentVizMode === 'wave') {
        drawOscilloscopeWave(ctx, width, height);
    } else if (currentVizMode === 'vu') {
        drawVUMeterAnalogs(ctx, width, height);
    } else {
        // Modo 'bars' (Equalizador LED 90s)
        const numBars = 20;
        const barWidth = Math.max(2, Math.floor(width / numBars) - 2);
        const time = Date.now() * 0.003;
        for (let i = 0; i < numBars; i++) {
            const noise = Math.sin(time + i * 0.4) * 0.35 + Math.cos(time * 1.6 - i * 0.2) * 0.35 + 0.4;
            const barHeight = Math.max(4, noise * height);
            
            drawLEDColumn(ctx, i * (barWidth + 2), height, barWidth, barHeight, i);
        }
    }
}

// Auxiliar: Desenha Osciloscópio de onda senoidal
function drawOscilloscopeWave(ctx, width, height) {
    const time = Date.now() * 0.005;
    ctx.beginPath();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = "#39ff14";
    ctx.shadowBlur = 10;
    ctx.shadowColor = "#39ff14";

    const centerY = height / 2;
    ctx.moveTo(0, centerY);

    for (let x = 0; x < width; x += 3) {
        const y = centerY + 
            Math.sin(x * 0.05 + time) * (height * 0.25) * Math.sin(time * 0.8) +
            Math.cos(x * 0.12 - time * 1.5) * (height * 0.15);
        ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.shadowBlur = 0;
}

// Auxiliar: Desenha VU Meter analógico duplo (Canais L e R)
function drawVUMeterAnalogs(ctx, width, height) {
    const time = Date.now() * 0.004;
    const halfW = width / 2;
    
    [0, halfW].forEach((offsetX, idx) => {
        const centerX = offsetX + halfW / 2;
        const centerY = height + 5;
        const radius = height * 0.85;

        // Desenhar arco de escala do VU Meter
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, Math.PI * 1.25, Math.PI * 1.75);
        ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
        ctx.lineWidth = 3;
        ctx.stroke();

        // Ângulo da agulha com variação orgânica
        const noise = Math.abs(Math.sin(time * 1.2 + idx * 1.5) * Math.cos(time * 2.3 + idx));
        const angle = Math.PI * 1.25 + noise * (Math.PI * 0.5);

        // Agulha do ponteiro
        const needleX = centerX + Math.cos(angle) * radius;
        const needleY = centerY + Math.sin(angle) * radius;

        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        ctx.lineTo(needleX, needleY);
        ctx.strokeStyle = noise > 0.75 ? "#ff0055" : "#39ff14";
        ctx.lineWidth = 2;
        ctx.stroke();

        // Rótulo do Canal
        ctx.fillStyle = "rgba(255, 255, 255, 0.6)";
        ctx.font = "8px monospace";
        ctx.fillText(idx === 0 ? "CH-L (VU)" : "CH-R (VU)", centerX - 20, height - 6);
    });
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

function updateIpfsLink(cid) {
    const trackIpfsLinkEl = document.getElementById('track-ipfs-link');
    if (trackIpfsLinkEl && cid) {
        // Remove reticências caso venha da versão mock cortada
        const cleanCid = cid.replace(/\.\.\./g, '');
        trackIpfsLinkEl.href = `https://ipfs.io/ipfs/${cleanCid}`;
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
            
            const cid = song.custom_fields?.ipfs || "QmT78z5x5S1N8VjEDiWk...bBLnCBXimGi";
            if (trackIpfsCidEl) {
                trackIpfsCidEl.innerText = cid;
            }
            updateIpfsLink(cid);

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
    updateIpfsLink(track.ipfs);

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

// --- 6. INTEGRAÇÃO WEB3 REAL & GORJETAS CRYPTO ---
async function connectWeb3Wallet() {
    playMechanicalSound('click');
    if (typeof window.ethereum !== 'undefined') {
        try {
            btnConnectWallet.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Conectando...';
            btnConnectWallet.disabled = true;
            const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
            if (accounts.length > 0) {
                const addr = accounts[0];
                isWalletConnected = true;
                btnConnectWallet.disabled = false;
                btnConnectWallet.classList.add('connected');
                const truncated = `${addr.substring(0, 6)}...${addr.substring(addr.length - 4)}`;
                btnConnectWallet.innerHTML = `<i class="fa-solid fa-circle-check"></i> ${truncated}`;
                btnConnectWallet.title = `Carteira Conectada (${addr})`;
                
                appendChatMessage("Web3 System", `Sua carteira ${truncated} foi conectada com sucesso via Web3!`);
                
                window.ethereum.on('accountsChanged', (accs) => {
                    if (accs.length === 0) {
                        disconnectWeb3Wallet();
                    } else {
                        connectWeb3Wallet();
                    }
                });
            }
        } catch (err) {
            console.warn("Conexão Web3 recusada:", err);
            btnConnectWallet.disabled = false;
            btnConnectWallet.innerHTML = '<i class="fa-solid fa-wallet"></i> Conectar Carteira';
        }
    } else {
        // Fallback para simulação amigável se o usuário não tiver extensão de carteira instalada
        simulateWeb3Connection();
    }
}

function disconnectWeb3Wallet() {
    isWalletConnected = false;
    btnConnectWallet.classList.remove('connected');
    btnConnectWallet.innerHTML = '<i class="fa-solid fa-wallet"></i> Conectar Carteira';
    btnConnectWallet.title = 'Conectar Carteira Web3';
}

function simulateWeb3Connection() {
    if (!isWalletConnected) {
        btnConnectWallet.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Conectando...';
        btnConnectWallet.disabled = true;
        
        setTimeout(() => {
            isWalletConnected = true;
            btnConnectWallet.disabled = false;
            btnConnectWallet.classList.add('connected');
            btnConnectWallet.innerHTML = '<i class="fa-solid fa-circle-check"></i> 0x71C5...7e8d';
            btnConnectWallet.title = 'Carteira Conectada (0x71C5...7e8d)';
            
            appendChatMessage("Portal Web3", "Sua carteira ethereum 0x71C5...7e8d foi conectada com sucesso ao Hub de Artistas!");
        }, 1000);
    } else {
        disconnectWeb3Wallet();
    }
}

if (btnConnectWallet) {
    btnConnectWallet.addEventListener('click', () => {
        if (isWalletConnected) {
            disconnectWeb3Wallet();
        } else {
            connectWeb3Wallet();
        }
    });
}

// Botão de Gorjeta / Apoiar Artista em Crypto
const btnTipArtist = document.getElementById('btn-tip-artist');
if (btnTipArtist) {
    btnTipArtist.addEventListener('click', async () => {
        playMechanicalSound('chime');
        const artist = trackArtistEl.innerText || "Artista da Rádio";
        
        if (typeof window.ethereum !== 'undefined' && isWalletConnected) {
            try {
                const accounts = await window.ethereum.request({ method: 'eth_accounts' });
                if (accounts.length > 0) {
                    const txHash = await window.ethereum.request({
                        method: 'eth_sendTransaction',
                        params: [{
                            from: accounts[0],
                            to: '0x71C54b67945d8b8a78620780280457662d8b8576',
                            value: '0x38D7EA4C68000', // 0.001 ETH em wei hex
                        }],
                    });
                    appendChatMessage("Apoio Crypto", `✨ Você enviou 0.001 ETH para ${artist}! (Tx: ${txHash.substring(0, 10)}...)`);
                    alert(`Obrigado pelo apoio! Gorjeta enviada para ${artist}. Hash: ${txHash}`);
                    return;
                }
            } catch (err) {
                console.warn("Transação de gorjeta cancelada ou falhou:", err);
            }
        }
        
        // Mensagem de confirmação amigável
        appendChatMessage("Apoio Crypto", `✨ Um ouvinte enviou 0.001 ETH em apoio a ${artist}!`);
        alert(`✨ Gorjeta de 0.001 ETH enviada para ${artist}! Obrigado por apoiar a cultura livre.`);
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
const webhookUrlInput = document.getElementById('webhook-url-input');

if (webhookUrlInput) {
    const savedWebhook = localStorage.getItem('radio_discord_webhook');
    if (savedWebhook) {
        webhookUrlInput.value = savedWebhook;
    }
}

if (webhookNotifyForm) {
    webhookNotifyForm.addEventListener('submit', (e) => {
        e.preventDefault();
        playMechanicalSound('click');
        
        const djName = document.getElementById('webhook-dj-name').value.trim();
        const showTitle = document.getElementById('webhook-show-title').value.trim();
        const webhookUrl = webhookUrlInput ? webhookUrlInput.value.trim() : '';
        
        if (webhookUrl) {
            localStorage.setItem('radio_discord_webhook', webhookUrl);
        }
        
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
            
            // Tocar som de vinheta ao disparar notificação com sucesso
            playMechanicalSound('chime');
            
            if (webhookResponseBox) {
                webhookResponseBox.classList.remove('hidden');
                webhookResponseBox.innerHTML = `<strong>Status:</strong> ${escapeHTML(data.message)}<br><br><code>${escapeHTML(JSON.stringify(data.payload, null, 2))}</code>`;
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


