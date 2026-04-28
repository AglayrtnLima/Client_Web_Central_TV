// Configurações Iniciais
const LOGO_URL = "https://powerembedded.blob.core.windows.net/images/7cb74a31-4e61-468c-9bf7-dcac28b6a8f2/organization/favicon.png";
const DEFAULT_SERVER_URL = "https://api.suaempresa.com.br";
const _0x4a12 = "Mzk3Q0U3NUJDQjJDQTRDQ0UzMzM2NEJEQTkwNzM0M0M=";
const _0x9b33 = "Rjk1QzYxMDM=";
const SHARED_SECRET = atob(_0x4a12);
const CONFIG_PASSWORD = atob(_0x9b33);

// Estado Global
let config = {
    serverUrl: localStorage.getItem('server_url') || DEFAULT_SERVER_URL,
    deviceId: null,
    hardwareId: getHardwareId()
};

let currentState = null;
let playlist = [];
let currentIndex = 0;
let repeatCount = 0;
let lastRevision = -1;
let playTimer = null;
let syncTimer = null;
let heartbeatTimer = null;
let validationTimer = null;
let metricsTimer = null;

// Elementos da UI
const screens = {
    activation: document.getElementById('screen-activation'),
    player: document.getElementById('screen-player'),
    blocked: document.getElementById('screen-blocked'),
    rejected: document.getElementById('screen-rejected'),
    config: document.getElementById('overlay-config')
};

const elements = {
    deviceCode: document.getElementById('device-code'),
    statusText: document.getElementById('status-text'),
    playerImage: document.getElementById('player-image'),
    playerVideo: document.getElementById('player-video'),
    playerIdle: document.getElementById('player-idle'),
    infoId: document.getElementById('info-id'),
    infoName: document.getElementById('info-name'),
    inputUrl: document.getElementById('input-server-url'),
    btnSave: document.getElementById('btn-save-config'),
    btnRetry: document.getElementById('btn-retry'),
    retryStatusText: document.getElementById('retry-status-text'),
    configHwid: document.getElementById('config-hwid'),
    activationId: document.getElementById('activation-id'),
    blockedId: document.getElementById('blocked-id'),
    rejectedId: document.getElementById('rejected-id'),
    idleId: document.getElementById('idle-id'),
    resolveStatus: document.getElementById('resolve-status')
};

// --- Inicialização ---

function init() {
    // Configura Logos
    document.getElementById('logo-activation').src = LOGO_URL;
    document.getElementById('logo-blocked').src = LOGO_URL;
    document.getElementById('logo-idle').src = LOGO_URL;

    // Hardware ID Display
    elements.configHwid.textContent = "HARDWARE ID: " + config.hardwareId;
    elements.deviceCode.textContent = config.hardwareId;
    elements.activationId.textContent = "CÓDIGO: " + config.hardwareId;
    elements.blockedId.textContent = "ID: " + config.hardwareId;
    elements.rejectedId.textContent = "ID: " + config.hardwareId;
    elements.idleId.textContent = "ID: " + config.hardwareId;

    // Listeners
    elements.btnSave.addEventListener('click', saveConfig);
    elements.btnRetry.addEventListener('click', retryConnection);

    // Atalho para abrir config (Pressionar 'C' no teclado)
    window.addEventListener('keydown', (e) => {
        if (e.key.toLowerCase() === 'c') {
            const pass = prompt("Digite a senha de configuração:");
            if (pass !== CONFIG_PASSWORD) {
                if (pass !== null) alert("Senha incorreta!");
                return;
            }

            screens.config.classList.toggle('hidden');
            if (!screens.config.classList.contains('hidden')) {
                elements.inputUrl.value = config.serverUrl;
                elements.inputUrl.focus();
            }
        }

        // Navegação por setas (Controle Remoto de TV)
        if (!screens.config.classList.contains('hidden')) {
            const navElements = document.querySelectorAll('.tv-nav');
            const currentIndex = Array.from(navElements).indexOf(document.activeElement);

            if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
                e.preventDefault();
                const nextIndex = (currentIndex + 1) % navElements.length;
                navElements[nextIndex].focus();
            } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
                e.preventDefault();
                const prevIndex = (currentIndex - 1 + navElements.length) % navElements.length;
                navElements[prevIndex].focus();
            }
        }
    });

    // Check inicial
    let savedUrl = localStorage.getItem('server_url');
    if (!savedUrl) {
        showScreen('config');
    } else {
        // Fix saved URLs that are missing http://
        if (!savedUrl.startsWith('http://') && !savedUrl.startsWith('https://')) {
            savedUrl = 'http://' + savedUrl;
            localStorage.setItem('server_url', savedUrl);
            config.serverUrl = savedUrl;
        }
        startApp();
    }
}

