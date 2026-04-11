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

const game = new GameEngine(io);

io.on('connection', socket => {
  console.log(`[+] ${socket.id}`);
  game.sendInit(socket);

  socket.on('game:join',    d => game.addPlayer(socket, d?.name, d?.color));
  socket.on('game:start',   () => game.startGame(socket));
  socket.on('game:roll',    () => game.handleRoll(socket));
  socket.on('game:respond', d => game.handleRespond(socket, d));
  socket.on('disconnect',   () => { console.log(`[-] ${socket.id}`); game.removePlayer(socket); });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`\n🏇  Dostihy a sázky — http://localhost:${PORT}\n`));
