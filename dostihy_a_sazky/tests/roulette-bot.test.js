'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const Bot = require('../src/Bot');
const { makeCtx, makePlayer, addPlayer } = require('./helpers/botCtx');

const FANTOME = 1;

function ctxWithPrompt(pendingAction, extra = {}) {
  const ctx = makeCtx({ pendingAction, ...extra });
  addPlayer(ctx, makePlayer('BOT', { isBot: true }));
  addPlayer(ctx, makePlayer('HUMAN'));
  ctx.turnOrder = ['BOT', 'HUMAN'];
  return ctx;
}

test('bot potvrdí roulette_ack', () => {
  const ctx = ctxWithPrompt({
    type: 'roulette_ack', targetId: 'BOT', data: { result: { id: 'immunity' } },
  });
  const action = Bot.decideAction(ctx, 'BOT');

  assert.notEqual(action, null, 'bot nesmí zamrznout na roulette_ack');
  assert.equal(action.kind, 'respond');
});

test('bot vybere soupeře pro cílený efekt', () => {
  const ctx = ctxWithPrompt({
    type: 'roulette_pick_player', targetId: 'BOT',
    data: { outcomeId: 'report', candidates: ['HUMAN'] },
  });
  const action = Bot.decideAction(ctx, 'BOT');

  assert.notEqual(action, null);
  assert.equal(action.data.decision, 'HUMAN');
});

test('bot si vybere koně v dražbě', () => {
  const ctx = ctxWithPrompt({
    type: 'roulette_pick_horse', targetId: 'BOT',
    data: { outcomeId: 'auction', options: [{ spaceId: FANTOME, price: 1800 }] },
  });
  const action = Bot.decideAction(ctx, 'BOT');

  assert.notEqual(action, null, 'bot nesmí zamrznout na dražbě');
  assert.ok(action.data.decision === FANTOME || action.data.decision === 'decline');
});

test('bot na dražbu, na kterou nemá, odpoví decline', () => {
  const ctx = ctxWithPrompt({
    type: 'roulette_pick_horse', targetId: 'BOT',
    data: { outcomeId: 'auction', options: [{ spaceId: FANTOME, price: 999999 }] },
  });
  ctx.players.get('BOT').balance = 1000;
  const action = Bot.decideAction(ctx, 'BOT');

  assert.equal(action.data.decision, 'decline');
});

test('bot si vezme žeton zdarma vždy', () => {
  const ctx = ctxWithPrompt({
    type: 'roulette_pick_horse', targetId: 'BOT',
    data: { outcomeId: 'free_token', options: [{ spaceId: FANTOME, price: 0 }] },
  });
  const action = Bot.decideAction(ctx, 'BOT');

  assert.equal(action.data.decision, FANTOME);
});

test('žádný nový prompt nevrací null', () => {
  const prompts = [
    { type: 'roulette_ack', data: { result: { id: 'doping' } } },
    { type: 'roulette_pick_player', data: { outcomeId: 'strike', candidates: ['HUMAN'] } },
    { type: 'roulette_pick_horse', data: { outcomeId: 'auction', options: [{ spaceId: FANTOME, price: 1800 }] } },
    { type: 'roulette_pick_horse', data: { outcomeId: 'free_token', options: [{ spaceId: FANTOME, price: 0 }] } },
  ];
  for (const p of prompts) {
    const ctx = ctxWithPrompt({ ...p, targetId: 'BOT' });
    assert.notEqual(Bot.decideAction(ctx, 'BOT'), null, `bot zamrzl na ${p.type}/${p.data.outcomeId ?? ''}`);
  }
});
