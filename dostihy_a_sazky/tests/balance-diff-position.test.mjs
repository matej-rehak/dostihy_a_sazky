import test from 'node:test';
import assert from 'node:assert/strict';
import { balanceDiffPosition, DIFF_RISE_PX } from '../public/js/ui/balanceDiffView.mjs';

// Částka se dřív kreslila uvnitř posuvného seznamu hráčů a u prvního hráče
// vyletěla nad jeho horní okraj → oříznutá. Teď je position: fixed nad stránkou
// a tahle funkce ji drží celou na obrazovce.

const vw = 1200;

test('pravý okraj částky lícuje se zůstatkem, začíná 15 px nad ním', () => {
  const pos = balanceDiffPosition({ top: 300, right: 1000 }, 80, vw);
  assert.deepEqual(pos, { left: 920, top: 285 });
});

test('u horního okraje obrazovky se posune dolů, aby celé vystoupání bylo vidět', () => {
  const pos = balanceDiffPosition({ top: 10, right: 1000 }, 80, vw);
  assert.ok(pos.top - DIFF_RISE_PX >= 0, `top ${pos.top} by vyletěl mimo obrazovku`);
});

test('na úzké obrazovce nepřeteče doprava ani doleva', () => {
  const right = balanceDiffPosition({ top: 300, right: 400 }, 90, 390);
  assert.ok(right.left + 90 <= 390);
  const left = balanceDiffPosition({ top: 300, right: 40 }, 90, 390);
  assert.ok(left.left >= 0);
});
