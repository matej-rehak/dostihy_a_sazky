'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const GameEngine = require('../src/GameEngine');
const BOARD = require('../src/data/boardData');

// Fantome (1) a Gavora (3) tvoří celou oranžovou stáj — dvoučlennou,
// takže monopol jde postavit dvěma koni.
const FANTOME = 1;
const GAVORA = 3;

function makeEngine() {
  const engine = new GameEngine({ to: () => ({ emit: () => {} }) }, 'room-test');
  engine._broadcast = () => {};
  engine._scheduleAction = (delay, fn) => fn();
  engine.phase = 'playing';

  ['A', 'B'].forEach(id => {
    engine.players.set(id, {
      id, socketId: `sock-${id}`, name: id, color: '#fff', isHost: false,
      position: 0, balance: 30000, bankrupt: false, inJail: false, jailTurns: 0,
      skipTurns: 0, properties: [], rollAccumulator: 0, moveDirection: 1,
      jailFreeCards: 0, ready: true, disconnected: false, canFly: false, left: false,
      pendingBet: null, halfPriceNext: false,
    });
  });
  engine.turnOrder = ['A', 'B'];
  return engine;
}

test('přednostní právo půlí cenu a spotřebuje se až nákupem', () => {
  const engine = makeEngine();
  const price = BOARD[FANTOME].price;
  engine.players.get('A').halfPriceNext = true;

  assert.equal(engine._effectiveBuyPrice('A', FANTOME), Math.floor(price / 2));
  // pouhý dotaz na cenu příznak nespotřebuje
  assert.equal(engine.players.get('A').halfPriceNext, true);

  engine._buyProperty('A', FANTOME);
  assert.equal(engine.players.get('A').balance, 30000 - Math.floor(price / 2));
  assert.equal(engine.players.get('A').halfPriceNext, false);

  // druhý nákup je za plnou cenu
  assert.equal(engine._effectiveBuyPrice('A', GAVORA), BOARD[GAVORA].price);
});

test('insufficient_funds hlásí sníženou cenu a nedoplatek podle přednostního práva', () => {
  const engine = makeEngine();
  const player = engine.players.get('A');
  const price = BOARD[FANTOME].price;
  const halfPrice = Math.floor(price / 2);

  player.position = FANTOME;
  player.halfPriceNext = true;
  // O 1000 méně, než kolik by hráč skutečně platil (poloviční cena) —
  // bez opravy by log/payload hlásily plnou cenu a nedoplatek by vycházel
  // vůči ní, ne vůči skutečně placené poloviční ceně.
  player.balance = halfPrice - 1000;

  let scheduled = null;
  engine._scheduleAction = (delay, fn) => { scheduled = fn; };

  engine._evaluateSpace('A');

  assert.equal(engine.pendingAction.type, 'insufficient_funds');
  assert.equal(engine.pendingAction.data.price, halfPrice, 'price v payloadu musí být zlevněná, ne plná');
  assert.equal(engine.pendingAction.data.balance, halfPrice - 1000);
  assert.equal(engine.pendingAction.data.shortage, 1000, 'shortage se musí počítat proti zlevněné ceně');
  // příznak zůstává nabitý — dotaz na cenu ho nespotřebovává
  assert.equal(player.halfPriceNext, true);
  assert.equal(typeof scheduled, 'function');
});
