import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// `actionBtn` po kliknutí tlačítko vypne (ochrana proti dvojímu odeslání akce);
// oživí ho až překreslení panelu z nového stavu hry. Tlačítko, které jen
// otevře okno na klientovi, žádný nový stav nevyvolá — bez `opensDialog`
// zůstalo po zavření okna křížkem mrtvé (prodej bance, sázka na hod).

const src = readFileSync(fileURLToPath(new URL('../public/js/ui/actions.js', import.meta.url)), 'utf8');

/** Řádek, kde se tlačítko s daným popiskem vytváří. */
function buttonLine(label) {
  const line = src.split('\n').find(l => /(iconBtn|actionBtn)\(/.test(l) && l.includes(`'${label}'`));
  assert.ok(line, `tlačítko „${label}" v actions.js chybí`);
  return line;
}

for (const [label, opener] of [
  ['Prodat bance', 'openBankSale'],
  ['Sázka na hod', 'openDiceBet'],
  ['Nabídnout obchod', 'startTradeWith'],
]) {
  test(`„${label}" zůstane po zavření okna klikatelné`, () => {
    const line = buttonLine(label);
    assert.ok(line.includes(opener), `„${label}" má otevírat ${opener}`);
    assert.match(line, /opensDialog:\s*true/, `„${label}" jen otevírá okno — potřebuje { opensDialog: true }`);
  });
}

test('actionBtn s opensDialog tlačítko po kliknutí nevypne', () => {
  const helpers = readFileSync(fileURLToPath(new URL('../public/js/ui/actionsHelpers.js', import.meta.url)), 'utf8');
  assert.match(helpers, /if \(!opensDialog\) btn\.disabled = true;/);
});
