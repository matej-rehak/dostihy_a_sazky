import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Každý zvuk, který kód pouští, musí být zaregistrovaný v audio.js a jeho
// soubor musí existovat — jinak se tiše nepřehraje (tak chyběly join, leave,
// trade_offer i money_out).

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const audioSrc = fs.readFileSync(path.join(root, 'public/js/audio.js'), 'utf8');
const registered = new Map([...audioSrc.matchAll(/this\.load\('(\w+)',\s*'([^']+)'\)/g)].map(m => [m[1], m[2]]));
const SYNTH = new Set(['step']); // generuje Web Audio, soubor nepotřebuje

function jsFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return jsFiles(p);
    return /\.(m?js)$/.test(e.name) ? [p] : [];
  });
}

test('každý zaregistrovaný zvuk má soubor', () => {
  for (const [name, url] of registered) {
    assert.ok(fs.existsSync(path.join(root, 'public', url)), `chybí soubor pro „${name}": ${url}`);
  }
});

test('každý přehrávaný zvuk je zaregistrovaný', () => {
  const played = new Set();
  for (const f of jsFiles(path.join(root, 'public/js'))) {
    for (const m of fs.readFileSync(f, 'utf8').matchAll(/audioManager\.play\('(\w+)'/g)) played.add(m[1]);
  }
  assert.ok(played.size > 10);
  for (const name of played) {
    if (SYNTH.has(name)) continue;
    assert.ok(registered.has(name), `audioManager.play('${name}') — zvuk není v audio.js zaregistrovaný`);
  }
});
