const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

app.use(express.static(path.join(__dirname, 'public')));

const rooms = {};

const MAP_CONFIGS = {
    "neon_void": { size: 800 },
    "lava_pit": { size: 700 },
    "deep_ocean": { size: 900 },
    "enchanted_forest": { size: 750 },
    "galactic_core": { size: 1100 }
};

io.on('connection', (socket) => {
    socket.on('createRoom', ({ playerName, settings }) => {
        const roomCode = Math.random().toString(36).substring(2, 7).toUpperCase();
        const name = `${playerName || 'Player'}#${Math.floor(1000 + Math.random() * 9000)}`;

        rooms[roomCode] = {
            id: roomCode,
            leader: socket.id,
            started: false,
            mapType: settings.mapType || "neon_void",
            duration: parseInt(settings.duration) || 60,
            timeLeft: parseInt(settings.duration) || 60,
            gameState: {
                players: {},
                arenaSize: MAP_CONFIGS[settings.mapType]?.size || 800,
                isGameOver: false,
                winner: null
            }
        };

        socket.join(roomCode);
        socket.roomCode = roomCode;
        addPlayerToRoom(roomCode, socket.id, name);
        socket.emit('roomCreated', { roomCode, playerName: name });
        updateLobby(roomCode);
    });

    socket.on('joinRoom', ({ playerName, roomCode }) => {
        const code = roomCode.toUpperCase();
        if (rooms[code] && !rooms[code].started) {
            const name = `${playerName || 'Player'}#${Math.floor(1000 + Math.random() * 9000)}`;
            socket.join(code);
            socket.roomCode = code;
            addPlayerToRoom(code, socket.id, name);
            socket.emit('roomJoined', { roomCode: code, playerName: name });
            updateLobby(code);
        }
    });

    socket.on('updateSettings', (settings) => {
        const room = rooms[socket.roomCode];
        if (room && room.leader === socket.id && !room.started) {
            room.mapType = settings.mapType;
            room.duration = parseInt(settings.duration);
            room.gameState.arenaSize = MAP_CONFIGS[settings.mapType].size;
            io.to(socket.roomCode).emit('settingsUpdated', settings);
        }
    });

    socket.on('startGame', () => {
        const room = rooms[socket.roomCode];
        if (room && room.leader === socket.id) {
            room.started = true;
            room.gameState.isGameOver = false;
            room.gameState.winner = null;
            
            const ids = Object.keys(room.gameState.players);
            ids.forEach((id, i) => {
                const p = room.gameState.players[id];
                const angle = (i / ids.length) * Math.PI * 2;
                p.alive = true;
                p.x = Math.cos(angle) * 100; // Small circle spawn
                p.y = Math.sin(angle) * 100;
                p.vx = 0;
                p.vy = 0;
                p.spawnTimer = 180; // 3 seconds of invincibility (60 ticks * 3)
            });
            
            io.to(socket.roomCode).emit('gameStarted', { mapType: room.mapType });
            runGameLoop(socket.roomCode);
        }
    });

    socket.on('restartGame', () => {
        const room = rooms[socket.roomCode];
        if (room && room.leader === socket.id) {
            room.started = false;
            room.gameState.isGameOver = false;
            io.to(socket.roomCode).emit('roomReset');
            updateLobby(socket.roomCode);
        }
    });

    socket.on('playerInput', (input) => {
        const room = rooms[socket.roomCode];
        if (room && room.gameState.players[socket.id]) {
            room.gameState.players[socket.id].input = input;
        }
    });

    socket.on('disconnect', () => {
        if (socket.roomCode && rooms[socket.roomCode]) {
            delete rooms[socket.roomCode].gameState.players[socket.id];
            if (rooms[socket.roomCode].leader === socket.id) {
                const remaining = Object.keys(rooms[socket.roomCode].gameState.players);
                if (remaining.length > 0) rooms[socket.roomCode].leader = remaining[0];
                else delete rooms[socket.roomCode];
            }
            if (rooms[socket.roomCode]) updateLobby(socket.roomCode);
        }
    });
});

