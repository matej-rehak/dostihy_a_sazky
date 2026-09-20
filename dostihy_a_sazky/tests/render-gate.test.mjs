import test from 'node:test';
import assert from 'node:assert/strict';

import {
  logChanged,
  ownershipsChanged,
  tokensChanged,
} from '../public/js/ui/renderGate.mjs';

/**
 * Klient dostává `game:state` až 20×/s (server má debounce 50 ms). Panel logu,
 * závoje vlastnictví i tečky žetonů se přitom přestavovaly pokaždé, i když se
 * v nich nic nezměnilo. Tyhle funkce rozhodují, kdy se přestavba vyplatí.
 */

test('shodný log se nepřekresluje', () => {
  assert.equal(logChanged(['a', 'b'], ['a', 'b']), false);
});

test('nový záznam v logu překreslení vyvolá', () => {
  assert.equal(logChanged(['a', 'b'], ['c', 'a', 'b']), true);
});

test('změna textu při stejné délce se pozná', () => {
  assert.equal(logChanged(['a', 'b'], ['a', 'x']), true);
});

test('prázdný a chybějící log se chovají stejně', () => {
  assert.equal(logChanged(undefined, []), false);
  assert.equal(logChanged([], undefined), false);
  assert.equal(logChanged(undefined, ['a']), true);
});

test('shodné vlastnictví se nepřekresluje', () => {
  assert.equal(ownershipsChanged({ 1: 'A', 3: 'B' }, { 1: 'A', 3: 'B' }), false);
});

test('nový majitel se pozná', () => {
  assert.equal(ownershipsChanged({ 1: 'A' }, { 1: 'B' }), true);
});

test('přibylé i ubylé políčko se pozná', () => {
  assert.equal(ownershipsChanged({ 1: 'A' }, { 1: 'A', 3: 'B' }), true);
  assert.equal(ownershipsChanged({ 1: 'A', 3: 'B' }, { 1: 'A' }), true);
});

test('pořadí klíčů nehraje roli', () => {
  assert.equal(ownershipsChanged({ 1: 'A', 3: 'B' }, { 3: 'B', 1: 'A' }), false);
});

test('shodné žetony se nepřekreslují', () => {
  const a = { 1: { small: 2, big: false }, 5: { small: 0, big: true } };
  const b = { 1: { small: 2, big: false }, 5: { small: 0, big: true } };
  assert.equal(tokensChanged(a, b), false);
});

test('přidaný malý žeton se pozná', () => {
  assert.equal(
    tokensChanged({ 1: { small: 1, big: false } }, { 1: { small: 2, big: false } }),
    true
  );
});

test('povýšení na hlavní dostih se pozná', () => {
  assert.equal(
    tokensChanged({ 1: { small: 4, big: false } }, { 1: { small: 4, big: true } }),
    true
  );
});

test('chybějící mapy se berou jako prázdné', () => {
  assert.equal(tokensChanged(undefined, {}), false);
  assert.equal(ownershipsChanged(undefined, {}), false);
  assert.equal(tokensChanged(undefined, { 1: { small: 1, big: false } }), true);
});
