'use strict';

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

const PLAYER_COLORS = ['#e74c3c', '#3b82f6', '#10b981', '#f59e0b', '#a855f7', '#f97316'];

function roll() { return Math.floor(Math.random() * 6) + 1; }
function fmt(n)  { return Number(n).toLocaleString('cs-CZ'); }

module.exports = { BOARD_SIZE, JAIL_SPACE, JAIL_TURNS_MAX, JAIL_FINE, ACTION_DELAY_MS, SIX_REROLL_DELAY_MS, PLAYER_COLORS, roll, fmt };