function startApp() {
    screens.config.classList.add('hidden');
    checkStatusLoop();
}

function getHardwareId() {
    let id = localStorage.getItem('hardware_id');
    if (!id) {
        // Gera um ID único e seguro (UUID)
        id = self.crypto.randomUUID().split('-')[0].toUpperCase();
        localStorage.setItem('hardware_id', id);
    }
    return id;
}

// Wrapper para fetch com segurança
async function safeFetch(url, options = {}) {
    const headers = {
        ...options.headers,
        'X-API-Key': SHARED_SECRET
    };
    return fetch(url, { ...options, headers });
}

async function resolveShortenedUrl(url) {
    // Lista de domínios comuns de encurtadores para verificar
    const shorteners = ['bit.ly', 'encurtador.com.br', 't.co', 'goo.gl', 'tinyurl.com', 'is.gd', 'buff.ly'];
    const isShortened = shorteners.some(s => url.toLowerCase().includes(s));

    if (!isShortened) return url;

    console.log("Detectado link encurtador, resolvendo:", url);
    if (elements.resolveStatus) elements.resolveStatus.classList.remove('hidden');

    try {
        // Usando a API unshorten.me para resolver o link com suporte a CORS
        const response = await fetch(`https://unshorten.me/json/${encodeURIComponent(url)}`);
        const data = await response.json();

        if (data.success && data.resolved_url) {
            console.log("URL resolvida com sucesso:", data.resolved_url);
            return data.resolved_url;
        }
    } catch (error) {
        console.error("Erro ao resolver URL encurtada:", error);
    } finally {
        if (elements.resolveStatus) elements.resolveStatus.classList.add('hidden');
    }

    return url; // Retorna a original se falhar
}

async function saveConfig() {
    let url = elements.inputUrl.value.trim();
    if (!url) return alert("Informe uma URL válida");

    // Adiciona http:// se não houver protocolo
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = 'http://' + url;
    }

    // Resolve o link se for encurtador
    url = await resolveShortenedUrl(url);

    // Remove barra final se houver
    if (url.endsWith('/')) url = url.slice(0, -1);

    localStorage.setItem('server_url', url);
    config.serverUrl = url;
    location.reload();
}

async function retryConnection() {
    if (currentState !== 'rejected') return;

    elements.btnRetry.classList.add('bg-orange-500', 'border-white');
    elements.btnRetry.classList.remove('bg-slate-700', 'border-slate-500');
    setTimeout(() => {
        elements.btnRetry.classList.remove('bg-orange-500', 'border-white');
        elements.btnRetry.classList.add('bg-slate-700', 'border-slate-500');
    }, 150);

    elements.retryStatusText.textContent = "Verificando acesso...";

    try {
        const response = await safeFetch(`${config.serverUrl}/devices/activate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ device_code: config.hardwareId })
        });
        const data = await response.json();

        if (data.status === 'error' && data.message && data.message.toLowerCase().includes('desativado')) {
            elements.retryStatusText.textContent = "Acesso ainda rejeitado.";
        } else {
            elements.retryStatusText.textContent = "";
            checkStatusLoop(); // Força uma nova checagem completa que fará a transição
        }
    } catch (e) {
        elements.retryStatusText.textContent = "Erro ao conectar com o servidor.";
    }
}

// --- Lógica de Estados ---

async function checkStatusLoop() {
    try {
        const response = await safeFetch(`${config.serverUrl}/devices/activate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ device_code: config.hardwareId })
        });

        const data = await response.json();

        if (data.status === 'activated') {
            config.deviceId = data.device_id;
            transitionTo('player', data);
        } else if (data.message && (data.message.toLowerCase().includes('block') || data.message.toLowerCase().includes('bloqueado'))) {
            transitionTo('blocked');
        } else if (data.status === 'error' && data.message && data.message.toLowerCase().includes('desativado')) {
            transitionTo('rejected');
            return;
        } else {
            transitionTo('activation');
            elements.statusText.textContent = "Aguardando ativação no painel...";
        }
    } catch (error) {
        console.error("Erro ao verificar status:", error);
        transitionTo('activation');
        const shortUrl = config.serverUrl.replace(/^https?:\/\//, '').split('/')[0];
        elements.statusText.textContent = `Erro de conexão em: ${shortUrl}`;
    }

    // Polling a cada 5 segundos se não estiver no player
    if (currentState !== 'player') {
        setTimeout(checkStatusLoop, 5000);
    }
}

