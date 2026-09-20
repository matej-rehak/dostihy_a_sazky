'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const GameEngine = require('../src/GameEngine');
const { SIX_REROLL_DELAY_MS } = require('../src/constants');

/**
 * Po šestce se hází znovu. Server ale dřív povolil další hod okamžitě, takže
 * protihráčův klient dostal nový stav dřív, než dohrála animace šestky — a ta
 * se rozbila uprostřed. Server proto další hod odloží o délku animace.
 */

function makeEngine() {
  const engine = new GameEngine({ to: () => ({ emit: () => {} }) }, 'room-test');
  engine.phase = 'playing';
  engine.players.set('A', {
    id: 'A',
    name: 'A',
    position: 4,
    balance: 5000,
    properties: [],
    bankrupt: false,
    inJail: false,
    jailTurns: 0,
    rollAccumulator: 0,
  });
  engine.players.set('B', {
    id: 'B',
    name: 'B',
    position: 0,
    balance: 5000,
    properties: [],
    bankrupt: false,
  });
  engine.turnOrder = ['A', 'B'];
  engine.currentTurnIdx = 0;
  engine.pendingAction = { type: 'wait_roll', targetId: 'A' };
  engine._broadcast = () => {};
  return engine;
}

test('prodleva po šestce pokryje celou animaci kostky', () => {
  // Klient: 400 ms roztočení + 600 ms dosednutí + 700 ms jiskry = 1700 ms.
  // Viz public/js/animations/diceAnimationGate.mjs (SIX_TOTAL_MS).
  assert.ok(
    SIX_REROLL_DELAY_MS >= 1700,
    `SIX_REROLL_DELAY_MS (${SIX_REROLL_DELAY_MS}) musí pokrýt 1700 ms animace šestky`
  );
});

test('po šestce není další hod hned k dispozici', () => {
  const engine = makeEngine();
  const scheduled = [];
  engine._scheduleAction = (delay, fn) => scheduled.push({ delay, fn });

  engine._forceDice = 6;
  engine.handleRoll({ playerId: 'A', emit: () => {} });

  assert.equal(engine.players.get('A').rollAccumulator, 6);
  assert.equal(engine.pendingAction, null, 'hod nesmí být povolen dřív, než dohraje animace');
  assert.equal(scheduled.length, 1);
  assert.equal(scheduled[0].delay, SIX_REROLL_DELAY_MS);
});

test('po uplynutí prodlevy se hod vrátí stejnému hráči', () => {
  const engine = makeEngine();
  const scheduled = [];
  engine._scheduleAction = (delay, fn) => scheduled.push({ delay, fn });

  engine._forceDice = 6;
  engine.handleRoll({ playerId: 'A', emit: () => {} });

  scheduled[0].fn();

  assert.equal(engine.pendingAction.type, 'wait_roll');
  assert.equal(engine.pendingAction.targetId, 'A');
  assert.equal(engine.players.get('A').rollAccumulator, 6, 'nasčítané body se prodlevou neztrácí');
});

test('hod jiný než šestka se neodkládá', () => {
  const engine = makeEngine();
  const scheduled = [];
  engine._scheduleAction = (delay, fn) => scheduled.push({ delay, fn });

  engine._forceDice = 3;
  engine.handleRoll({ playerId: 'A', emit: () => {} });

  assert.equal(
    scheduled.some(s => s.delay === SIX_REROLL_DELAY_MS),
    false,
    'prodleva šestky se nesmí uplatnit na běžný hod'
  );
});

test('během prodlevy nelze hodit znovu', () => {
  const engine = makeEngine();
  engine._scheduleAction = () => {};

  engine._forceDice = 6;
  engine.handleRoll({ playerId: 'A', emit: () => {} });

  const errors = [];
  engine._forceDice = 6;
  engine.handleRoll({ playerId: 'A', emit: msg => errors.push(msg) });

  assert.equal(errors.length, 1, 'druhý hod během prodlevy musí být odmítnut');
  assert.equal(engine.players.get('A').rollAccumulator, 6, 'odmítnutý hod se nesmí nasčítat');
});
