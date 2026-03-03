// --- INITIALIZATION ---
const socket = io({
    transports: ['websocket'] 
});

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// --- AUDIO SYSTEM ---
const sounds = {
    bgm: new Audio('bgm.mp3'),
    hit: new Audio('hit.mp3')
};
sounds.bgm.loop = true;
sounds.bgm.volume = 0.2;

let isMuted = false;

function startAudio() {
    if (!isMuted) {
        sounds.bgm.play().catch(e => console.log("Audio waiting for interaction"));
    }
}

function toggleMute(e) {
    if (e && e.target) e.target.blur(); 
    isMuted = !isMuted;
    const btn = document.getElementById('muteBtn');
    if (isMuted) {
        sounds.bgm.pause();
        if (btn) btn.innerText = "🔈 Music: OFF";
    } else {
        sounds.bgm.play().catch(e => {});
        if (btn) btn.innerText = "🔊 Music: ON";
    }
}

function playHitSound() {
    if (isMuted) return; 
    const s = sounds.hit.cloneNode();
    s.volume = 0.2;
    s.play().catch(() => {});
}

// --- GAME STATE & CONSTANTS ---
let gameState = null;
let currentMap = "neon_void";
let isLeader = false;
let isSpectating = false;
let animationId = null; 
let screenShake = 0;
const hitSparks = [];
const particles = [];
const inputs = { up: false, down: false, left: false, right: false, dash: false };

const MAPS = {
    "neon_void": { color: "#00f2ff", secondary: "#ff0055", bg: "#050508", particleCount: 80, pColor: "#00f2ff" },
    "lava_pit": { color: "#ff4400", secondary: "#ffcc00", bg: "#1a0500", particleCount: 50, pColor: "#ffcc00" },
    "deep_ocean": { color: "#0077ff", secondary: "#00ffff", bg: "#00051a", particleCount: 100, pColor: "#00ffff" },
    "enchanted_forest": { color: "#22ff66", secondary: "#aaff00", bg: "#020a05", particleCount: 60, pColor: "#22ff66" },
    "galactic_core": { color: "#ff00ff", secondary: "#ffffff", bg: "#0a0015", particleCount: 150, pColor: "#ffffff" }
};

// --- HELPER FUNCTIONS ---

function resetInputs() {
    inputs.up = false; inputs.down = false; inputs.left = false; inputs.right = false; inputs.dash = false;
    socket.emit('playerInput', inputs);
}

function createParticles() {
    particles.length = 0;
    const settings = MAPS[currentMap] || MAPS["neon_void"];
    for (let i = 0; i < settings.particleCount; i++) {
        particles.push({
            x: Math.random() * window.innerWidth,
            y: Math.random() * window.innerHeight,
            size: Math.random() * 2 + 0.5,
            vx: (Math.random() - 0.5) * 0.3,
            vy: -Math.random() * 0.8 - 0.2,
            opacity: Math.random()
        });
    }
}

function hideAll() { 
    document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden')); 
    canvas.classList.add('hidden');
    document.getElementById('gameUI')?.classList.add('hidden');
    document.getElementById('mobileUI')?.classList.add('hidden');
    document.getElementById('restartScreen')?.classList.add('hidden');
    
    if (animationId) {
        cancelAnimationFrame(animationId);
        animationId = null;
    }
}

// --- WINDOW GLOBALS ---
window.showCreate = () => { hideAll(); document.getElementById('createScreen').classList.remove('hidden'); };
window.showJoin = () => { hideAll(); document.getElementById('joinScreen').classList.remove('hidden'); };
window.toggleMute = toggleMute;

window.createRoom = () => {
    startAudio();
    const name = document.getElementById('playerName').value || "Slayer";
    const settings = { 
        mapType: document.getElementById('mapType').value, 
        duration: document.getElementById('duration').value 
    };
    socket.emit('createRoom', { playerName: name, settings });
};

window.joinRoom = () => {
    startAudio();
    const name = document.getElementById('playerName').value || "Guest";
    const code = document.getElementById('roomCodeInput').value.toUpperCase();
    socket.emit('joinRoom', { playerName: name, roomCode: code });
};

window.startGame = () => socket.emit('startGame');
window.restartGame = () => socket.emit('restartGame');

window.changeLobbySettings = () => {
    if (!isLeader) return;
    const settings = {
        mapType: document.getElementById('lobbyMapType').value,
        duration: "60" 
    };
    socket.emit('updateSettings', settings);
};

// --- SOCKET LISTENERS ---

socket.on('settingsUpdated', (data) => {
    currentMap = data.mapType;
    if (document.getElementById('lobbyMapType')) document.getElementById('lobbyMapType').value = data.mapType;
});

socket.on('roomCreated', (data) => {
    hideAll(); isLeader = true;
    document.getElementById('lobbyScreen').classList.remove('hidden');
    document.getElementById('leaderSettings').classList.remove('hidden');
    document.getElementById('displayCode').innerText = data.roomCode;
    document.getElementById('startBtn').classList.remove('hidden');
});

