import test from 'node:test';
import assert from 'node:assert/strict';

import { createRenderLoop } from '../public/js/ui/renderLoop.mjs';

// Falešný requestAnimationFrame: snímky se spouští ručně přes flush().
function fakeRaf() {
  let next = 1;
  const pending = new Map();
  return {
    raf: cb => { const id = next++; pending.set(id, cb); return id; },
    caf: id => { pending.delete(id); },
    flush() {
      const due = [...pending.values()];
      pending.clear();
      due.forEach(cb => cb(0));
    },
    get size() { return pending.size; },
  };
}

test('start kreslí snímek a plánuje další', () => {
  const r = fakeRaf();
  let frames = 0;
  const loop = createRenderLoop(() => frames++, r.raf, r.caf);
  loop.start();
  assert.equal(frames, 1);
  r.flush();
  r.flush();
  assert.equal(frames, 3);
  assert.equal(loop.running, true);
});

test('stop zastaví smyčku — ve 2D se 3D scéna už nevykresluje', () => {
  const r = fakeRaf();
  let frames = 0;
  const loop = createRenderLoop(() => frames++, r.raf, r.caf);
  loop.start();
  loop.stop();
  assert.equal(r.size, 0);
  r.flush();
  assert.equal(frames, 1);
  assert.equal(loop.running, false);
});

test('opakovaný start nespustí druhou souběžnou smyčku', () => {
  const r = fakeRaf();
  let frames = 0;
  const loop = createRenderLoop(() => frames++, r.raf, r.caf);
  loop.start();
  loop.start();
  assert.equal(frames, 1);
  assert.equal(r.size, 1);
  r.flush();
  assert.equal(frames, 2);
});

test('po stop se smyčka dá znovu rozběhnout', () => {
  const r = fakeRaf();
  let frames = 0;
  const loop = createRenderLoop(() => frames++, r.raf, r.caf);
  loop.start();
  loop.stop();
  loop.start();
  r.flush();
  assert.equal(frames, 3);
  assert.equal(loop.running, true);
});
