import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { passesStart } from '../public/js/animations/pawnAnimationGate.mjs';
import { SETTING_KEYS } from '../public/js/settingsGate.mjs';

const read = rel => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const css = read('../public/style.css');

test('průjezd STARTem se pozná jen při kroku dopředu na pole 0', () => {
  assert.equal(passesStart(0, 1), true);
  assert.equal(passesStart(0, undefined), true);
  assert.equal(passesStart(0, -1), false, 'pozpátku se bonus nevyplácí');
  assert.equal(passesStart(1, 1), false);
  for (const file of ['../public/js/animations/pawns.js', '../public/js/ui/board3d.js']) {
    assert.match(read(file), /passesStart\(/, `${file} neanimuje průjezd STARTem`);
  }
});

/**
 * Regrese: záře pole hráče na tahu byla stín samotného políčka, takže ji
 * závoj vlastníka (.own-overlay, z-index 1) na koupeném koni zakryl.
 */
test('záře pole na tahu leží nad závojem vlastníka', () => {
  const at = css.indexOf('.space.current-turn::after {');
  assert.notEqual(at, -1, 'záře musí být ve vlastní vrstvě');
  const rule = css.slice(at, css.indexOf('}', at));
  assert.match(rule, /z-index:\s*2/);
  assert.match(rule, /pointer-events:\s*none/);
  assert.equal(/\.space\.current-turn \{/.test(css), false, 'stín na políčku samotném by zase zmizel pod závojem');
});

test('Ruletu nejde v nastavení vypnout ani přeskočit', () => {
  assert.equal(SETTING_KEYS.includes('rouletteSpin'), false);
  assert.doesNotMatch(read('../public/index.html'), /rouletteSpin/);
  assert.doesNotMatch(read('../public/js/animations/roulette.js'), /isEffectEnabled/);
});

test('hod v Distancu má stejné tlačítko jako běžný hod', () => {
  const src = read('../public/js/ui/actions.js');
  const jail = src.slice(src.indexOf('function renderJailChoice'), src.indexOf('function renderTokenManage'));
  assert.match(jail, /iconBtn\('kostka', 'Hodit kostkou', 'btn-gold btn-lg'/);
});

test('karta Finance a Náhoda má jednu plnou barvu balíčku', () => {
  for (const sel of ['.card-back {', '.card-front {']) {
    const at = css.indexOf(sel);
    const rule = css.slice(at, css.indexOf('}', at));
    assert.match(rule, /background:\s*var\(--deck/, `${sel} nemá barvu balíčku`);
    assert.doesNotMatch(rule, /gradient/, `${sel} nemá být přechod`);
  }
});
