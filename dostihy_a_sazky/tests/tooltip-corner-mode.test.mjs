import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { cornerArt } from '../public/js/ui/cornerArt.mjs';

/**
 * Regrese: v režimu Letiště ukazoval tooltip nad polem 20 „Parkoviště —
 * Bezpečné pole bez postihu i odměny", protože se na `field20Mode` vůbec
 * nedíval (u pole 30 a Rulety to řešil). Tooltip teď bere název rohu ze
 * sdíleného cornerArt, stejně jako plán, a popis Letiště má vlastní větev.
 */
const tooltip = readFileSync(fileURLToPath(new URL('../public/js/ui/tooltip.js', import.meta.url)), 'utf8');

test('pole 20 má název podle režimu', () => {
  assert.equal(cornerArt(20, { field20Mode: 'airport' }).name, 'Letiště');
  assert.equal(cornerArt(20, { field20Mode: 'parking' }).name, 'Parkoviště');
  assert.equal(cornerArt(20, {}).name, 'Parkoviště');
});

test('tooltip bere název rohu z cornerArt podle nastavení hry', () => {
  assert.match(tooltip, /cornerArt\(space\.id, gameState\.config\)/);
});

test('tooltip má pro Letiště vlastní popis s poplatkem', () => {
  const parking = tooltip.slice(tooltip.indexOf("space.type === 'free_parking'"));
  const branch = parking.slice(0, parking.indexOf("space.type === 'skip_turn'"));
  assert.match(branch, /field20Mode/, 'větev pole 20 se musí dívat na režim');
  assert.match(branch, /Letiště/);
  assert.match(branch, /airportFee/, 'popis Letiště má uvést poplatek');
});
