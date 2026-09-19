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
        this._setPendingAction({ type: 'debt_manage', targetId: debtor.id });
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

  // ─── Teardown ─────────────────────────────────────────────────────────────

  /**
   * Úplné zastavení enginu — volá server při rušení místnosti.
   *
   * `_clearBotTimers()` sám o sobě NESTAČÍ: naplánovaná akce (`_timer`)
   * po vypršení znovu spustí tah, ten zavolá `_setPendingAction`, a ten
   * boty znovu probudí. Opuštěná hra s boty by tak běžela v paměti
   * donekonečna a držela slot místnosti. Proto se tu ruší všechny timery
   * enginu naráz. Každý nový timer enginu musí přibýt i sem.
   */
  destroy() {
    this.phase = 'ended';
    if (typeof this._clearBotTimers === 'function') this._clearBotTimers();
    clearTimeout(this._timer);
    clearTimeout(this._turnTimer);
    clearTimeout(this._broadcastTimer);
    clearTimeout(this._gameTimeLimitTimer);
    clearTimeout(this._starterTimer);
    this._timer = null;
    this._turnTimer = null;
    this._broadcastTimer = null;
    this._gameTimeLimitTimer = null;
    this._starterTimer = null;
    this.turnTimerEndsAt = null;
    this._resumeFn = null;
    this.pendingAction = null;
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
      lastPawnMove: this.lastPawnMove,
      log: this.log.slice(0, LOG_BROADCAST_MAX),
      round: this.round,
      config: this.config,
      timeLimitEndsAt: this.timeLimitEndsAt,
      gameStartTime: this.gameStartTime,
      turnTimerEndsAt: this.turnTimerEndsAt,
      tradeOffers: this.tradeOffers,
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

  _calcTokenValue(spaceId) {
    const space = BOARD[spaceId];
    const tok = this.tokens[spaceId];
    if (!tok) return 0;
    if (tok.big) return space.bigTokenCost + space.tokenCost * 4;
    if (tok.small > 0) return space.tokenCost * tok.small;
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
