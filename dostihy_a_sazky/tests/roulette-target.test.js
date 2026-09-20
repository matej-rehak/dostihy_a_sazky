'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const GameEngine = require('../src/GameEngine');
const { OUTCOMES } = require('../src/Roulette');
const { JAIL_SPACE } = require('../src/constants');

function makeEngine(outcomeId) {
  const engine = new GameEngine({ to: () => ({ emit: () => {} }) }, 'room-test');
  engine._broadcast = () => {};
  engine._scheduleAction = (delay, fn) => fn();
  engine.phase = 'playing';
  engine.config.field30Mode = 'roulette';

  ['A', 'B', 'C'].forEach(id => {
    engine.players.set(id, {
      id, socketId: `sock-${id}`, name: id, color: '#fff', isHost: false,
      position: 0, balance: 30000, bankrupt: false, inJail: false, jailTurns: 0,
      skipTurns: 0, properties: [], rollAccumulator: 0, moveDirection: 1,
      jailFreeCards: 0, ready: true, disconnected: false, canFly: false, left: false,
      pendingBet: null, doubleRent: 0, rentImmunity: 0, halfPriceNext: false, tokenStrike: 0,
    });
  });
  engine.turnOrder = ['A', 'B', 'C'];
  engine.currentTurnIdx = 0;

  const idx = OUTCOMES.findIndex(o => o.id === outcomeId);
  engine._rouletteRnd = () => (idx + 0.5) / OUTCOMES.length;
  return engine;
}

function spinAndAck(engine) {
  engine.players.get('A').position = 30;
  engine._evaluateSpace('A');
  engine.handleRespond({ playerId: 'A', emit: () => {} }, {});
}

test('stávka otevře výběr soupeře bez sebe sama', () => {
  const engine = makeEngine('strike');
  spinAndAck(engine);

  assert.equal(engine.pendingAction.type, 'roulette_pick_player');
  assert.equal(engine.pendingAction.targetId, 'A');
  assert.deepEqual(engine.pendingAction.data.candidates.sort(), ['B', 'C']);
});

test('stávka nabije tokenStrike vybranému soupeři', () => {
  const engine = makeEngine('strike');
  spinAndAck(engine);
  engine.handleRespond({ playerId: 'A', emit: () => {} }, { decision: 'C' });

  assert.equal(engine.players.get('C').tokenStrike, 1);
  assert.equal(engine.players.get('B').tokenStrike, 0);
  assert.equal(engine.players.get('A').tokenStrike, 0);
});

test('udání pošle vybraného soupeře na Distanc', () => {
  const engine = makeEngine('report');
  spinAndAck(engine);
  engine.handleRespond({ playerId: 'A', emit: () => {} }, { decision: 'B' });

  const b = engine.players.get('B');
  assert.equal(b.inJail, true);
  assert.equal(b.position, JAIL_SPACE);
});

test('neplatný cíl efekt zahodí a tah pokračuje', () => {
  const engine = makeEngine('strike');
  spinAndAck(engine);
  engine.handleRespond({ playerId: 'A', emit: () => {} }, { decision: 'A' });

  assert.equal(engine.players.get('A').tokenStrike, 0);
  assert.notEqual(engine.pendingAction?.type, 'roulette_pick_player');
});

test('bankrotáři nejsou mezi kandidáty', () => {
  const engine = makeEngine('report');
  engine.players.get('B').bankrupt = true;
  spinAndAck(engine);

  assert.deepEqual(engine.pendingAction.data.candidates, ['C']);
});

test('bez soupeřů efekt propadne a prompt se neotevře', () => {
  const engine = makeEngine('strike');
  engine.players.get('B').bankrupt = true;
  engine.players.get('C').bankrupt = true;
  spinAndAck(engine);

  assert.notEqual(engine.pendingAction?.type, 'roulette_pick_player');
});