function transitionTo(state, data = null) {
    if (currentState === state) return;

    currentState = state;
    showScreen(state);

    if (state === 'player') {
        if (elements.infoId) elements.infoId.textContent = data.device_id;
        if (elements.infoName && data.device_name && data.device_name !== 'undefined') {
            elements.infoName.textContent = " | " + data.device_name;
        } else if (elements.infoName) {
            elements.infoName.textContent = "";
        }
        startPlayer();
    } else {
        stopPlayer();
    }

    if (state === 'blocked' || state === 'rejected') {
        // ID já é configurado no init, mas caso precisemos atualizar
        if (state === 'blocked') elements.blockedId.textContent = `ID: ${config.hardwareId}`;
        if (state === 'rejected') {
            elements.rejectedId.textContent = `ID: ${config.hardwareId}`;
            elements.retryStatusText.textContent = "";
            // foca no botão automaticamente
            setTimeout(() => elements.btnRetry.focus(), 100);
        }
    }
}

function showScreen(name) {
    Object.values(screens).forEach(s => s.classList.add('hidden'));
    if (screens[name]) screens[name].classList.remove('hidden');
}

// --- Player Engine ---

function startPlayer() {
    stopPlayer(); // Limpa timers anteriores
    playNext(); // Mostra a tela idle ou a mídia imediatamente
    runSyncLoop();
    runHeartbeatLoop();
    runValidationLoop();
    runMetricsLoop();
}

function stopPlayer() {
    clearTimeout(syncTimer);
    clearTimeout(heartbeatTimer);
    clearTimeout(validationTimer);
    clearTimeout(playTimer);
    clearTimeout(metricsTimer);
    elements.playerVideo.pause();
    elements.playerVideo.src = "";
}

async function runSyncLoop() {
    try {
        const response = await safeFetch(`${config.serverUrl}/devices/${config.deviceId}/playlist`);
        const info = await response.json();

        if (info.maintenance && info.maintenance.reset) {
            await safeFetch(`${config.serverUrl}/devices/${config.deviceId}/ack-reset`, { method: 'POST' });
            location.reload();
            return;
        }

        const rev = parseInt(info.revision || -1);
        if (rev !== lastRevision) {
            console.log("Nova revisão detectada:", rev);
            playlist = info.items || [];
            lastRevision = rev;
            currentIndex = 0;
            repeatCount = 0;

            // Atualiza a tela (vai para a primeira mídia ou tela de idle)
            playNext();
        }
    } catch (e) {
        console.error("Erro no sync:", e);
    }
    syncTimer = setTimeout(runSyncLoop, 5000);
}

async function runHeartbeatLoop() {
    try {
        const item = playlist[currentIndex] || {};
        await safeFetch(`${config.serverUrl}/devices/heartbeat`, {
            method: 'POST',
            body: new URLSearchParams({
                device_id: config.deviceId,
                current_filename: item.filename || "Idle",
                current_kind: item.kind || "none"
            })
        });
    } catch (e) { }
    heartbeatTimer = setTimeout(runHeartbeatLoop, 10000);
}

async function runValidationLoop() {
    try {
        const response = await safeFetch(`${config.serverUrl}/devices/${config.deviceId}/validate`);
        const data = await response.json();
        if (!data.valid) {
            // Se não for válido, volta pro checkStatus para ver se foi bloqueado ou excluído
            currentState = null;
            checkStatusLoop();
            return;
        }
    } catch (e) { }
    validationTimer = setTimeout(runValidationLoop, 15000);
}

function playNext() {
    clearTimeout(playTimer);

    if (playlist.length === 0) {
        elements.playerIdle.classList.remove('hidden');
        elements.playerImage.classList.add('hidden');
        elements.playerVideo.classList.add('hidden');
        return;
    }

    elements.playerIdle.classList.add('hidden');

    // Lógica de Repetição
    if (repeatCount <= 0) {
        const item = playlist[currentIndex];
        repeatCount = parseInt(item.repeat || 1);
    }

    const item = playlist[currentIndex];

    // Suporte a links absolutos na playlist
    let mediaUrl = item.url;
    if (!mediaUrl.startsWith('http')) {
        mediaUrl = `${config.serverUrl}${item.url}`;
    }

    if (item.kind === 'image') {
        showImage(mediaUrl, parseInt(item.duration || 10));
    } else {
        showVideo(mediaUrl);
    }

    // Prepara próximo índice
    repeatCount--;
    if (repeatCount <= 0) {
        currentIndex = (currentIndex + 1) % playlist.length;
    }
}

