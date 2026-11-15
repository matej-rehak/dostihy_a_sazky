import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

import { inflate, INFLATION_RATE, priced, inflationPercent } from '../public/js/ui/inflation.mjs';

const require = createRequire(import.meta.url);
const server = require('../src/constants');
const BOARD = require('../src/data/boardData');

/**
 * Server strhává platby podle `inflate` ze src/constants.js, klient podle
 * zrcadla v public/js/ui/inflation.mjs ukazuje ceny. Kdyby se rozešly
 * (sazba nebo zaokrouhlení), hráč by na plánu četl jinou cenu, než zaplatí.
 */
test('klientská inflace dává stejné částky jako serverová', () => {
  assert.equal(INFLATION_RATE, server.INFLATION_RATE);
  const amounts = new Set([0, 1, 80, 333, 1000, 2000]);
  for (const s of BOARD) {
    for (const k of ['price', 'tokenCost', 'bigTokenCost', 'amount']) if (s[k]) amounts.add(s[k]);
    (s.rents || []).forEach(r => amounts.add(r));
  }
  for (let level = 0; level <= 6; level++) {
    for (const a of amounts) {
      assert.equal(inflate(a, level), server.inflate(a, level), `${a} Kč při úrovni ${level}`);
    }
  }
});

test('ceny po inflaci jsou vždy celé koruny', () => {
  for (let level = 1; level <= 6; level++) {
    assert.ok(Number.isInteger(inflate(1234, level)));
  }
});

test('priced čte úroveň ze stavu hry a bez ní cenu nemění', () => {
  assert.equal(priced({ inflation: 1 }, 1000), 1100);
  assert.equal(priced({}, 1000), 1000);
  assert.equal(priced(null, 1000), 1000);
});

test('procento inflace od začátku hry', () => {
  assert.equal(inflationPercent(0), 0);
  assert.equal(inflationPercent(1), 10);
  assert.equal(inflationPercent(2), 21);
});

/** Automatická inflace po kolech (vlastní sazba) — zrcadlo musí sedět i s ní. */
test('klient a server se shodnou i s automatickou inflací', () => {
  for (const rate of [1, 7, 10, 15, 33, 100]) {
    for (let level = 0; level <= 3; level++) {
      for (let auto = 0; auto <= 5; auto++) {
        for (const a of [80, 1000, 2350, 40000]) {
          assert.equal(inflate(a, level, auto, rate), server.inflate(a, level, auto, rate), `${a} Kč, Ruleta ${level}, auto ${auto}× ${rate} %`);
        }
      }
    }
  }
  assert.equal(priced({ inflation: 1, autoInflation: 2, config: { inflationRate: 20 } }, 1000), Math.round(1000 * 1.1 * 1.44));
  assert.equal(inflationPercent(0, 2, 20), 44);
});
