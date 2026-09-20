import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SETTING_KEYS,
  DEFAULTS,
  mergeSettings,
  parseSettings,
  serializeSettings,
} from '../public/js/settingsGate.mjs';

/**
 * Přepínače efektů z nastavení. Ukládají se do localStorage jako jeden JSON,
 * který může být z libovolné starší verze hry nebo rozbitý — proto se vždy
 * slučuje s výchozími hodnotami a nikdy se nedůvěřuje tomu, co přišlo.
 */

test('všechny efekty jsou ve výchozím stavu zapnuté', () => {
  for (const key of SETTING_KEYS) {
    assert.equal(DEFAULTS[key], true, `${key} má být výchozí true`);
  }
});

test('sedm přepínačů, žádný navíc', () => {
  assert.equal(SETTING_KEYS.length, 7);
  assert.deepEqual(Object.keys(DEFAULTS).sort(), [...SETTING_KEYS].sort());
});

test('chybějící klíč spadne na výchozí hodnotu', () => {
  const merged = mergeSettings({ particles: false });
  assert.equal(merged.particles, false);
  assert.equal(merged.cardFlip, true);
});

// Klasická past: `stored[key] || DEFAULTS[key]` by vypnutý přepínač zase zapnul.
test('vypnutý přepínač přežije sloučení', () => {
  const merged = mergeSettings({ toasts: false, sixSparks: false });
  assert.equal(merged.toasts, false);
  assert.equal(merged.sixSparks, false);
});

test('neznámé klíče se zahodí', () => {
  const merged = mergeSettings({ particles: false, smthElse: true });
  assert.equal('smthElse' in merged, false);
});

test('jiná než booleovská hodnota se ignoruje', () => {
  const merged = mergeSettings({ particles: 'ne', cardFlip: 0, toasts: null });
  assert.equal(merged.particles, true);
  assert.equal(merged.cardFlip, true);
  assert.equal(merged.toasts, true);
});

test('chybějící nebo nesmyslný vstup dá čisté výchozí nastavení', () => {
  assert.deepEqual(mergeSettings(undefined), { ...DEFAULTS });
  assert.deepEqual(mergeSettings(null), { ...DEFAULTS });
  assert.deepEqual(mergeSettings('nesmysl'), { ...DEFAULTS });
  assert.deepEqual(mergeSettings([]), { ...DEFAULTS });
});

test('rozbitý JSON z localStorage shodí na výchozí, ne na výjimku', () => {
  assert.deepEqual(parseSettings('{tohle není json'), { ...DEFAULTS });
  assert.deepEqual(parseSettings(null), { ...DEFAULTS });
  assert.deepEqual(parseSettings(''), { ...DEFAULTS });
});

test('uložení a načtení dá stejné nastavení', () => {
  const settings = mergeSettings({ particles: false, starterDraw: false });
  assert.deepEqual(parseSettings(serializeSettings(settings)), settings);
});

test('výchozí objekt nejde omylem přepsat', () => {
  const merged = mergeSettings({ particles: false });
  assert.equal(DEFAULTS.particles, true, 'DEFAULTS musí zůstat nedotčené');
  merged.cardFlip = false;
  assert.equal(DEFAULTS.cardFlip, true);
});
