'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const GameEngine = require('../src/GameEngine');
const { OUTCOMES } = require('../src/Roulette');

const BET = OUTCOMES.find(o => o.id === 'bet');

function makeEngine() {
  const engine = new GameEngine({ to: () => ({ emit: () => {} }) }, 'room-test');
  engine._broadcast = () => {};
  engine._scheduleAction = (delay, fn) => fn();
  engine.phase = 'playing';
  engine.config.field30Mode = 'roulette';

  ['A', 'B'].forEach(id => {
    engine.players.set(id, {
      id, socketId: `sock-${id}`, name: id, color: '#fff', isHost: false,
      position: 0, balance: 30000, bankrupt: false, inJail: false, jailTurns: 0,
      skipTurns: 0, properties: [], rollAccumulator: 0, moveDirection: 1,
      jailFreeCards: 0, ready: true, disconnected: false, canFly: false, left: false,
      pendingBet: null, doubleRent: 0, rentImmunity: 0, halfPriceNext: false, tokenStrike: 0,
    });
  });
  engine.turnOrder = ['A', 'B'];
  engine.currentTurnIdx = 0;

  const idx = OUTCOMES.findIndex(o => o.id === 'bet');
  engine._rouletteRnd = () => (idx + 0.5) / OUTCOMES.length;
  return engine;
}

function placeBet(engine) {
  // `_scheduleAction` je synchronní (viz makeEngine), takže bez izolace by
  // `_handleRouletteAck` → `_offerTokensOrEnd` → `_advanceTurn` propadl(a)
  // rovnou do `_startTurn` dalšího hráče a přepsal(a) currentTurnIdx na B —
  // stejný vzor izolace jako v tests/roulette-spin.test.js (test "režim
  // doping se chová jako dřív") a tests/trade-debt-resume.test.js.
  engine._advanceTurn = () => {};
  engine.players.get('A').position = 30;
  engine._evaluateSpace('A');
  engine.handleRespond({ playerId: 'A', emit: () => {} }, {});
}

test('sázka se strhne hned při zatočení', () => {
  const engine = makeEngine();
  placeBet(engine);

  assert.equal(engine.players.get('A').balance, 30000 - BET.stake);
  assert.deepEqual(engine.players.get('A').pendingBet, {
    stake: BET.stake, threshold: BET.threshold, payout: BET.stake * BET.payoutMultiplier,
  });
});

test('výhra vyplatí trojnásobek a sázku vynuluje', () => {
  const engine = makeEngine();
  placeBet(engine);

  engine._setPendingAction({ type: 'wait_roll', targetId: 'A' });
  engine._movePlayer = () => {};
  engine._forceDice = 5;
  engine.handleRoll({ playerId: 'A', emit: () => {} });

  assert.equal(engine.players.get('A').balance, 30000 - BET.stake + BET.stake * BET.payoutMultiplier);
  assert.equal(engine.players.get('A').pendingBet, null);
});

test('prohra sázku jen vynuluje', () => {
  const engine = makeEngine();
  placeBet(engine);

  engine._setPendingAction({ type: 'wait_roll', targetId: 'A' });
  engine._movePlayer = () => {};
  engine._forceDice = 3;
  engine.handleRoll({ playerId: 'A', emit: () => {} });

  assert.equal(engine.players.get('A').balance, 30000 - BET.stake);
  assert.equal(engine.players.get('A').pendingBet, null);
});

test('šestka vyhraje a opakovaný hod se už nesází', () => {
  const engine = makeEngine();
  placeBet(engine);
  const afterStake = engine.players.get('A').balance;

  engine._setPendingAction({ type: 'wait_roll', targetId: 'A' });
  engine._movePlayer = () => {};
  engine._forceDice = 6;
  engine.handleRoll({ playerId: 'A', emit: () => {} });

  assert.equal(engine.players.get('A').balance, afterStake + BET.stake * BET.payoutMultiplier);
  assert.equal(engine.players.get('A').pendingBet, null, 'šestka musí sázku spotřebovat');
});

test('chudý hráč vsadí jen to, co má', () => {
  const engine = makeEngine();
  engine.players.get('A').balance = 2000;
  placeBet(engine);

  assert.equal(engine.players.get('A').balance, 0);
  assert.equal(engine.players.get('A').pendingBet.stake, 2000);
  assert.equal(engine.players.get('A').pendingBet.payout, 2000 * BET.payoutMultiplier);
});

test('s nulovým zůstatkem se sázka nekoná', () => {
  const engine = makeEngine();
  engine.players.get('A').balance = 0;
  placeBet(engine);

  assert.equal(engine.players.get('A').pendingBet, null);
  assert.equal(engine.players.get('A').balance, 0);
});

test('sázka přežije serializaci stavu', () => {
  const engine = makeEngine();
  placeBet(engine);

  const restored = engine._buildState().players.find(p => p.id === 'A');
  assert.deepEqual(restored.pendingBet, engine.players.get('A').pendingBet);
});
