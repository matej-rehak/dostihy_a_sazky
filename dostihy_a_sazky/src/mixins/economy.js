'use strict';

const BOARD = require('../data/boardData');
const { ACTION_DELAY_MS, fmt } = require('../constants');

module.exports = {

  _buyProperty(pid, spaceId) {
    const player = this.players.get(pid);
    const space = BOARD[spaceId];
    player.balance -= space.price;
    this.ownerships[spaceId] = pid;
    player.properties.push(spaceId);
    this._addLog(`🏠 ${player.name} koupil(a) ${space.name} za ${fmt(space.price)} Kč`);
    this._checkBankrupt(pid);
  },

  _sellProperty(pid, spaceId) {
    const p = this.players.get(pid);
    const space = BOARD[spaceId];
    if (this.ownerships[spaceId] !== pid) return;

    const addedValue = Math.floor(space.price / 2) + this._calcTokenSellValue(spaceId);
    if (this.tokens[spaceId]) delete this.tokens[spaceId];

    p.balance += addedValue;
    p.properties = p.properties.filter(id => id !== spaceId);
    delete this.ownerships[spaceId];
    this._addLog(`📉 ${p.name} prodal(a) ${space.name} za ${fmt(addedValue)} Kč`);
  },

  _calcRent(spaceId, dice) {
    const space = BOARD[spaceId];
    const owner = this.ownerships[spaceId];
    if (!owner) return 0;

    if (space.type === 'service') {
      const ownerPlayer = this.players.get(owner);
      if (space.serviceType === 'trener') {
        const count = ownerPlayer.properties.filter(
          sid => BOARD[sid].serviceType === 'trener'
        ).length;
        return count * 1000;
      }
      const hasPreprava = ownerPlayer.properties.some(sid => BOARD[sid].serviceType === 'preprava');
      const hasStaje = ownerPlayer.properties.some(sid => BOARD[sid].serviceType === 'staje');
      return (hasPreprava && hasStaje ? 200 : 80) * dice;
    }

    // horse
    const ownerPlayer = this.players.get(owner);
    const hasMonopoly = this._ownsFullGroup(owner, space.group);
    const tok = this.tokens[spaceId] || { small: 0, big: false };
    const baseRent = space.rents[0];

    if (tok.big || tok.small > 0) {
      if (ownerPlayer.inJail) {
        this._addLog(`ℹ️ Majitel ${ownerPlayer.name} je v Distancu — žetony nefungují!`);
      } else if (ownerPlayer.skipTurns > 0) {
        this._addLog(`ℹ️ Majitel ${ownerPlayer.name} je pod podezřením z dopingu — žetony nefungují!`);
      } else if (!hasMonopoly) {
        this._addLog(`ℹ️ Majitel ${ownerPlayer.name} nemá celou stáj — žetony nefungují!`);
      } else {
        if (tok.big) return space.rents[5];
        return space.rents[tok.small];
      }
    }

    return baseRent;
  },

  _transfer(fromId, toId, amount) {
    const from = this.players.get(fromId);
    const to = this.players.get(toId);
    if (!from || !to) return;
    from.balance -= amount;
    to.balance += amount;
    this._checkBankrupt(fromId);
  },

  _calcAssetsValue(pid) {
    const p = this.players.get(pid);
    if (!p) return 0;
    return p.properties.reduce((sum, spId) => {
      return sum + BOARD[spId].price + this._calcTokenSellValue(spId);
    }, 0);
  },

  _offerBuyoutOrEnd(pid, spaceId, buyoutCost) {
    const player = this.players.get(pid);
    if (!player || player.bankrupt) { this._advanceTurn(); return; }

    const space = BOARD[spaceId];
    const ownerId = this.ownerships[spaceId];
    if (this._ownsFullGroup(ownerId, space.group)) {
      return this._offerTokensOrEnd(pid);
    }

    if (player.balance >= buyoutCost) {
      this.pendingAction = { type: 'buyout_offer', targetId: pid, data: { spaceId, buyoutCost } };
      this._broadcast();
    } else {
      this._offerTokensOrEnd(pid);
    }
  },

  _checkBankrupt(pid) {
    const player = this.players.get(pid);
    if (player && player.balance < 0 && !player.bankrupt) {
      if (this._calcAssetsValue(pid) + player.balance < 0) {
        this._declareBankrupt(pid);
      }
    }
  },

  _declareBankrupt(pid) {
    const player = this.players.get(pid);
    if (!player || player.bankrupt) return;
    player.bankrupt = true;
    player.properties.forEach(sid => {
      delete this.ownerships[sid];
      delete this.tokens[sid];
    });
    player.properties = [];
    this._addLog(`💀 ${player.name} je v bankrotu a vypadává ze hry!`);
    this._removeFromTurnOrder(pid);

    const active = this.turnOrder.filter(id => !this.players.get(id)?.bankrupt);
    if (active.length <= 1) this._endGame(active[0]);
  },

  _removeFromTurnOrder(pid) {
    const idx = this.turnOrder.indexOf(pid);
    if (idx !== -1) {
      this.turnOrder.splice(idx, 1);
      if (idx <= this.currentTurnIdx) {
        this.currentTurnIdx--;
      }
      if (this.currentTurnIdx >= this.turnOrder.length) this.currentTurnIdx = 0;
      if (this.currentTurnIdx < 0 && this.turnOrder.length > 0) {
        this.currentTurnIdx = this.turnOrder.length - 1;
      }
    }
  },

  _endGame(winnerId) {
    this.phase = 'ended';
    const winner = winnerId ? this.players.get(winnerId) : null;
    this._addLog(winner
      ? `🏆 ${winner.name} vyhrál(a) hru s ${fmt(winner.balance)} Kč!`
      : '🏁 Hra skončila nerozhodně.'
    );
    this.pendingAction = {
      type: 'game_over',
      winner: winner ? { name: winner.name, balance: winner.balance } : null,
    };
    this._broadcast();
  },
};
