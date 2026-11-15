'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const Bot = require('../src/Bot');
const { makeCtx, makePlayer, addPlayer } = require('./helpers/botCtx');

const FANTOME = 1;
const GAVORA = 3;
const LADY_ANNE = 6;

function ctxWithPrompt(pendingAction, extra = {}) {
  const ctx = makeCtx({ pendingAction, ...extra });
  addPlayer(ctx, makePlayer('BOT', { isBot: true }));
  addPlayer(ctx, makePlayer('HUMAN'));
  ctx.turnOrder = ['BOT', 'HUMAN'];
  return ctx;
}

test('bot potvrdí roulette_ack', () => {
  const ctx = ctxWithPrompt({
    type: 'roulette_ack', targetId: 'BOT', data: { result: { id: 'preemption' } },
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
    { type: 'roulette_pick_player', data: { outcomeId: 'report', candidates: ['HUMAN'] } },
    { type: 'roulette_give_horse', data: { options: [FANTOME], candidates: ['HUMAN'] } },
    { type: 'roulette_pick_horse', data: { outcomeId: 'free_token', options: [{ spaceId: FANTOME, price: 0 }] } },
  ];
  for (const p of prompts) {
    const ctx = ctxWithPrompt({ ...p, targetId: 'BOT' });
    assert.notEqual(Bot.decideAction(ctx, 'BOT'), null, `bot zamrzl na ${p.type}/${p.data.outcomeId ?? ''}`);
  }
});

test('bot daruje nejlevnějšího koně nejslabšímu soupeři', () => {
  const ctx = ctxWithPrompt({
    type: 'roulette_give_horse', targetId: 'BOT',
    data: { options: [FANTOME, LADY_ANNE], candidates: ['HUMAN', 'RICH'] },
  });
  addPlayer(ctx, makePlayer('RICH', { balance: 90000 }));
  ctx.turnOrder.push('RICH');
  [FANTOME, LADY_ANNE].forEach(sid => {
    ctx.ownerships[sid] = 'BOT';
    ctx.players.get('BOT').properties.push(sid);
  });
  const action = Bot.decideAction(ctx, 'BOT');

  assert.equal(action.data.decision, 'HUMAN');
  assert.equal(action.data.spaceId, FANTOME);
});

test('bot nedaruje koně z vlastní úplné stáje, když má jiného', () => {
  const ctx = ctxWithPrompt({
    type: 'roulette_give_horse', targetId: 'BOT',
    data: { options: [FANTOME, GAVORA, LADY_ANNE], candidates: ['HUMAN'] },
  });
  [FANTOME, GAVORA, LADY_ANNE].forEach(sid => {
    ctx.ownerships[sid] = 'BOT';
    ctx.players.get('BOT').properties.push(sid);
  });
  const action = Bot.decideAction(ctx, 'BOT');

  assert.equal(action.data.spaceId, LADY_ANNE);
});
