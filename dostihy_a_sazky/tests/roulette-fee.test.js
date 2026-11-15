'use strict';

// Ruleta (pole 30 v režimu 'roulette') funguje jako Letiště: po zastavení na
// poli se dá zatočit až na začátku PŘÍŠTÍHO tahu. Hráč tehdy volí „zatočit /
// hodit kostkou"; poplatek nastaví hostitel v lobby (i 0 — pak je jen zdarma).

const test = require('node:test');
const assert = require('node:assert/strict');

const GameEngine = require('../src/GameEngine');
const { rndFor } = require('../src/Roulette');
const Bot = require('../src/Bot');
const { makeCtx, makePlayer, addPlayer } = require('./helpers/botCtx');

const ROULETTE_SPACE = 30;

function makeEngine() {
  const engine = new GameEngine({ to: () => ({ emit: () => {} }) }, 'room-test');
  engine._broadcast = () => {};
  engine._addLog = () => {};
  return engine;
}

function makeHost(engine) {
  const socket = { playerId: 'HOST', id: 'sock-host', emit: () => {} };
  engine.addPlayer(socket, 'Host', '#e74c3c');
  return socket;
}

/** Hráč stojí na poli 30, hra běží, další kroky se jen zaznamenají. */
function landOnRoulette({ fee, balance = 30000 }) {
  const engine = makeEngine();
  const host = makeHost(engine);
  engine.updateConfig(host, { field30Mode: 'roulette', rouletteFee: fee });
  engine.phase = 'playing';
  const player = engine.players.get('HOST');
  player.position = ROULETTE_SPACE;
  player.balance = balance;
  engine.turnOrder = ['HOST'];
  engine.currentTurnIdx = 0;
  const scheduled = [];
  engine._scheduleAction = (ms, fn) => scheduled.push(fn);
  engine._evaluateSpace('HOST');
  return { engine, host, player, scheduled };
}

/** Vstup na pole 30 a začátek dalšího tahu téhož hráče. */
function nextTurnAfterRoulette(opts) {
  const ctx = landOnRoulette(opts);
  ctx.engine._startTurn();
  return ctx;
}

// ── Nastavení ────────────────────────────────────────────────────────────────

test('výchozí poplatky: Ruleta 2 000 Kč, Letiště 4 000 Kč', () => {
  const engine = makeEngine();
  assert.equal(engine.config.rouletteFee, 2000);
  assert.equal(engine.config.airportFee, 4000);
});

test('hostitel nastaví poplatek; záporný spadne na 0, nesmyslný na výchozí', () => {
  const engine = makeEngine();
  const host = makeHost(engine);
  engine.updateConfig(host, { rouletteFee: 1500 });
  assert.equal(engine.config.rouletteFee, 1500);
  engine.updateConfig(host, { rouletteFee: -200 });
  assert.equal(engine.config.rouletteFee, 0);
  engine.updateConfig(host, { rouletteFee: 'hodně' });
  assert.equal(engine.config.rouletteFee, 2000);
  engine.updateConfig(host, { rouletteFee: 999.6 });
  assert.equal(engine.config.rouletteFee, 1000);
});

test('poplatek se veze ve stavu ke klientovi', () => {
  const engine = makeEngine();
  const host = makeHost(engine);
  engine.updateConfig(host, { rouletteFee: 800 });
  assert.equal(engine._buildState().config.rouletteFee, 800);
});

// ── Vstup na pole a další tah ───────────────────────────────────────────────

test('vstup na pole jen nabije právo zatočit — nic se netočí ani neplatí', () => {
  const { engine, player, scheduled } = landOnRoulette({ fee: 1000 });
  assert.equal(player.canSpin, true);
  assert.equal(player.balance, 30000);
  assert.notEqual(engine.pendingAction?.type, 'roulette_choice');
  assert.notEqual(engine.pendingAction?.type, 'roulette_ack');
  assert.ok(scheduled.length > 0, 'tah pokračuje (žetony / konec tahu)');
});

