'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const GameEngine = require('../src/GameEngine');

test('landing on an unaffordable unowned property announces insufficient funds', () => {
  const engine = new GameEngine({ to: () => ({ emit: () => {} }) }, 'room-test');
  const player = {
    id: 'p1',
    name: 'Matej',
    position: 1,
    balance: 500,
    properties: [],
    bankrupt: false,
  };

  engine.phase = 'playing';
  engine.players.set(player.id, player);
  engine.turnOrder = [player.id];

  let scheduled = null;
  engine._broadcast = () => {};
  engine._scheduleAction = (delay, fn) => {
    scheduled = { delay, fn };
  };

  engine._evaluateSpace(player.id);

  assert.equal(engine.pendingAction.type, 'insufficient_funds');
  assert.equal(engine.pendingAction.targetId, player.id);
  assert.equal(engine.pendingAction.data.spaceId, 1);
  assert.equal(engine.pendingAction.data.price, 1200);
  assert.equal(engine.pendingAction.data.balance, 500);
  assert.equal(engine.pendingAction.data.shortage, 700);
  assert.equal(typeof scheduled.fn, 'function');
});

test('standing on an upgradeable stable without token money announces insufficient funds', () => {
  const engine = new GameEngine({ to: () => ({ emit: () => {} }) }, 'room-test');
  const player = {
    id: 'p1',
    name: 'Matej',
    position: 1,
    balance: 500,
    properties: [1, 3],
    bankrupt: false,
  };

  engine.phase = 'playing';
  engine.players.set(player.id, player);
  engine.turnOrder = [player.id];
  engine.ownerships = { 1: player.id, 3: player.id };

  let scheduled = null;
  engine._broadcast = () => {};
  engine._scheduleAction = (delay, fn) => {
    scheduled = { delay, fn };
  };

  engine._offerTokensOrEnd(player.id);

  assert.equal(engine.pendingAction.type, 'insufficient_funds');
  assert.equal(engine.pendingAction.targetId, player.id);
  assert.equal(engine.pendingAction.data.kind, 'token');
  assert.equal(engine.pendingAction.data.spaceId, 1);
  assert.equal(engine.pendingAction.data.price, 1000);
  assert.equal(engine.pendingAction.data.balance, 500);
  assert.equal(engine.pendingAction.data.shortage, 500);
  assert.equal(engine.pendingAction.data.tokenType, 'small');
  assert.equal(typeof scheduled.fn, 'function');
});
