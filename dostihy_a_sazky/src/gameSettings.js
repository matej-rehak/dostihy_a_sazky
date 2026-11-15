'use strict';

/**
 * Nastavení hry — jediný zdroj pravdy.
 *
 * Každé nastavení je JEDEN záznam v `SETTINGS`: výchozí hodnota, rozsah,
 * popisek i skupina v lobby. Server podle schématu validuje (`sanitizeConfig`),
 * posílá ho klientům v `game:init` a lobby z něj samo vykreslí formulář
 * hostitele i přehled pravidel pro ostatní (public/js/ui/lobbySettings.js).
 *
 * Nové nastavení = přidat záznam sem a použít `this.config.<key>` v enginu.
 * Nic dalšího (HTML, posluchače, výchozí hodnoty na klientovi) netřeba.
 * Schéma jsou čistá data (bez funkcí), aby šlo poslat přes Socket.IO.
 *
 * Pole záznamu:
 *   key        klíč v `config`
 *   group      id skupiny z `GROUPS`
 *   label      popisek v lobby
 *   type       'number' | 'select' | 'toggle'
 *   default    výchozí hodnota (i náhrada za neplatný vstup)
 *   min, max   rozsah čísla (max: null = bez horní hranice)
 *   step       krok šipek v políčku
 *   round      na kolik se číslo zaokrouhlí (1 = celé; null = nezaokrouhlovat)
 *   unit       jednotka do přehledu („Kč", „min"…)
 *   zeroLabel  jak v přehledu zobrazit nulu („Bez limitu", „Vypnuto"…)
 *   options    [{ value, label }] pro 'select'
 *   visibleIf  { key, equals } | { key, notEquals } — zobrazí se, jen když platí
 *   hint       krátká nápověda pod políčkem
 */

const { BANK_SALE_DEFAULT } = require('./constants');

const GROUPS = [
  { id: 'money', label: 'Peníze', icon: 'koruna' },
  { id: 'time', label: 'Čas', icon: 'casovac' },
  { id: 'board', label: 'Herní plán', icon: 'hraci' },
  { id: 'extras', label: 'Volitelná pravidla', icon: 'kostka' },
  { id: 'bots', label: 'Boti', icon: 'bot' },
];

