'use strict';

const BOARD = require('../data/boardData');
const { ACTION_DELAY_MS, fmt } = require('../constants');

module.exports = {
  _endByTimeLimit() {
    const alivePlayers = [...this.players.values()].filter(p => !p.bankrupt);
    if (!alivePlayers.length) {
      this._endGame(null, 'time_limit');
      return;
    }
    const ranking = alivePlayers
      .map(p => ({
        id: p.id,
        score: p.balance + this._calcAssetsValue(p.id),
        balance: p.balance,
      }))
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return b.balance - a.balance;
      });
    const isTie = ranking.length > 1 && ranking[0].score === ranking[1].score && ranking[0].balance === ranking[1].balance;
    this._endGame(isTie ? null : ranking[0].id, 'time_limit');
  },

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

    this._cancelStaleTradeOffers([spaceId]);
  },

  _cancelStaleTradeOffers(spaceIds) {
    if (!spaceIds || spaceIds.length === 0) return;
    const stale = this.tradeOffers.filter(o =>
      o.offer.horses.some(sid => spaceIds.includes(sid)) || 
      o.request.horses.some(sid => spaceIds.includes(sid))
    );
    if (stale.length > 0) {
      this.tradeOffers = this.tradeOffers.filter(o =>
        !o.offer.horses.some(sid => spaceIds.includes(sid)) && 
        !o.request.horses.some(sid => spaceIds.includes(sid))
      );
      stale.forEach(o => {
        const from = this.players.get(o.fromId);
        this._addLog(`❌ Nabídka obchodu od ${from?.name ?? '?'} zrušena (kůň změnil majitele).`);
      });
    }
  },

  _sellMultipleProperties(pid, spaceIds) {
    if (!Array.isArray(spaceIds)) return;
    spaceIds.forEach(sid => this._sellProperty(pid, sid));
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

    // How much can they REALLY pay? 
    // User requested to use FULL value (100%) because of potential player-to-player trades
    const canPayTotal = from.balance + this._calcAssetsValue(fromId);
    const actualTransfer = Math.max(0, Math.min(amount, canPayTotal));

    from.balance -= amount;
    to.balance += actualTransfer;
    
    if (actualTransfer < amount) {
      this._addLog(`ℹ️ ${from.name} nemá na plnou splátku, ${to.name} dostává jen ${fmt(actualTransfer)} Kč`);
    }

    this._checkBankrupt(fromId);
  },

  _calcAssetsValue(pid) {
    const p = this.players.get(pid);
    if (!p) return 0;
    return p.properties.reduce((sum, spId) => {
      return sum + BOARD[spId].price + this._calcTokenValue(spId);
    }, 0);
  },

  _calcLiquidationValue(pid) {
    const p = this.players.get(pid);
    if (!p) return 0;
    return p.properties.reduce((sum, spId) => {
      const space = BOARD[spId];
      const sellVal = Math.floor(space.price / 2) + this._calcTokenSellValue(spId);
      return sum + sellVal;
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
      this._setPendingAction({ type: 'buyout_offer', targetId: pid, data: { spaceId, buyoutCost } });
      this._broadcast();
    } else {
      this._offerTokensOrEnd(pid);
    }
  },

  _checkBankrupt(pid) {
    const player = this.players.get(pid);
    if (player && player.balance < 0 && !player.bankrupt) {
      const assets = this._calcAssetsValue(pid);
      if (assets + player.balance < 0 || (player.properties.length === 0 && player.balance < 0)) {
        this._declareBankrupt(pid);
      }
    }
  },

  _declareBankrupt(pid) {
    const player = this.players.get(pid);
    if (!player || player.bankrupt) return;
    player.bankrupt = true;
    const soldHorses = [...player.properties];
    player.properties.forEach(sid => {
      delete this.ownerships[sid];
      delete this.tokens[sid];
    });
    player.properties = [];
    this._cancelStaleTradeOffers(soldHorses);
    
    // Zrušit VŠECHNY nabídky obchodu spojené s tímto hráčem
    const playerOffers = this.tradeOffers.filter(o => o.fromId === pid || o.targetId === pid);
    if (playerOffers.length > 0) {
      this.tradeOffers = this.tradeOffers.filter(o => o.fromId !== pid && o.targetId !== pid);
      this._addLog(`❌ Obchodní nabídky hráče ${player.name} byly zrušeny (bankrot).`);
    }

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

  _endGame(winnerId, reason = null) {
    this.phase = 'ended';
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }
    if (this._broadcastTimer) {
      clearTimeout(this._broadcastTimer);
      this._broadcastTimer = null;
    }
    this._resumeFn = null;
    this.timeLimitExpired = false;
    if (this._gameTimeLimitTimer) {
      clearTimeout(this._gameTimeLimitTimer);
      this._gameTimeLimitTimer = null;
    }
    this.timeLimitEndsAt = null;
    const winner = winnerId ? this.players.get(winnerId) : null;
    const winnerAssets = winner ? winner.balance + this._calcAssetsValue(winnerId) : 0;
    this._addLog(winner
      ? `🏆 ${winner.name} vyhrál(a) hru s celkovým majetkem ${fmt(winnerAssets)} Kč!`
      : '🏁 Hra skončila nerozhodně.'
    );
    this._setPendingAction({
      type: 'game_over',
      winner: winner ? { name: winner.name, balance: winner.balance, totalAssets: winnerAssets } : null,
      reason,
    });
    this._broadcast();
  },
};
