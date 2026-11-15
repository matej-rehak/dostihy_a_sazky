'use strict';

// Časovaná rozhodnutí (odkup koně, karta „Opakovaný hod") a potvrzení Rulety.

const test = require('node:test');
const assert = require('node:assert/strict');

const GameEngine = require('../src/GameEngine');
const { NahodaDeck } = require('../src/Cards');
const { shouldReroll } = require('../src/Bot');
const { DECISION_WINDOW_MS } = require('../src/constants');
const { spinRoulette } = require('./helpers/roulette');
const { rndFor } = require('../src/Roulette');

const FANTOME = 1;

function makeEngine() {
  const engine = new GameEngine({ to: () => ({ emit: () => {} }) }, 'room-test');
  engine._broadcast = () => {};
  engine._scheduleAction = (delay, fn) => fn && fn();
  engine.phase = 'playing';
  ['A', 'B'].forEach(id => {
    engine.players.set(id, {
      id, socketId: `sock-${id}`, name: id, color: '#fff', isHost: false,
      position: 0, balance: 30000, bankrupt: false, inJail: false, jailTurns: 0,
      skipTurns: 0, properties: [], rollAccumulator: 0, moveDirection: 1,
      jailFreeCards: 0, rerollCards: 0, ready: true, disconnected: false, canFly: false, left: false,
      pendingBet: null, halfPriceNext: false, canSpin: false,
    });
  });
  engine.turnOrder = ['A', 'B'];
  engine.currentTurnIdx = 0;
  engine.pendingAction = { type: 'wait_roll', targetId: 'A' };
  // Pohyb a další tah nás tu nezajímají — jen kolik se hodilo.
  engine._movePlayer = (pid, steps) => { engine.moved = steps; };
  engine._advanceTurn = () => {};
  return engine;
}

const sock = pid => ({ playerId: pid, emit: () => {} });

// ─── Odkup ───────────────────────────────────────────────────────────────────

test('nabídka odkupu má okno 5 s a vypršením propadá', () => {
  const engine = makeEngine();
  engine.ownerships[FANTOME] = 'B';
  engine.players.get('B').properties.push(FANTOME);
  let tokensOffered = false;
  engine._offerTokensOrEnd = () => { tokensOffered = true; };

  engine._offerBuyoutOrEnd('A', FANTOME, 5000);
  const pa = engine.pendingAction;
  assert.equal(pa.type, 'buyout_offer');
  assert.equal(pa.data.windowMs, DECISION_WINDOW_MS);
  assert.equal(DECISION_WINDOW_MS, 5000);

  engine._handleDecisionTimeout(pa);
  assert.equal(engine.ownerships[FANTOME], 'B', 'kůň zůstává majiteli');
  assert.equal(tokensOffered, true, 'tah pokračuje jako po odmítnutí');
  engine.destroy();
});

test('vypršení starého okna nesahá na novější prompt', () => {
  const engine = makeEngine();
  engine.ownerships[FANTOME] = 'B';
  engine._offerBuyoutOrEnd('A', FANTOME, 5000);
  const stale = engine.pendingAction;
  engine.handleRespond(sock('A'), { decision: 'buy' });
  assert.equal(engine.ownerships[FANTOME], 'A');
  assert.notEqual(engine.pendingAction, stale);
  engine.destroy();
});

// ─── Karta Opakovaný hod ─────────────────────────────────────────────────────

test('balíček Náhoda má kartu Opakovaný hod právě jednou a drží se', () => {
  const deck = NahodaDeck();
  const cards = deck.original.filter(c => c.type === 'reroll_card');
  assert.equal(cards.length, 1);
  assert.equal(cards[0].keep, true);
});

test('karta přidá hráči opakovaný hod', () => {
  const engine = makeEngine();
  engine._applyCard('A', { type: 'reroll_card', keep: true, text: '' });
  assert.equal(engine.players.get('A').rerollCards, 1);
});

test('bez karty se po hodu nic nenabízí', () => {
  const engine = makeEngine();
  engine._forceDice = 3;
  engine.handleRoll(sock('A'));
  assert.equal(engine.moved, 3);
});

