'use strict';

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const GameEngine = require('./src/GameEngine');

// ─── HTTP + Socket.IO setup ──────────────────────────────────────────────────

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Statické soubory z /public, SPA fallback na index.html
app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (_req, res) =>
  res.sendFile(path.join(__dirname, 'public', 'index.html'))
);

// ─── Stav místností ──────────────────────────────────────────────────────────

/**
 * @type {Map<string, { engine: GameEngine, password: string, name: string }>}
 */
const rooms = new Map();
const MAX_ROOMS = 5;

/**
 * Vrátí seznam místností pro lobby
 */
function getRoomList() {
  return Array.from(rooms.entries()).map(([id, r]) => ({
    id,
    name: r.name,
    players: r.engine.players.size,
    phase: r.engine.phase,
    hasPassword: !!r.password,
  }));
}

/**
 * Odstraní hráče z místnosti a smaže ji, pokud je prázdná.
 * Voláno jak při `game:leave`, tak při `disconnect`.
 */
function handleLeave(socket) {
  const roomId = socket.roomId;
  if (!roomId) return;

  const room = rooms.get(roomId);
  if (room) {
    room.engine.removePlayer(socket);
    socket.leave(roomId);
    socket.roomId = null;

    if (room.engine.players.size === 0) {
      rooms.delete(roomId);
    }
  }

  // Aktualizuj lobby u všech připojených klientů
  io.emit('room:list', getRoomList());
}

// ─── Socket.IO události ──────────────────────────────────────────────────────

io.on('connection', socket => {
  console.log(`[+] ${socket.id}`);

  // Lobby: klient žádá o aktuální seznam místností
  socket.on('room:list', () => {
    socket.emit('room:list', getRoomList());
  });

  // Vytvoření nové místnosti
  socket.on('room:create', ({ name, password }) => {
    if (rooms.size >= MAX_ROOMS) {
      return socket.emit('game:error', {
        message: `Dosažen maximální počet místností (${MAX_ROOMS}). Zkuste to prosím později.`,
      });
    }

    const nameExists = Array.from(rooms.values()).some(r => r.name === name);
    if (nameExists) {
      return socket.emit('game:error', {
        message: 'Místnost s tímto názvem již existuje. Zvolte prosím jiný název.',
      });
    }

    const roomId = Math.random().toString(36).substr(2, 9);
    const engine = new GameEngine(io, roomId);
    rooms.set(roomId, { engine, password, name });

    socket.emit('room:created', { roomId, password });
    io.emit('room:list', getRoomList());
  });

  // Vstup do existující místnosti (ověření hesla, join Socket.IO roomu)
  socket.on('room:join', ({ roomId, password }) => {
    const room = rooms.get(roomId);
    if (!room) {
      return socket.emit('game:error', { message: 'Místnost neexistuje.' });
    }
    if (room.password && room.password !== password) {
      return socket.emit('game:error', { message: 'Nesprávné heslo.' });
    }

    socket.join(roomId);
    socket.roomId = roomId;
    room.engine.sendInit(socket); // Pošle klientovi aktuální stav hry
    io.emit('room:list', getRoomList());
  });

  // ─── Herní události (delegováno do GameEngine) ───────────────────────────

  socket.on('game:join', d => rooms.get(socket.roomId)?.engine.addPlayer(socket, d?.name, d?.color));
  socket.on('game:start', () => rooms.get(socket.roomId)?.engine.startGame(socket));
  socket.on('game:update_config', d => rooms.get(socket.roomId)?.engine.updateConfig(socket, d));
  socket.on('game:ready', () => rooms.get(socket.roomId)?.engine.toggleReady(socket.id));
  socket.on('game:roll', () => rooms.get(socket.roomId)?.engine.handleRoll(socket));
  socket.on('game:respond', d => rooms.get(socket.roomId)?.engine.handleRespond(socket, d));

  // ─── Odpojení ────────────────────────────────────────────────────────────

  socket.on('game:leave', () => handleLeave(socket));
  socket.on('disconnect', () => { console.log(`[-] ${socket.id}`); handleLeave(socket); });
});

// ─── Start serveru ───────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3000;
server.listen(PORT, () =>
  console.log(`\n🏇  Dostihy a sázky — http://localhost:${PORT}\n`)
);
