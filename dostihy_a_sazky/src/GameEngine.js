'use strict';

const { FinanceDeck, NahodaDeck } = require('./Cards');
const { PLAYER_COLORS } = require('./constants');

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
    this.config = { startBalance: 30000, startBonus: 4000, buyoutMultiplier: 0 };
    this._timer = null;
    this._resumeFn = null;
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
);

module.exports = GameEngine;