socket.on('roomJoined', (data) => {
    hideAll(); isLeader = false;
    document.getElementById('lobbyScreen').classList.remove('hidden');
    document.getElementById('leaderSettings').classList.add('hidden');
    document.getElementById('displayCode').innerText = data.roomCode;
    document.getElementById('startBtn').classList.add('hidden');
});

socket.on('lobbyUpdate', (players) => {
    const pList = document.getElementById('playerList');
    if (pList) {
        pList.innerHTML = players.map(p => 
            `<div class="player-entry"><span>${p.name}</span> ${p.isLeader ? '<b style="color:#00f2ff">[HOST]</b>' : ''}</div>`
        ).join('');
    }
});

socket.on('gameStarted', (data) => {
    hideAll();
    isSpectating = false; 
    resetInputs(); 
    currentMap = data.mapType;
    createParticles();
    canvas.classList.remove('hidden');
    document.getElementById('gameUI').classList.remove('hidden');
    
    const isTouchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
    if (isTouchDevice) {
        document.getElementById('mobileUI')?.classList.remove('hidden');
    }

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    draw();
});

socket.on('playerHit', (pos) => {
    screenShake = 15; 
    playHitSound();
    for(let i=0; i<12; i++) {
        hitSparks.push({
            x: pos.x, y: pos.y,
            vx: (Math.random()-0.5)*18,
            vy: (Math.random()-0.5)*18,
            life: 1.0,
            color: MAPS[currentMap]?.color || "#ffffff"
        });
    }
});

socket.on('roomReset', () => {
    resetInputs(); 
    hideAll();
    gameState = null;
    isSpectating = false;
    document.getElementById('lobbyScreen').classList.remove('hidden');
    if (isLeader) {
        document.getElementById('leaderSettings').classList.remove('hidden');
        document.getElementById('startBtn').classList.remove('hidden');
    }
});

socket.on('matchEnded', (data) => {
    document.getElementById('mobileUI')?.classList.add('hidden');
    document.getElementById('restartScreen').classList.remove('hidden');
    document.getElementById('winnerText').innerText = `Winner: ${data.winner}`;
    if (isLeader) document.getElementById('leaderRestartBtn').classList.remove('hidden');
});

socket.on('gameStateUpdate', (state) => { gameState = state; });

// --- RENDER ENGINE ---

function draw() {
    if (!gameState) {
        animationId = requestAnimationFrame(draw);
        return;
    }
    const theme = MAPS[currentMap] || MAPS["neon_void"];
    ctx.fillStyle = theme.bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // MOBILE ZOOM LOGIC
    const isMobile = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
    const zoomLevel = isMobile ? 0.6 : 1.0; 

    ctx.save();
    
    // Center camera and apply scale
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.scale(zoomLevel, zoomLevel);

    if (screenShake > 0) {
        ctx.translate((Math.random() - 0.5) * screenShake, (Math.random() - 0.5) * screenShake);
        screenShake *= 0.85; 
        if (screenShake < 0.1) screenShake = 0;
    }

    // Draw Background Particles relative to scaled screen
    particles.forEach(p => {
        p.y += p.vy; p.x += p.vx;
        if (p.y < 0) p.y = canvas.height / zoomLevel;
        ctx.globalAlpha = p.opacity * 0.5;
        ctx.fillStyle = theme.pColor;
        ctx.beginPath(); 
        ctx.arc(p.x - (canvas.width / 2) / zoomLevel, p.y - (canvas.height / 2) / zoomLevel, p.size, 0, Math.PI * 2); 
        ctx.fill();
    });
    ctx.globalAlpha = 1;

    let me = gameState.players[socket.id];
    let target = (me && me.alive) ? me : Object.values(gameState.players).find(p => p.alive) || me;

    if (me && !me.alive) {
        isSpectating = true;
        document.getElementById('specBanner')?.classList.remove('hidden');
    } else {
        isSpectating = false;
        document.getElementById('specBanner')?.classList.add('hidden');
    }

    if (target) {
        ctx.save();
        ctx.translate(-target.x, -target.y);

        // Arena Border
        ctx.beginPath();
        ctx.arc(0, 0, gameState.arenaSize || 600, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255, 255, 255, 0.02)"; ctx.fill();
        ctx.shadowBlur = 20; ctx.shadowColor = theme.color; ctx.strokeStyle = theme.color;
        ctx.lineWidth = 10; ctx.stroke(); ctx.shadowBlur = 0;

        hitSparks.forEach((s, index) => {
            s.x += s.vx; s.y += s.vy; s.life -= 0.03;
            if (s.life <= 0) hitSparks.splice(index, 1);
            else { ctx.globalAlpha = s.life; ctx.fillStyle = s.color; ctx.fillRect(s.x, s.y, 4, 4); }
        });
        ctx.globalAlpha = 1;

        for (let id in gameState.players) {
            const p = gameState.players[id];
            if (!p.alive) continue;
            const isMe = (id === socket.id);
            const baseColor = isMe ? "#ffffff" : theme.secondary;

            if (p.vx !== 0 || p.vy !== 0) {
                ctx.globalAlpha = 0.2; ctx.fillStyle = baseColor;
                ctx.beginPath(); ctx.arc(p.x - (p.vx * 2), p.y - (p.vy * 2), 18, 0, Math.PI * 2); ctx.fill();
                ctx.globalAlpha = 1;
            }

            const grad = ctx.createRadialGradient(p.x - 7, p.y - 7, 2, p.x, p.y, 22);
            grad.addColorStop(0, "#ffffff");
            grad.addColorStop(0.3, baseColor); 
            grad.addColorStop(1, "#000000");

            ctx.shadowBlur = 15; ctx.shadowColor = baseColor;
            ctx.fillStyle = grad;
            ctx.beginPath(); ctx.arc(p.x, p.y, 20, 0, Math.PI * 2); ctx.fill();
            ctx.shadowBlur = 0;

            if (isMe) {
                const cdWidth = 40;
                ctx.fillStyle = "rgba(0,0,0,0.5)";
                ctx.fillRect(p.x - cdWidth/2, p.y + 35, cdWidth, 6);
                ctx.fillStyle = p.dashCooldown > 0 ? "#555" : "#00f2ff";
                const progress = p.dashCooldown > 0 ? (1 - p.dashCooldown/100) : 1;
                ctx.fillRect(p.x - cdWidth/2, p.y + 35, cdWidth * progress, 6);
            }

            ctx.fillStyle = "white"; 
            ctx.font = `bold ${14 / zoomLevel}px Arial`; 
            ctx.textAlign = "center";
            ctx.fillText(p.name, p.x, p.y - 40);
        }
        ctx.restore();
    }
    ctx.restore(); 

    const timerDisp = document.getElementById('timerDisplay');
    if (timerDisp) timerDisp.innerText = (gameState.timeLeft || 0) + "s REMAINING";
    animationId = requestAnimationFrame(draw);
}

