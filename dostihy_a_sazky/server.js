'use strict';

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const GameEngine = require('./src/GameEngine');
const { generateToken, verifyToken } = require('./src/auth');
const { PLAYER_COLORS } = require('./src/constants');

// ─── HTTP + Socket.IO setup ──────────────────────────────────────────────────

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const DEV_MODE = process.env.npm_lifecycle_event === 'dev' || process.env.NODE_ENV === 'development';

app.use(express.static(path.join(__dirname, 'public')));
app.get('/api/config', (_req, res) => res.json({ devMode: DEV_MODE, colors: PLAYER_COLORS }));
app.get('*', (_req, res) =>
  res.sendFile(path.join(__dirname, 'public', 'index.html'))
);

// ─── Stav místností ──────────────────────────────────────────────────────────

/** @type {Map<string, { engine: GameEngine, password: string, name: string }>} */
const rooms = new Map();
const MAX_ROOMS = 5;

// Rate limiting: `${playerId}:${event}` → posledníMs
const rateLimits = new Map();

function throttle(socket, event, limitMs) {
  const key = `${socket.playerId}:${event}`;
  const now = Date.now();
  if (now - (rateLimits.get(key) || 0) < limitMs) return true;
  rateLimits.set(key, now);
  return false;
}

// playerId → { timer, roomId } — aktivní grace timery při odpojení
const reconnectTimers = new Map();

const RECONNECT_GRACE_MS = 120_000;

function getRoomList() {
  return Array.from(rooms.entries()).map(([id, r]) => ({
    id,
    name: r.name,
    players: r.engine.players.size,
    phase: r.engine.phase,
    hasPassword: !!r.password,
  }));
}

function removePlayerFromRoom(roomId, playerId, socket = null) {
  if (!roomId || !playerId) return;
  const room = rooms.get(roomId);
  if (room) {
    room.engine.removePlayer({ playerId });
    if (socket) {
      socket.leave(roomId);
      socket.roomId = null;
    }
    if (room.engine.players.size === 0) rooms.delete(roomId);
  }
}

function handleLeave(socket) {
  removePlayerFromRoom(socket.roomId, socket.playerId, socket);
  io.emit('room:list', getRoomList());
}

// ─── JWT middleware ───────────────────────────────────────────────────────────

io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (token) {
    const payload = verifyToken(token);
    if (payload?.playerId) {
      socket.playerId = payload.playerId;
      return next();
    }
  }
  socket.playerId = uuidv4();
  next();
});

// ─── Socket.IO události ──────────────────────────────────────────────────────

