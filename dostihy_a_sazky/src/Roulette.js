'use strict';

const { randomFloat } = require('./random');

/**
 * Výseče Rulety.
 *
 * Výsledky jsou DATA, ne funkce — bot i klient s nimi pak umí pracovat, aniž
 * by je znaly jménem, a testy se píšou proti definicím místo proti chování.
 * Chování jednotlivých id řeší `src/mixins/roulette.js`.
 *
 * Výseče tvoří tři stejně pravděpodobné skupiny — dobré, neutrální a špatné
 * (každá má součet vah 12 z 36). Uvnitř skupiny rozhoduje síla efektu: čím
 * silnější, tím menší výseč. Pořadí v poli je zároveň pořadí na kole —
 * skupiny se střídají, aby barvy nebyly v jednom bloku.
 *
 * `text` se ukáže po zatočení, `summary` je krátký popis do tooltipu pole 30.
 */
const GROUP_WEIGHT = 12;

/** Kolik korun k ceně zatočení přidá Jackpot a kolik k ní připočte Pokuta. */
const JACKPOT_BONUS = 10000;
const FINE_EXTRA = 10000;

/** Pokuta u „Daruješ koně", když hráč žádného koně nemá. */
const GIFT_FALLBACK_FINE = 2000;

const OUTCOMES = [
  {
    id: 'preemption', group: 'good', weight: 5, icon: '🎟️', name: 'Přednostní právo', short: 'Přednost', prompt: null,
    summary: 'Příští volný kůň za polovinu',
    text: 'Příštího volného koně, na kterého došlápneš, koupíš za polovinu.',
  },
  {
    id: 'spin_again', group: 'neutral', weight: 5, icon: '🔁', name: 'Toč znovu', short: 'Znovu', prompt: null,
    summary: 'Zatočíš ještě jednou',
    text: 'Můžeš zatočit ještě jednou — za stejnou cenu, nebo odmítnout.',
  },
  {
    id: 'jail', group: 'bad', weight: 5, icon: '🔒', name: 'Distanc', short: 'Distanc', prompt: null,
    summary: 'Jdeš rovnou na Distanc',
    text: 'Jdeš rovnou na Distanc.',
  },
  {
    id: 'report', group: 'good', weight: 4, icon: '🎯', name: 'Udání', short: 'Udání', prompt: 'pick_player',
    summary: 'Vybraný soupeř jde na Distanc',
    text: 'Vyber soupeře — půjde rovnou na Distanc.',
  },
  {
    id: 'bet', group: 'neutral', weight: 4, icon: '🎲', name: 'Sázka na vlastní hod', short: 'Sázka', prompt: null,
    stake: 5000, threshold: 5, payoutMultiplier: 3,
    summary: 'Sázka 5 000 Kč, při 5–6 bereš 15 000',
    text: 'Vsadil(a) jsi 5.000 Kč na vlastní hod. Padne-li 5 nebo 6, bereš trojnásobek.',
  },
  {
    id: 'doping', group: 'bad', weight: 4, icon: '🤒', name: 'Doping', short: 'Doping', prompt: null,
    turns: 2,
    summary: '2 kola stojíš, žetony nefungují',
    text: 'Stojíš dvě kola a nefungují ti žetony dostihů.',
  },
  {
    id: 'free_token', group: 'good', weight: 2, icon: '🏗️', name: 'Dostih zdarma', short: 'Dostih', prompt: 'pick_horse',
    summary: 'Žeton na svého koně zdarma',
    text: 'Polož žeton dostihů na svého koně zdarma.',
  },
  {
    id: 'inflation', group: 'neutral', weight: 3, icon: '📈', name: 'Inflace', short: 'Inflace', prompt: null,
    summary: 'Vše zdraží o 10 % do konce hry',
    text: 'Všechno zdražuje o 10 % — koně, žetony, nájmy i poplatky. Platí do konce hry.',
  },
  {
    id: 'give_horse', group: 'bad', weight: 2, icon: '🎁', name: 'Daruješ koně', short: 'Dar', prompt: 'give_horse',
    summary: 'Daruješ koně soupeři',
    text: `Vyber svého koně a soupeře, kterému ho daruješ. Bez koně platíš ${GIFT_FALLBACK_FINE.toLocaleString('cs-CZ')} Kč.`,
  },
  {
    id: 'jackpot', group: 'good', weight: 1, icon: '💰', name: 'Jackpot', short: 'Jackpot', prompt: null,
    summary: `Cena zatočení + ${JACKPOT_BONUS.toLocaleString('cs-CZ')} Kč`,
    text: `Bereš cenu zatočení a k tomu ${JACKPOT_BONUS.toLocaleString('cs-CZ')} Kč.`,
  },
  {
    id: 'fine', group: 'bad', weight: 1, icon: '💸', name: 'Pokuta', short: 'Pokuta', prompt: null,
    summary: `Cena zatočení + ${FINE_EXTRA.toLocaleString('cs-CZ')} Kč`,
    text: `Platíš cenu zatočení ještě jednou a k tomu ${FINE_EXTRA.toLocaleString('cs-CZ')} Kč.`,
  },
];

const TOTAL_WEIGHT = OUTCOMES.reduce((sum, o) => sum + o.weight, 0);

/**
 * Vážený výběr: každá výseč má šanci `weight / TOTAL_WEIGHT`.
 *
 * @param {() => number} rnd injektovatelný generátor kvůli testům
 * @returns {object} jedna z výsečí OUTCOMES
 */
function spin(rnd = randomFloat) {
  let r = rnd() * TOTAL_WEIGHT;
  for (const o of OUTCOMES) {
    if (r < o.weight) return o;
    r -= o.weight;
  }
  return OUTCOMES[OUTCOMES.length - 1];
}

/**
 * Hodnota generátoru, při které `spin` padne doprostřed výseče `id`.
 * Pro testy a debug — vynutí konkrétní výsledek přes `_rouletteRnd`.
 */
function rndFor(id) {
  let start = 0;
  for (const o of OUTCOMES) {
    if (o.id === id) return (start + o.weight / 2) / TOTAL_WEIGHT;
    start += o.weight;
  }
  throw new Error(`Neznámá výseč Rulety: ${id}`);
}

module.exports = {
  rndFor, OUTCOMES, TOTAL_WEIGHT, GROUP_WEIGHT, JACKPOT_BONUS, FINE_EXTRA, GIFT_FALLBACK_FINE, spin,
};
