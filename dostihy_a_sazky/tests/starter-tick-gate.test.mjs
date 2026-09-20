import test from 'node:test';
import assert from 'node:assert/strict';

import {
  TICK_MS,
  TICK_COUNT,
  ticksElapsed,
  isStarterFinished,
  nextFlickerIndex,
} from '../public/js/animations/starterAnimationGate.mjs';

test('losování má 30 tiků po 100 ms', () => {
  assert.equal(TICK_MS, 100);
  assert.equal(TICK_COUNT, 30);
});

test('počet tiků se odvozuje z uplynulého času, ne z počtu snímků', () => {
  assert.equal(ticksElapsed(0), 0);
  assert.equal(ticksElapsed(99), 0);
  assert.equal(ticksElapsed(100), 1);
  assert.equal(ticksElapsed(250), 2);
  assert.equal(ticksElapsed(3000), 30);
});

test('zdržený snímek tiky nezahodí, jen je dožene', () => {
  // Snímek, který se opozdí o 300 ms, musí vrátit tik 5, ne tik 3.
  assert.equal(ticksElapsed(500), 5);
});

test('losování končí po posledním tiku', () => {
  assert.equal(isStarterFinished(29), false);
  assert.equal(isStarterFinished(30), true);
  assert.equal(isStarterFinished(31), true);
});

// Náhodný výběr ukázal u dvou hráčů stejné jméno zhruba v polovině tiků
// a kolo pak vypadalo zaseknuté. Jména se proto střídají dokola.
test('jméno se nikdy neopakuje dvakrát po sobě', () => {
  for (const count of [2, 3, 4, 5, 6]) {
    let idx = 0;
    for (let i = 0; i < count * 3; i++) {
      const next = nextFlickerIndex(idx, count);
      assert.notEqual(next, idx, `při ${count} hráčích se index ${idx} zopakoval`);
      idx = next;
    }
  }
});

test('střídání jmen se po posledním hráči vrátí na začátek', () => {
  assert.equal(nextFlickerIndex(0, 3), 1);
  assert.equal(nextFlickerIndex(1, 3), 2);
  assert.equal(nextFlickerIndex(2, 3), 0);
});

test('jediný hráč nerozbije střídání', () => {
  assert.equal(nextFlickerIndex(0, 1), 0);
});

test('prázdný seznam hráčů nevrátí neplatný index', () => {
  assert.equal(nextFlickerIndex(0, 0), 0);
});
