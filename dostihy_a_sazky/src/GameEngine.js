'use strict';

const { FinanceDeck, NahodaDeck } = require('./Cards');
const { PLAYER_COLORS } = require('./constants');

const DebugMixin    = require('./mixins/debug');
const LobbyMixin    = require('./mixins/lobby');
const TurnsMixin    = require('./mixins/turns');
const MovementMixin = require('./mixins/movement');
const ActionsMixin  = require('./mixins/actions');
const CardsMixin    = require('./mixins/cards');
const EconomyMixin  = require('./mixins/economy');
const TokensMixin   = require('./mixins/tokens');
const StateMixin    = require('./mixins/state');
const TradeMixin    = require('./mixins/trade');

class GameEngine {
  constructor(io, roomId) {
    this.io = io;
    this.roomId = roomId;
    this.phase = 'lobby';        // 'lobby' | 'playing' | 'ended'
    this.players = new Map();    // socketId → player object
    this.turnOrder = [];         // [socketId, ...]
    this.currentTurnIdx = 0;
    this.ownerships = {};        // { spaceId: socketId }
    this.tokens = {};            // { spaceId: { small: 0–4, big: false } }
    this.pendingAction = null;
    this.lastDice = null;
    this.log = [];
    this.round = 1;
    this.financeCards = FinanceDeck();
    this.nahodaCards = NahodaDeck();
    this.config = { startBalance: 30000, startBonus: 4000, buyoutMultiplier: 0, timeLimitMinutes: 0, turnTimeLimitSeconds: 0 };
    this.timeLimitEndsAt = null;
    this.timeLimitExpired = false;
    this.gameStartTime = null;
    this._gameTimeLimitTimer = null;
    this.turnTimerEndsAt = null;
    this._turnTimer = null;
    this._timer = null;
    this._resumeFn = null;
    this.tradeOffers = [];
  }

  _setPendingAction(action) {
    this.pendingAction = action;
    if (this._turnTimer) {
      clearTimeout(this._turnTimer);
      this._turnTimer = null;
      this.turnTimerEndsAt = null;
    }
    if (action && this.config.turnTimeLimitSeconds > 0 && action.type !== 'debt_manage' && action.type !== 'trade_offer') {
      const delayMs = this.config.turnTimeLimitSeconds * 1000;
      this.turnTimerEndsAt = Date.now() + delayMs;
      this._turnTimer = setTimeout(() => {
        this._turnTimer = null;
        this.turnTimerEndsAt = null;
        if (typeof this._handleTurnTimeout === 'function') {
          this._handleTurnTimeout();
        }
      }, delayMs);
    }
  }
}

Object.assign(GameEngine.prototype,
  StateMixin,    // _addLog, _scheduleAction, _broadcast, _buildState, sendInit, sdílené helpery
  LobbyMixin,    // addPlayer, removePlayer, toggleReady, startGame, updateConfig
  TurnsMixin,    // _startTurn, handleRoll, _advanceTurn
  MovementMixin, // _movePlayer, _evaluateSpace
  ActionsMixin,  // handleRespond, _handle* metody
  CardsMixin,    // _applyCard
  EconomyMixin,  // _buyProperty, _sellProperty, _calcRent, _transfer, _calcAssetsValue, bankrot
  TokensMixin,   // _addToken, _eligibleTokenSpaces, _offerTokensOrEnd
  TradeMixin,    // initiateTrade
  DebugMixin,    // handleDebugSetState
);

module.exports = GameEngine;
