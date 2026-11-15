'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { listImages } = require('../src/imageManifest');

/**
 * Regrese: obrázky (karta Finance / Náhoda, Ruleta, portréty koní) se
 * stahovaly až ve chvíli, kdy se měly ukázat — přes pomalé připojení je
 * animace nestihla a místo obrázku bylo prázdno. Klient si je proto stáhne
 * dopředu podle seznamu z /api/images.
 */

test('seznam obsahuje obrázky i z podsložek jako URL cesty', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'img-manifest-'));
  fs.mkdirSync(path.join(dir, 'horses'));
  fs.writeFileSync(path.join(dir, 'finance.png'), '');
  fs.writeFileSync(path.join(dir, 'horses', '1.webp'), '');
  fs.writeFileSync(path.join(dir, 'poznamky.txt'), '');
  fs.writeFileSync(path.join(dir, 'LOGO.PNG'), '');

  assert.deepEqual(listImages(dir, 'img'), ['img/LOGO.PNG', 'img/finance.png', 'img/horses/1.webp']);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('neexistující složka vrátí prázdný seznam, ne výjimku', () => {
  assert.deepEqual(listImages(path.join(os.tmpdir(), 'neexistuje-' + Date.now()), 'img'), []);
});

test('skutečná složka public/img obsahuje obrázky karet a portréty', () => {
  const list = listImages(path.join(__dirname, '..', 'public', 'img'), 'img');
  assert.ok(list.includes('img/finance.png'));
  assert.ok(list.includes('img/nahoda.png'));
  assert.ok(list.some(src => src.startsWith('img/horses/')));
});
