'use strict';

const BOARD = require('../../src/data/boardData');

function makePlayer(id, overrides = {}) {
  return {
    id,
    name: id,
    position: 0,
    balance: 30000,
    properties: [],
    bankrupt: false,
    inJail: false,
    jailTurns: 0,
    skipTurns: 0,
    jailFreeCards: 0,
    isBot: false,
    ...overrides,
  };
}

/** Zrcadlí EconomyMixin._calcTokenValue ze state.js. */
function calcTokenValue(ctx, spaceId) {
  const space = BOARD[spaceId];
  const tok = ctx.tokens[spaceId];
  if (!tok) return 0;
  if (tok.big) return space.bigTokenCost + space.tokenCost * 4;
  if (tok.small > 0) return space.tokenCost * tok.small;
  return 0;
}

function makeCtx(overrides = {}) {
  const ctx = {
    players: new Map(),
    ownerships: {},
    tokens: {},
    config: {
      startBalance: 30000,
      startBonus: 4000,
      buyoutMultiplier: 0,
      field20Mode: 'airport',
      airportFee: 2000,
    },
    round: 10,            // mimo ranou fázi — rezerva se neškáluje
    pendingAction: null,
    tradeOffers: [],
    lastDice: null,
    // Zrcadlí EconomyMixin._calcAssetsValue z economy.js — bot ji čte přes ctx.
    _calcAssetsValue(pid) {
      const p = this.players.get(pid);
      if (!p) return 0;
      return p.properties.reduce((sum, spId) => sum + BOARD[spId].price + calcTokenValue(this, spId), 0);
    },
    ...overrides,
  };
  return ctx;
}

function addPlayer(ctx, player) {
  ctx.players.set(player.id, player);
  return player;
}

/** Přiřadí hráči vlastnictví polí a zrcadlí to do player.properties. */
function own(ctx, pid, ...spaceIds) {
  const p = ctx.players.get(pid);
  spaceIds.forEach(sid => {
    ctx.ownerships[sid] = pid;
    if (!p.properties.includes(sid)) p.properties.push(sid);
  });
}

module.exports = { makeCtx, makePlayer, addPlayer, own };
