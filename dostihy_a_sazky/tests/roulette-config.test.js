'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const GameEngine = require('../src/GameEngine');

function makeEngine() {
  const engine = new GameEngine({ to: () => ({ emit: () => {} }) }, 'room-test');
  engine._broadcast = () => {};
  return engine;
}

function makeHost(engine) {
  const socket = { playerId: 'HOST', id: 'sock-host', emit: () => {} };
  engine.addPlayer(socket, 'Host', '#e74c3c');
  return socket;
}

test('field30Mode je výchozí doping', () => {
  const engine = makeEngine();
  assert.equal(engine.config.field30Mode, 'doping');
});

test('hostitel přepne na ruletu', () => {
  const engine = makeEngine();
  const host = makeHost(engine);
  engine.updateConfig(host, { field30Mode: 'roulette' });
  assert.equal(engine.config.field30Mode, 'roulette');
});

test('neplatná hodnota spadne zpět na doping', () => {
  const engine = makeEngine();
  const host = makeHost(engine);
  engine.updateConfig(host, { field30Mode: 'roulette' });
  engine.updateConfig(host, { field30Mode: 'kasino' });
  assert.equal(engine.config.field30Mode, 'doping');
});

test('field30Mode se veze ve stavu ke klientovi', () => {
  const engine = makeEngine();
  const host = makeHost(engine);
  engine.updateConfig(host, { field30Mode: 'roulette' });
  assert.equal(engine._buildState().config.field30Mode, 'roulette');
});
