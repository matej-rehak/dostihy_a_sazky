import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Otočka karty se „odehraje" v polovině dráhy, kde backface-visibility prohodí
 * rub za líc. Předsazená křivka (--ease-out, cubic-bezier(0.23, 1, 0.32, 1))
 * tenhle bod přejede v prvních ~12 % času, takže otočka zmizí v pár desítkách
 * milisekund a zbytek animace vypadá staticky. Rotace potřebuje symetrickou
 * křivku a dost času — a nesmí startovat dřív, než se overlay prolne.
 */

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

const flipRule = ruleBody('.card-3d');

test('otočka karty nepoužívá předsazenou ease-out křivku', () => {
  const transition = flipRule.match(/transition:\s*transform[^;]*/)?.[0];
  assert.ok(transition, '.card-3d musí mít transition na transform');
  assert.equal(
    /var\(--ease-out\)/.test(transition),
    false,
    'předsazená křivka přejede bod převrácení v prvních ~12 % času — otočka pak není vidět'
  );
});

test('otočka karty používá symetrickou křivku', () => {
  const transition = flipRule.match(/transition:\s*transform[^;]*/)?.[0];
  assert.ok(
    /var\(--ease-in-out\)/.test(transition),
    'rotace je morphing, ne příchod — patří jí ease-in-out'
  );
});

test('otočka má dost času, aby šla přečíst', () => {
  const ms = Number(flipRule.match(/transition:\s*transform\s+(\d+)ms/)?.[1]);
  assert.ok(Number.isFinite(ms), 'délka otočky musí být v ms');
  assert.ok(ms >= 600, `otočka trvá ${ms}ms, což je na 180° málo`);
});

test('otočka začne až po prolnutí overlaye', () => {
  const entry = ruleBody('.card-3d-overlay.is-open .card-3d');
  const delay = Number(entry.match(/transition-delay:\s*(\d+)ms/)?.[1]);
  assert.ok(Number.isFinite(delay), 'vstupní otočka musí mít transition-delay');

  const overlay = ruleBody('.card-3d-overlay');
  const fade = Number(overlay.match(/transition:\s*opacity\s+(\d+)ms/)?.[1]);
  assert.ok(Number.isFinite(fade), 'overlay musí mít prolnutí v ms');

  assert.ok(
    delay >= fade * 0.75,
    `otočka startuje po ${delay}ms, ale overlay se prolíná ${fade}ms — začátek otočky by byl pod průhledným pozadím`
  );
});
