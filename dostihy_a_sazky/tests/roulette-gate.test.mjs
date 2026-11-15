import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

import {
  segmentBounds, targetRotation, spinPlan, SPIN_MS, SPIN_TURNS, SPIN_EASING,
  segmentLabelRotation, segmentPath, polar, WHEEL, labelLayout, nameInnerRadius, arcWidth,
  segmentUnderPointer, nameReadsOutward, groupOdds, formatShare, GROUP_FACE,
  hideDelay, RESULT_HOLD_MS,
} from '../public/js/animations/rouletteAnimationGate.mjs';

const require = createRequire(import.meta.url);
const { OUTCOMES } = require('../src/Roulette.js');
const WEIGHTS = OUTCOMES.map(o => o.weight);

const css = readFileSync(
  fileURLToPath(new URL('../public/style.css', import.meta.url)),
  'utf8'
);

const close = (a, b) => Math.abs(a - b) < 1e-9;
// úhel ve stupních, který po otočení kola skončí pod ručičkou nahoře
const underPointer = rot => (((360 - (rot % 360)) % 360) + 360) % 360;

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

test('výseče pokryjí celé kolo a šířka odpovídá váze', () => {
  const bounds = segmentBounds(WEIGHTS);
  const total = WEIGHTS.reduce((s, w) => s + w, 0);
  bounds.forEach((seg, i) => {
    assert.ok(close(seg.size, (WEIGHTS[i] / total) * 360), `výseč ${i} má ${seg.size}°`);
    if (i > 0) assert.ok(close(seg.start, bounds[i - 1].start + bounds[i - 1].size), `mezera před výsečí ${i}`);
  });
  const last = bounds[bounds.length - 1];
  assert.ok(close(last.start + last.size, 360));
});

test('stejné váhy dávají stejně široké výseče', () => {
  segmentBounds([1, 1, 1, 1, 1, 1, 1, 1, 1]).forEach((seg, i) => {
    assert.ok(close(seg.size, 40));
    assert.ok(close(seg.start, i * 40));
  });
});

test('každá výseč se zastaví uprostřed svého pásma, ne na okraji', () => {
  segmentBounds(WEIGHTS).forEach((seg, i) => {
    const at = underPointer(targetRotation(i, WEIGHTS, 4));
    assert.ok(close(at, seg.start + seg.size / 2), `výseč ${i} se zastavila na ${at}°`);
  });
});

