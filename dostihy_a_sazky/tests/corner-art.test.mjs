import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { cornerArt, CORNER_ART_FILES } from '../public/js/ui/cornerArt.mjs';

test('pole 20 a 30 se řídí režimem z lobby', () => {
  assert.equal(cornerArt(20, {}).name, 'Parkoviště');
  assert.equal(cornerArt(20, { field20Mode: 'airport' }).name, 'Letiště');
  assert.equal(cornerArt(30, {}).name, 'Podezření z dopingu');
  assert.equal(cornerArt(30, { field30Mode: 'roulette' }).name, 'Ruleta');
  assert.equal(cornerArt(20, { field20Mode: 'airport' }).icon, '✈️');
  assert.equal(cornerArt(30, { field30Mode: 'roulette' }).icon, '🎰');
});

test('bez konfigurace platí výchozí režimy', () => {
  assert.equal(cornerArt(20).name, 'Parkoviště');
  assert.equal(cornerArt(30, undefined).name, 'Podezření z dopingu');
});

test('jen rohy mají rohovou ikonku', () => {
  for (const id of [1, 5, 11, 29, 39]) assert.equal(cornerArt(id), null);
  for (const id of [0, 10, 20, 30]) assert.ok(cornerArt(id));
});

// Obrázek, který modul hlásí jako hotový, musí na disku opravdu být —
// jinak by se ve 2D ukázal rozbitý obrázek místo emoji.
test('každá ohlášená ikonka existuje v public/', () => {
  const configs = [{}, { field20Mode: 'airport', field30Mode: 'roulette' }];
  for (const cfg of configs) {
    for (const id of [0, 10, 20, 30]) {
      const { img } = cornerArt(id, cfg);
      if (!img) continue;
      const path = fileURLToPath(new URL(`../public/${img}`, import.meta.url));
      assert.ok(existsSync(path), `chybí ${img}`);
    }
  }
});

test('seznam souborů pokrývá všechny varianty rohů', () => {
  assert.equal(CORNER_ART_FILES.length, 6);
  assert.ok(CORNER_ART_FILES.includes('img/letiste.png'));
  assert.ok(CORNER_ART_FILES.includes('img/ruleta.png'));
});
