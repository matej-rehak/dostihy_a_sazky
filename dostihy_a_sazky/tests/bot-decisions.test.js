'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const Bot = require('../src/Bot');
const { makeCtx, makePlayer, addPlayer, own } = require('./helpers/botCtx');

function twoPlayerCtx(overrides = {}) {
  const ctx = makeCtx(overrides);
  addPlayer(ctx, makePlayer('bot', { isBot: true }));
  addPlayer(ctx, makePlayer('opp'));
  return ctx;
}

test('calcReserve: prázdný plán → spodní mez', () => {
  const ctx = twoPlayerCtx();
  assert.equal(Bot.calcReserve(ctx, 'bot'), Bot.RESERVE_MIN);
});

test('calcReserve: vlastní majetek bota hrozbu netvoří', () => {
  const ctx = twoPlayerCtx();
  own(ctx, 'bot', 37, 39);
  ctx.tokens[39] = { small: 0, big: true };
  assert.equal(Bot.calcReserve(ctx, 'bot'), Bot.RESERVE_MIN);
});

test('calcReserve: Napoli s velkým dostihem → horní mez', () => {
  const ctx = twoPlayerCtx();
  own(ctx, 'opp', 37, 39);
  ctx.tokens[39] = { small: 0, big: true };   // nájem 40 000 → clamp
  assert.equal(Bot.calcReserve(ctx, 'bot'), Bot.RESERVE_MAX);
});

test('calcReserve: hrozba mezi mezemi se propíše přímo', () => {
  const ctx = twoPlayerCtx();
  own(ctx, 'opp', 1, 3);
  ctx.tokens[1] = { small: 2, big: false };   // rents[2] = 600 → pod minimem
  ctx.tokens[3] = { small: 4, big: false };   // rents[4] = 3200
  assert.equal(Bot.calcReserve(ctx, 'bot'), 3200);
});

test('calcReserve: raná fáze hry rezervu snižuje', () => {
  const ctx = twoPlayerCtx({ round: Bot.EARLY_ROUND_MAX });
  own(ctx, 'opp', 1, 3);
  ctx.tokens[3] = { small: 4, big: false };   // 3200
  assert.equal(Bot.calcReserve(ctx, 'bot'), Math.round(3200 * Bot.EARLY_ROUND_FACTOR));
});

test('calcReserve: hned po rané fázi je rezerva plná', () => {
  const ctx = twoPlayerCtx({ round: Bot.EARLY_ROUND_MAX + 1 });
  own(ctx, 'opp', 1, 3);
  ctx.tokens[3] = { small: 4, big: false };
  assert.equal(Bot.calcReserve(ctx, 'bot'), 3200);
});
