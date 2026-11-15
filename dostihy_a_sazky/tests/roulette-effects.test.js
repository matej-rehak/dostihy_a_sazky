'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const GameEngine = require('../src/GameEngine');
const { spinRoulette } = require('./helpers/roulette');
const BOARD = require('../src/data/boardData');
const { JAIL_SPACE } = require('../src/constants');
const { rndFor, JACKPOT_BONUS, FINE_EXTRA } = require('../src/Roulette');

const FANTOME = 1;
const GAVORA = 3;

function makeEngine({ fee = 0 } = {}) {
  const engine = new GameEngine({ to: () => ({ emit: () => {} }) }, 'room-test');
  engine._broadcast = () => {};
  engine._scheduleAction = (delay, fn) => fn();
  engine._advanceTurn = () => { engine.advanced = (engine.advanced || 0) + 1; };
  engine.phase = 'playing';
  engine.config.field30Mode = 'roulette';
  engine.config.rouletteFee = fee;

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
  engine.currentTurnIdx = 0;
  return engine;
}

const respond = (engine, data = {}) => engine.handleRespond({ playerId: 'A', emit: () => {} }, data);

/** Postaví A na Ruletu, případně zaplatí zatočení, a potvrdí výsledek `id`. */
function spinAndAck(engine, id) {
  engine._rouletteRnd = () => rndFor(id);
  spinRoulette(engine);
  if (engine.pendingAction.type === 'roulette_choice') respond(engine, { decision: 'spin' });
  assert.equal(engine.pendingAction.data.result.id, id);
  respond(engine, { decision: 'ack' });
}

test('jackpot vrátí cenu zatočení a přidá 10.000 Kč', () => {
  const engine = makeEngine({ fee: 1000 });
  spinAndAck(engine, 'jackpot');
  assert.equal(engine.players.get('A').balance, 30000 + JACKPOT_BONUS);
});

test('jackpot u Rulety zdarma dá jen bonus', () => {
  const engine = makeEngine();
  spinAndAck(engine, 'jackpot');
  assert.equal(engine.players.get('A').balance, 30000 + JACKPOT_BONUS);
});

test('pokuta stojí cenu zatočení podruhé a k tomu 10.000 Kč', () => {
  const engine = makeEngine({ fee: 1000 });
  spinAndAck(engine, 'fine');
  assert.equal(engine.players.get('A').balance, 30000 - 1000 - (1000 + FINE_EXTRA));
});

test('Distanc z Rulety pošle hráče do vězení a ukončí tah', () => {
  const engine = makeEngine();
  spinAndAck(engine, 'jail');
  const a = engine.players.get('A');
  assert.equal(a.inJail, true);
  assert.equal(a.position, JAIL_SPACE);
  assert.equal(engine.advanced, 1);
});

test('toč znovu s poplatkem nabídne nové placené zatočení', () => {
  const engine = makeEngine({ fee: 500 });
  spinAndAck(engine, 'spin_again');
  assert.equal(engine.pendingAction.type, 'roulette_choice');
  assert.equal(engine.pendingAction.data.fee, 500);

  respond(engine, { decision: 'skip' });
  assert.equal(engine.players.get('A').balance, 30000 - 500, 'odmítnutí nic nestojí');
});

test('toč znovu u Rulety zdarma nabídne novou volbu zdarma', () => {
  const engine = makeEngine();
  spinAndAck(engine, 'spin_again');
  assert.equal(engine.pendingAction.type, 'roulette_choice');
  assert.equal(engine.pendingAction.data.fee, 0);
});

// ─── Inflace ────────────────────────────────────────────────────────────────

test('inflace zvedne úroveň a veze se ve stavu', () => {
  const engine = makeEngine();
  spinAndAck(engine, 'inflation');
  assert.equal(engine.inflation, 1);
  assert.equal(engine._buildState().inflation, 1);
});

test('inflace zdraží platby o 10 % na celé koruny, příjmy ne', () => {
  const engine = makeEngine({ fee: 1000 });
  engine.config.airportFee = 2000;
  engine.inflation = 1;
  const up = n => Math.round(n * 1.1);

  assert.equal(engine._effectiveBuyPrice('A', FANTOME), up(BOARD[FANTOME].price));
  assert.equal(engine._tokenCost(FANTOME, false), up(BOARD[FANTOME].tokenCost));
  assert.equal(engine._tokenCost(FANTOME, true), up(BOARD[FANTOME].bigTokenCost));
  assert.equal(engine._airportFee(), 2200);
  assert.equal(engine._rouletteFee(), 1100);

  engine.ownerships[FANTOME] = 'B';
  engine.players.get('B').properties.push(FANTOME);
  assert.equal(engine._calcRent(FANTOME, 1), up(BOARD[FANTOME].rents[0]));

  // prodej zůstává z původní ceny (inflace výkup nemění)
  const before = engine.players.get('B').balance;
  engine._sellProperty('B', FANTOME);
  assert.equal(engine.players.get('B').balance, before + engine._bankSaleValue(BOARD[FANTOME].price));
});

test('inflace se násobí a zaokrouhluje na celé koruny', () => {
  const engine = makeEngine();
  engine.inflation = 2;
  assert.equal(engine._price(1000), 1210);
  assert.equal(engine._price(333), 403);   // 402,93
  engine.inflation = 0;
  assert.equal(engine._price(333), 333);
});

test('daň na poli se platí po inflaci', () => {
  const engine = makeEngine();
  engine.inflation = 1;
  const tax = BOARD.find(s => s.type === 'tax');
  engine.players.get('A').position = tax.id;
  engine._offerTokensOrEnd = () => {};
  engine._evaluateSpace('A');
  assert.equal(engine.players.get('A').balance, 30000 - Math.round(tax.amount * 1.1));
});

test('nájem z pole se strhne po inflaci', () => {
  const engine = makeEngine();
  engine.inflation = 1;
  [FANTOME, GAVORA].forEach(sid => {
    engine.ownerships[sid] = 'B';
    engine.players.get('B').properties.push(sid);
  });
  engine._offerTokensOrEnd = () => {};
  engine.players.get('A').position = FANTOME;
  engine._evaluateSpace('A');
  assert.equal(engine.players.get('A').balance, 30000 - Math.round(BOARD[FANTOME].rents[0] * 1.1));
});

test('karta „zaplať" po inflaci změní částku i text', () => {
  const engine = makeEngine();
  engine.inflation = 1;
  const card = engine._inflateCard({ type: 'pay', amount: 1000, text: 'Zaplať pojistku 1.000 Kč.' });
  assert.equal(card.amount, 1100);
  assert.equal(card.text, 'Zaplať pojistku 1.100 Kč.');

  const tokens = engine._inflateCard({
    type: 'pay_per_token_custom', small: 800, big: 2300,
    text: 'Za každý svůj obsazený dostih zaplať 800 Kč, za každý svůj obsazený hlavní dostih sezóny zaplať 2.300 Kč.',
  });
  assert.equal(tokens.small, 880);
  assert.equal(tokens.big, 2530);
  assert.match(tokens.text, /880 Kč.*2\.530 Kč/);

  const gain = { type: 'gain', amount: 1000, text: 'Získáváš 1.000 Kč.' };
  assert.equal(engine._inflateCard(gain), gain, 'příjem z karty se nezdražuje');
});
