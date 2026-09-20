import test from 'node:test';
import assert from 'node:assert/strict';

import { MIN_VISIBLE, clampDragPosition } from '../public/js/ui/dragGate.mjs';

/**
 * Posouvání modálních oken. `pos` je posun oproti původní (vycentrované)
 * poloze, `rect` je okno před posunem. Meze hlídají, aby okno nešlo zasunout
 * za okraj tak, že by se už nedalo chytit zpátky.
 */

const viewport = { width: 1200, height: 800 };
// Okno 400×300 vycentrované v 1200×800
const rect = { left: 400, top: 250, width: 400, height: 300 };

test('výchozí viditelný okraj je 80 px', () => {
  assert.equal(MIN_VISIBLE, 80);
});

test('posun uvnitř mezí projde beze změny', () => {
  assert.deepEqual(
    clampDragPosition({ x: 50, y: -40 }, rect, viewport),
    { x: 50, y: -40 }
  );
});

test('okno nejde vytáhnout nad horní okraj', () => {
  // rect.top je 250, takže y pod -250 by dostalo záhlaví mimo obraz
  const { y } = clampDragPosition({ x: 0, y: -999 }, rect, viewport);
  assert.equal(y, -250);
  assert.equal(rect.top + y, 0, 'horní hrana skončí přesně na okraji');
});

test('okno nejde zasunout úplně doleva', () => {
  const { x } = clampDragPosition({ x: -9999, y: 0 }, rect, viewport);
  assert.equal(rect.left + x + rect.width, MIN_VISIBLE,
    'vpravo musí zůstat viditelný pruh');
});

test('okno nejde zasunout úplně doprava', () => {
  const { x } = clampDragPosition({ x: 9999, y: 0 }, rect, viewport);
  assert.equal(rect.left + x, viewport.width - MIN_VISIBLE,
    'vlevo musí zůstat viditelný pruh');
});

test('okno nejde shodit pod spodní okraj', () => {
  const { y } = clampDragPosition({ x: 0, y: 9999 }, rect, viewport);
  assert.equal(rect.top + y, viewport.height - MIN_VISIBLE,
    'úchyt musí zůstat nad spodní hranou');
});

test('vlastní viditelný okraj se respektuje', () => {
  const { x } = clampDragPosition({ x: 9999, y: 0 }, rect, viewport, 200);
  assert.equal(rect.left + x, viewport.width - 200);
});

test('okno větší než viewport nevyrobí nesmyslné meze', () => {
  const big = { left: 0, top: 0, width: 2000, height: 1500 };
  const small = { width: 320, height: 480 };
  const result = clampDragPosition({ x: -500, y: -500 }, big, small);
  assert.ok(Number.isFinite(result.x), 'x musí být konečné číslo');
  assert.ok(Number.isFinite(result.y), 'y musí být konečné číslo');
});

test('nulový posun zůstane nulový', () => {
  assert.deepEqual(clampDragPosition({ x: 0, y: 0 }, rect, viewport), { x: 0, y: 0 });
});