io.on('connection', socket => {
  console.log(`[+] ${socket.id} (pid: ${socket.playerId})`);

  // ─── Registrace všech handlerů ────────────────────────────────────────────

  socket.on('room:list', () => {
    if (throttle(socket, 'room:list', 2000)) return;
    socket.emit('room:list', getRoomList());
  });

  socket.on('room:create', ({ name, password, playerName, color }) => {
    const finalRoomName = typeof name === 'string' ? name.trim() : '';
    const finalPlayerName = typeof playerName === 'string' ? playerName.trim() : '';
    if (!finalPlayerName) {
      return socket.emit('game:error', { message: 'Pro vytvoření místnosti je potřeba jméno hráče.' });
    }
    if (!finalRoomName) {
      return socket.emit('game:error', { message: 'Název místnosti je povinný.' });
    }
    if (rooms.size >= MAX_ROOMS) {
      return socket.emit('game:error', {
        message: `Dosažen maximální počet místností (${MAX_ROOMS}). Zkuste to prosím později.`,
      });
    }
    const nameExists = Array.from(rooms.values()).some(r => r.name === finalRoomName);
    if (nameExists) {
      return socket.emit('game:error', {
        message: 'Místnost s tímto názvem již existuje. Zvolte prosím jiný název.',
      });
    }
    const roomId = Math.random().toString(36).substr(2, 9);
    const engine = new GameEngine(io, roomId);
    rooms.set(roomId, { engine, password, name: finalRoomName });
    socket.join(roomId);
    socket.roomId = roomId;
    const token = generateToken(socket.playerId);
    socket.emit('game:token', { token, playerId: socket.playerId });
    engine.addPlayer(socket, finalPlayerName, color);
    engine.sendInit(socket);

    socket.emit('room:created', { roomId, password });
    io.emit('room:list', getRoomList());
  });

  socket.on('room:join', ({ roomId, password }) => {
    const room = rooms.get(roomId);
    if (!room) return socket.emit('game:error', { message: 'Místnost neexistuje.' });
    if (room.password && room.password !== password) {
      return socket.emit('game:error', { message: 'Nesprávné heslo.' });
    }
    socket.join(roomId);
    socket.roomId = roomId;
    room.engine.sendInit(socket);
    io.emit('room:list', getRoomList());
  });

  socket.on('game:join', d => {
    const engine = rooms.get(socket.roomId)?.engine;
    if (!engine) return;
    const token = generateToken(socket.playerId);
    socket.emit('game:token', { token, playerId: socket.playerId });
    engine.addPlayer(socket, d?.name, d?.color);
    io.emit('room:list', getRoomList());
  });

  socket.on('game:start', () => {
    const engine = rooms.get(socket.roomId)?.engine;
    if (engine) { engine.startGame(socket); io.emit('room:list', getRoomList()); }
  });
  socket.on('game:update_config', d => rooms.get(socket.roomId)?.engine.updateConfig(socket, d));
  socket.on('game:ready', () => rooms.get(socket.roomId)?.engine.toggleReady(socket.playerId));
  socket.on('game:change_color', ({ color }) => rooms.get(socket.roomId)?.engine.changeColor(socket.playerId, color));
  socket.on('game:change_name', ({ name }) => rooms.get(socket.roomId)?.engine.changeName(socket.playerId, name));
  socket.on('game:roll', () => {
    if (throttle(socket, 'roll', 500)) return;
    rooms.get(socket.roomId)?.engine.handleRoll(socket);
  });
  socket.on('game:respond', d => {
    if (throttle(socket, 'respond', 300)) return;
    rooms.get(socket.roomId)?.engine.handleRespond(socket, d);
  });
  socket.on('game:trade_init', d => rooms.get(socket.roomId)?.engine.initiateTrade(socket, d));
  socket.on('game:debug_set_state', d => {
    if (!DEV_MODE) { socket.emit('game:error', { message: 'Debug funkce je dostupná jen v dev módu.' }); return; }
    rooms.get(socket.roomId)?.engine.handleDebugSetState(socket, d);
  });

  socket.on('game:leave', () => {
    reconnectTimers.delete(socket.playerId);
    handleLeave(socket);
  });

  socket.on('disconnect', () => {
    console.log(`[-] ${socket.id} (pid: ${socket.playerId})`);
    ['roll', 'respond', 'room:list'].forEach(e => rateLimits.delete(`${socket.playerId}:${e}`));
    const roomId = socket.roomId;
    const playerId = socket.playerId;
    const room = rooms.get(roomId);

    if (room) {
      // Grace period ve všech fázích (lobby i playing) — čekáme na reconnect
      room.engine.markDisconnected(playerId);
      const timer = setTimeout(() => {
        reconnectTimers.delete(playerId);
        removePlayerFromRoom(roomId, playerId);
        io.emit('room:list', getRoomList());
      }, RECONNECT_GRACE_MS);
      reconnectTimers.set(playerId, { timer, roomId });
    } else {
      handleLeave(socket);
    }
  });

  // ─── Reconnect detekce ────────────────────────────────────────────────────
  // Musí být NA KONCI aby handlery byly registrovány i pro reconnect socket

  const pending = reconnectTimers.get(socket.playerId);
  if (pending) {
    clearTimeout(pending.timer);
    reconnectTimers.delete(socket.playerId);
    const room = rooms.get(pending.roomId);
    if (room) {
      socket.join(pending.roomId);
      socket.roomId = pending.roomId;
      // Pošli token a plný stav hry — klient po refreshi potřebuje boardData i myId
      const token = generateToken(socket.playerId);
      socket.emit('game:token', { token, playerId: socket.playerId });
      room.engine.sendInit(socket);
      room.engine.reconnectPlayer(socket);
      io.emit('room:list', getRoomList());
    }
  }
});

// ─── Start serveru ───────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3001;
server.listen(PORT, () =>
  console.log(`\n🏇  Dostihy a sázky — http://localhost:${PORT}\n`)
);
