'use strict';

const { PLAYER_COLORS } = require('../constants');

module.exports = {

  addPlayer(socket, name, color) {
    if (this.phase !== 'lobby') {
      socket.emit('game:error', { message: 'Hra již probíhá.' });
      return;
    }
    if (this.players.size >= 6) {
      socket.emit('game:error', { message: 'Hra je plná (max 6 hráčů).' });
      return;
    }
    const isHost = this.players.size === 0;
    const usedColors = [...this.players.values()].map(p => p.color);
    const finalColor = color && !usedColors.includes(color)
      ? color
      : PLAYER_COLORS.find(c => !usedColors.includes(c)) || '#ffffff';

    const player = {
      id: socket.id, name, color: finalColor, isHost,
      position: 0, balance: this.config.startBalance,
      bankrupt: false, inJail: false, jailTurns: 0, skipTurns: 0,
      properties: [], rollAccumulator: 0, moveDirection: 1,
      jailFreeCards: 0, ready: false,
    };
    this.players.set(socket.id, player);
    this._addLog(`🐎 ${name} se připojil(a) k hře`);
    this._broadcast();
  },

  updateConfig(socket, config) {
    if (this.phase !== 'lobby') return;
    const player = this.players.get(socket.id);
    if (!player || !player.isHost) return;
    this.config = { ...this.config, ...config };
    this._broadcast();
  },

  toggleReady(socketId) {
    if (this.phase !== 'lobby') return;
    const player = this.players.get(socketId);
    if (!player) return;
    player.ready = !player.ready;
    this._broadcast();
  },

  removePlayer(socket) {
    const player = this.players.get(socket.id);
    if (!player) return;

    if (this.phase === 'playing') {
      this._addLog(`⚠️ ${player.name} se odpojil(a) — bankrot`);
      this._declareBankrupt(socket.id);
    } else {
      this.players.delete(socket.id);
      this._addLog(`${player.name} opustil(a) lobby`);

      if (player.isHost && this.players.size > 0) {
        const nextId = this.players.keys().next().value;
        const nextPlayer = this.players.get(nextId);
        if (nextPlayer) {
          nextPlayer.isHost = true;
          this._addLog(`👑 ${nextPlayer.name} je nyní hostitelem`);
        }
      }
    }
    this._broadcast();
  },

  startGame(socket) {
    if (this.phase !== 'lobby') return;
    const host = this.players.get(socket.id);
    if (!host?.isHost) { socket.emit('game:error', { message: 'Hru může spustit pouze host.' }); return; }
    if (this.players.size < 2) { socket.emit('game:error', { message: 'Potřeba alespoň 2 hráče.' }); return; }

    const unready = [...this.players.values()].filter(p => !p.ready);
    if (unready.length > 0) {
      const names = unready.map(p => p.name).join(', ');
      socket.emit('game:error', { message: `Všichni hráči musí být připraveni! Čeká se na: ${names}` });
      return;
    }

    this.phase = 'playing';
    this.players.forEach(p => p.balance = this.config.startBalance);

    // Fisher-Yates shuffle pořadí hráčů
    const keys = [...this.players.keys()];
    for (let i = keys.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [keys[i], keys[j]] = [keys[j], keys[i]];
    }
    this.turnOrder = keys;
    this.currentTurnIdx = 0;

    this.pendingAction = {
      type: 'selecting_starter',
      targetId: this.turnOrder[0],
      data: { starterId: this.turnOrder[0] },
    };

    this._addLog('🏁 Hra začala! Losuje se začínající hráč...');
    this._broadcast();

    setTimeout(() => {
      if (this.pendingAction?.type === 'selecting_starter') {
        this.pendingAction = null;
        this._startTurn();
      }
    }, 5000);
  },
};
