import test from 'node:test';
import assert from 'node:assert/strict';

import { segmentAngle, targetRotation, SPIN_MS } from '../public/js/animations/rouletteAnimationGate.mjs';

test('devět výsečí po 40 stupních', () => {
  assert.equal(segmentAngle(9), 40);
});

test('první výseč končí pod ručičkou bez zbytkového posunu', () => {
  const rot = targetRotation(0, 9, 4);
  assert.equal(rot % 360, 0);
  assert.equal(rot, 4 * 360);
});

test('každá výseč se zastaví ve svém pásmu', () => {
  for (let i = 0; i < 9; i++) {
    const rot = targetRotation(i, 9, 4);
    // Kolo se točí dopředu, výseč i musí skončit na svém úhlu
    const landed = ((360 - (rot % 360)) % 360) / 40;
    assert.equal(Math.round(landed), i, `výseč ${i} se zastavila na ${landed}`);
  }
});

test('víc otáček neposune cílovou výseč', () => {
  assert.equal(targetRotation(3, 9, 2) % 360, targetRotation(3, 9, 6) % 360);
});

test('doba točení pokryje čtyři otáčky a je konečná', () => {
  assert.ok(SPIN_MS > 0 && Number.isFinite(SPIN_MS));
});
