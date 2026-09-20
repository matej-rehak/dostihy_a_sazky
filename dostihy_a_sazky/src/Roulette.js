'use strict';

/**
 * Devět výsečí Totalizátoru.
 *
 * Výsledky jsou DATA, ne funkce — bot i klient s nimi pak umí pracovat, aniž
 * by je znaly jménem, a testy se píšou proti definicím místo proti chování.
 * Chování jednotlivých id řeší `src/mixins/roulette.js`.
 *
 * Každá výseč staví na ose, kterou stávajících 28 karet nepokrývá:
 * vlastnictví, žetony, nájem, cílení na soupeře, volba hráče a sázka.
 */
const OUTCOMES = [
  {
    id: 'bet', icon: '🎲', name: 'Sázka na vlastní hod', prompt: null,
    stake: 5000, threshold: 5, payoutMultiplier: 3,
    text: 'Vsadil(a) jsi 5.000 Kč na vlastní hod. Padne-li 5 nebo 6, bereš trojnásobek.',
  },
  {
    id: 'auction', icon: '🏇', name: 'Dražba', prompt: 'pick_horse',
    surchargePct: 50,
    text: 'Vyber si libovolného volného koně a kup ho s přirážkou 50 %.',
  },
  {
    id: 'preemption', icon: '🎟️', name: 'Přednostní právo', prompt: null,
    text: 'Příštího volného koně, na kterého došlápneš, koupíš za polovinu.',
  },
  {
    id: 'free_token', icon: '🏗️', name: 'Dostih zdarma', prompt: 'pick_horse',
    text: 'Polož žeton dostihů na svého koně zdarma.',
  },
  {
    id: 'double_rent', icon: '💵', name: 'Dvojitý nájem', prompt: null,
    text: 'Příští nájem, který vybereš, bude dvojnásobný.',
  },
  {
    id: 'immunity', icon: '🛡️', name: 'Imunita', prompt: null,
    text: 'Příští nájem, který bys platil(a), je zdarma.',
  },
  {
    id: 'strike', icon: '🚧', name: 'Stávka ve stáji', prompt: 'pick_player',
    rounds: 1,
    text: 'Vyber soupeře — jedno kolo mu nebudou fungovat žetony dostihů.',
  },
  {
    id: 'report', icon: '🎯', name: 'Udání', prompt: 'pick_player',
    text: 'Vyber soupeře — půjde rovnou na Distanc.',
  },
  {
    id: 'doping', icon: '🤒', name: 'Podezření z dopingu', prompt: null,
    turns: 1,
    text: 'Stojíš jedno kolo a nefungují ti žetony dostihů.',
  },
];

/**
 * @param {() => number} rnd injektovatelný generátor kvůli testům
 * @returns {object} jedna z výsečí OUTCOMES
 */
function spin(rnd = Math.random) {
  return OUTCOMES[Math.floor(rnd() * OUTCOMES.length)];
}

module.exports = { OUTCOMES, spin };
