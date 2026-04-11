'use strict';

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

class CardDeck {
  constructor(cards) {
    this.original = cards;
    this.pile = shuffle([...cards]);
  }
  draw() {
    if (this.pile.length === 0) this.pile = shuffle([...this.original]);
    return this.pile.pop();
  }
}

// ─── Finance karty (14) ─────────────────────────────────────────────────────
const FINANCE_CARDS = [
  { type: 'gain',           amount: 1500, text: 'Vyhráli jste dostih! Získáváte 1 500 Kč.' },
  { type: 'pay',            amount: 800,  text: 'Oprava stáje. Zaplatíte 800 Kč.' },
  { type: 'collect_from_all', amount: 200, text: 'Narozeniny! Každý hráč vám dá 200 Kč.' },
  { type: 'move_to',        space: 10,    passStart: false, text: 'Odjeďte na Velkou pardubickou. Přesuňte se na Distanc.' },
  { type: 'pay',            amount: 500,  text: 'Výplata trenéra. Zaplatíte 500 Kč.' },
  { type: 'gain',           amount: 2000, text: 'Nečekaný sponzorský vklad. Získáváte 2 000 Kč.' },
  { type: 'pay',            amount: 1000, text: 'Daň z koní. Zaplatíte 1 000 Kč.' },
  { type: 'gain',           amount: 1000, text: 'Sponzor platí za závod. Získáváte 1 000 Kč.' },
  { type: 'pay',            amount: 600,  text: 'Veterinář. Zaplatíte 600 Kč.' },
  { type: 'gain',           amount: 500,  text: 'Výhra v loterii. Získáváte 500 Kč.' },
  { type: 'go_to_jail',                   text: 'Špatné zacházení s koněm — jdete do Distancu!' },
  { type: 'move_to',        space: 0,     passStart: true,  text: 'Postup na START! Přesouváte se na START a získáváte 4 000 Kč.' },
  { type: 'pay_to_all',     amount: 150,  text: 'Fond trenérů. Každému hráči zaplatíte 150 Kč.' },
  { type: 'gain',           amount: 1200, text: 'Výhra za chov! Získáváte 1 200 Kč.' },
];

// ─── Náhoda karty (14) ──────────────────────────────────────────────────────
const NAHODA_CARDS = [
  { type: 'move_forward',   steps: 3,    text: 'Rychlý start! Postoupíte o 3 pole dopředu.' },
  { type: 'move_to',        space: 0,    passStart: true, text: 'Vrátíte se na START a berete 4 000 Kč.' },
  { type: 'go_to_jail',                  text: 'Diskvalifikace — jdete do Distancu!' },
  { type: 'pay',            amount: 300, text: 'Pokuta za přestupek v závodě. Zaplatíte 300 Kč.' },
  { type: 'gain',           amount: 600, text: 'Bonus od závodního svazu. Získáváte 600 Kč.' },
  { type: 'skip_turn',      turns: 1,    text: 'Kůň nemocen. Vynecháváte příští kolo.' },
  { type: 'move_to',        space: 5,    passStart: false, text: 'Spěchejte k Trenérovi! Přesuňte se na pole Trenér (5).' },
  { type: 'gain',           amount: 400, text: 'Výhra vstupenky. Získáváte 400 Kč.' },
  { type: 'pay',            amount: 700, text: 'Oprava závodní tratě. Zaplatíte 700 Kč.' },
  { type: 'gain',           amount: 800, text: 'Odměna od majitele stáje. Získáváte 800 Kč.' },
  { type: 'move_backward',  steps: 2,    text: 'Zaváhání — vrátíte se o 2 pole zpět.' },
  { type: 'gain',           amount: 1000, text: 'Dostihová pocta. Získáváte 1 000 Kč.' },
  { type: 'gain',           amount: 1500, text: 'Výplata od pojišťovny. Získáváte 1 500 Kč.' },
  { type: 'gain_per_property', amount: 100, text: 'Bonifikace za koně. Za každého vlastněného koně získáváte 100 Kč.' },
];

module.exports = {
  FinanceDeck: () => new CardDeck(FINANCE_CARDS),
  NahodaDeck:  () => new CardDeck(NAHODA_CARDS),
};
