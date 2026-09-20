import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SPIN_MS,
  LAND_MS,
  SIX_ANIM_MS,
  SIX_TOTAL_MS,
  shouldStartRollAnimation,
  shouldTriggerSixAnimation,
  shouldClearRollVisuals,
} from '../public/js/animations/diceAnimationGate.mjs';

test('nový hod se pozná podle id, stejné id animaci nespouští', () => {
  assert.equal(shouldStartRollAnimation({ value: 3, id: 0.42 }, 0.11), true);
  assert.equal(shouldStartRollAnimation({ value: 3, id: 0.42 }, 0.42), false);
});

test('chybějící hod animaci nespouští', () => {
  assert.equal(shouldStartRollAnimation(null, 0.11), false);
  assert.equal(shouldStartRollAnimation(undefined, undefined), false);
});

test('první hod po načtení stránky se animuje', () => {
  assert.equal(shouldStartRollAnimation({ value: 6, id: 0.42 }, null), true);
});

test('šestka spustí oslavnou animaci, jiná hodnota ne', () => {
  assert.equal(shouldTriggerSixAnimation(6, 1, 1), true);
  assert.equal(shouldTriggerSixAnimation(3, 1, 1), false);
});

// Jádro bugu: po šestce se smí házet hned znovu. Odložená práce z předchozího
// hodu (záložní časovač, posluchač transitionend) pak vybouchne uprostřed hodu
// dalšího a pustí jiskry nad kostkou, která se zrovna točí na něco jiného.
test('zastaralý hod už oslavnou animaci nespustí, ani když padla šestka', () => {
  assert.equal(shouldTriggerSixAnimation(6, 1, 2), false);
});

test('zastaralý hod nesmí uklidit vizuál aktuálního hodu', () => {
  assert.equal(shouldClearRollVisuals(1, 1), true);
  assert.equal(shouldClearRollVisuals(1, 2), false);
});

test('celková délka animace šestky je součtem svých fází', () => {
  assert.equal(SPIN_MS, 400);
  assert.equal(LAND_MS, 600);
  assert.equal(SIX_ANIM_MS, 700);
  assert.equal(SIX_TOTAL_MS, SPIN_MS + LAND_MS + SIX_ANIM_MS);
  assert.equal(SIX_TOTAL_MS, 1700);
});
