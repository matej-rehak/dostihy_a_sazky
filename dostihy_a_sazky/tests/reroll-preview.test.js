'use strict';

// Karta „Opakovaný hod": hráč dřív neviděl, kam by s aktuálním hodem došel,
// a rozhodoval se naslepo. Server proto v promptu reroll_offer posílá náhled
// (`data.preview`), podle kterého klient zvýrazní cílové pole.

const test = require('node:test');
const assert = require('node:assert/strict');

const GameEngine = require('../src/GameEngine');
const { JAIL_SPACE } = require('../src/constants');

function makeEngine({ position = 0, rollAccumulator = 0 } = {}) {
  const engine = new GameEngine({ to: () => ({ emit: () => {} }) }, 'room-test');
  engine._broadcast = () => {};
  engine._scheduleAction = (delay, fn) => fn && fn();
  engine.phase = 'playing';
  ['A', 'B'].forEach(id => {
    engine.players.set(id, {
      id, socketId: `sock-${id}`, name: id, color: '#fff', isHost: false,
      position: id === 'A' ? position : 0, balance: 30000, bankrupt: false, inJail: false, jailTurns: 0,
      skipTurns: 0, properties: [], rollAccumulator: id === 'A' ? rollAccumulator : 0, moveDirection: 1,
      jailFreeCards: 0, rerollCards: id === 'A' ? 1 : 0, ready: true, disconnected: false, canFly: false, left: false,
      pendingBet: null, halfPriceNext: false, canSpin: false,
    });
  });
  engine.turnOrder = ['A', 'B'];
  engine.currentTurnIdx = 0;
  engine.pendingAction = { type: 'wait_roll', targetId: 'A' };
  engine._movePlayer = (pid, steps) => { engine.moved = steps; };
  engine._advanceTurn = () => {};
  return engine;
}

function offerFor(engine, dice) {
  engine._forceDice = dice;
  engine.handleRoll({ playerId: 'A', emit: () => {} });
  assert.equal(engine.pendingAction.type, 'reroll_offer');
  const { preview } = engine.pendingAction.data;
  engine.destroy();
  return preview;
}

test('náhled ukáže pole, kam by hráč s hodem došel', () => {
  assert.deepEqual(offerFor(makeEngine({ position: 5 }), 3), { kind: 'move', spaceId: 8, steps: 3 });
});

test('náhled počítá s průchodem STARTem', () => {
  assert.deepEqual(offerFor(makeEngine({ position: 38 }), 4), { kind: 'move', spaceId: 2, steps: 4 });
});

test('po předchozí šestce náhled přičte nasčítané hody', () => {
  // Hráč už hodil 6 (nasčítáno 6) a teď hodil 2 → posune se o 8
  assert.deepEqual(offerFor(makeEngine({ position: 0, rollAccumulator: 6 }), 2), { kind: 'move', spaceId: 8, steps: 8 });
});

test('první šestka — náhled řekne, že se hází znovu', () => {
  assert.deepEqual(offerFor(makeEngine(), 6), { kind: 'again', steps: 6 });
});

test('druhá šestka po sobě — náhled ukáže Distanc', () => {
  assert.deepEqual(offerFor(makeEngine({ rollAccumulator: 6 }), 6), { kind: 'jail', spaceId: JAIL_SPACE });
});

test('náhled odpovídá skutečnému pohybu po ponechání hodu', () => {
  const engine = makeEngine({ position: 12 });
  engine._forceDice = 5;
  engine.handleRoll({ playerId: 'A', emit: () => {} });
  const { preview } = engine.pendingAction.data;
  engine.handleRespond({ playerId: 'A', emit: () => {} }, { decision: 'keep' });
  assert.equal(engine.moved, preview.steps);
  assert.equal((12 + engine.moved) % 40, preview.spaceId);
  engine.destroy();
});
