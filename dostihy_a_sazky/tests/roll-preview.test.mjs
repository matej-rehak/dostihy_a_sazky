import test from 'node:test';
import assert from 'node:assert/strict';
import { previewSpaceId, previewText } from '../public/js/ui/rollPreview.mjs';

const board = { 8: { name: 'Pasek', type: 'horse' }, 7: { name: 'Náhoda', type: 'nahoda' }, 30: { name: 'Podezření z dopingu', type: 'skip_turn' } };
const gs = { config: {}, ownerships: {}, players: [{ id: 'A', name: 'Matěj' }, { id: 'B', name: 'Petr' }] };

test('zvýrazní se jen pole z náhledu opakovaného hodu', () => {
  assert.equal(previewSpaceId({ type: 'reroll_offer', data: { preview: { kind: 'move', spaceId: 8 } } }), 8);
  assert.equal(previewSpaceId({ type: 'reroll_offer', data: { preview: { kind: 'again', steps: 6 } } }), null);
  assert.equal(previewSpaceId({ type: 'buy_offer', data: { preview: { spaceId: 8 } } }), null);
  assert.equal(previewSpaceId(null), null);
});

test('text řekne, komu cílové pole patří', () => {
  const p = { kind: 'move', spaceId: 8, steps: 3 };
  assert.equal(previewText(p, gs, board, 'A'), 'Dojdeš na Pasek — volné.');
  assert.equal(previewText(p, { ...gs, ownerships: { 8: 'B' } }, board, 'A'), 'Dojdeš na Pasek — patří hráči Petr.');
  assert.equal(previewText(p, { ...gs, ownerships: { 8: 'A' } }, board, 'A'), 'Dojdeš na Pasek — tvoje pole.');
  assert.equal(previewText({ kind: 'move', spaceId: 7, steps: 3 }, gs, board, 'A'), 'Dojdeš na Náhoda.');
});

test('pole 30 se jmenuje podle nastavení hostitele', () => {
  const p = { kind: 'move', spaceId: 30, steps: 4 };
  assert.equal(previewText(p, { ...gs, config: { field30Mode: 'roulette' } }, board, 'A'), 'Dojdeš na Ruleta.');
});

test('šestky mají vlastní text', () => {
  assert.match(previewText({ kind: 'again', steps: 6 }, gs, board, 'A'), /znovu/);
  assert.match(previewText({ kind: 'jail', spaceId: 10 }, gs, board, 'A'), /Distanc/);
  assert.equal(previewText(null, gs, board, 'A'), null);
});
