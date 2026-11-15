import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  CONFETTI_MS, makeConfetti, stepConfetti, confettiOpacity, stableConfettiColors,
} from '../public/js/animations/confettiGate.mjs';

// deterministický generátor, ať testy nejsou náhodné
function seeded(seed = 1) {
  return () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
}

const W = 1600, H = 900;

test('paleta stáje obsahuje barvu stáje a zlatou hry', () => {
  const colors = stableConfettiColors('#22c55e');
  assert.ok(colors.includes('#22c55e'));
  assert.ok(colors.includes('#ffd700'));
  assert.ok(stableConfettiColors(undefined).length > 0, 'bez barvy stáje nesmí paleta zůstat prázdná');
});

test('papírky startují dole v rozích a letí nahoru ke středu', () => {
  const pieces = makeConfetti({ width: W, height: H, colors: ['#f00', '#0f0'], count: 40, rnd: seeded() });
  assert.equal(pieces.length, 40);
  for (const p of pieces) {
    assert.ok(p.y > H, 'start pod spodním okrajem');
    assert.ok(p.vy < 0, 'letí nahoru');
    const fromLeft = p.x < W / 2;
    assert.ok(fromLeft ? p.vx > 0 : p.vx < 0, 'míří dovnitř obrazovky');
    assert.ok(['#f00', '#0f0'].includes(p.color));
  }
});

test('papírky vyletí do obrazovky a gravitace je pak stáhne dolů', () => {
  const [p] = makeConfetti({ width: W, height: H, colors: ['#fff'], count: 1, rnd: seeded(7) });
  let highest = p.y;
  for (let i = 0; i < 60; i++) { stepConfetti(p, 1 / 60); highest = Math.min(highest, p.y); }
  assert.ok(highest < H * 0.35, `papírek vyletěl jen na y=${highest.toFixed(0)}`);
  const afterRise = p.y;
  for (let i = 0; i < 120; i++) stepConfetti(p, 1 / 60);
  assert.ok(p.y > afterRise, 'po vrcholu musí padat');
});

test('papírky padají pomalu, aby byly vidět až do konce', () => {
  const pieces = makeConfetti({ width: W, height: H, colors: ['#fff'], count: 30, rnd: seeded(3) });
  const steps = Math.round((CONFETTI_MS / 1000) * 60 * 0.75);
  for (let i = 0; i < steps; i++) pieces.forEach(p => stepConfetti(p, 1 / 60));
  const visible = pieces.filter(p => p.y > 0 && p.y < H).length;
  assert.ok(visible >= pieces.length * 0.6, `ve 3/4 trvání je vidět jen ${visible} z ${pieces.length}`);
  for (const p of pieces) assert.ok(p.vy <= p.term + 1e-9, 'pád nesmí překročit mezní rychlost');
});

test('konfety na konci plynule zmizí', () => {
  assert.equal(confettiOpacity(0), 1);
  assert.equal(confettiOpacity(CONFETTI_MS * 0.5), 1);
  const late = confettiOpacity(CONFETTI_MS * 0.9);
  assert.ok(late > 0 && late < 1);
  assert.equal(confettiOpacity(CONFETTI_MS), 0);
});

test('konfety se spustí s oknem dokončené stáje a neblokují kliknutí', () => {
  const read = rel => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
  const actions = read('../public/js/ui/actions.js');
  const fn = actions.slice(actions.indexOf('export function showStableOverlay'));
  assert.match(fn.slice(0, 400), /playConfetti\(stableConfettiColors\(groupColor\)\)/);
  const css = read('../public/style.css');
  const rule = css.slice(css.indexOf('.confetti-canvas {'));
  assert.match(rule.slice(0, 200), /pointer-events:\s*none/);
});
