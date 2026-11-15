import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Regrese: když měli hráči hodně majetku, sekce hráčů v pravém panelu narostla
 * a sekci akcí zbylo málo místa. #action-content se má v takovém případě
 * posouvat, jenže jeho děti jsou flex položky a smí se zmenšovat — karta
 * nabídky koupě (.buy-card, overflow: hidden) se zmáčkla a oříznula tlačítka
 * „Koupit" / „Nechci koupit". Nešlo koupit ani odmítnout.
 * Obsah panelu akcí se proto nesmí zmenšovat; místo toho se panel posouvá.
 */

const css = readFileSync(
  fileURLToPath(new URL('../public/style.css', import.meta.url)),
  'utf8'
);

/** Tělo pravidla s daným selektorem na nejvyšší úrovni souboru (mimo @media). */
function topLevelRule(source, selector) {
  let depth = 0;
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (ch === '{') depth++;
    else if (ch === '}') depth--;
    else if (depth === 0 && source.startsWith(selector, i)) {
      const open = source.indexOf('{', i);
      if (source.slice(i, open).trim() !== selector) continue;
      const close = source.indexOf('}', open);
      return source.slice(open + 1, close);
    }
  }
  return null;
}

test('obsah panelu akcí se nesmí zmenšovat — jinak se oříznou tlačítka', () => {
  const body = topLevelRule(css, '#action-content > *');
  assert.ok(body, 'chybí pravidlo #action-content > * na nejvyšší úrovni style.css');
  assert.match(body, /flex-shrink:\s*0\s*;/);
});

test('panel akcí se při nedostatku místa posouvá', () => {
  const body = topLevelRule(css, '#action-content');
  assert.ok(body, 'chybí pravidlo #action-content');
  assert.match(body, /overflow-y:\s*auto\s*;/);
});

/** flex-shrink z deklarace `flex: grow shrink basis` nebo `flex-shrink`. */
function flexShrink(body) {
  const own = body.match(/flex-shrink:\s*([\d.]+)/);
  if (own) return Number(own[1]);
  const flex = body.match(/(?:^|[;\s])flex:\s*([\d.]+)\s+([\d.]+)/);
  return flex ? Number(flex[2]) : 1;
}

/**
 * Regrese: na nižší obrazovce (notebook) zabraly sekce hráčů (až 350 px)
 * a průběhu (160 px) skoro celý panel a nabídka koně se do zbytku nevešla —
 * tlačítka „Koupit" / „Nechci koupit" byla až pod okrajem.
 * Při nedostatku místa se proto mají smrštit hráči a průběh, ne panel akcí.
 */
test('při nedostatku místa ustoupí panelu akcí sekce hráčů a průběhu', () => {
  const action = topLevelRule(css, '#action-section');
  const players = topLevelRule(css, '#players-section');
  const log = topLevelRule(css, '#log-section');
  assert.ok(action && players && log, 'chybí pravidla sekcí pravého panelu');
  assert.ok(flexShrink(players) > flexShrink(action), 'hráči se musí smršťovat dřív než akce');
  assert.ok(flexShrink(log) > flexShrink(action), 'průběh se musí smršťovat dřív než akce');
  assert.doesNotMatch(log, /(?:^|[;\s])height:\s*\d/, 'pevná výška průběhu by nešla smrštit');
});
