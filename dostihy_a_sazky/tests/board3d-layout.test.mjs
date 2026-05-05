import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getBoard3DSpacePosition,
  getPawn3DOffset,
  getBoard3DSide,
} from '../public/js/ui/board3dLayout.mjs';

test('maps corner spaces to square board corners', () => {
  assert.deepEqual(getBoard3DSpacePosition(0), { x: 5, z: 5, rotationY: 0 });
  assert.deepEqual(getBoard3DSpacePosition(10), { x: -5, z: 5, rotationY: Math.PI / 2 });
  assert.deepEqual(getBoard3DSpacePosition(20), { x: -5, z: -5, rotationY: Math.PI });
  assert.deepEqual(getBoard3DSpacePosition(30), { x: 5, z: -5, rotationY: -Math.PI / 2 });
});

test('maps edge spaces clockwise around the board', () => {
  assert.deepEqual(getBoard3DSide(1), 'bottom');
  assert.deepEqual(getBoard3DSide(11), 'left');
  assert.deepEqual(getBoard3DSide(21), 'top');
  assert.deepEqual(getBoard3DSide(31), 'right');
  assert.equal(getBoard3DSpacePosition(5).z, 5);
  assert.equal(getBoard3DSpacePosition(15).x, -5);
  assert.equal(getBoard3DSpacePosition(25).z, -5);
  assert.equal(getBoard3DSpacePosition(35).x, 5);
});

test('creates stable pawn offsets for multiple players on one space', () => {
  assert.deepEqual(getPawn3DOffset(0, 1), { x: 0, z: 0 });
  assert.deepEqual(getPawn3DOffset(0, 4), { x: -0.18, z: -0.18 });
  assert.deepEqual(getPawn3DOffset(3, 4), { x: 0.18, z: 0.18 });
});
