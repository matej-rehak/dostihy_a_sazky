'use strict';

const BOARD = require('../data/boardData');
const { JAIL_SPACE, JAIL_TURNS_MAX, PLAYER_COLORS } = require('../constants');

const LOG_MAX = 30;
const LOG_BROADCAST_MAX = 20;

module.exports = {

  // ─── Log ──────────────────────────────────────────────────────────────────

  _addLog(msg) {
    this.log.unshift(msg);
    if (this.log.length > LOG_MAX) this.log.pop();
  },

  // ─── Scheduling ───────────────────────────────────────────────────────────

  _scheduleAction(delay, fn) {
    if (this.phase === 'ended') return;
    const debtor = [...this.players.values()].find(p => p.balance < 0 && !p.bankrupt);
    if (debtor) {
      const assets = this._calcAssetsValue(debtor.id);
      if (assets + debtor.balance >= 0) {
        this.pendingAction = { type: 'debt_manage', targetId: debtor.id };
        this._resumeFn = fn;
        this._broadcast();
        return;
      } else {
        this._declareBankrupt(debtor.id);
        return this._scheduleAction(delay, fn);
      }
    }
    this._broadcast();
    this._timer = setTimeout(fn, delay);
  },

  // ─── Broadcast ────────────────────────────────────────────────────────────

  _broadcast() {
    if (this._broadcastTimer) clearTimeout(this._broadcastTimer);
    this._broadcastTimer = setTimeout(() => {
      this._broadcastTimer = null;
      this.io.to(this.roomId).emit('game:state', this._buildState());
    }, 50);
  },

  _buildState() {
    return {
      phase: this.phase,
      players: [...this.players.values()].map(({ socketId, ...rest }) => rest),
      turnOrder: this.turnOrder,
      currentTurnId: this._currentPlayerId(),
      ownerships: this.ownerships,
      tokens: this.tokens,
      pendingAction: this.pendingAction,
      lastDice: this.lastDice,
      log: this.log.slice(0, LOG_BROADCAST_MAX),
      round: this.round,
      config: this.config,
    };
  },

  sendInit(socket) {
    socket.emit('game:init', {
      roomId: this.roomId,
      board: BOARD,
      colors: PLAYER_COLORS,
      state: this._buildState(),
    });
  },

  // ─── Sdílené helpery ──────────────────────────────────────────────────────

  _currentPlayerId() {
    return this.turnOrder[this.currentTurnIdx];
  },

  _ownsFullGroup(pid, group) {
    return BOARD
      .filter(s => s.group === group)
      .every(s => this.ownerships[s.id] === pid);
  },

  _calcTokenSellValue(spaceId) {
    const space = BOARD[spaceId];
    const tok = this.tokens[spaceId];
    if (!tok) return 0;
    if (tok.big) return Math.floor(space.bigTokenCost / 2) + Math.floor(space.tokenCost / 2) * 4;
    if (tok.small > 0) return Math.floor(space.tokenCost / 2) * tok.small;
    return 0;
  },

  _sendToJail(pid) {
    const player = this.players.get(pid);
    player.position = JAIL_SPACE;
    player.inJail = true;
    player.jailTurns = JAIL_TURNS_MAX;
    this._addLog(`🔒 ${player.name} jde do Distancu!`);
  },
};
