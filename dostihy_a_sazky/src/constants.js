'use strict';

const { randomInt } = require('./random');

const BOARD_SIZE    = 40;
const JAIL_SPACE    = 10;
const JAIL_TURNS_MAX = 3;
const JAIL_FINE     = 3000;
const ACTION_DELAY_MS = 2000;

/**
 * Prodleva mezi šestkou a dalším hodem téhož hráče.
 *
 * Bez ní server povolil další hod okamžitě a protihráčův klient dostal nový
 * stav dřív, než dohrála animace šestky — ta se pak utnula uprostřed.
 * Hodnota musí pokrýt celou animaci: 400 ms roztočení + 600 ms dosednutí
 * + 700 ms jiskry = 1700 ms (viz SIX_TOTAL_MS v
 * public/js/animations/diceAnimationGate.mjs). Kdo mění jedno, ať zkontroluje
 * druhé — hlídají to tests/six-reroll-delay.test.js a
 * tests/dice-animation-gate.test.mjs.
 */
const SIX_REROLL_DELAY_MS = 1800;

/**
 * Hod na poplatek služby a hod v Distancu: výsledek (peníze, log, propuštění)
 * se použije až po dotočení kostky na klientovi — jinak hráč vidí, kolik
 * hodil, dřív než kostka dopadne. Pokrývá i pulz šestky (SIX_TOTAL_MS
 * v public/js/animations/diceAnimationGate.mjs). Test: tests/dice-reveal-delay.test.js.
 */
const DICE_REVEAL_MS = 1800;

/**
 * Jak dlouho bot „drží" prompt `roulette_ack`, než ho potvrdí.
 *
 * Kolo Rulety vidí všichni hráči, ale potvrzuje ho jen ten, kdo točil.
 * Když točí bot, potvrdil by s běžnou pauzou `Bot.BOT_THINK_MS` (800 ms)
 * ještě uprostřed točení — `pendingAction` by se změnil a klienti diváků by
 * overlay schovali dřív, než se výsledek vůbec odhalí. Karta tímhle netrpí,
 * protože její text je na overlayi hned.
 *
 * Hodnota musí pokrýt celé točení: SPIN_MS = 3000 ms v
 * public/js/animations/rouletteAnimationGate.mjs, plus ~2,8 s, aby si výsledek
 * ostatní hráči stihli přečíst — Ruleta se nedá přeskočit. Kdo mění jedno, ať zkontroluje druhé — hlídá to
 * tests/roulette-gate.test.mjs a tests/roulette-bot-delay.test.js.
 *
 * Když si hostitel nastaví extrémně krátký `turnTimeLimitSeconds`, vyhraje
 * časový limit a animace se utne — efekt se ale i tak aplikuje právě jednou
 * (viz `_handleTurnTimeout`).
 */
const ROULETTE_BOT_ACK_DELAY_MS = 5800;

/**
 * Časovaná rozhodnutí — odkup koně a karta „Opakovaný hod". Hráč má na
 * volbu `DECISION_WINDOW_MS`, klient ukazuje ubývající lištu. Server čeká
 * o `DECISION_GRACE_MS` déle, aby klik z poslední chvíle ještě prošel.
 * Vypršení = odmítnout odkup / ponechat hod (viz `_handleDecisionTimeout`).
 */
const DECISION_WINDOW_MS = 5000;
const DECISION_GRACE_MS = 500;

const PLAYER_COLORS = ['#e74c3c', '#3b82f6', '#10b981', '#f59e0b', '#a855f7', '#f97316'];

/** Sázka na vlastní hod: nejmenší vklad a krok vkladu (viz mixins/diceBet.js). */
const DICE_BET_MIN_STAKE = 100;

// Nájem Přepravy a Stájí = násobek hodu kostkou: jedna služba / obě.
// (Originál má 80× / 200×; zvýšeno, aby se služby vyplatily.)
// Klient zrcadlí v public/js/ui/rentView.mjs (SERVICE_DICE_RENT), soulad
// hlídá tests/tile-amount.test.mjs.
const SERVICE_RENT_SINGLE = 200;
const SERVICE_RENT_PAIR   = 500;

function roll() { return randomInt(1, 7); }
function fmt(n)  { return Number(n).toLocaleString('cs-CZ'); }

/**
 * Cena po inflaci. Inflace má dva zdroje, které se násobí:
 *  • `level` — výseč Inflace na Ruletě, každá úroveň zdražuje o INFLATION_RATE,
 *  • `autoLevel` — automatická inflace každých N kol z nastavení hostitele,
 *    každá úroveň zdražuje o `autoRatePercent` %.
 * Úrovně se násobí (dvakrát 10 % = ×1,21) a výsledek je na celé koruny.
 * Klient má zrcadlo v public/js/ui/inflation.mjs — soulad hlídá
 * tests/inflation.test.mjs.
 */
const INFLATION_RATE = 0.1;
function inflationFactor(level, autoLevel = 0, autoRatePercent = 0) {
  return (1 + INFLATION_RATE) ** (level || 0) * (1 + (autoRatePercent || 0) / 100) ** (autoLevel || 0);
}
function inflate(amount, level, autoLevel = 0, autoRatePercent = 0) {
  if (!level && !(autoLevel && autoRatePercent)) return amount;
  return Math.round(amount * inflationFactor(level, autoLevel, autoRatePercent));
}

/**
 * Výkup bankou — kolik z původní ceny banka zaplatí za koně, službu i žeton.
 * Klíč je hodnota nastavení `bankSaleRatio` (src/gameSettings.js). Výsledek se
 * zaokrouhluje dolů, inflace výkup nemění. Klient má zrcadlo
 * v public/js/ui/bankSale.mjs — soulad hlídá tests/bank-sale-ratio.test.mjs.
 */
const BANK_SALE_RATIOS = { '1/2': [1, 2], '2/3': [2, 3], '3/4': [3, 4], '1': [1, 1] };
const BANK_SALE_DEFAULT = '2/3';
function bankSaleValue(amount, ratioKey) {
  const [num, den] = BANK_SALE_RATIOS[ratioKey] || BANK_SALE_RATIOS[BANK_SALE_DEFAULT];
  return Math.floor(amount * num / den);
}

module.exports = { BOARD_SIZE, JAIL_SPACE, JAIL_TURNS_MAX, JAIL_FINE, ACTION_DELAY_MS, SIX_REROLL_DELAY_MS, DICE_REVEAL_MS, ROULETTE_BOT_ACK_DELAY_MS, DECISION_WINDOW_MS, DECISION_GRACE_MS, PLAYER_COLORS, INFLATION_RATE, DICE_BET_MIN_STAKE, SERVICE_RENT_SINGLE, SERVICE_RENT_PAIR, BANK_SALE_RATIOS, BANK_SALE_DEFAULT, roll, fmt, inflate, inflationFactor, bankSaleValue };
