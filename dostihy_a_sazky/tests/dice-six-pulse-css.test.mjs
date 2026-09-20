import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Hodnota kostky je držená inline (`diceEl.style.transform = rotateX/rotateY`
 * v dice.js). CSS animace přebíjí inline styl, takže jakmile `diceSixPulse`
 * animuje `transform`, kostka po dobu pulzu ztratí rotaci a skočí na jedničku.
 * Zvětšení proto patří na obalový `.dice-scene`, ne na samotnou kostku.
 */

const css = readFileSync(
  fileURLToPath(new URL('../public/style.css', import.meta.url)),
  'utf8'
);

/** Vrátí tělo bloku, který začíná na `startIdx`, podle párování složených závorek. */
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
  const idx = css.indexOf(selector);
  assert.notEqual(idx, -1, `selektor ${selector} v style.css chybí`);
  return blockBodyAt(css, idx);
}

test('pulz šestky neanimuje transform na kostce', () => {
  const body = ruleBody('@keyframes diceSixPulse');
  assert.equal(
    /\btransform\s*:/.test(body),
    false,
    'diceSixPulse nesmí animovat transform — přebil by inline rotaci a kostka by skočila na jedničku'
  );
});

test('pulz šestky pořád dělá světelný efekt', () => {
  const body = ruleBody('@keyframes diceSixPulse');
  assert.ok(/\bfilter\s*:/.test(body), 'diceSixPulse má animovat filter');
});

test('třída na kostce nenastavuje transform', () => {
  const body = ruleBody('.dice-3d.dice-six-hit');
  assert.equal(
    /\btransform\s*:/.test(body),
    false,
    '.dice-3d.dice-six-hit nesmí sahat na transform'
  );
});

test('zvětšení se přesunulo na obalovou scénu', () => {
  const body = ruleBody('.dice-scene.dice-six-hit');
  assert.ok(/\banimation\s*:/.test(body), '.dice-scene.dice-six-hit má mít animaci');

  const pop = ruleBody('@keyframes diceSixPop');
  assert.ok(/\btransform\s*:\s*scale/.test(pop), 'diceSixPop má zvětšovat scénu');
});
