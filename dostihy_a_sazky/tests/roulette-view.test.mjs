import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

import { rouletteLegend } from '../public/js/ui/rouletteView.mjs';

const require = createRequire(import.meta.url);
const { OUTCOMES } = require('../src/Roulette');

test('každá výseč má krátký popis pro tooltip', () => {
  for (const o of OUTCOMES) {
    assert.ok(typeof o.summary === 'string' && o.summary.length > 0, `${o.id} nemá summary`);
    assert.ok(o.summary.length <= 40, `${o.id}: summary je na tooltip moc dlouhé`);
  }
});

test('legenda má všechny výseče právě jednou, rozdělené do skupin', () => {
  const legend = rouletteLegend(OUTCOMES);
  assert.deepEqual(legend.map(g => g.group), ['good', 'neutral', 'bad']);
  const ids = legend.flatMap(g => g.items.map(i => i.id)).sort();
  assert.deepEqual(ids, OUTCOMES.map(o => o.id).sort());
  for (const g of legend) {
    assert.ok(g.items.every(i => OUTCOMES.find(o => o.id === i.id).group === g.group));
  }
});

test('pravděpodobnost výseče = váha / součet vah, skupina = součet jejích výsečí', () => {
  const total = OUTCOMES.reduce((s, o) => s + o.weight, 0);
  for (const g of rouletteLegend(OUTCOMES)) {
    let sum = 0;
    for (const item of g.items) {
      const o = OUTCOMES.find(x => x.id === item.id);
      assert.equal(item.share, o.weight / total);
      sum += item.share;
    }
    assert.ok(Math.abs(g.share - sum) < 1e-9);
  }
});

test('ve skupině jdou výseče od nejčastější', () => {
  for (const g of rouletteLegend(OUTCOMES)) {
    const shares = g.items.map(i => i.share);
    assert.deepEqual(shares, [...shares].sort((a, b) => b - a));
  }
});

test('procenta: celá čísla, malé šance nespadnou na 0 %', () => {
  const legend = rouletteLegend(OUTCOMES);
  const jackpot = legend.flatMap(g => g.items).find(i => i.id === 'jackpot');
  assert.equal(jackpot.percent, '3 %');
  const preemption = legend.flatMap(g => g.items).find(i => i.id === 'preemption');
  assert.equal(preemption.percent, '14 %');
  assert.equal(rouletteLegend([{ id: 'x', group: 'good', weight: 1 }, { id: 'y', group: 'bad', weight: 999 }])[0].items[0].percent, '<1 %');
});

test('bez dat Rulety je legenda prázdná', () => {
  assert.deepEqual(rouletteLegend([]), []);
  assert.deepEqual(rouletteLegend(undefined), []);
});
