const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path'); // Added for robust path handling

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*", // Allows connections from any origin
        methods: ["GET", "POST"]
    }
});

// Use path.join to ensure it finds the public folder on the hosting provider
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
        const fullIdName = `${playerName || 'Player'}#${Math.floor(1000 + Math.random() * 9000)}`;

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
        addPlayerToRoom(roomCode, socket.id, fullIdName);
        socket.emit('roomCreated', { roomCode, playerName: fullIdName });
        updateLobby(roomCode);
    });

    socket.on('joinRoom', ({ playerName, roomCode }) => {
        const code = roomCode.toUpperCase();
        if (rooms[code] && !rooms[code].started) {
            const fullIdName = `${playerName || 'Player'}#${Math.floor(1000 + Math.random() * 9000)}`;
            socket.join(code);
            socket.roomCode = code;
            addPlayerToRoom(code, socket.id, fullIdName);
            socket.emit('roomJoined', { roomCode: code, playerName: fullIdName });
            updateLobby(code);
        }
    });

    socket.on('updateSettings', (settings) => {
        const room = rooms[socket.roomCode];
        if (room && room.leader === socket.id && !room.started) {
            room.mapType = settings.mapType;
            room.duration = parseInt(settings.duration);
            room.gameState.arenaSize = MAP_CONFIGS[settings.mapType].size;
            
            io.to(socket.roomCode).emit('settingsUpdated', {
                mapType: room.mapType,
                duration: room.duration
            });
        }
    });

    socket.on('startGame', () => {
        const room = rooms[socket.roomCode];
        if (room && room.leader === socket.id) {
            room.started = true;
            for (let id in room.gameState.players) {
                room.gameState.players[id].alive = true;
                room.gameState.players[id].x = (Math.random() - 0.5) * 100;
                room.gameState.players[id].y = (Math.random() - 0.5) * 100;
            }
            io.to(socket.roomCode).emit('gameStarted', { mapType: room.mapType });
            runGameLoop(socket.roomCode);
        }
    });

    socket.on('restartGame', () => {
        const room = rooms[socket.roomCode];
        if (room && room.leader === socket.id) {
            room.started = false;
            room.gameState.isGameOver = false;
            room.gameState.winner = null;
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
                if (remaining.length > 0) {
                    rooms[socket.roomCode].leader = remaining[0];
                } else {
                    delete rooms[socket.roomCode];
                    return;
                }
            }
            updateLobby(socket.roomCode);
        }
    });
});

function addPlayerToRoom(code, socketId, name) {
    rooms[code].gameState.players[socketId] = {
        id: socketId, name, x: 0, y: 0, alive: true,
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
    const TICK_RATE = 60;
    room.timeLeft = room.duration;
    room.gameState.arenaSize = MAP_CONFIGS[room.mapType].size;
    const shrinkPerTick = (room.gameState.arenaSize - 50) / (room.duration * TICK_RATE);

    const interval = setInterval(() => {
        if (!room || room.gameState.isGameOver || !room.started) return clearInterval(interval);

        room.timeLeft -= (1 / TICK_RATE);
        room.gameState.arenaSize -= shrinkPerTick;

        let alivePlayers = [];
        const playerIds = Object.keys(room.gameState.players);

        playerIds.forEach(id => {
            const p = room.gameState.players[id];
            if (!p.alive) return;

            const speed = p.input.dash ? 13 : 6;
            if (p.input.up) p.y -= speed;
            if (p.input.down) p.y += speed;
            if (p.input.left) p.x -= speed;
            if (p.input.right) p.x += speed;

            playerIds.forEach(id2 => {
                if (id === id2) return;
                const p2 = room.gameState.players[id2];
                if (!p2.alive) return;
                const dx = p2.x - p.x;
                const dy = p2.y - p.y;
                const dist = Math.sqrt(dx*dx + dy*dy);
                if (dist < 40) {
                    const angle = Math.atan2(dy, dx);
                    const force = p.input.dash ? 30 : 8;
                    p2.x += Math.cos(angle) * force;
                    p2.y += Math.sin(angle) * force;
                }
            });

            if (Math.sqrt(p.x*p.x + p.y*p.y) > room.gameState.arenaSize) {
                p.alive = false;
            } else {
                alivePlayers.push(p);
            }
        });

        if (alivePlayers.length <= 1 && playerIds.length > 1) {
            room.gameState.isGameOver = true;
            io.to(roomCode).emit('matchEnded', { winner: alivePlayers[0]?.name || "Draw" });
        }

        io.to(roomCode).emit('gameStateUpdate', { 
            ...room.gameState, 
            timeLeft: Math.max(0, Math.ceil(room.timeLeft)) 
        });
    }, 1000 / TICK_RATE);
}

// DYNAMIC PORT: Vercel/Railway/Render will provide this automatically
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Arena.io Server Running on Port ${PORT}`));