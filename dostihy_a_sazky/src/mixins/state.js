'use strict';

const BOARD = require('../data/boardData');
const { eventId } = require('../random');
const { JAIL_SPACE, JAIL_TURNS_MAX, PLAYER_COLORS, DECISION_WINDOW_MS, DECISION_GRACE_MS, bankSaleValue } = require('../constants');
const { OUTCOMES } = require('../Roulette');

const LOG_MAX = 30;
const LOG_BROADCAST_MAX = 20;

const { GROUPS, SETTINGS } = require('../gameSettings');

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

  /**
   * Otevře časované rozhodnutí: nastaví prompt s `windowMs` (klient podle
   * něj kreslí ubývající lištu) a po vypršení ho vyřídí výchozí volbou.
   * Timer se váže na konkrétní objekt promptu — když mezitím hráč odpoví
   * (nebo prompt nahradí cokoli jiného), vypršení nic neudělá.
   */
  _setTimedPendingAction(type, targetId, data) {
    const action = {
      type, targetId,
      data: { ...data, windowMs: DECISION_WINDOW_MS, windowId: eventId() },
    };
    this._setPendingAction(action);
    clearTimeout(this._decisionTimer);
    this._decisionTimer = setTimeout(() => {
      this._decisionTimer = null;
      if (this.phase !== 'playing' || this.pendingAction !== action) return;
      this._handleDecisionTimeout(action);
    }, DECISION_WINDOW_MS + DECISION_GRACE_MS);
    // Nedrží proces naživu (testy, vypínání serveru).
    this._decisionTimer.unref?.();
    this._broadcast();
  },

  /** Vypršelé časované rozhodnutí — odkup se odmítne, hod se ponechá. */
  _handleDecisionTimeout(action) {
    const { type, targetId, data } = action;
    // Prompt se spotřebuje dřív, než běží handler — stejně jako v handleRespond.
    this._setPendingAction(null);
    const player = this.players.get(targetId);
    switch (type) {
      case 'buyout_offer':
        if (player) this._addLog(`⏳ ${player.name} nestihl(a) odkup — nabídka propadá.`);
        return this._handleBuyoutOffer(targetId, 'decline', data);
      case 'reroll_offer':
        return this._handleRerollOffer(targetId, 'keep', data);
    }
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
    clearTimeout(this._decisionTimer);
    this._decisionTimer = null;
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
      turnSkip: this.turnSkip ?? null,
      lastDice: this.lastDice,
      lastPawnMove: this.lastPawnMove,
      log: this.log.slice(0, LOG_BROADCAST_MAX),
      round: this.round,
      inflation: this.inflation,
      autoInflation: this.autoInflation,
      config: this.config,
      timeLimitEndsAt: this.timeLimitEndsAt,
      gameStartTime: this.gameStartTime,
      turnTimerEndsAt: this.turnTimerEndsAt,
      tradeOffers: this.tradeOffers,
      // Kdo právě skládá nabídku obchodu a pro koho (src/mixins/trade.js)
      tradeDrafts: this._activeTradeDrafts(),
      // Obsah balíčků pro detail pole Finance / Náhoda (texty po inflaci).
      cardDecks: {
        finance: this._deckOverview(this.financeCards),
        nahoda: this._deckOverview(this.nahodaCards),
      },
    };
  },

  sendInit(socket) {
    socket.emit('game:init', {
      roomId: this.roomId,
      board: BOARD,
      colors: PLAYER_COLORS,
      // Statický seznam výsečí Rulety — klient z něj kreslí kolo.
      roulette: OUTCOMES,
      // Schéma nastavení — lobby z něj vykreslí formulář i přehled pravidel.
      settings: { groups: GROUPS, fields: SETTINGS },
      state: this._buildState(),
    });
  },

  // ─── Sdílené helpery ──────────────────────────────────────────────────────

  /**
   * Název pole, jak ho hráči vidí na plánu. Pole 20 a 30 mění podobu podle
   * nastavení (Parkoviště ↔ Letiště, Podezření z dopingu ↔ Ruleta) — v logu
   * ani na kartě proto nesmí být název natvrdo z boardData. Klient má stejné
   * názvy v public/js/ui/cornerArt.mjs (soulad hlídá tests/space-names.test.js).
   */
  _spaceName(spaceId) {
    if (spaceId === 20) return this.config.field20Mode === 'airport' ? 'Letiště' : 'Parkoviště';
    if (spaceId === 30) return this.config.field30Mode === 'roulette' ? 'Ruleta' : 'Podezření z dopingu';
    return BOARD[spaceId]?.name ?? String(spaceId);
  },

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
    if (tok.big) return this._bankSaleValue(space.bigTokenCost) + this._bankSaleValue(space.tokenCost) * 4;
    if (tok.small > 0) return this._bankSaleValue(space.tokenCost) * tok.small;
    return 0;
  },

  /** Kolik banka zaplatí za věc s cenou `amount` — podle nastavení `bankSaleRatio`. */
  _bankSaleValue(amount) {
    return bankSaleValue(amount, this.config?.bankSaleRatio);
  },

  _calcTokenValue(spaceId) {
    const space = BOARD[spaceId];
    const tok = this.tokens[spaceId];
    if (!tok) return 0;
    if (tok.big) return space.bigTokenCost + space.tokenCost * 4;
    if (tok.small > 0) return space.tokenCost * tok.small;
    return 0;
  },

  /**
   * Pošle hráče do Distancu. Vždy jako teleport (`lastPawnMove`) — jinak by
   * klient figurku vedl po plánu dopředu, přes START by ukázal animaci
   * bonusu, který se nevyplácí. Hlídá tests/jail-teleport.test.js.
   */
  _sendToJail(pid, reason = 'jail') {
    const player = this.players.get(pid);
    if (player.position !== JAIL_SPACE) {
      this.lastPawnMove = {
        id: eventId(), type: 'teleport', reason, playerId: pid, from: player.position, to: JAIL_SPACE,
      };
    }
    player.position = JAIL_SPACE;
    player.inJail = true;
    player.jailTurns = JAIL_TURNS_MAX;
    this._addLog(`🔒 ${player.name} jde do Distancu!`);
  },
};