const SETTINGS = [
  // ─── Peníze ────────────────────────────────────────────────────────────────
  { key: 'startBalance', group: 'money', label: 'Základní kapitál', type: 'number',
    default: 30000, min: 1000, max: null, step: 1000, round: 1, unit: 'Kč' },
  { key: 'startBonus', group: 'money', label: 'Průchod STARTEM', type: 'number',
    default: 4000, min: 0, max: null, step: 500, round: 1, unit: 'Kč' },
  { key: 'buyoutMultiplier', group: 'money', label: 'Odkup koní', type: 'number',
    default: 0, min: 0, max: null, step: 0.5, round: null, unit: '×', zeroLabel: 'Vypnuto',
    hint: 'Násobek ceny, za který lze koupit koně soupeři. 0 = vypnuto.' },
  { key: 'bankSaleRatio', group: 'money', label: 'Výkup bankou', type: 'select', default: BANK_SALE_DEFAULT,
    options: [
      { value: '1/2', label: 'Polovina ceny' },
      { value: '2/3', label: 'Dvě třetiny ceny' },
      { value: '3/4', label: 'Tři čtvrtiny ceny' },
      { value: '1', label: 'Plná cena' },
    ],
    hint: 'Kolik banka zaplatí za prodané koně, služby i žetony.' },

  // ─── Čas ───────────────────────────────────────────────────────────────────
  { key: 'timeLimitMinutes', group: 'time', label: 'Délka hry', type: 'number',
    default: 0, min: 0, max: 240, step: 5, round: 1, unit: 'min', zeroLabel: 'Bez limitu',
    hint: 'Po uplynutí vyhrává nejbohatší hráč. 0 = bez limitu.' },
  { key: 'turnTimeLimitSeconds', group: 'time', label: 'Čas na tah', type: 'number',
    default: 0, min: 0, max: 300, step: 5, round: 1, unit: 's', zeroLabel: 'Bez limitu' },

  // ─── Herní plán ───────────────────────────────────────────────────────────
  { key: 'field20Mode', group: 'board', label: 'Pole 20', type: 'select', default: 'parking',
    options: [{ value: 'parking', label: 'Parkoviště' }, { value: 'airport', label: 'Letiště' }] },
  { key: 'airportFee', group: 'board', label: 'Cena letu', type: 'number',
    default: 4000, min: 0, max: null, step: 500, round: 1, unit: 'Kč', zeroLabel: 'Zdarma',
    visibleIf: { key: 'field20Mode', equals: 'airport' } },
  { key: 'field30Mode', group: 'board', label: 'Pole 30', type: 'select', default: 'doping',
    options: [{ value: 'doping', label: 'Podezření z dopingu' }, { value: 'roulette', label: 'Ruleta' }] },
  { key: 'rouletteFee', group: 'board', label: 'Cena zatočení', type: 'number',
    default: 2000, min: 0, max: null, step: 500, round: 1, unit: 'Kč', zeroLabel: 'Zdarma',
    visibleIf: { key: 'field30Mode', equals: 'roulette' } },

  // ─── Volitelná pravidla ───────────────────────────────────────────────────
  { key: 'diceBetEnabled', group: 'extras', label: 'Sázky na hod', type: 'toggle', default: false,
    hint: 'Před hodem lze vsadit na číslo, které padne.' },
  { key: 'diceBetMultiplier', group: 'extras', label: 'Výhra sázky', type: 'number',
    default: 5, min: 2, max: 10, step: 1, round: 1, unit: '× vklad',
    visibleIf: { key: 'diceBetEnabled', equals: true } },
  { key: 'diceBetMaxStake', group: 'extras', label: 'Max. vklad', type: 'number',
    default: 5000, min: 100, max: 100000, step: 500, round: 100, unit: 'Kč',
    visibleIf: { key: 'diceBetEnabled', equals: true } },
  { key: 'inflationEveryRounds', group: 'extras', label: 'Inflace každých', type: 'number',
    default: 0, min: 0, max: 50, step: 1, round: 1, unit: 'kol', zeroLabel: 'Vypnuto',
    hint: 'Po kolika kolech všechno zdraží. 0 = vypnuto.' },
  { key: 'inflationRate', group: 'extras', label: 'Velikost inflace', type: 'number',
    default: 10, min: 1, max: 100, step: 1, round: 1, unit: '%',
    visibleIf: { key: 'inflationEveryRounds', notEquals: 0 } },

  // ─── Boti ─────────────────────────────────────────────────────────────────
  { key: 'botRisk', group: 'bots', label: 'Riskování botů', type: 'select', default: 'balanced',
    options: [
      { value: 'cautious', label: 'Opatrný' },
      { value: 'balanced', label: 'Vyvážený' },
      { value: 'risky', label: 'Riskující' },
    ],
    hint: 'Kolik peněz si boti nechávají stranou. Riskující utrácí skoro do dna.' },
];

/** Výchozí konfigurace nové místnosti. */
function defaultConfig() {
  return Object.fromEntries(SETTINGS.map(s => [s.key, s.default]));
}

function sanitizeValue(setting, raw) {
  switch (setting.type) {
    case 'toggle':
      // Zapíná se jen skutečným `true` — „ano", 1 ani "true" ne.
      return raw === true;
    case 'select':
      return setting.options.some(o => o.value === raw) ? raw : setting.default;
    case 'number': {
      let n = Number(raw);
      if (raw === null || raw === '' || !Number.isFinite(n)) return setting.default;
      if (setting.round) n = Math.round(n / setting.round) * setting.round;
      if (setting.min != null) n = Math.max(setting.min, n);
      if (setting.max != null) n = Math.min(setting.max, n);
      return n;
    }
    default:
      return setting.default;
  }
}

/**
 * Vrátí platnou konfiguraci: známé klíče ořízne do rozsahu, neplatné hodnoty
 * nahradí výchozími a neznámé klíče zahodí.
 */
function sanitizeConfig(input = {}) {
  return Object.fromEntries(SETTINGS.map(s => [s.key, sanitizeValue(s, input[s.key])]));
}

module.exports = { GROUPS, SETTINGS, defaultConfig, sanitizeConfig };
