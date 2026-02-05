// --- INITIALIZATION ---
// Force websocket transport for production stability (Vercel/Railway requirement)
const socket = io({
    transports: ['websocket'] 
});

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

let gameState = null;
let currentMap = "neon_void";
let isLeader = false;
let isSpectating = false;
let animationId = null; // Track the loop to prevent memory leaks

// --- MAP CONFIGURATIONS ---
const MAPS = {
    "neon_void": { color: "#00f2ff", secondary: "#ff0055", bg: "#050508", particleCount: 80, pColor: "#00f2ff" },
    "lava_pit": { color: "#ff4400", secondary: "#ffcc00", bg: "#1a0500", particleCount: 50, pColor: "#ffcc00" },
    "deep_ocean": { color: "#0077ff", secondary: "#00ffff", bg: "#00051a", particleCount: 100, pColor: "#00ffff" },
    "enchanted_forest": { color: "#22ff66", secondary: "#aaff00", bg: "#020a05", particleCount: 60, pColor: "#22ff66" },
    "galactic_core": { color: "#ff00ff", secondary: "#ffffff", bg: "#0a0015", particleCount: 150, pColor: "#ffffff" }
};

// --- LOBBY SETTINGS SYNC ---
function changeLobbySettings() {
    if (!isLeader) return;
    const settings = {
        mapType: document.getElementById('lobbyMapType').value,
        duration: document.getElementById('lobbyDuration').value
    };
    socket.emit('updateSettings', settings);
}

socket.on('settingsUpdated', (data) => {
    currentMap = data.mapType;
    const mapSelect = document.getElementById('lobbyMapType');
    const durSelect = document.getElementById('lobbyDuration');
    if (mapSelect) mapSelect.value = data.mapType;
    if (durSelect) durSelect.value = data.duration;
});

// --- ATMOSPHERIC PARTICLES ---
const particles = [];
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

// --- UI NAVIGATION ---
function hideAll() { document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden')); }
function showCreate() { hideAll(); document.getElementById('createScreen').classList.remove('hidden'); }
function showJoin() { hideAll(); document.getElementById('joinScreen').classList.remove('hidden'); }

function createRoom() {
    const name = document.getElementById('playerName').value || "Slayer";
    const settings = { 
        mapType: document.getElementById('mapType').value, 
        duration: document.getElementById('duration').value 
    };
    socket.emit('createRoom', { playerName: name, settings });
}

function joinRoom() {
    const name = document.getElementById('playerName').value || "Guest";
    const code = document.getElementById('roomCodeInput').value;
    socket.emit('joinRoom', { playerName: name, roomCode: code });
}

function startGame() { socket.emit('startGame'); }
function restartGame() { socket.emit('restartGame'); }

// --- SOCKET EVENTS ---
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
            `<div class="player-node">${p.isLeader ? '👑 ' : ''}${p.name}</div>`
        ).join('');
    }
});

socket.on('gameStarted', (data) => {
    hideAll();
    currentMap = data.mapType;
    createParticles();
    canvas.classList.remove('hidden');
    document.getElementById('gameUI').classList.remove('hidden');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    
    // Ensure only one draw loop is running
    if (animationId) cancelAnimationFrame(animationId);
    draw();
});

socket.on('roomReset', () => {
    hideAll();
    gameState = null;
    isSpectating = false;
    if (animationId) cancelAnimationFrame(animationId); // Stop drawing when in lobby
    canvas.classList.add('hidden');
    document.getElementById('gameUI').classList.add('hidden');
    document.getElementById('lobbyScreen').classList.remove('hidden');
    document.getElementById('endScreen').classList.add('hidden'); // Clear end screen
    
    if (isLeader) {
        document.getElementById('leaderSettings').classList.remove('hidden');
        document.getElementById('startBtn').classList.remove('hidden');
    }
});

socket.on('gameStateUpdate', (state) => { gameState = state; });

socket.on('matchEnded', (data) => {
    document.getElementById('endScreen').classList.remove('hidden');
    document.getElementById('winnerText').innerText = `Winner: ${data.winner}`;
    if (isLeader) document.getElementById('restartBtn').classList.remove('hidden');
});

// --- RENDER ENGINE ---
function draw() {
    if (!gameState) {
        animationId = requestAnimationFrame(draw);
        return;
    }
    const theme = MAPS[currentMap] || MAPS["neon_void"];

    ctx.fillStyle = theme.bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    particles.forEach(p => {
        p.y += p.vy; p.x += p.vx;
        if (p.y < 0) p.y = canvas.height;
        ctx.globalAlpha = p.opacity * 0.5;
        ctx.fillStyle = theme.pColor;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
    });
    ctx.globalAlpha = 1;

    let me = gameState.players[socket.id];
    let target = (me && me.alive) ? me : Object.values(gameState.players).find(p => p.alive) || me;

    const specBanner = document.getElementById('specBanner');
    if (me && !me.alive) {
        isSpectating = true;
        if (specBanner) specBanner.classList.remove('hidden');
    } else {
        isSpectating = false;
        if (specBanner) specBanner.classList.add('hidden');
    }

    if (target) {
        ctx.save();
        ctx.translate(canvas.width / 2 - target.x, canvas.height / 2 - target.y);

        ctx.shadowBlur = 20;
        ctx.shadowColor = theme.color;
        ctx.strokeStyle = theme.color;
        ctx.lineWidth = 8;
        ctx.beginPath();
        ctx.arc(0, 0, gameState.arenaSize, 0, Math.PI * 2);
        ctx.stroke();
        ctx.shadowBlur = 0;

        for (let id in gameState.players) {
            const p = gameState.players[id];
            if (!p.alive) continue;
            
            const baseColor = (id === socket.id) ? "#ffffff" : theme.secondary;

            const grad = ctx.createRadialGradient(p.x - 7, p.y - 7, 2, p.x, p.y, 22);
            grad.addColorStop(0, "#ffffff");
            grad.addColorStop(0.3, baseColor); 
            grad.addColorStop(1, "#000000");

            ctx.shadowBlur = 15;
            ctx.shadowColor = baseColor;
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(p.x, p.y, 20, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;

            ctx.fillStyle = "white";
            ctx.font = "bold 13px Arial";
            ctx.textAlign = "center";
            ctx.fillText(p.name, p.x, p.y - 35);
        }
        ctx.restore();
    }

    const timerDisp = document.getElementById('timerDisplay');
    if (timerDisp) timerDisp.innerText = (gameState.timeLeft || 0) + "s REMAINING";
    
    animationId = requestAnimationFrame(draw);
}

// --- INPUTS ---
const inputs = { up: false, down: false, left: false, right: false, dash: false };
window.addEventListener('keydown', e => handle(e, true));
window.addEventListener('keyup', e => handle(e, false));

function handle(e, isDown) {
    if (isSpectating) return; 
    let changed = false;
    if (e.code === 'KeyW' && inputs.up !== isDown) { inputs.up = isDown; changed = true; }
    if (e.code === 'KeyS' && inputs.down !== isDown) { inputs.down = isDown; changed = true; }
    if (e.code === 'KeyA' && inputs.left !== isDown) { inputs.left = isDown; changed = true; }
    if (e.code === 'KeyD' && inputs.right !== isDown) { inputs.right = isDown; changed = true; }
    if (e.code === 'Space' && inputs.dash !== isDown) { inputs.dash = isDown; changed = true; }
    
    if (changed) socket.emit('playerInput', inputs);
}

window.addEventListener('resize', () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    createParticles();
});