test('na začátku dalšího tahu dostane hráč volbu s výší poplatku', () => {
  const { engine } = nextTurnAfterRoulette({ fee: 1000 });
  assert.equal(engine.pendingAction.type, 'roulette_choice');
  assert.equal(engine.pendingAction.targetId, 'HOST');
  assert.equal(engine.pendingAction.data.fee, 1000);
});

test('poplatek 0: volba se nabídne taky, zatočení je zdarma', () => {
  const { engine, host, player } = nextTurnAfterRoulette({ fee: 0 });
  assert.equal(engine.pendingAction.type, 'roulette_choice');
  assert.equal(engine.pendingAction.data.fee, 0);
  engine.handleRespond(host, { decision: 'spin' });
  assert.equal(engine.pendingAction.type, 'roulette_ack');
  assert.equal(player.balance, 30000);
});

test('zatočit: strhne poplatek, zatočí a právo spotřebuje', () => {
  const { engine, host, player } = nextTurnAfterRoulette({ fee: 1000 });
  engine.handleRespond(host, { decision: 'spin' });
  assert.equal(player.balance, 29000);
  assert.equal(engine.pendingAction.type, 'roulette_ack');
  assert.equal(player.canSpin, false);
});

test('netočit: nic se neplatí a hráč hází kostkou', () => {
  const { engine, host, player } = nextTurnAfterRoulette({ fee: 1000 });
  engine.handleRespond(host, { decision: 'skip' });
  assert.equal(player.balance, 30000);
  assert.equal(engine.pendingAction.type, 'wait_roll');
  assert.equal(player.canSpin, false, 'právo zatočit propadá');
});

test('po výsledku Rulety hráč pokračuje hodem kostkou', () => {
  const { engine, host, scheduled } = nextTurnAfterRoulette({ fee: 1000 });
  engine._rouletteRnd = () => rndFor('preemption');
  engine.handleRespond(host, { decision: 'spin' });
  engine.handleRespond(host, { decision: 'ack' });
  scheduled.splice(0).forEach(fn => fn());
  assert.equal(engine.pendingAction.type, 'wait_roll');
});

test('zatočit bez peněz nejde — nic se nestrhne a volba zůstane', () => {
  const { engine, host, player } = nextTurnAfterRoulette({ fee: 1000, balance: 500 });
  engine.handleRespond(host, { decision: 'spin' });
  assert.equal(player.balance, 500);
  assert.equal(engine.pendingAction.type, 'roulette_choice');
});

test('vypršení limitu tahu = netočit (nic se neplatí, hází se)', () => {
  const { engine, player } = nextTurnAfterRoulette({ fee: 1000 });
  engine._handleTurnTimeout();
  assert.equal(player.balance, 30000);
  assert.equal(engine.pendingAction.type, 'wait_roll');
});

// ── Bot ──────────────────────────────────────────────────────────────────────

function botCtx(balance, fee) {
  const ctx = makeCtx();
  addPlayer(ctx, makePlayer('bot', { isBot: true, balance, position: ROULETTE_SPACE }));
  addPlayer(ctx, makePlayer('opp'));
  ctx.config.rouletteFee = fee;
  ctx.pendingAction = { type: 'roulette_choice', targetId: 'bot', data: { fee } };
  return ctx;
}

test('bot zatočí, když mu po poplatku zůstane rezerva', () => {
  assert.deepEqual(Bot.decideAction(botCtx(30000, 1000), 'bot'),
    { kind: 'respond', data: { decision: 'spin' } });
});

test('bot netočí, když by poplatek sáhl na rezervu', () => {
  const ctx = botCtx(0, 1000);
  ctx.players.get('bot').balance = Bot.calcReserve(ctx, 'bot') + 500;
  assert.deepEqual(Bot.decideAction(ctx, 'bot'),
    { kind: 'respond', data: { decision: 'skip' } });
});
