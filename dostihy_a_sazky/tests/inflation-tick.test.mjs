import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { inflationRaised, tickValue } from '../public/js/animations/inflationTickGate.mjs';

const read = rel => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

test('počítadlo se spustí jen když inflace stoupla', () => {
  assert.equal(inflationRaised(0, 1), true);
  assert.equal(inflationRaised(1, 2), true);
  assert.equal(inflationRaised(1, 1), false);
  // první stav po načtení / reconnectu — ceny se jen ukážou, nic se netočí
  assert.equal(inflationRaised(null, 2), false);
  // nová hra po předchozí s inflací
  assert.equal(inflationRaised(3, 0), false);
});

test('počítadlo jde od staré ceny k nové po celých korunách', () => {
  assert.equal(tickValue(1200, 1320, 0), 1200);
  assert.equal(tickValue(1200, 1320, 1), 1320);
  assert.equal(tickValue(1200, 1320, 2), 1320);
  let prev = 1200;
  for (let i = 1; i <= 20; i++) {
    const v = tickValue(1200, 1320, i / 20);
    assert.ok(Number.isInteger(v), `${v} není celé číslo`);
    assert.ok(v >= prev && v <= 1320, 'počítadlo nesmí couvat ani přestřelit');
    prev = v;
  }
});

test('2D i 3D plán protáčí ceny po inflaci', () => {
  for (const file of ['../public/js/ui/board.js', '../public/js/ui/board3d.js']) {
    const src = read(file);
    // Porovnává se celkový koeficient — zdražení z Rulety i automatické po kolech.
    assert.match(src, /inflationRaised\(prevInflation, factor\)/, `${file}: chybí detekce inflace`);
    assert.match(src, /stateInflationFactor\(gameState\)/, `${file}: inflace se musí brát ze všech zdrojů`);
    assert.match(src, /tickNumber\(/, `${file}: chybí počítadlo`);
  }
  assert.match(read('../public/style.css'), /\.space-price\.price-inflating \{/);
});
