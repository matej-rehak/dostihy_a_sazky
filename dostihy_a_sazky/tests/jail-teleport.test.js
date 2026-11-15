'use strict';

// Cesta do Distancu je vždy „teleport": server posílá `lastPawnMove` typu
// teleport, aby klient figurku přenesl, ne aby ji vedl po plánu. Dřív to
// platilo jen pro dvojitou šestku — kartu „Distanc (bez 4 000 Kč)", Ruletu
// i udání klient animoval jako chůzi dopředu přes START a ukázal animaci
// bonusu +4 000 Kč, i když se nic nevyplatilo.

const test = require('node:test');
const assert = require('node:assert/strict');

const GameEngine = require('../src/GameEngine');
const { JAIL_SPACE } = require('../src/constants');

function makeEngine() {
  const engine = new GameEngine({ to: () => ({ emit: () => {} }) }, 'room-test');
  engine._broadcast = () => {};
  engine._scheduleAction = () => {};
  engine.phase = 'playing';
  ['A', 'B'].forEach(id => engine.players.set(id, {
    id, name: id, position: 36, balance: 30000, bankrupt: false, inJail: false,
    jailTurns: 0, skipTurns: 0, properties: [], rollAccumulator: 0, jailFreeCards: 0,
  }));
  engine.turnOrder = ['A', 'B'];
  engine.currentTurnIdx = 0;
  return engine;
}

function assertTeleport(engine, pid, from) {
  const move = engine.lastPawnMove;
  assert.ok(move, 'chybí lastPawnMove — klient by figurku vedl po plánu přes START');
  assert.equal(move.type, 'teleport');
  assert.equal(move.playerId, pid);
  assert.equal(move.from, from);
  assert.equal(move.to, JAIL_SPACE);
  assert.equal(engine.players.get(pid).position, JAIL_SPACE);
}

test('karta „Distanc" pošle hráče teleportem a bez bonusu za START', () => {
  const engine = makeEngine();
  engine._applyCard('A', { type: 'go_to_jail', passStart: false, text: 'Distanc' });
  assertTeleport(engine, 'A', 36);
  assert.equal(engine.players.get('A').balance, 30000, 'bonus za START se nevyplácí');
});

test('výseč Distanc na Ruletě = teleport', () => {
  const engine = makeEngine();
  engine._sendToJail('A');
  assertTeleport(engine, 'A', 36);
});

test('udání z Rulety pošle soupeře teleportem', () => {
  const engine = makeEngine();
  engine.players.get('B').position = 25;
  engine._sendToJail('B');
  assertTeleport(engine, 'B', 25);
});

test('každý teleport má nové id, aby ho klient nepřeskočil', () => {
  const engine = makeEngine();
  engine._sendToJail('A');
  const first = engine.lastPawnMove.id;
  engine.players.get('A').position = 36;
  engine._sendToJail('A');
  assert.notEqual(engine.lastPawnMove.id, first);
});

test('dvojitá šestka si ponechá svůj důvod', () => {
  const engine = makeEngine();
  engine.players.get('A').rollAccumulator = 6;
  engine.pendingAction = { type: 'wait_roll', targetId: 'A' };
  engine._forceDice = 6;
  engine.handleRoll({ playerId: 'A', emit: () => {} });
  assertTeleport(engine, 'A', 36);
  assert.equal(engine.lastPawnMove.reason, 'double_six_jail');
});
