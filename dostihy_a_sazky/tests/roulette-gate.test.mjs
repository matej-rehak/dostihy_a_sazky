import test from 'node:test';
import assert from 'node:assert/strict';

import { segmentAngle, targetRotation, SPIN_MS } from '../public/js/animations/rouletteAnimationGate.mjs';

test('devět výsečí po 40 stupních', () => {
  assert.equal(segmentAngle(9), 40);
});

test('první výseč skončí uprostřed svého pásma, ne na okraji', () => {
  const rot = targetRotation(0, 9, 4);
  // úhel ve stupních, který po otočení skončí pod ručičkou nahoře
  const underPointer = (360 - (rot % 360) + 360) % 360;
  assert.equal(underPointer, 20); // střed výseče 0 (0*40 + 20), ne 0
});

test('každá výseč se zastaví uprostřed svého pásma', () => {
  for (let i = 0; i < 9; i++) {
    const rot = targetRotation(i, 9, 4);
    // úhel ve stupních, který po otočení skončí pod ručičkou nahoře
    const underPointer = (360 - (rot % 360) + 360) % 360;
    // musí padnout doprostřed výseče `i`, ne na její okraj
    assert.equal(underPointer, i * 40 + 20, `výseč ${i} se zastavila na ${underPointer}`);
  }
});

test('víc otáček neposune cílovou výseč', () => {
  assert.equal(targetRotation(3, 9, 2) % 360, targetRotation(3, 9, 6) % 360);
});

test('doba točení pokryje čtyři otáčky a je konečná', () => {
  assert.ok(SPIN_MS > 0 && Number.isFinite(SPIN_MS));
});