// --- INPUT HANDLERS ---

function handle(e, isDown) {
    if (isSpectating || canvas.classList.contains('hidden')) return; 
    let changed = false;
    if (e.code === 'KeyW' && inputs.up !== isDown) { inputs.up = isDown; changed = true; }
    if (e.code === 'KeyS' && inputs.down !== isDown) { inputs.down = isDown; changed = true; }
    if (e.code === 'KeyA' && inputs.left !== isDown) { inputs.left = isDown; changed = true; }
    if (e.code === 'KeyD' && inputs.right !== isDown) { inputs.right = isDown; changed = true; }
    if (e.code === 'Space' && inputs.dash !== isDown) { inputs.dash = isDown; changed = true; }
    if (changed) socket.emit('playerInput', inputs);
}

window.addEventListener('keydown', e => { if (e.code === 'Space') e.preventDefault(); handle(e, true); });
window.addEventListener('keyup', e => handle(e, false));

// --- MOBILE TOUCH CONTROLS ---
const joyStick = { active: false, startX: 0, startY: 0 };
const joyBase = document.getElementById('joyBase');
const joyStickEl = document.getElementById('joyStick');

window.addEventListener('touchstart', e => {
    if (isSpectating || canvas.classList.contains('hidden')) return;
    const touch = e.touches[0];
    if (touch.clientX < window.innerWidth / 2) {
        joyStick.active = true;
        joyStick.startX = touch.clientX;
        joyStick.startY = touch.clientY;
        if(joyBase) {
            joyBase.style.left = `${joyStick.startX - 50}px`;
            joyBase.style.top = `${joyStick.startY - 50}px`;
            joyBase.classList.remove('hidden');
        }
    }
}, { passive: false });

window.addEventListener('touchmove', e => {
    if (!joyStick.active) return;
    e.preventDefault(); 
    const touch = Array.from(e.touches).find(t => t.clientX < window.innerWidth / 2);
    if (!touch) return;

    const dx = touch.clientX - joyStick.startX;
    const dy = touch.clientY - joyStick.startY;
    const dist = Math.sqrt(dx*dx + dy*dy);
    const max = 50;
    
    if(joyStickEl) {
        const moveX = dist > max ? (dx/dist) * max : dx;
        const moveY = dist > max ? (dy/dist) * max : dy;
        joyStickEl.style.transform = `translate(${moveX}px, ${moveY}px)`;
    }
    
    inputs.left = dx < -15;
    inputs.right = dx > 15;
    inputs.up = dy < -15;
    inputs.down = dy > 15;
    socket.emit('playerInput', inputs);
}, { passive: false });

window.addEventListener('touchend', e => {
    const leftTouch = Array.from(e.touches).find(t => t.clientX < window.innerWidth / 2);
    if (!leftTouch) {
        joyStick.active = false;
        joyBase?.classList.add('hidden');
        inputs.up = inputs.down = inputs.left = inputs.right = false;
        socket.emit('playerInput', inputs);
    }
});

window.mobileDash = (active) => {
    inputs.dash = active;
    socket.emit('playerInput', inputs);
};

window.addEventListener('resize', () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    createParticles();
});