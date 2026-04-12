'use strict';

const express    = require('express');
const http       = require('http');
const { Server } = require('socket.io');
const path       = require('path');
const GameEngine = require('./src/GameEngine');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

const rooms = new Map(); // roomId -> { engine, password, name }

function getRoomList() {
  const list = [];
  for (const [id, r] of rooms.entries()) {
    list.push({
      id,
      name: r.name,
      players: r.engine.players.size,
      phase: r.engine.phase,
      hasPassword: !!r.password
    });
  }
  return list;
}

io.on('connection', socket => {
  console.log(`[+] ${socket.id}`);
  
  socket.on('room:list', () => {
    socket.emit('room:list', getRoomList());
  });

  socket.on('room:create', ({ name, password }) => {
    const roomId = Math.random().toString(36).substr(2, 9);
    const engine = new GameEngine(io, roomId);
    rooms.set(roomId, { engine, password, name });
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
    const room = rooms.get(socket.roomId);
    if (room) room.engine.addPlayer(socket, d?.name, d?.color);
  });

  socket.on('game:start', () => {
    const room = rooms.get(socket.roomId);
    if (room) room.engine.startGame(socket);
  });

  socket.on('game:update_config', d => {
    const room = rooms.get(socket.roomId);
    if (room) room.engine.updateConfig(socket, d);
  });

  socket.on('game:roll', () => {
    const room = rooms.get(socket.roomId);
    if (room) room.engine.handleRoll(socket);
  });

  socket.on('game:respond', d => {
    const room = rooms.get(socket.roomId);
    if (room) room.engine.handleRespond(socket, d);
  });

  socket.on('game:leave', () => {
    handleLeave(socket);
  });

  socket.on('disconnect', () => {
    console.log(`[-] ${socket.id}`);
    handleLeave(socket);
  });

  function handleLeave(socket) {
    const rId = socket.roomId;
    if (!rId) return;
    const room = rooms.get(rId);
    if (room) {
      room.engine.removePlayer(socket);
      socket.leave(rId);
      socket.roomId = null;
      if (room.engine.players.size === 0) {
        rooms.delete(rId);
      }
    }
    io.emit('room:list', getRoomList());
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`\n🏇  Dostihy a sázky — http://localhost:${PORT}\n`));