test('s kartou hráč po hodu dostane časované okno', () => {
  const engine = makeEngine();
  engine.players.get('A').rerollCards = 1;
  engine._forceDice = 3;
  engine.handleRoll(sock('A'));
  assert.equal(engine.moved, undefined, 'figurka čeká na rozhodnutí');
  assert.equal(engine.pendingAction.type, 'reroll_offer');
  assert.equal(engine.pendingAction.data.dice, 3);
  assert.equal(engine.pendingAction.data.windowMs, DECISION_WINDOW_MS);
  engine.destroy();
});

test('použití karty hodí znovu, kartu spotřebuje a vrátí do balíčku', () => {
  const engine = makeEngine();
  const a = engine.players.get('A');
  // Karta je „v ruce" — v balíčku chybí.
  engine.nahodaCards.setHeld('reroll_card', true);
  a.rerollCards = 1;
  engine._forceDice = 3;
  engine.handleRoll(sock('A'));
  const firstDiceId = engine.lastDice.id;

  engine._forceDice = 5;
  engine.handleRespond(sock('A'), { decision: 'reroll' });
  assert.equal(engine.moved, 5, 'platí nový hod');
  assert.notEqual(engine.lastDice.id, firstDiceId, 'klient dostane novou kostku');
  assert.equal(a.rerollCards, 0);
  assert.equal(engine.nahodaCards.held.size, 0);
  assert.equal(engine.nahodaCards.pile.filter(c => c.type === 'reroll_card').length, 1);
});

test('odmítnutí i vypršení okna ponechá původní hod a kartu', () => {
  for (const finish of ['keep', 'timeout']) {
    const engine = makeEngine();
    const a = engine.players.get('A');
    a.rerollCards = 1;
    engine._forceDice = 4;
    engine.handleRoll(sock('A'));
    if (finish === 'keep') engine.handleRespond(sock('A'), { decision: 'keep' });
    else engine._handleDecisionTimeout(engine.pendingAction);
    assert.equal(engine.moved, 4, finish);
    assert.equal(a.rerollCards, 1, finish);
  }
});

test('karta zachrání druhou šestku po sobě', () => {
  const engine = makeEngine();
  const a = engine.players.get('A');
  a.rerollCards = 1;
  a.rollAccumulator = 6;
  engine._forceDice = 6;
  engine.handleRoll(sock('A'));
  engine._forceDice = 2;
  engine.handleRespond(sock('A'), { decision: 'reroll' });
  assert.equal(a.inJail, false);
  assert.equal(engine.moved, 8);
});

test('bankrotem se karta Opakovaný hod vrací do balíčku', () => {
  const engine = makeEngine();
  engine.nahodaCards.setHeld('reroll_card', true);
  engine.players.get('B').rerollCards = 1;
  engine._declareBankrupt('B');
  assert.equal(engine.players.get('B').rerollCards, 0);
  assert.equal(engine.nahodaCards.held.size, 0);
});

test('bot kartu spálí na druhou šestku, na neškodný hod ne', () => {
  const engine = makeEngine();
  const a = engine.players.get('A');
  a.rollAccumulator = 6;
  assert.equal(shouldReroll(engine, 'A', 6), true);
  a.rollAccumulator = 0;
  assert.equal(shouldReroll(engine, 'A', 3), false);
});

// ─── Ruleta ──────────────────────────────────────────────────────────────────

test('efekt Rulety se uplatní až na potvrzení, ne na jinou zprávu', () => {
  const engine = makeEngine();
  engine.config.field30Mode = 'roulette';
  engine.config.rouletteFee = 0;
  engine._rouletteRnd = () => rndFor('jackpot');
  spinRoulette(engine);
  const before = engine.players.get('A').balance;
  assert.equal(engine.pendingAction.type, 'roulette_ack');

  // Opožděný dvojklik na „Zatočit" dorazí až během točení.
  engine.handleRespond(sock('A'), { decision: 'spin' });
  assert.equal(engine.pendingAction.type, 'roulette_ack');
  assert.equal(engine.players.get('A').balance, before);

  engine.handleRespond(sock('A'), { decision: 'ack' });
  assert.ok(engine.players.get('A').balance > before);
});
