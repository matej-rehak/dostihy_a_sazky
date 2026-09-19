'use strict';

const BOARD = require('./data/boardData');

// ─── Ladicí konstanty ─────────────────────────────────────────────────────────

const BOT_THINK_MS       = 800;    // pauza „bot přemýšlí"; musí být < turnTimeLimitSeconds
const RESERVE_MIN        = 2000;
const RESERVE_MAX        = 12000;
const EARLY_ROUND_MAX    = 3;      // do kolikátého kola bot expanduje agresivněji
const EARLY_ROUND_FACTOR = 0.6;
const AVG_DICE           = 3.5;    // průměr kostky pro odhady bez konkrétního hodu
const HAZARD_PENALTY     = 8000;   // srážka za Distanc / doping při skórování polí

// ─── Sdílené helpery ──────────────────────────────────────────────────────────

function groupSpaces(group) {
  return BOARD.filter(s => s.group === group);
}

function ownsFullGroup(ctx, pid, group) {
  return groupSpaces(group).every(s => ctx.ownerships[s.id] === pid);
}

/** Zrcadlí _calcTokenSellValue ze state.js — kolik dá prodej žetonů na poli. */
function tokenSellValue(ctx, spaceId) {
  const space = BOARD[spaceId];
  const tok = ctx.tokens[spaceId];
  if (!tok) return 0;
  if (tok.big) return Math.floor(space.bigTokenCost / 2) + Math.floor(space.tokenCost / 2) * 4;
  if (tok.small > 0) return Math.floor(space.tokenCost / 2) * tok.small;
  return 0;
}

// ─── Odhad nájmu ──────────────────────────────────────────────────────────────

/**
 * Odhad nájmu na poli. Zrcadlí EconomyMixin._calcRent, která je metodou enginu
 * a loguje — proto se sem nedá volat přímo.
 * Soulad obou implementací hlídá tests/bot-rent-estimate.test.js.
 */
function estimateRent(ctx, spaceId, dice = AVG_DICE) {
  const space = BOARD[spaceId];
  const ownerId = ctx.ownerships[spaceId];
  if (!ownerId) return 0;

  const owner = ctx.players.get(ownerId);
  if (!owner) return 0;

  if (space.type === 'service') {
    if (space.serviceType === 'trener') {
      const count = owner.properties.filter(sid => BOARD[sid].serviceType === 'trener').length;
      return count * 1000;
    }
    const hasPreprava = owner.properties.some(sid => BOARD[sid].serviceType === 'preprava');
    const hasStaje    = owner.properties.some(sid => BOARD[sid].serviceType === 'staje');
    return (hasPreprava && hasStaje ? 200 : 80) * dice;
  }

  if (space.type !== 'horse') return 0;

  const tok = ctx.tokens[spaceId] || { small: 0, big: false };
  const baseRent = space.rents[0];

  if (!tok.big && tok.small === 0) return baseRent;
  if (owner.inJail || owner.skipTurns > 0) return baseRent;
  if (!ownsFullGroup(ctx, ownerId, space.group)) return baseRent;

  return tok.big ? space.rents[5] : space.rents[tok.small];
}

// ─── Rezerva ──────────────────────────────────────────────────────────────────

/**
 * Kolik hotovosti chce bot držet. Vychází z nejdražšího nájmu, který mu na
 * plánu hrozí od soupeřů, oříznutého do [RESERVE_MIN, RESERVE_MAX].
 * V prvních kolech je plán prázdný a expanze je důležitější než polštář.
 */
function calcReserve(ctx, botId) {
  let threat = 0;
  for (const space of BOARD) {
    const ownerId = ctx.ownerships[space.id];
    if (!ownerId || ownerId === botId) continue;
    const rent = estimateRent(ctx, space.id);
    if (rent > threat) threat = rent;
  }

  let reserve = Math.min(Math.max(threat, RESERVE_MIN), RESERVE_MAX);
  if (ctx.round <= EARLY_ROUND_MAX) reserve *= EARLY_ROUND_FACTOR;
  return Math.round(reserve);
}

module.exports = {
  BOT_THINK_MS,
  RESERVE_MIN,
  RESERVE_MAX,
  EARLY_ROUND_MAX,
  EARLY_ROUND_FACTOR,
  AVG_DICE,
  HAZARD_PENALTY,
  groupSpaces,
  ownsFullGroup,
  tokenSellValue,
  estimateRent,
  calcReserve,
};
