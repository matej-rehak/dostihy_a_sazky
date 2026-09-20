'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const GameEngine = require('../src/GameEngine');
const { OUTCOMES } = require('../src/Roulette');

function makeEngine(field30Mode = 'roulette') {
  const engine = new GameEngine({ to: () => ({ emit: () => {} }) }, 'room-test');
  engine._broadcast = () => {};
  engine._scheduleAction = (delay, fn) => fn();
  engine.phase = 'playing';
  engine.config.field30Mode = field30Mode;

  ['A', 'B'].forEach((id, i) => {
    engine.players.set(id, {
      id, socketId: `sock-${id}`, name: id, color: '#fff', isHost: i === 0,
      position: 0, balance: 30000, bankrupt: false, inJail: false, jailTurns: 0,
      skipTurns: 0, properties: [], rollAccumulator: 0, moveDirection: 1,
      jailFreeCards: 0, ready: true, disconnected: false, canFly: false, left: false,
      pendingBet: null, doubleRent: 0, rentImmunity: 0, halfPriceNext: false, tokenStrike: 0,
    });
  });
  engine.turnOrder = ['A', 'B'];
  engine.currentTurnIdx = 0;
  return engine;
}

function forceOutcome(engine, id) {
  const idx = OUTCOMES.findIndex(o => o.id === id);
  engine._rouletteRnd = () => (idx + 0.5) / OUTCOMES.length;
}

test('režim doping se chová jako dřív — žádná ruleta', () => {
  const engine = makeEngine('doping');
  // `_scheduleAction` v `makeEngine` je synchronní, takže by bez izolace
  // `_advanceTurn` propadl(a) rovnou do `_startTurn` dalšího hráče a
  // `pendingAction` by skončil jako `wait_roll` pro B — to je chování mimo
  // rozsah tohoto testu (a mimo rozsah Tasku 3). Stejný vzor izolace používá
  // `tests/trade-debt-resume.test.js`.
  engine._advanceTurn = () => {};
  engine.players.get('A').position = 30;
  engine._evaluateSpace('A');

  assert.equal(engine.players.get('A').skipTurns, 1);
  assert.equal(engine.pendingAction, null);
});

test('režim roulette otevře prompt roulette_ack s výsledkem', () => {
  const engine = makeEngine();
  forceOutcome(engine, 'immunity');
  engine.players.get('A').position = 30;
  engine._evaluateSpace('A');

  assert.equal(engine.pendingAction.type, 'roulette_ack');
  assert.equal(engine.pendingAction.targetId, 'A');
  assert.equal(engine.pendingAction.data.result.id, 'immunity');
  // Efekt se aplikuje až po potvrzení, ne při zatočení
  assert.equal(engine.players.get('A').rentImmunity, 0);
});

test('potvrzení nabije imunitu a tah pokračuje', () => {
  const engine = makeEngine();
  forceOutcome(engine, 'immunity');
  engine.players.get('A').position = 30;
  engine._evaluateSpace('A');
  engine.handleRespond({ playerId: 'A', emit: () => {} }, {});

  assert.equal(engine.players.get('A').rentImmunity, 1);
});

test('dvojitý nájem a přednostní právo se nabijí', () => {
  for (const [id, field, expected] of [
    ['double_rent', 'doubleRent', 1],
    ['preemption', 'halfPriceNext', true],
  ]) {
    const engine = makeEngine();
    forceOutcome(engine, id);
    engine.players.get('A').position = 30;
    engine._evaluateSpace('A');
    engine.handleRespond({ playerId: 'A', emit: () => {} }, {});
    assert.equal(engine.players.get('A')[field], expected, `${id} nenabil ${field}`);
  }
});

test('doping na ruletě zachová původní efekt', () => {
  const engine = makeEngine();
  forceOutcome(engine, 'doping');
  engine.players.get('A').position = 30;
  engine._evaluateSpace('A');
  engine.handleRespond({ playerId: 'A', emit: () => {} }, {});

  assert.equal(engine.players.get('A').skipTurns, 1);
});

