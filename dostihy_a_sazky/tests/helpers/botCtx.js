'use strict';

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

function makeCtx(overrides = {}) {
  return {
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
    ...overrides,
  };
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