test('víc otáček neposune cílovou výseč', () => {
  assert.ok(close(targetRotation(3, WEIGHTS, 2) % 360, targetRotation(3, WEIGHTS, 6) % 360));
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

/**
 * Plynulost: kolo se v nejrychlejším místě nesmí otočit o víc než ~20° za
 * snímek (60 fps). Dřív to bylo ~42° — víc, než je šířka většiny výsečí,
 * a oko vidělo skoky místo točení.
 */
test('kolo se točí plynule — nejvýš ~20° za snímek', () => {
  const [x1, y1, x2, y2] = SPIN_EASING;
  const B = (t, a, b) => 3 * (1 - t) ** 2 * t * a + 3 * (1 - t) * t * t * b + t ** 3;
  const y = x => {
    let lo = 0, hi = 1;
    for (let i = 0; i < 50; i++) { const m = (lo + hi) / 2; if (B(m, x1, x2) < x) lo = m; else hi = m; }
    return B((lo + hi) / 2, y1, y2);
  };
  const total = SPIN_TURNS * 360 + 360;   // nejdelší možná cesta
  const N = 1000;
  let peak = 0;
  for (let i = 0; i < N; i++) peak = Math.max(peak, (y((i + 1) / N) - y(i / N)) * N);
  const degPerFrame = peak * total / (SPIN_MS / 1000) / 60;
  assert.ok(degPerFrame <= 20, `kolo skáče o ${degPerFrame.toFixed(1)}° za snímek`);

  const wheel = ruleBody('.roulette-wheel');
  assert.ok(wheel.includes(`cubic-bezier(${SPIN_EASING.join(', ')})`), 'CSS křivka musí sedět se SPIN_EASING');
});

/** Otočený čtverec kola nesmí rozšiřovat scénu — jinak se objeví posuvníky. */
test('kolo se ořízne bez posuvníků', () => {
  const wrap = ruleBody('.roulette-wheel-wrap');
  assert.match(wrap, /overflow:\s*clip/);
  assert.match(ruleBody('.roulette-scene'), /overflow-x:\s*hidden/);
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

// ─── Potvrzení bota nesmí useknout kolo ──────────────────────────────────────

test('bot potvrdí uprostřed točení → kolo se dotočí a výsledek chvíli zůstane', () => {
  // Kolo se divákovi otevřelo v t=0 (třeba až po doběhnutí figurky),
  // potvrzení bota dorazilo v t=1000.
  assert.equal(hideDelay({ revealAt: SPIN_MS, now: 1000 }), SPIN_MS - 1000 + RESULT_HOLD_MS);
});

test('bot potvrdí těsně po dojetí → výsledek zůstane aspoň RESULT_HOLD_MS', () => {
  assert.equal(hideDelay({ revealAt: SPIN_MS, now: SPIN_MS + 200 }), RESULT_HOLD_MS - 200);
});

test('výsledek už byl vidět dost dlouho → kolo zmizí hned', () => {
  assert.equal(hideDelay({ revealAt: SPIN_MS, now: SPIN_MS + RESULT_HOLD_MS + 1 }), 0);
});

test('neukázané kolo se nedrží', () => {
  assert.equal(hideDelay({ revealAt: null, now: 5000 }), 0);
});

test('kolo se otevírá hned se stavem, ne až po doběhnutí figurky', () => {
  const main = readFileSync(fileURLToPath(new URL('../public/js/main.js', import.meta.url)), 'utf8');
  const sync = main.indexOf('syncRouletteOverlay(gameState)');
  const pawns = main.indexOf('animatePawnsIfNeeded(gameState');
  assert.ok(sync !== -1, 'processState musí volat syncRouletteOverlay(gameState)');
  assert.ok(sync < pawns, 'kolo se nesmí otevírat až v callbacku animace figurek');
});

/**
 * Nejdůležitější vazba celého kola: hráč čte název z výseče, která stojí pod
 * ručičkou, ale VÝSLEDEK určil server přes `result.index`. Kdyby se otočení
 * kola a umístění popisku rozešly byť o jednu výseč, kolo by ukazovalo jiný
 * název, než jaký efekt se doopravdy aplikoval — a nic jiného by to nechytlo,
 * protože obě strany by samy o sobě byly „správně".
 */
test('popisek výseče skončí přesně pod ručičkou pro každý index', () => {
  WEIGHTS.forEach((_, i) => {
    const total = segmentLabelRotation(i, WEIGHTS) + targetRotation(i, WEIGHTS);
    const off = ((total % 360) + 360) % 360;
    assert.ok(close(off, 0) || close(off, 360), `výseč ${i}: popisek stojí ${off}° od ručičky, ne na ní`);
  });
});

test('barvy skupin jsou definované v :root', () => {
  for (const group of ['good', 'neutral', 'bad']) {
    assert.ok(css.includes(`--roulette-${group}:`), `chybí --roulette-${group}`);
    assert.equal(GROUP_FACE[group], `var(--roulette-${group})`);
  }
});

/**
 * Výseč se kreslí jako SVG cesta ze středu přes oblouk. Když by konec
 * oblouku neseděl se začátkem další výseče, mezi plochami by prosvítala
 * mezera — kontroluje se tedy, že koncový bod jedné je začátek druhé.
 */
test('SVG výseče na sebe navazují bez mezer', () => {
  const bounds = segmentBounds(WEIGHTS);
  const nums = d => d.match(/-?\d+(\.\d+)?/g).map(Number);
  bounds.forEach((seg, i) => {
    const d = segmentPath(seg.start, seg.size);
    assert.match(d, /^M100 100 L/);
    const n = nums(d);
    const end = { x: n[n.length - 2], y: n[n.length - 1] };
    const next = bounds[(i + 1) % bounds.length];
    const expected = polar(WHEEL.face, next.start);
    assert.ok(Math.abs(end.x - expected.x) < 0.01 && Math.abs(end.y - expected.y) < 0.01,
      `výseč ${i} končí jinde, než začíná ${(i + 1) % bounds.length}`);
  });
});

test('jediná výseč vykreslí celé kolo', () => {
  const d = segmentPath(0, 360);
  assert.equal((d.match(/A/g) || []).length, 2, 'plný kruh jsou dva půloblouky');
});

test('výseč pod ručičkou odpovídá cílové rotaci', () => {
  WEIGHTS.forEach((_, i) => {
    assert.equal(segmentUnderPointer(targetRotation(i, WEIGHTS), WEIGHTS), i);
  });
  assert.equal(segmentUnderPointer(0, WEIGHTS), 0);
});

/**
 * Kolo kreslí `short`, ne `name` — dlouhé názvy se do výseče nevejdou.
 * Bez téhle kontroly by nová výseč s dlouhým `short` tiše přetekla přes okraj.
 */
test('každá výseč má krátký popisek pro kolo', () => {
  for (const o of OUTCOMES) {
    assert.ok(o.short, `výseč ${o.id} nemá short`);
    assert.ok(
      o.short.length <= 9,
      `short „${o.short}" výseče ${o.id} má ${o.short.length} znaků, na kolo se vejde 9`
    );
  }
});

/**
 * Popisek leží podél poloměru: ikona u ráfku, název od ní ke středu.
 * Musí platit pro KAŽDOU výseč, i tu nejužší:
 *  • název nevleze pod náboj,
 *  • v nejvnitřnějším bodě názvu je oblouk výseče aspoň tak široký jako písmo
 *    (jinak by text přečníval do sousední výseče),
 *  • ikona se vejde do oblouku a nepřekryje ráfek.
 * Je to čistá geometrie ve viewBoxu — kolo se škáluje celé, takže platí na
 * každé velikosti obrazovky.
 */
test('popisky se vejdou do svých výsečí', () => {
  const bounds = segmentBounds(WEIGHTS);
  OUTCOMES.forEach((o, i) => {
    const size = bounds[i].size;
    const layout = labelLayout(size);
    const inner = nameInnerRadius(o.short, layout);

    assert.ok(inner >= WHEEL.hub + 2, `${o.id}: název dosahuje pod náboj (r=${inner.toFixed(1)})`);
    assert.ok(
      arcWidth(inner, size) >= layout.nameSize,
      `${o.id}: u středu má výseč jen ${arcWidth(inner, size).toFixed(1)}, písmo ${layout.nameSize}`
    );
    assert.ok(layout.nameR <= layout.iconR - layout.iconSize / 2,
      `${o.id}: název se překrývá s ikonou`);

    const iconInner = layout.iconR - layout.iconSize / 2;
    assert.ok(arcWidth(iconInner, size) >= layout.iconSize, `${o.id}: ikona se do výseče nevejde`);
    assert.ok(layout.iconR + layout.iconSize / 2 <= WHEEL.face, `${o.id}: ikona leze na ráfek`);
  });
});

test('legenda ukazuje šanci každé skupiny', () => {
  const odds = groupOdds(OUTCOMES);
  assert.deepEqual(odds.map(g => g.group), ['good', 'neutral', 'bad']);
  const sum = odds.reduce((s, g) => s + g.share, 0);
  assert.ok(close(sum, 1));
  for (const g of odds) {
    const expected = OUTCOMES.filter(o => o.group === g.group).reduce((s, o) => s + o.weight, 0)
      / WEIGHTS.reduce((s, w) => s + w, 0);
    assert.ok(close(g.share, expected), `skupina ${g.group}`);
  }
  assert.equal(formatShare(1 / 3), '⅓');
  assert.equal(formatShare(0.2), '20 %');
});

/** Náboj v CSS (v % obalu) musí sedět s WHEEL.hub, podle kterého se hlídá dosah názvů. */
test('velikost náboje v CSS sedí s geometrií kola', () => {
  const hub = ruleBody('.roulette-hub');
  const pct = Number(hub.match(/width:\s*([\d.]+)%/)?.[1]);
  assert.equal(pct, (WHEEL.hub * 2) / WHEEL.size * 100);
});

test('po dojetí není žádný název vzhůru nohama', () => {
  // vpravo od svislice se čte od středu ven, vlevo od ráfku dovnitř
  assert.equal(nameReadsOutward(90), true);
  assert.equal(nameReadsOutward(270), false);
  // výherní výseč stojí nahoře → čte se shora dolů, jako dosud
  WEIGHTS.forEach((_, i) => {
    assert.equal(nameReadsOutward(segmentLabelRotation(i, WEIGHTS), targetRotation(i, WEIGHTS)), false);
  });
  // rozhoduje koncová poloha kola, ne poloha v souřadnicích kola
  assert.equal(nameReadsOutward(90, 180), false);
});
