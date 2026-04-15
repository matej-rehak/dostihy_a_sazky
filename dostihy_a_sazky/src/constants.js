'use strict';

const BOARD_SIZE    = 40;
const JAIL_SPACE    = 10;
const JAIL_TURNS_MAX = 3;
const JAIL_FINE     = 3000;
const ACTION_DELAY_MS = 2000;

const PLAYER_COLORS = ['#e74c3c', '#3b82f6', '#10b981', '#f59e0b', '#a855f7', '#f97316'];

function roll() { return Math.floor(Math.random() * 6) + 1; }
function fmt(n)  { return Number(n).toLocaleString('cs-CZ'); }

module.exports = { BOARD_SIZE, JAIL_SPACE, JAIL_TURNS_MAX, JAIL_FINE, ACTION_DELAY_MS, PLAYER_COLORS, roll, fmt };
