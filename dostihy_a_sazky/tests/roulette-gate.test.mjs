import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { segmentAngle, targetRotation, spinPlan, SPIN_MS } from '../public/js/animations/rouletteAnimationGate.mjs';

const css = readFileSync(
  fileURLToPath(new URL('../public/style.css', import.meta.url)),
  'utf8'
);

function blockBodyAt(source, startIdx) {
  const open = source.indexOf('{', startIdx);
  assert.notEqual(open, -1, 'blok nemá otevírací závorku');
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') {
      depth--;
      if (depth === 0) return source.slice(open + 1, i);
    }
  }
  throw new Error('neuzavřený blok');
}

function ruleBody(selector) {
  const idx = css.indexOf(`\n${selector} {`);
  assert.notEqual(idx, -1, `selektor ${selector} v style.css chybí`);
  return blockBodyAt(css, idx);
}

test('devět výsečí po 40 stupních', () => {
  assert.equal(segmentAngle(9), 40);
});

test('první výseč skončí uprostřed svého pásma, ne na okraji', () => {
  const rot = targetRotation(0, 9, 4);
  // úhel ve stupních, který po otočení skončí pod ručičkou nahoře
  const underPointer = (360 - (rot % 360) + 360) % 360;
  assert.equal(underPointer, 20); // střed výseče 0 (0*40 + 20), ne 0
});

test('každá výseč se zastaví uprostřed svého pásma', () => {
  for (let i = 0; i < 9; i++) {
    const rot = targetRotation(i, 9, 4);
    // úhel ve stupních, který po otočení skončí pod ručičkou nahoře
    const underPointer = (360 - (rot % 360) + 360) % 360;
    // musí padnout doprostřed výseče `i`, ne na její okraj
    assert.equal(underPointer, i * 40 + 20, `výseč ${i} se zastavila na ${underPointer}`);
  }
});

test('víc otáček neposune cílovou výseč', () => {
  assert.equal(targetRotation(3, 9, 2) % 360, targetRotation(3, 9, 6) % 360);
});

/**
 * SPIN_MS je jen kopie doby přechodu z CSS — server i klient podle ní počítají,
 * kdy je kolo dotočené. Kdyby se hodnoty rozešly, odhalení výsledku by přišlo
 * dřív nebo později než dojezd kola, a nikdo by si toho nevšiml. Proto se
 * porovnává se skutečným `transition` na `.roulette-wheel`, ne jen se sebou
 * samotným (stejný vzor jako tests/card-flip-css.test.mjs).
 */
test('SPIN_MS sedí s dobou přechodu na .roulette-wheel v style.css', () => {
  const wheel = ruleBody('.roulette-wheel');
  const ms = Number(wheel.match(/transition:\s*transform\s+(\d+)ms/)?.[1]);

  assert.ok(Number.isFinite(ms), '.roulette-wheel musí mít transition na transform v ms');
  assert.equal(
    ms, SPIN_MS,
    `CSS točí kolo ${ms}ms, ale SPIN_MS je ${SPIN_MS}ms — odhalení výsledku by nesedělo na dojezd`
  );
});

test('kolo, které se právě točí, se druhým zavoláním nerozbije', () => {
  const plan = spinPlan({
    spinId: 7, animatedSpinId: 7, spinningSpinId: 7, animationEnabled: true,
  });
  assert.equal(plan, 'ignore', 'nesouvisející broadcast během točení nesmí kolo useknout na výsledek');
});

test('nové zatočení se roztočí', () => {
  assert.equal(
    spinPlan({ spinId: 8, animatedSpinId: 7, spinningSpinId: null, animationEnabled: true }),
    'spin'
  );
  assert.equal(
    spinPlan({ spinId: 8, animatedSpinId: null, spinningSpinId: null, animationEnabled: true }),
    'spin'
  );
});

test('už odanimované zatočení se po reconnectu ukáže dojeté', () => {
  assert.equal(
    spinPlan({ spinId: 7, animatedSpinId: 7, spinningSpinId: null, animationEnabled: true }),
    'snap'
  );
});

test('vypnutá animace kolo nikdy neroztočí', () => {
  assert.equal(
    spinPlan({ spinId: 9, animatedSpinId: null, spinningSpinId: null, animationEnabled: false }),
    'snap'
  );
});
