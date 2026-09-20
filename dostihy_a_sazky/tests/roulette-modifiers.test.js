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
      pendingBet: null, doubleRent: 0, rentImmunity: 0, halfPriceNext: false, tokenStrike: 0,
    });
  });
  engine.turnOrder = ['A', 'B'];
  return engine;
}

function giveStable(engine, pid) {
  [FANTOME, GAVORA].forEach(sid => {
    engine.ownerships[sid] = pid;
    engine.players.get(pid).properties.push(sid);
  });
}

test('stávka vypne žetony stejně jako doping', () => {
  const engine = makeEngine();
  giveStable(engine, 'B');
  engine.tokens[FANTOME] = { small: 2, big: false };

  const withTokens = engine._calcRent(FANTOME, 3);
  assert.equal(withTokens, BOARD[FANTOME].rents[2]);

  engine.players.get('B').tokenStrike = 1;
  const striking = engine._calcRent(FANTOME, 3);
  assert.equal(striking, BOARD[FANTOME].rents[0], 'při stávce má platit základní nájem');
});

test('dvojitý nájem zdvojnásobí a spotřebuje se jednou', () => {
  const engine = makeEngine();
  giveStable(engine, 'B');
  engine.players.get('B').doubleRent = 1;

  const base = engine._calcRent(FANTOME, 3);
  assert.equal(engine._applyRentModifiers('A', 'B', base), base * 2);
  assert.equal(engine.players.get('B').doubleRent, 0);

  // druhý nájem už je normální
  assert.equal(engine._applyRentModifiers('A', 'B', base), base);
});

test('imunita vynuluje nájem a spotřebuje se jednou', () => {
  const engine = makeEngine();
  giveStable(engine, 'B');
  engine.players.get('A').rentImmunity = 1;

  const base = engine._calcRent(FANTOME, 3);
  assert.equal(engine._applyRentModifiers('A', 'B', base), 0);
  assert.equal(engine.players.get('A').rentImmunity, 0);
  assert.equal(engine._applyRentModifiers('A', 'B', base), base);
});

test('imunita vyhraje nad dvojitým nájmem a obě nabití se spotřebují', () => {
  const engine = makeEngine();
  giveStable(engine, 'B');
  engine.players.get('B').doubleRent = 1;
  engine.players.get('A').rentImmunity = 1;

  const base = engine._calcRent(FANTOME, 3);
  assert.equal(engine._applyRentModifiers('A', 'B', base), 0);
  assert.equal(engine.players.get('B').doubleRent, 0, 'dvojitý nájem se musí spotřebovat taky');
  assert.equal(engine.players.get('A').rentImmunity, 0);
});

test('nabití nepřeteče pod nulu', () => {
  const engine = makeEngine();
  giveStable(engine, 'B');
  const base = engine._calcRent(FANTOME, 3);

  engine._applyRentModifiers('A', 'B', base);
  assert.equal(engine.players.get('B').doubleRent, 0);
  assert.equal(engine.players.get('A').rentImmunity, 0);
});

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

test('stávka se snižuje na začátku tahu cílového hráče', () => {
  const engine = makeEngine();
  engine.players.get('A').tokenStrike = 1;
  engine.currentTurnIdx = 0;
  engine._startTurn();

  assert.equal(engine.players.get('A').tokenStrike, 0);
});
