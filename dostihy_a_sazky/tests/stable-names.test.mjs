import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

import { stableName } from '../public/js/ui/stableNames.mjs';

const require = createRequire(import.meta.url);
const BOARD = require('../src/data/boardData');

/**
 * Regrese: okno „Stáj zkompletována!" skládalo název z interního `group`
 * („Zelena stáj", „Sv modra stáj") — bez diakritiky a se zkratkami.
 */
test('každá stáj z plánu má český název', () => {
  const groups = new Set(BOARD.filter(s => s.type === 'horse').map(s => s.group));
  for (const g of groups) {
    const name = stableName(g);
    assert.notEqual(name, 'Stáj', `stáj ${g} nemá název`);
    assert.match(name, / stáj$/);
  }
  assert.equal(stableName('sv_modra'), 'Světle modrá stáj');
  assert.equal(stableName('neexistuje'), 'Stáj');
});

test('okno dokončené stáje bere název ze stableName', () => {
  const src = readFileSync(fileURLToPath(new URL('../public/js/ui/actions.js', import.meta.url)), 'utf8');
  const fn = src.slice(src.indexOf('export function showStableOverlay'));
  assert.match(fn.slice(0, 1500), /stableName\(group\)/);
  assert.doesNotMatch(fn.slice(0, 1500), /friendlyGroup/);
});
