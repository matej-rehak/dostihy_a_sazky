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

// ─── evaluatePurchase ─────────────────────────────────────────────────────────

test('nákup: blokace — soupeř drží zbytek stáje, bot bere i bez výhledu', () => {
  const ctx = twoPlayerCtx();
  own(ctx, 'opp', 1);                         // oranzova má jen 1 a 3
  ctx.players.get('bot').balance = 10000;
  const r = Bot.evaluatePurchase(ctx, 'bot', 3);
  assert.equal(r.reason, 'block');
  assert.equal(r.buy, true);
});

test('nákup: blokace se odmítne, když by nezbyla rezerva', () => {
  const ctx = twoPlayerCtx();
  own(ctx, 'opp', 1);
  ctx.players.get('bot').balance = 2500;      // 2500 - 1200 = 1300 < 2000
  const r = Bot.evaluatePurchase(ctx, 'bot', 3);
  assert.equal(r.reason, 'block');
  assert.equal(r.buy, false);
});

test('nákup: kompletace stáje projde, když zbyde i na žeton', () => {
  const ctx = twoPlayerCtx();
  own(ctx, 'bot', 1);
  ctx.players.get('bot').balance = 1200 + 2000 + 1000;   // price + reserve + tokenCost
  const r = Bot.evaluatePurchase(ctx, 'bot', 3);
  assert.equal(r.reason, 'complete');
  assert.equal(r.buy, true);
});

test('nákup: kompletace se odmítne, když by nezbylo na žeton', () => {
  const ctx = twoPlayerCtx();
  own(ctx, 'bot', 1);
  ctx.players.get('bot').balance = 1200 + 2000 + 999;
  const r = Bot.evaluatePurchase(ctx, 'bot', 3);
  assert.equal(r.reason, 'complete');
  assert.equal(r.buy, false);
});

test('nákup: postup ve volné stáji vyžaduje rezervu i cenu žetonu', () => {
  const ctx = twoPlayerCtx();
  own(ctx, 'bot', 6);                         // hneda = 6, 8, 9; zbytek volný
  ctx.players.get('bot').balance = 2000 + 2000 + 1000;
  const r = Bot.evaluatePurchase(ctx, 'bot', 8);
  assert.equal(r.reason, 'progress');
  assert.equal(r.buy, true);
});

test('nákup: osamocený kůň ve stáji cizího hráče se nekupuje nikdy', () => {
  const ctx = twoPlayerCtx();
  own(ctx, 'opp', 6);                         // hneda má 3 koně → 8 a 9 volné
  ctx.players.get('bot').balance = 100000;
  const r = Bot.evaluatePurchase(ctx, 'bot', 8);
  assert.equal(r.reason, 'isolated');
  assert.equal(r.buy, false);
});

test('nákup: úplně volná stáj vyžaduje dvojnásobnou rezervu', () => {
  const ctx = twoPlayerCtx();
  ctx.players.get('bot').balance = 2000 + 2 * 2000;
  assert.equal(Bot.evaluatePurchase(ctx, 'bot', 6).reason, 'default');
  assert.equal(Bot.evaluatePurchase(ctx, 'bot', 6).buy, true);

  ctx.players.get('bot').balance = 2000 + 2 * 2000 - 1;
  assert.equal(Bot.evaluatePurchase(ctx, 'bot', 6).buy, false);
});

test('nákup: trenér stačí s běžnou rezervou', () => {
  const ctx = twoPlayerCtx();
  ctx.players.get('bot').balance = 4000 + 2000;
  const r = Bot.evaluatePurchase(ctx, 'bot', 5);
  assert.equal(r.reason, 'trener');
  assert.equal(r.buy, true);
});

test('nákup: Přeprava sólo se nekupuje', () => {
  const ctx = twoPlayerCtx();
  ctx.players.get('bot').balance = 100000;
  const r = Bot.evaluatePurchase(ctx, 'bot', 12);
  assert.equal(r.reason, 'service_pair');
  assert.equal(r.buy, false);
});

test('nákup: Přeprava se kupuje, když bot už má Stáje', () => {
  const ctx = twoPlayerCtx();
  own(ctx, 'bot', 28);
  ctx.players.get('bot').balance = 3000 + 2000;
  const r = Bot.evaluatePurchase(ctx, 'bot', 12);
  assert.equal(r.reason, 'service_pair');
  assert.equal(r.buy, true);
});