/**
 * Vypršení časového limitu odehraje prompt za hráče. Kliknutí, které dorazí
 * těsně po něm, už nesmí stejný efekt aplikovat podruhé — `_handleTurnTimeout`
 * proto musí `pendingAction` spotřebovat stejně jako `handleRespond`.
 */
test('vypršelý limit a opožděné kliknutí aplikují sázku právě jednou', () => {
  const engine = makeEngine();
  forceOutcome(engine, 'bet');
  // Pokračování tahu se jen zaznamená: v reálném provozu ještě visí ve
  // frontě, když opožděné kliknutí dorazí.
  const scheduled = [];
  engine._scheduleAction = (delay, fn) => scheduled.push(fn);

  engine.players.get('A').position = 30;
  engine._evaluateSpace('A');
  assert.equal(engine.pendingAction.type, 'roulette_ack');

  const before = engine.players.get('A').balance;
  engine._handleTurnTimeout();
  const afterTimeout = engine.players.get('A').balance;
  assert.ok(afterTimeout < before, 'vypršelý limit musí sázku strhnout');
  const scheduledAfterTimeout = scheduled.length;

  // Opožděné kliknutí hráče, které dorazilo až po vypršení limitu.
  engine.handleRespond({ playerId: 'A', emit: () => {} }, {});

  assert.equal(
    engine.players.get('A').balance, afterTimeout,
    'sázka se nesmí strhnout podruhé'
  );
  assert.equal(
    scheduled.length, scheduledAfterTimeout,
    'opožděné kliknutí nesmí naplánovat druhé pokračování tahu — hráč by tiše přišel o tah'
  );
});

test('vypršelý limit spotřebuje pendingAction u všech promptů Totalizátoru', () => {
  const prompts = [
    { type: 'roulette_ack', data: { result: { id: 'immunity' } } },
    { type: 'roulette_pick_player', data: { outcomeId: 'strike', candidates: ['B'] } },
    { type: 'roulette_pick_horse', data: { outcomeId: 'auction', options: [] } },
  ];

  for (const prompt of prompts) {
    const engine = makeEngine();
    const scheduled = [];
    engine._scheduleAction = (delay, fn) => scheduled.push(fn);
    engine.pendingAction = { ...prompt, targetId: 'A' };

    engine._handleTurnTimeout();
    assert.equal(engine.pendingAction, null, `${prompt.type} zůstal po timeoutu viset`);

    const scheduledAfterTimeout = scheduled.length;
    engine.handleRespond({ playerId: 'A', emit: () => {} }, {});
    assert.equal(
      scheduled.length, scheduledAfterTimeout,
      `opožděné kliknutí znovu odbavilo ${prompt.type}`
    );
  }
});

test('nový hráč má všechny příznaky vynulované', () => {
  const engine = new GameEngine({ to: () => ({ emit: () => {} }) }, 'room-test');
  engine._broadcast = () => {};
  engine.addPlayer({ playerId: 'X', id: 'sock-x', emit: () => {} }, 'X', '#fff');
  const p = engine.players.get('X');

  assert.equal(p.pendingBet, null);
  assert.equal(p.doubleRent, 0);
  assert.equal(p.rentImmunity, 0);
  assert.equal(p.halfPriceNext, false);
  assert.equal(p.tokenStrike, 0);
});

test('nový bot má všechny příznaky vynulované', () => {
  const engine = new GameEngine({ to: () => ({ emit: () => {} }) }, 'room-test');
  engine._broadcast = () => {};
  engine.addBot();
  const bot = [...engine.players.values()].find(p => p.isBot);

  assert.ok(bot, 'addBot() nevytvořil hráče');
  assert.equal(bot.pendingBet, null);
  assert.equal(bot.doubleRent, 0);
  assert.equal(bot.rentImmunity, 0);
  assert.equal(bot.halfPriceNext, false);
  assert.equal(bot.tokenStrike, 0);
});