function addPlayerToRoom(code, socketId, name) {
    rooms[code].gameState.players[socketId] = {
        id: socketId, name, x: 0, y: 0, vx: 0, vy: 0,
        alive: true, dashCooldown: 0, spawnTimer: 0,
        input: { up: false, down: false, left: false, right: false, dash: false }
    };
}

function updateLobby(code) {
    const room = rooms[code];
    if (!room) return;
    const players = Object.values(room.gameState.players).map(p => ({
        name: p.name, isLeader: p.id === room.leader 
    }));
    io.to(code).emit('lobbyUpdate', players);
}

function runGameLoop(roomCode) {
    const room = rooms[roomCode];
    if (!room) return;
    
    const TICK_RATE = 60;
    room.timeLeft = room.duration;
    const startArenaSize = MAP_CONFIGS[room.mapType].size;
    room.gameState.arenaSize = startArenaSize;
    const shrinkPerTick = (startArenaSize - 100) / (room.duration * TICK_RATE);

    const interval = setInterval(() => {
        if (!room || room.gameState.isGameOver || !room.started) {
            clearInterval(interval);
            return;
        }

        room.timeLeft -= (1 / TICK_RATE);
        room.gameState.arenaSize -= shrinkPerTick;

        const playerIds = Object.keys(room.gameState.players);
        let alivePlayers = [];

        playerIds.forEach(id => {
            const p = room.gameState.players[id];
            if (!p.alive) return;

            if (p.dashCooldown > 0) p.dashCooldown--;
            if (p.spawnTimer > 0) p.spawnTimer--;

            const isDashing = p.input.dash && p.dashCooldown === 0;
            if (isDashing) p.dashCooldown = 90; // 1.5s cooldown

            // Physics
            const accel = isDashing ? 4.0 : 0.7;
            if (p.input.up) p.vy -= accel;
            if (p.input.down) p.vy += accel;
            if (p.input.left) p.vx -= accel;
            if (p.input.right) p.vx += accel;

            p.vx *= 0.94;
            p.vy *= 0.94;
            p.x += p.vx;
            p.y += p.vy;

            // Collisions (Only if both players aren't spawning)
            playerIds.forEach(id2 => {
                if (id === id2) return;
                const p2 = room.gameState.players[id2];
                if (!p2.alive || p.spawnTimer > 0 || p2.spawnTimer > 0) return;

                const dx = p2.x - p.x;
                const dy = p2.y - p.y;
                const dist = Math.sqrt(dx*dx + dy*dy);

                if (dist < 40) { 
                    const angle = Math.atan2(dy, dx);
                    const force = isDashing ? 16 : 5;
                    p2.vx += Math.cos(angle) * force;
                    p2.vy += Math.sin(angle) * force;
                    p.vx -= Math.cos(angle) * (force * 0.5);
                    p.vy -= Math.sin(angle) * (force * 0.5);
                    io.to(roomCode).emit('playerHit', { x: (p.x + p2.x)/2, y: (p.y + p2.y)/2 });
                }
            });

            // Boundary
            const distFromCenter = Math.sqrt(p.x*p.x + p.y*p.y);
            if (distFromCenter > room.gameState.arenaSize) {
                p.alive = false;
            } else {
                alivePlayers.push(p);
            }
        });

        // FIXED WIN CONDITION
        // Only end game if at least one person has actually played
        if (playerIds.length > 0) {
            // Multiplayer Win
            if (playerIds.length > 1 && alivePlayers.length <= 1) {
                room.gameState.isGameOver = true;
                const winnerName = alivePlayers.length === 1 ? alivePlayers[0].name : "Draw";
                io.to(roomCode).emit('matchEnded', { winner: winnerName });
            } 
            // Solo Test Win
            else if (playerIds.length === 1 && alivePlayers.length === 0) {
                room.gameState.isGameOver = true;
                io.to(roomCode).emit('matchEnded', { winner: "Game Over (Solo)" });
            }
        }

        io.to(roomCode).emit('gameStateUpdate', { 
            ...room.gameState, 
            timeLeft: Math.max(0, Math.ceil(room.timeLeft)) 
        });
    }, 1000 / TICK_RATE);
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server on port ${PORT}`));