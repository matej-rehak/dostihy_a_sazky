'use strict';

const BOARD = require('../data/boardData');
const { fmt } = require('../constants');

module.exports = {

  _addToken(pid, spaceId, tokenType) {
    const player = this.players.get(pid);
    const space = BOARD[spaceId];
    if (!this.tokens[spaceId]) this.tokens[spaceId] = { small: 0, big: false };
    const tok = this.tokens[spaceId];

    if (tokenType === 'big') {
      if (tok.big) return;
      player.balance -= this._tokenCost(spaceId, true);
      tok.small = 0;
      tok.big = true;
      this._addLog(`🏆 ${player.name} přidal(a) Hlavní dostih na ${space.name}`);
    } else {
      if (tok.small >= 4 || tok.big) return;
      player.balance -= this._tokenCost(spaceId, false);
      tok.small++;
      this._addLog(`🎽 ${player.name} přidal(a) žeton dostihů na ${space.name} (${tok.small}x)`);
    }
    this._checkBankrupt(pid);
  },

  _eligibleTokenSpaces(pid) {
    const player = this.players.get(pid);
    const spaceId = player.position;

    if (!player.properties.includes(spaceId)) return [];
    const space = BOARD[spaceId];
    if (space.type !== 'horse') return [];

    const tok = this.tokens[spaceId] || { small: 0, big: false };
    if (tok.big) return [];
    if (!this._ownsFullGroup(pid, space.group)) return [];

    const cost = this._tokenCost(spaceId, tok.small >= 4);
    if (player.balance < cost) return [];

    return [spaceId];
  },

  _getTokenInsufficientFunds(pid) {
    const player = this.players.get(pid);
    if (!player) return null;

    const spaceId = player.position;
    if (!player.properties.includes(spaceId)) return null;

    const space = BOARD[spaceId];
    if (space.type !== 'horse') return null;

    const tok = this.tokens[spaceId] || { small: 0, big: false };
    if (tok.big) return null;
    if (!this._ownsFullGroup(pid, space.group)) return null;

    const price = this._tokenCost(spaceId, tok.small >= 4);
    if (player.balance >= price) return null;

    return {
      spaceId,
      kind: 'token',
      price,
      balance: player.balance,
      shortage: Math.max(0, price - player.balance),
      tokenType: tok.small >= 4 ? 'big' : 'small',
    };
  },

  _offerTokensOrEnd(pid) {
    const eligible = this._eligibleTokenSpaces(pid);
    if (eligible.length > 0) {
      this._setPendingAction({ type: 'token_manage', targetId: pid, data: { eligible } });
      this._broadcast();
    } else {
      const insufficientFunds = this._getTokenInsufficientFunds(pid);
      if (insufficientFunds) {
        this._setPendingAction({ type: 'insufficient_funds', targetId: pid, data: insufficientFunds });
        this._scheduleAction(1200, () => this._advanceTurn());
        return;
      }
      this._advanceTurn();
    }
  },

  _removeToken(pid, spaceId) {
    const player = this.players.get(pid);
    const space = BOARD[spaceId];
    const tok = this.tokens[spaceId];
    if (!tok) return;

    if (tok.big) {
      const val = this._bankSaleValue(space.bigTokenCost);
      player.balance += val;
      tok.big = false;
      tok.small = 4;
      this._addLog(`📉 ${player.name} prodal(a) Hlavní dostih na ${space.name} za ${fmt(val)} Kč`);
    } else if (tok.small > 0) {
      const val = this._bankSaleValue(space.tokenCost);
      player.balance += val;
      tok.small--;
      this._addLog(`📉 ${player.name} prodal(a) žeton na ${space.name} za ${fmt(val)} Kč`);
    }

    if (tok.small === 0 && !tok.big) {
      delete this.tokens[spaceId];
    }
  },
};
