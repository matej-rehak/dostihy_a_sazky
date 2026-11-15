'use strict';

// Automatická inflace z nastavení hostitele: každých `inflationEveryRounds`
// kol zdraží všechny platby o `inflationRate` %. Násobí se s inflací z Rulety
// (ta zůstává na pevných 10 %). Výchozí stav: vypnuto.

const test = require('node:test');
const assert = require('node:assert/strict');

const GameEngine = require('../src/GameEngine');
const Bot = require('../src/Bot');
const { inflate } = require('../src/constants');

function makeEngine(config = {}) {
  const engine = new GameEngine({ to: () => ({ emit: () => {} }) }, 'room-test');
  engine._broadcast = () => {};
  engine._scheduleAction = () => {};
  engine.phase = 'playing';
  ['A', 'B'].forEach(id => engine.players.set(id, {
    id, name: id, position: 0, balance: 30000, bankrupt: false, inJail: false,
    jailTurns: 0, skipTurns: 0, properties: [], rollAccumulator: 0, jailFreeCards: 0,
  }));
  engine.turnOrder = ['A', 'B'];
  engine.currentTurnIdx = 0;
  Object.assign(engine.config, config);
  return engine;
}

/** Odehraje tahy, dokud nezačne kolo `round`; vrátí úroveň automatické inflace. */
function playUntilRound(engine, round) {
  while (engine.round < round) engine._advanceTurn();
  return engine.autoInflation;
}

test('výchozí nastavení: automatická inflace je vypnutá', () => {
  const engine = makeEngine();
  assert.equal(engine.config.inflationEveryRounds, 0);
  assert.equal(engine.config.inflationRate, 10);
  assert.equal(playUntilRound(engine, 30), 0);
  assert.equal(engine._price(1000), 1000);
});

test('inflace přijde na začátku kola N+1, 2N+1, …', () => {
  const engine = makeEngine({ inflationEveryRounds: 3, inflationRate: 10 });
  assert.equal(playUntilRound(engine, 3), 0, 'během prvních 3 kol se nezdražuje');
  assert.equal(playUntilRound(engine, 4), 1, 'po 3 kolech');
  assert.equal(playUntilRound(engine, 6), 1);
  assert.equal(playUntilRound(engine, 7), 2, 'po 6 kolech');
  assert.equal(playUntilRound(engine, 10), 3);
});

test('každé kolo (N = 1)', () => {
  const engine = makeEngine({ inflationEveryRounds: 1, inflationRate: 5 });
  assert.equal(playUntilRound(engine, 5), 4);
});

test('velikost inflace se násobí a ceny jsou na celé koruny', () => {
  const engine = makeEngine({ inflationEveryRounds: 2, inflationRate: 25 });
  playUntilRound(engine, 5); // dvě zdražení
  assert.equal(engine.autoInflation, 2);
  assert.equal(engine._price(1000), 1563); // 1000 × 1,25² = 1562,5
  assert.ok(Number.isInteger(engine._price(1234)));
});

test('automatická inflace se násobí s inflací z Rulety (ta je vždy 10 %)', () => {
  const engine = makeEngine({ inflationEveryRounds: 2, inflationRate: 20 });
  engine.inflation = 1;          // výseč Inflace na Ruletě
  playUntilRound(engine, 3);     // jedno automatické zdražení
  assert.equal(engine._price(1000), Math.round(1000 * 1.1 * 1.2));
});

test('stav hry posílá úroveň automatické inflace klientům', () => {
  const engine = makeEngine({ inflationEveryRounds: 1, inflationRate: 10 });
  playUntilRound(engine, 3);
  const state = engine._buildState();
  assert.equal(state.autoInflation, 2);
  assert.equal(state.config.inflationRate, 10);
});

test('bot počítá ceny se stejnou inflací jako server', () => {
  const engine = makeEngine({ inflationEveryRounds: 1, inflationRate: 15 });
  engine.inflation = 2;
  playUntilRound(engine, 4);
  // Bot si cenu počítá z enginu stejným `inflate` jako EconomyMixin._price.
  assert.equal(
    inflate(4000, engine.inflation, engine.autoInflation, engine.config.inflationRate),
    engine._price(4000)
  );
  assert.equal(typeof Bot.decideAction, 'function');
});

test('karta „zaplať" zdraží i s automatickou inflací', () => {
  const engine = makeEngine({ inflationEveryRounds: 1, inflationRate: 50 });
  playUntilRound(engine, 2);
  const card = engine._inflateCard({ type: 'pay', amount: 1000, text: 'Zaplať pojistku 1.000 Kč.' });
  assert.equal(card.amount, 1500);
  assert.equal(card.text, 'Zaplať pojistku 1.500 Kč.');
});

test('lobby hodnoty ořízne do rozumného rozsahu', () => {
  const engine = new GameEngine({ to: () => ({ emit: () => {} }) }, 'room-test');
  engine._broadcast = () => {};
  engine.players.set('H', { id: 'H', isHost: true });
  const host = { playerId: 'H', emit: () => {} };
  const set = cfg => { engine.updateConfig(host, { ...engine.config, ...cfg }); return engine.config; };

  assert.deepEqual(
    (({ inflationEveryRounds, inflationRate }) => ({ inflationEveryRounds, inflationRate }))(set({ inflationEveryRounds: 4, inflationRate: 15 })),
    { inflationEveryRounds: 4, inflationRate: 15 }
  );
  assert.equal(set({ inflationEveryRounds: -3 }).inflationEveryRounds, 0);
  assert.equal(set({ inflationEveryRounds: 999 }).inflationEveryRounds, 50);
  assert.equal(set({ inflationRate: 0 }).inflationRate, 1);
  assert.equal(set({ inflationRate: 500 }).inflationRate, 100);
  assert.equal(set({ inflationRate: 'abc' }).inflationRate, 10);
});