function showImage(url, duration) {
    elements.playerVideo.classList.add('hidden');
    elements.playerVideo.pause();

    elements.playerImage.src = url;
    elements.playerImage.classList.remove('hidden');

    playTimer = setTimeout(playNext, duration * 1000);
}

function showVideo(url) {
    elements.playerImage.classList.add('hidden');

    elements.playerVideo.src = url;
    elements.playerVideo.classList.remove('hidden');
    elements.playerVideo.play().catch(e => {
        console.error("Erro autoplay vídeo:", e);
        // Em caso de erro de autoplay (bloqueio do browser), pula pro próximo em 3s
        playTimer = setTimeout(playNext, 3000);
    });

    elements.playerVideo.onended = () => {
        playNext();
    };

    elements.playerVideo.onerror = () => {
        console.error("Erro ao carregar vídeo");
        playNext();
    };
}


// =============================================================
// ===  MÉTRICAS DE PERFORMANCE  ===============================
// =============================================================

async function collectMetrics() {
    const metrics = {
        cpu_usage: 0,
        ram_usage: 0,
        ram_total: 0,
        storage_used: 0,
        storage_total: 0,
        net_down_speed: 0,
        net_up_speed: 0,
        net_type: 'unknown',
        net_effective_type: 'unknown',
        net_downlink: 0,
        net_rtt: 0,
    };

    // 1. CPU — estimativa via task timing
    try {
        const cpuStart = performance.now();
        let iterations = 0;
        while (performance.now() - cpuStart < 5) { iterations++; }
        const maxIter = 150000;
        metrics.cpu_usage = Math.round(Math.min(100, Math.max(0, 100 - (iterations / maxIter * 100))));
    } catch (e) { }

    // 2. RAM — Performance.memory (Chrome/Edge)
    try {
        if (performance.memory) {
            metrics.ram_usage = Math.round(performance.memory.usedJSHeapSize / 1048576);
            metrics.ram_total = Math.round(performance.memory.jsHeapSizeLimit / 1048576);
        } else if (navigator.deviceMemory) {
            metrics.ram_total = Math.round(navigator.deviceMemory * 1024);
        }
    } catch (e) { }

    // 3. Armazenamento — StorageManager API
    try {
        if (navigator.storage && navigator.storage.estimate) {
            const est = await navigator.storage.estimate();
            metrics.storage_total = Math.round((est.quota || 0) / 1048576);
            metrics.storage_used = Math.round((est.usage || 0) / 1048576);
        }
    } catch (e) { }

    // 4. Rede — NetworkInformation API
    try {
        const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
        if (conn) {
            metrics.net_type = conn.type || 'unknown';
            metrics.net_effective_type = conn.effectiveType || 'unknown';
            metrics.net_downlink = conn.downlink || 0;
            metrics.net_rtt = conn.rtt || 0;
        }
    } catch (e) { }

    // 5. Velocidade real de download — medição via requisição
    try {
        const testUrl = `${config.serverUrl}/api/stats?_t=${Date.now()}`;
        const startTime = performance.now();
        const resp = await safeFetch(testUrl, { cache: 'no-store' });
        const blob = await resp.blob();
        const endTime = performance.now();
        const duration = (endTime - startTime) / 1000;
        const sizeKB = blob.size / 1024;
        if (duration > 0) {
            metrics.net_down_speed = Math.round((sizeKB / duration) * 100) / 100;
        }
    } catch (e) { }

    return metrics;
}

async function runMetricsLoop() {
    if (!config.deviceId) {
        metricsTimer = setTimeout(runMetricsLoop, 15000);
        return;
    }

    try {
        const metrics = await collectMetrics();
        await safeFetch(`${config.serverUrl}/devices/metrics`, {
            method: 'POST',
            body: new URLSearchParams({
                device_id: config.deviceId,
                ...metrics
            })
        });
    } catch (e) {
        console.error("Erro ao enviar métricas:", e);
    }
    metricsTimer = setTimeout(runMetricsLoop, 15000);
}


// Inicia aplicação
init();
