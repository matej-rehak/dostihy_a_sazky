import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getPawnStepDelay,
  hasPendingPawnAnimation,
} from '../public/js/animations/pawnAnimationGate.mjs';

test('detects active pawn movement when visual position differs from server position', () => {
  const players = [
    { id: 'p1', position: 12, bankrupt: false },
    { id: 'p2', position: 4, bankrupt: false },
  ];
  const visualPos = { p1: 8, p2: 4 };

  assert.equal(hasPendingPawnAnimation(players, visualPos), true);
});

test('ignores bankrupt players when deciding whether action controls should wait', () => {
  const players = [
    { id: 'p1', position: 12, bankrupt: true },
  ];
  const visualPos = { p1: 8 };

  assert.equal(hasPendingPawnAnimation(players, visualPos), false);
});

test('keeps short pawn movement at the readable base speed', () => {
  assert.equal(getPawnStepDelay(3), 180);
});

test('speeds up long pawn movement while keeping each step visible', () => {
  assert.equal(getPawnStepDelay(12), 80);
  assert.equal(getPawnStepDelay(30), 60);
});
