'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const GameEngine = require('../src/GameEngine');
const Bot = require('../src/Bot');
const { makeCtx, makePlayer, addPlayer, own } = require('./helpers/botCtx');

// Pole z boardData: 1+3 = oranzova (2 koně), 6+8+9 = hneda (3 koně),
// 5/15/25/35 = trenéři, 12 = Přeprava, 28 = Stáje, 37+39 = tm_modra.

/** Postaví ctx i ekvivalentní engine, aby šly porovnat výsledky. */
function pair(setup) {
  const ctx = makeCtx();
  addPlayer(ctx, makePlayer('bot'));
  addPlayer(ctx, makePlayer('opp'));
  setup(ctx);

  const engine = new GameEngine({ to: () => ({ emit: () => {} }) }, 'room-test');
  engine.phase = 'playing';
  ctx.players.forEach(p => engine.players.set(p.id, p));
  engine.ownerships = ctx.ownerships;
  engine.tokens = ctx.tokens;
  engine._addLog = () => {};      // _calcRent loguje — v testu ticho

  return { ctx, engine };
}

const CASES = [
  {
    name: 'kůň bez monopolu a bez žetonů',
    spaceId: 1,
    setup: ctx => own(ctx, 'opp', 1),
  },
  {
    name: 'kůň s monopolem, ale bez žetonů',
    spaceId: 1,
    setup: ctx => own(ctx, 'opp', 1, 3),
  },
  {
    name: 'monopol + 1 malý žeton',
    spaceId: 1,
    setup: ctx => { own(ctx, 'opp', 1, 3); ctx.tokens[1] = { small: 1, big: false }; },
  },
  {
    name: 'monopol + 4 malé žetony',
    spaceId: 1,
    setup: ctx => { own(ctx, 'opp', 1, 3); ctx.tokens[1] = { small: 4, big: false }; },
  },
  {
    name: 'monopol + velký dostih',
    spaceId: 1,
    setup: ctx => { own(ctx, 'opp', 1, 3); ctx.tokens[1] = { small: 0, big: true }; },
  },
  {
    name: 'žetony bez monopolu — neúčinné',
    spaceId: 1,
    setup: ctx => { own(ctx, 'opp', 1); ctx.tokens[1] = { small: 4, big: false }; },
  },
  {
    name: 'majitel v Distancu — žetony neúčinné',
    spaceId: 1,
    setup: ctx => {
      own(ctx, 'opp', 1, 3);
      ctx.tokens[1] = { small: 4, big: false };
      ctx.players.get('opp').inJail = true;
    },
  },
  {
    name: 'majitel pod dopingem — žetony neúčinné',
    spaceId: 1,
    setup: ctx => {
      own(ctx, 'opp', 1, 3);
      ctx.tokens[1] = { small: 0, big: true };
      ctx.players.get('opp').skipTurns = 1;
    },
  },
  {
    name: 'tříkoňová stáj, neúplná',
    spaceId: 6,
    setup: ctx => { own(ctx, 'opp', 6, 8); ctx.tokens[6] = { small: 2, big: false }; },
  },
  {
    name: 'tříkoňová stáj, úplná + 2 žetony',
    spaceId: 6,
    setup: ctx => { own(ctx, 'opp', 6, 8, 9); ctx.tokens[6] = { small: 2, big: false }; },
  },
  {
    name: 'nejdražší kůň s velkým dostihem',
    spaceId: 39,
    setup: ctx => { own(ctx, 'opp', 37, 39); ctx.tokens[39] = { small: 0, big: true }; },
  },
  { name: '1 trenér',  spaceId: 5, setup: ctx => own(ctx, 'opp', 5) },
  { name: '2 trenéři', spaceId: 5, setup: ctx => own(ctx, 'opp', 5, 15) },
  { name: '4 trenéři', spaceId: 5, setup: ctx => own(ctx, 'opp', 5, 15, 25, 35) },
  { name: 'Přeprava sólo',        spaceId: 12, setup: ctx => own(ctx, 'opp', 12) },
  { name: 'Přeprava + Stáje',     spaceId: 12, setup: ctx => own(ctx, 'opp', 12, 28) },
  { name: 'Stáje sólo',           spaceId: 28, setup: ctx => own(ctx, 'opp', 28) },
  { name: 'nevlastněné pole',     spaceId: 1,  setup: () => {} },
];

for (const c of CASES) {
  for (const dice of [1, 4, 6]) {
    test(`estimateRent === _calcRent: ${c.name} (kostka ${dice})`, () => {
      const { ctx, engine } = pair(c.setup);
      assert.equal(
        Bot.estimateRent(ctx, c.spaceId, dice),
        engine._calcRent(c.spaceId, dice),
      );
    });
  }
}
