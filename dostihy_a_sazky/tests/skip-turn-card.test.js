'use strict';

// Karta „Zdržíš se na N kol" (Náhoda): hráč vynechá N tahů, ale jeho žetony
// dostihů dál platí. Žetony vypíná jen Doping (pole 30 / výseč Rulety).

const test = require('node:test');
const assert = require('node:assert/strict');

const GameEngine = require('../src/GameEngine');
const BOARD = require('../src/data/boardData');

const FANTOME = 1;
const GAVORA = 3;

function makeEngine() {
  const engine = new GameEngine({ to: () => ({ emit: () => {} }) }, 'room-test');
  engine._broadcast = () => {};
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
  return engine;
}

/** A vlastní celou oranžovou stáj a na Fantome má 2 malé žetony. */
function giveStable(engine) {
  const a = engine.players.get('A');
  a.properties.push(FANTOME, GAVORA);
  engine.ownerships[FANTOME] = 'A';
  engine.ownerships[GAVORA] = 'A';
  engine.tokens[FANTOME] = { small: 2, big: false };
}

test('karta Zdržíš se na 2 kola nevypne žetony dostihů', () => {
  const engine = makeEngine();
  giveStable(engine);
  engine._applyCard('A', { type: 'skip_turn', turns: 2, text: 'Zdržíš se na 2 kola.' });

  assert.equal(engine._calcRent(FANTOME, 0), engine._price(BOARD[FANTOME].rents[2]));
});

test('Doping žetony dál vypíná', () => {
  const engine = makeEngine();
  giveStable(engine);
  engine.players.get('A').skipTurns = 1;

  assert.equal(engine._calcRent(FANTOME, 0), engine._price(BOARD[FANTOME].rents[0]));
});

test('karta nechá hráče vynechat právě 2 tahy', () => {
  const engine = makeEngine();
  engine._applyCard('A', { type: 'skip_turn', turns: 2, text: 'Zdržíš se na 2 kola.' });
  const a = engine.players.get('A');

  engine.currentTurnIdx = 0;
  engine._startTurn();
  assert.notEqual(engine.pendingAction?.targetId === 'A' && engine.pendingAction.type, 'wait_roll');
  engine.currentTurnIdx = 0;
  engine._startTurn();
  assert.notEqual(engine.pendingAction?.targetId === 'A' && engine.pendingAction.type, 'wait_roll');
  engine.currentTurnIdx = 0;
  engine._startTurn();
  assert.deepEqual(
    { type: engine.pendingAction.type, targetId: engine.pendingAction.targetId },
    { type: 'wait_roll', targetId: 'A' },
  );
  assert.equal(a.waitTurns, 0);
});
