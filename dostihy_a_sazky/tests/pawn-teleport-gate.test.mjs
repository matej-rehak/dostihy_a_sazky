import test from 'node:test';
import assert from 'node:assert/strict';

import {
  hasPendingPawnAnimation,
  isPawnTeleportMove,
} from '../public/js/animations/pawnAnimationGate.mjs';

test('double-six jail movement is handled as teleport instead of step animation', () => {
  const players = [
    { id: 'p1', position: 10, bankrupt: false },
  ];
  const visualPos = { p1: 4 };
  const move = {
    type: 'teleport',
    reason: 'double_six_jail',
    playerId: 'p1',
    from: 4,
    to: 10,
  };

  assert.equal(isPawnTeleportMove(players[0], visualPos, move), true);
  assert.equal(hasPendingPawnAnimation(players, visualPos, move), false);
});
