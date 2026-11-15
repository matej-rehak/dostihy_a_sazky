'use strict';

const { shuffle } = require('./random');

/**
 * Balíček karet. Většina karet se po zahrání vrací do hry při dalším
 * zamíchání; karta s `keep: true` („Zrušen distanc") ale zůstává hráči
 * v ruce. Dokud ji někdo drží, v balíčku není — ani po zamíchání — a vrátí
 * se až přes `returnCard` (použití, bankrot).
 */
class CardDeck {
  constructor(cards) {
    this.original = cards;
    /** Karty, které drží hráči — nesmí se znovu líznout. */
    this.held = new Set();
    this.pile = shuffle([...cards]);
  }
  draw() {
    if (this.pile.length === 0) this.pile = shuffle(this.original.filter(c => !this.held.has(c)));
    const card = this.pile.pop();
    if (card?.keep) this.held.add(card);
    return card;
  }
  /** Vrátí drženou kartu daného typu na spodek balíčku. */
  returnCard(type) {
    const card = [...this.held].find(c => c.type === type);
    if (!card) return false;
    this.held.delete(card);
    this.pile.unshift(card); // pop() bere z konce → unshift = spodek balíčku
    return true;
  }
  /** Debug: srovná balíček s tím, jestli kartu daného typu někdo drží. */
  setHeld(type, isHeld) {
    const card = this.original.find(c => c.type === type && c.keep);
    if (!card) return;
    if (isHeld && !this.held.has(card)) {
      this.held.add(card);
      this.pile = this.pile.filter(c => c !== card);
    } else if (!isHeld && this.held.has(card)) {
      this.returnCard(type);
    }
  }
  forceDraw(idx) {
    const card = this.original[idx];
    if (card === undefined || this.held.has(card)) return; // držená karta v balíčku není
    const at = this.pile.indexOf(card);
    if (at !== -1) this.pile.splice(at, 1); // ať se jedinečná karta nezdvojí
    this.pile.push(card); // push → pop() vrátí tuto kartu příště
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

// ─── Náhoda karty (15) ──────────────────────────────────────────────────────
const NAHODA_CARDS = [
  { type: 'move_backward', steps: 3, text: 'Jdi o 3 pole zpět.' },
  { type: 'jail_free_card', keep: true, text: 'Zrušen distanc (kartu lze zachovat pro pozdější použití).' },
  { type: 'reroll_card', keep: true, text: 'Opakovaný hod (kartu si ponech — po hodu kostkou ji můžeš použít a hodit znovu).' },
  { type: 'move_nearest', serviceType: 'trener', passStart: true, text: 'Jedeš se zúčastnit trenérského kurzu. Postoupíš na nejbližší pole Trenér. Dostaneš {startBonus} Kč, pokud jedeš dopředu přes Start.' },
  { type: 'skip_turn', turns: 2, text: 'Zdržíš se na 2 kola.' },
  { type: 'go_to_jail', passStart: false, text: 'Distanc (bez {startBonus} Kč).' },
  { type: 'move_nearest_backward', category: 'type', value: 'finance', text: 'Zpět na nejbližší pole Finance.' },
  { type: 'move_backward_to', space: 39, bonus: 'startBonus', text: 'Zpět na poslední pole ve hře (kůň Napoli), obdržíš {startBonus} Kč.' },
  { type: 'move_backward_to', space: 10, passStart: true, text: 'Zpět na pole Distanc. Obdržíš {startBonus} Kč, pokud jsi cestou zpět prošel Start.' },
  { type: 'move_nearest_backward', category: 'type', value: 'finance', text: 'Zpět na nejbližší pole Finance.' },
  { type: 'move_backward_to', space: 0, bonus: 'startBonus', passStart: true, text: 'Zpět na start (hráč obdrží {startBonus} Kč).' },
  { type: 'move_backward_to', space: 0, passStart: false, text: 'Zpět na start (bez {startBonus} Kč).' },
  { type: 'skip_turn', turns: 2, text: 'Zdržíš se na 2 kola.' },
  { type: 'skip_turn', turns: 1, text: 'Zdržíš se na 1 kolo.' },
  { type: 'move_backward_to', space: 20, passStart: true, text: 'Zpět na pole {space:20}. Dostaneš {startBonus} Kč, pokud jsi cestou zpět prošel start.' },
];

module.exports = {
  FinanceDeck: () => new CardDeck(FINANCE_CARDS),
  NahodaDeck: () => new CardDeck(NAHODA_CARDS),
};
