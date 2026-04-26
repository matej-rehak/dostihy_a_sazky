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
      player.balance -= space.bigTokenCost;
      tok.small = 0;
      tok.big = true;
      this._addLog(`🏆 ${player.name} přidal(a) Hlavní dostih na ${space.name}`);
    } else {
      if (tok.small >= 4 || tok.big) return;
      player.balance -= space.tokenCost;
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

    const cost = tok.small >= 4 ? space.bigTokenCost : space.tokenCost;
    if (player.balance < cost) return [];

    return [spaceId];
  },

  _offerTokensOrEnd(pid) {
    const eligible = this._eligibleTokenSpaces(pid);
    if (eligible.length > 0) {
      this._setPendingAction({ type: 'token_manage', targetId: pid, data: { eligible } });
      this._broadcast();
    } else {
      this._advanceTurn();
    }
  },

  _removeToken(pid, spaceId) {
    const player = this.players.get(pid);
    const space = BOARD[spaceId];
    const tok = this.tokens[spaceId];
    if (!tok) return;

    if (tok.big) {
      const val = Math.floor(space.bigTokenCost / 2);
      player.balance += val;
      tok.big = false;
      tok.small = 4;
      this._addLog(`📉 ${player.name} prodal(a) Hlavní dostih na ${space.name} za ${fmt(val)} Kč`);
    } else if (tok.small > 0) {
      const val = Math.floor(space.tokenCost / 2);
      player.balance += val;
      tok.small--;
      this._addLog(`📉 ${player.name} prodal(a) žeton na ${space.name} za ${fmt(val)} Kč`);
    }

    if (tok.small === 0 && !tok.big) {
      delete this.tokens[spaceId];
    }
  },
};
