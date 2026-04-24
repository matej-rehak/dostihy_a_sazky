'use strict';

const { PLAYER_COLORS } = require('../constants');
const MAX_TIME_LIMIT_MINUTES = 240;

module.exports = {

  addPlayer(socket, name, color) {
    // Pokud hráč již existuje (reconnect přes lobby), jen aktualizuj socketId
    if (this.players.has(socket.playerId)) {
      const p = this.players.get(socket.playerId);
      p.socketId = socket.id;
      p.disconnected = false;
      this._broadcast();
      return;
    }

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
      id: socket.playerId, socketId: socket.id,
      name, color: finalColor, isHost,
      position: 0, balance: this.config.startBalance,
      bankrupt: false, inJail: false, jailTurns: 0, skipTurns: 0,
      properties: [], rollAccumulator: 0, moveDirection: 1,
      jailFreeCards: 0, ready: false, disconnected: false,
    };
    this.players.set(socket.playerId, player);
    this._addLog(`🐎 ${name} se připojil(a) k hře`);
    this._broadcast();
  },

  updateConfig(socket, config) {
    if (this.phase !== 'lobby') return;
    const player = this.players.get(socket.playerId);
    if (!player || !player.isHost) return;
    const nextConfig = { ...this.config, ...config };

    const startBalance = Number(nextConfig.startBalance);
    const startBonus = Number(nextConfig.startBonus);
    const buyoutMultiplier = Number(nextConfig.buyoutMultiplier);
    const timeLimitMinutes = Number(nextConfig.timeLimitMinutes);
    const turnTimeLimitSeconds = Number(nextConfig.turnTimeLimitSeconds);

    this.config.startBalance = Number.isFinite(startBalance) ? Math.max(1000, Math.round(startBalance)) : 30000;
    this.config.startBonus = Number.isFinite(startBonus) ? Math.max(0, Math.round(startBonus)) : 4000;
    this.config.buyoutMultiplier = Number.isFinite(buyoutMultiplier) ? Math.max(0, buyoutMultiplier) : 0;
    this.config.timeLimitMinutes = Number.isFinite(timeLimitMinutes)
      ? Math.max(0, Math.min(MAX_TIME_LIMIT_MINUTES, Math.round(timeLimitMinutes)))
      : 0;
    this.config.turnTimeLimitSeconds = Number.isFinite(turnTimeLimitSeconds)
      ? Math.max(0, Math.min(300, Math.round(turnTimeLimitSeconds)))
      : 0;

    this._broadcast();
  },

  toggleReady(playerId) {
    if (this.phase !== 'lobby') return;
    const player = this.players.get(playerId);
    if (!player) return;
    player.ready = !player.ready;
    this._broadcast();
  },

  removePlayer(socket) {
    const player = this.players.get(socket.playerId);
    if (!player) return;

    if (this.phase === 'playing') {
      // Zapamatuj si PŘED bankrotem, jestli hra čekala právě na tohoto hráče.
      const wasPending = this.pendingAction?.targetId === socket.playerId;
      this._addLog(`⚠️ ${player.name} se odpojil(a) — bankrot`);
      this._declareBankrupt(socket.playerId);

      // Pokud hra stále pokračuje (>=2 hráčů) a akce čekala na odpojeného
      // hráče → posunout tah, jinak by hra zamrzla navěky.
      if (this.phase === 'playing' && wasPending) {
        clearTimeout(this._timer);
        this._scheduleAction(1200, () => this._startTurn());
      }
    } else {
      this.players.delete(socket.playerId);
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

  markDisconnected(playerId) {
    const player = this.players.get(playerId);
    if (!player) return;
    player.disconnected = true;
    this._addLog(`📡 ${player.name} se odpojil(a) — čekáme 2 min na znovupřipojení...`);
    this._broadcast();
  },

  reconnectPlayer(socket) {
    const player = this.players.get(socket.playerId);
    if (!player) return;
    player.socketId = socket.id;
    player.disconnected = false;
    this._addLog(`✅ ${player.name} se znovu připojil(a)`);
    this._broadcast();
  },

  startGame(socket) {
    if (this.phase !== 'lobby') return;
    const host = this.players.get(socket.playerId);
    if (!host?.isHost) { socket.emit('game:error', { message: 'Hru může spustit pouze host.' }); return; }
    if (this.players.size < 2) { socket.emit('game:error', { message: 'Potřeba alespoň 2 hráče.' }); return; }

    const unready = [...this.players.values()].filter(p => !p.ready);
    if (unready.length > 0) {
      const names = unready.map(p => p.name).join(', ');
      socket.emit('game:error', { message: `Všichni hráči musí být připraveni! Čeká se na: ${names}` });
      return;
    }

    this.phase = 'playing';
    this.timeLimitEndsAt = null;
    this.gameStartTime = Date.now();
    this.timeLimitExpired = false;
    if (this._gameTimeLimitTimer) {
      clearTimeout(this._gameTimeLimitTimer);
      this._gameTimeLimitTimer = null;
    }
    this.players.forEach(p => p.balance = this.config.startBalance);

    const keys = [...this.players.keys()];
    for (let i = keys.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [keys[i], keys[j]] = [keys[j], keys[i]];
    }
    this.turnOrder = keys;
    this.currentTurnIdx = 0;

    this._setPendingAction({
      type: 'selecting_starter',
      targetId: this.turnOrder[0],
      data: { starterId: this.turnOrder[0] },
    });

    this._addLog('🏁 Hra začala! Losuje se začínající hráč...');

    if (this.config.timeLimitMinutes > 0) {
      const durationMs = this.config.timeLimitMinutes * 60 * 1000;
      this.timeLimitEndsAt = Date.now() + durationMs;
      this._addLog(`⏱️ Časový limit hry: ${this.config.timeLimitMinutes} min.`);
      this._gameTimeLimitTimer = setTimeout(() => {
        if (this.phase !== 'playing') return;
        this._gameTimeLimitTimer = null;
        this.timeLimitExpired = true;
        this.timeLimitEndsAt = Date.now();
        this._addLog('⏰ Vypršel časový limit hry. Aktuální tah se dohraje a poté hra skončí.');
        this._broadcast();
      }, durationMs);
    }

    this._broadcast();

    setTimeout(() => {
      if (this.pendingAction?.type === 'selecting_starter') {
        this._setPendingAction(null);
        this._startTurn();
      }
    }, 5000);
  },
};
