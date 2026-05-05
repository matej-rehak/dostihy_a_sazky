'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const GameEngine = require('../src/GameEngine');
const { JAIL_SPACE } = require('../src/constants');

test('druhá šestka po sobě pošle hráče na Distanc jako teleport událost', () => {
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
  engine._scheduleAction = () => {};

  engine._forceDice = 6;
  engine.handleRoll({ playerId: 'A', emit: () => {} });

  assert.equal(engine.players.get('A').position, 4);
  assert.equal(engine.players.get('A').rollAccumulator, 6);
  assert.equal(engine.pendingAction.type, 'wait_roll');

  engine._forceDice = 6;
  engine.handleRoll({ playerId: 'A', emit: () => {} });

  const player = engine.players.get('A');
  assert.equal(player.position, JAIL_SPACE);
  assert.equal(player.inJail, true);
  assert.equal(player.rollAccumulator, 0);
  assert.equal(engine.lastPawnMove.type, 'teleport');
  assert.equal(engine.lastPawnMove.reason, 'double_six_jail');
  assert.equal(engine.lastPawnMove.playerId, 'A');
  assert.equal(engine.lastPawnMove.from, 4);
  assert.equal(engine.lastPawnMove.to, JAIL_SPACE);
});
