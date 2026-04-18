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
  forceDraw(idx) {
    const card = this.original[idx];
    if (card !== undefined) this.pile.push(card); // push → pop() vrátí tuto kartu příště
  }
}

// ─── Finance karty (14) ─────────────────────────────────────────────────────
const FINANCE_CARDS = [
  { type: 'pay', amount: 1000, text: 'Zaplať pojistku 1.000 Kč.' },
  { type: 'pay', amount: 400, text: 'Pokuta za nedodržení předpisů 400 Kč.' },
  { type: 'pay_per_token_custom', small: 500, big: 0, text: 'Renovuješ všechny stáje. Za každý svůj obsazený dostih zaplať 500 Kč.' },
  { type: 'gain', amount: 2000, text: 'Mimořádný zisk z dostihů obdržíš 2.000 Kč.' },
  { type: 'collect_from_all', amount: 200, text: 'Jako dárek k narozeninám obdržíš od každého 200 Kč.' },
  { type: 'gain', amount: 500, text: 'Mimořádná prémie 500 Kč.' },
  { type: 'gain', amount: 4000, text: 'Obdržíš dotaci 4.000 Kč.' },
  { type: 'pay', amount: 3000, text: 'Zaplať dluh 3.000 Kč.' },
  { type: 'pay_per_token_custom', small: 800, big: 2300, text: 'Za každý svůj obsazený dostih zaplať 800 Kč, za každý svůj obsazený hlavní dostih sezóny zaplať 2.300 Kč.' },
  { type: 'pay', amount: 2000, text: 'Zaplať příspěvek 2.000 Kč.' },
  { type: 'pay', amount: 100, text: 'Nákup materiálu na opravu 100 Kč.' },
  { type: 'gain', amount: 1000, text: 'Výhra v loterii 1.000 Kč.' },
  { type: 'gain', amount: 2000, text: 'Obdržíš dotaci 2.000 Kč.' },
  { type: 'gain', amount: 3000, text: 'Z banky obdržíš přeplatek 3.000 Kč.' },
];

// ─── Náhoda karty (14) ──────────────────────────────────────────────────────
const NAHODA_CARDS = [
  { type: 'move_backward', steps: 3, text: 'Jdi o 3 pole zpět.' },
  { type: 'jail_free_card', text: 'Zrušen distanc (kartu lze zachovat pro pozdější použití).' },
  { type: 'move_nearest', serviceType: 'trener', passStart: true, text: 'Jedeš se zúčastnit trenérského kurzu. Postoupíš na nejbližší pole Trenér. Dostaneš 4.000 Kč, pokud jedeš dopředu přes Start.' },
  { type: 'skip_turn', turns: 2, text: 'Zdržíš se na 2 kola.' },
  { type: 'go_to_jail', passStart: false, text: 'Distanc (bez 4.000 Kč).' },
  { type: 'move_nearest_backward', category: 'type', value: 'finance', text: 'Zpět na nejbližší pole Finance.' },
  { type: 'move_backward_to', space: 39, bonus: 4000, text: 'Zpět na poslední pole ve hře (kůň Napoli), obdržíš 4.000 Kč.' },
  { type: 'move_backward_to', space: 10, passStart: true, text: 'Zpět na pole Distanc. Obdržíš 4.000 Kč, pokud jsi cestou zpět prošel Start.' },
  { type: 'move_nearest_backward', category: 'type', value: 'finance', text: 'Zpět na nejbližší pole Finance.' },
  { type: 'move_backward_to', space: 0, bonus: 4000, passStart: true, text: 'Zpět na start (hráč obdrží 4.000 Kč).' },
  { type: 'move_backward_to', space: 0, passStart: false, text: 'Zpět na start (bez 4.000 Kč).' },
  { type: 'skip_turn', turns: 2, text: 'Zdržíš se na 2 kola.' },
  { type: 'skip_turn', turns: 1, text: 'Zdržíš se na 1 kolo.' },
  { type: 'move_backward_to', space: 20, passStart: true, text: 'Zpět na pole Parkoviště. Dostaneš 4.000 Kč, pokud jsi cestou zpět prošel start.' },
];

module.exports = {
  FinanceDeck: () => new CardDeck(FINANCE_CARDS),
  NahodaDeck: () => new CardDeck(NAHODA_CARDS),
};
