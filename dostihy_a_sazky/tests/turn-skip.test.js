'use strict';

// Přeskočený tah (zdržení z karty / doping) se posílá ve stavu jako `turnSkip`,
// aby klient mohl přeskočenému hráči ukázat banner „Toto kolo stojíš".

const test = require('node:test');
const assert = require('node:assert/strict');

const GameEngine = require('../src/GameEngine');

function makeEngine() {
  const engine = new GameEngine({ to: () => ({ emit: () => {} }) }, 'room-test');
  engine.broadcasts = 0;
  engine._broadcast = () => { engine.broadcasts++; };
  engine._scheduleAction = () => {};
  engine.phase = 'playing';
  ['A', 'B'].forEach(id => {
    engine.players.set(id, {
      id, socketId: `sock-${id}`, name: id, color: '#fff', isHost: false,
      position: 0, balance: 30000, bankrupt: false, inJail: false, jailTurns: 0,
      skipTurns: 0, waitTurns: 0, properties: [], rollAccumulator: 0, moveDirection: 1,
      jailFreeCards: 0, rerollCards: 0, ready: true, disconnected: false, canFly: false, left: false,
      pendingBet: null, halfPriceNext: false, canSpin: false,
    });
  });
  engine.turnOrder = ['A', 'B'];
  engine.currentTurnIdx = 0;
  engine.round = 1;
  return engine;
}

test('zdržení z karty: stav nese důvod, hráče a zbývající kola', () => {
  const engine = makeEngine();
  engine.players.get('A').waitTurns = 2;
  engine._startTurn();
  const skip = engine._buildState().turnSkip;
  assert.equal(skip.playerId, 'A');
  assert.equal(skip.reason, 'wait');
  assert.equal(skip.remaining, 1);
  assert.ok(skip.id);
  assert.ok(engine.broadcasts >= 1, 'přeskočení se musí rozeslat');
});

test('doping: důvod doping, po posledním kole zbývá 0', () => {
  const engine = makeEngine();
  engine.players.get('A').skipTurns = 1;
  engine._startTurn();
  const skip = engine._buildState().turnSkip;
  assert.equal(skip.reason, 'doping');
  assert.equal(skip.remaining, 0);
});

test('každé přeskočení má nové id (klient ho ukáže jen jednou)', () => {
  const engine = makeEngine();
  engine.players.get('A').waitTurns = 2;
  engine._startTurn();
  const first = engine._buildState().turnSkip.id;
  engine._startTurn();
  assert.notEqual(engine._buildState().turnSkip.id, first);
});

test('běžný tah turnSkip nenastaví', () => {
  const engine = makeEngine();
  engine._startTurn();
  assert.equal(engine._buildState().turnSkip ?? null, null);
});
