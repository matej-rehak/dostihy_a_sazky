'use strict';

/**
 * Náhoda na serveru nesmí jít z `Math.random()`.
 *
 * `Math.random()` ve V8 (xorshift128+) je rychlý, ale z několika jeho výstupů
 * jde dopočítat všechny další. Server dřív jeho syrové hodnoty posílal všem
 * hráčům jako identifikátory (`lastDice.id`, `lastPawnMove.id`, `spinId`,
 * `roomId`…) — kdo se podíval do síťové komunikace, mohl předpovědět příští
 * hody kostkou, výsledky Rulety i pořadí karet.
 *
 * Statistická kvalita obou generátorů je stejná; jde jen o to, aby výsledky
 * nešly předpovědět.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

function serverSources() {
  const files = [path.join(ROOT, 'server.js')];
  const walk = dir => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.name.endsWith('.js')) files.push(full);
    }
  };
  walk(path.join(ROOT, 'src'));
  return files;
}

test('serverový kód nepoužívá Math.random()', () => {
  const offenders = serverSources()
    .filter(f => /Math\.random\s*\(/.test(fs.readFileSync(f, 'utf8')))
    .map(f => path.relative(ROOT, f));
  assert.deepEqual(offenders, [], `Math.random() je v: ${offenders.join(', ')}`);
});

/**
 * Totéž za běhu: s `Math.random` nahrazeným výjimkou musí hod kostkou,
 * Ruleta i míchání karet projít — a identifikátory, které jdou klientům,
 * nesmí být čísla z [0, 1).
 */
test('hod, Ruleta ani karty za běhu nesahají na Math.random()', () => {
  const original = Math.random;
  Math.random = () => { throw new Error('Math.random() zavoláno na serveru'); };
  try {
    const { roll } = require('../src/constants');
    const { spin } = require('../src/Roulette');
    const { FinanceDeck, NahodaDeck } = require('../src/Cards');
    const GameEngine = require('../src/GameEngine');

    for (let i = 0; i < 200; i++) {
      const d = roll();
      assert.ok(Number.isInteger(d) && d >= 1 && d <= 6, `hod ${d}`);
      assert.ok(spin().id);
    }
    // Balíček se míchá při vytvoření i po dobrání — obojí musí projít.
    for (const deck of [FinanceDeck(), NahodaDeck()]) {
      for (let i = 0; i < 30; i++) assert.ok(deck.draw());
    }

    const engine = new GameEngine({ to: () => ({ emit: () => {} }) }, 'room-test');
    engine.phase = 'playing';
    for (const id of ['A', 'B']) {
      engine.players.set(id, {
        id, name: id, position: 0, balance: 50000, properties: [],
        bankrupt: false, inJail: false, jailTurns: 0, rollAccumulator: 0,
      });
    }
    engine.turnOrder = ['A', 'B'];
    engine.currentTurnIdx = 0;
    engine.pendingAction = { type: 'wait_roll', targetId: 'A' };
    engine._broadcast = () => {};
    engine._scheduleAction = () => {};

    engine.handleRoll({ playerId: 'A', emit: () => {} });

    const { lastDice, lastPawnMove } = engine;
    assert.ok(lastDice && lastDice.value >= 1 && lastDice.value <= 6);
    for (const id of [lastDice.id, lastPawnMove?.id].filter(v => v !== undefined)) {
      assert.equal(typeof id, 'string', 'identifikátor pro klienta nesmí být syrové číslo z generátoru');
    }
  } finally {
    Math.random = original;
  }
});

test('identifikátory událostí se neopakují', () => {
  const { eventId } = require('../src/random');
  const seen = new Set();
  for (let i = 0; i < 10000; i++) seen.add(eventId());
  assert.equal(seen.size, 10000);
});

test('randomInt i randomFloat drží rozsah', () => {
  const { randomInt, randomFloat } = require('../src/random');
  for (let i = 0; i < 5000; i++) {
    const n = randomInt(1, 7);
    assert.ok(Number.isInteger(n) && n >= 1 && n <= 6);
    const f = randomFloat();
    assert.ok(f >= 0 && f < 1);
  }
});
