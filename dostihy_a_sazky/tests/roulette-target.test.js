'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const GameEngine = require('../src/GameEngine');
const { spinRoulette } = require('./helpers/roulette');
const { OUTCOMES, rndFor } = require('../src/Roulette');
const { JAIL_SPACE } = require('../src/constants');

function makeEngine(outcomeId) {
  const engine = new GameEngine({ to: () => ({ emit: () => {} }) }, 'room-test');
  engine._broadcast = () => {};
  engine._scheduleAction = (delay, fn) => fn();
  engine.phase = 'playing';
  engine.config.field30Mode = 'roulette';
  engine.config.rouletteFee = 0;   // točí se hned, bez volby zaplatit

  ['A', 'B', 'C'].forEach(id => {
    engine.players.set(id, {
      id, socketId: `sock-${id}`, name: id, color: '#fff', isHost: false,
      position: 0, balance: 30000, bankrupt: false, inJail: false, jailTurns: 0,
      skipTurns: 0, properties: [], rollAccumulator: 0, moveDirection: 1,
      jailFreeCards: 0, ready: true, disconnected: false, canFly: false, left: false,
      pendingBet: null, halfPriceNext: false,
    });
  });
  engine.turnOrder = ['A', 'B', 'C'];
  engine.currentTurnIdx = 0;

  engine._rouletteRnd = () => rndFor(outcomeId);
  return engine;
}

function spinAndAck(engine) {
  spinRoulette(engine);
  engine.handleRespond({ playerId: 'A', emit: () => {} }, { decision: 'ack' });
}

test('udání otevře výběr soupeře bez sebe sama', () => {
  const engine = makeEngine('report');
  spinAndAck(engine);

  assert.equal(engine.pendingAction.type, 'roulette_pick_player');
  assert.equal(engine.pendingAction.targetId, 'A');
  assert.deepEqual(engine.pendingAction.data.candidates.sort(), ['B', 'C']);
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
  const engine = makeEngine('report');
  spinAndAck(engine);
  engine.handleRespond({ playerId: 'A', emit: () => {} }, { decision: 'A' });

  assert.equal(engine.players.get('A').inJail, false);
  assert.notEqual(engine.pendingAction?.type, 'roulette_pick_player');
});

test('bankrotáři nejsou mezi kandidáty', () => {
  const engine = makeEngine('report');
  engine.players.get('B').bankrupt = true;
  spinAndAck(engine);

  assert.deepEqual(engine.pendingAction.data.candidates, ['C']);
});

test('bez soupeřů efekt propadne a prompt se neotevře', () => {
  const engine = makeEngine('report');
  engine.players.get('B').bankrupt = true;
  engine.players.get('C').bankrupt = true;
  spinAndAck(engine);

  assert.notEqual(engine.pendingAction?.type, 'roulette_pick_player');
});

test('udání: kandidát zbankrotuje mezi promptem a odpovědí — efekt propadne, ne poslat do Distancu', () => {
  const engine = makeEngine('report');
  spinAndAck(engine);
  // Simuluje odpojení hráče B v okně mezi otevřením promptu a odpovědí —
  // `candidates` v pendingAction je stále stará (obsahuje B).
  engine.players.get('B').bankrupt = true;
  engine.handleRespond({ playerId: 'A', emit: () => {} }, { decision: 'B' });

  const b = engine.players.get('B');
  assert.equal(b.inJail, false);
  assert.equal(b.position, 0);
  assert.notEqual(engine.pendingAction?.type, 'roulette_pick_player');
});
