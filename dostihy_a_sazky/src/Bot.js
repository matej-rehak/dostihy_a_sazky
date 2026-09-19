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

// ─── Nákup ────────────────────────────────────────────────────────────────────

/**
 * Má bot koupit volné pole, na kterém stojí?
 * Pravidla se vyhodnocují shora dolů, první shoda vyhrává.
 * `reason` používá i scoreSpace při výběru cíle letu.
 */
function evaluatePurchase(ctx, botId, spaceId) {
  const bot = ctx.players.get(botId);
  const space = BOARD[spaceId];
  if (!bot || !space) return { buy: false, reason: 'default' };

  const reserve = calcReserve(ctx, botId);
  const left = bot.balance - space.price;

  if (space.type === 'service') {
    if (space.serviceType === 'trener') {
      // Nájem = počet trenérů × 1000, bez podmínky monopolu → bezpečná investice.
      return { buy: left >= reserve, reason: 'trener' };
    }
    // Přeprava a Stáje se vyplatí jen v páru (80×kostka → 200×kostka).
    const other = space.serviceType === 'preprava' ? 'staje' : 'preprava';
    const hasOther = bot.properties.some(sid => BOARD[sid].serviceType === other);
    return { buy: hasOther && left >= reserve, reason: 'service_pair' };
  }

  if (space.type !== 'horse') return { buy: false, reason: 'default' };

  const peers = groupSpaces(space.group).filter(s => s.id !== spaceId);
  const mine  = peers.filter(s => ctx.ownerships[s.id] === botId).length;
  const free  = peers.filter(s => !ctx.ownerships[s.id]).length;
  const opponentOwned = peers.length - mine - free;

  // Blokace: soupeři drží celý zbytek stáje — koupě jim bere monopol.
  if (opponentOwned === peers.length) {
    return { buy: left >= reserve, reason: 'block' };
  }

  // Kompletace: monopol bez peněz na žeton nevydělává nic (viz _calcRent).
  if (mine === peers.length) {
    return { buy: left >= reserve + space.tokenCost, reason: 'complete' };
  }

  // Postup: bot ve stáji už koně má a zbytek je volný → monopol je na dosah.
  if (mine > 0 && opponentOwned === 0) {
    return { buy: left >= reserve + space.tokenCost, reason: 'progress' };
  }

  // Osamocený kůň ve stáji, kterou rozebírá někdo jiný → zmrazený kapitál.
  if (mine === 0 && opponentOwned > 0) {
    return { buy: false, reason: 'isolated' };
  }

  return { buy: left >= reserve * 2, reason: 'default' };
}

// ─── Skórování polí a letiště ─────────────────────────────────────────────────

/**
 * Hodnota pole pro bota, v korunách — aby šla přímo porovnat s airportFee.
 * Kladné = chci tam, záporné = radši ne.
 */
function scoreSpace(ctx, botId, spaceId) {
  const bot = ctx.players.get(botId);
  const space = BOARD[spaceId];
  if (!bot || !space) return 0;

  // Bonus za START se záměrně neskóruje: bot ho dostane i obyčejnou chůzí,
  // let ho jen uspíší. Jinak by z letiště létal pokaždé (viz odchylka od 5.6).
  let score = 0;

  if (space.type === 'horse' || space.type === 'service') {
    const ownerId = ctx.ownerships[spaceId];

    if (!ownerId) {
      const { buy, reason } = evaluatePurchase(ctx, botId, spaceId);
      if (buy && (reason === 'block' || reason === 'complete')) {
        score += space.price;
      } else if (buy && reason === 'progress') {
        score += Math.floor(space.price / 2);
      }
    } else if (ownerId === botId) {
      // Vlastní kůň s monopolem → příští tah tam jde postavit žeton.
      if (space.type === 'horse' && ownsFullGroup(ctx, botId, space.group)) {
        const tok = ctx.tokens[spaceId] || { small: 0, big: false };
        if (!tok.big) score += space.tokenCost;
      }
    } else {
      score -= estimateRent(ctx, spaceId);
    }

    return score;
  }

  // Pole 10 má typ 'jail', ale _evaluateSpace ho řeší jako go_to_jail.
  if (space.type === 'jail' || space.type === 'go_to_jail') score -= HAZARD_PENALTY;
  else if (space.type === 'skip_turn') score -= HAZARD_PENALTY;
  else if (space.type === 'tax') score -= space.amount;

  return score;
}

/**
 * Kam letět z letiště — nebo null, když se let nevyplatí.
 * Porovnává nejlepší dosažitelný cíl s průměrem polí, na která by bot doletěl
 * obyčejným hodem. Let musí být lepší aspoň o cenu poplatku.
 */
function decideAirport(ctx, botId) {
  const bot = ctx.players.get(botId);
  const fee = ctx.config.airportFee;
  if (!bot || bot.balance < fee) return null;

  let best = null;
  let bestScore = -Infinity;
  for (let id = 0; id < BOARD.length; id++) {
    if (id === bot.position) continue;
    const score = scoreSpace(ctx, botId, id);
    if (score > bestScore) {
      bestScore = score;
      best = id;
    }
  }

  let sum = 0;
  for (let d = 1; d <= 6; d++) {
    sum += scoreSpace(ctx, botId, (bot.position + d) % BOARD.length);
  }
  const expected = sum / 6;

  return bestScore - expected > fee ? best : null;
}

// ─── Dluhy ────────────────────────────────────────────────────────────────────

/** Kolik dá prodej pole — zrcadlí EconomyMixin._sellProperty. */
function propertySellValue(ctx, spaceId) {
  return Math.floor(BOARD[spaceId].price / 2) + tokenSellValue(ctx, spaceId);
}

/**
 * Jednu akci na jeden prompt debt_manage — engine se po každém prodeji doptá znovu.
 * Prodej je za 50 %, takže cílem je prodat co nejmíň a to nejpostradatelnější.
 */
function pickDebtAction(ctx, botId) {
  const bot = ctx.players.get(botId);
  if (!bot) return null;

  const shortage = -bot.balance;
  if (shortage <= 0) return null;

  const loneHorses = [];      // kůň mimo monopol, bez žetonů
  const tokenHorses = [];     // kůň mimo monopol, ale se žetony (vzácné)
  const services = [];
  const monopolyHorses = [];
  const withTokens = [];

  for (const sid of bot.properties) {
    const space = BOARD[sid];
    const tok = ctx.tokens[sid];
    const hasTokens = !!tok && (tok.big || tok.small > 0);
    if (hasTokens) withTokens.push(sid);

    if (space.type === 'service') {
      services.push(sid);
    } else if (ownsFullGroup(ctx, botId, space.group)) {
      monopolyHorses.push(sid);
    } else if (hasTokens) {
      tokenHorses.push(sid);
    } else {
      loneHorses.push(sid);
    }
  }

  // Žetony až za službami, ale před rozebráním monopolu — jeden žeton bolí
  // míň než ztráta celé stáje.
  for (const tier of [loneHorses, tokenHorses, services]) {
    const pick = pickFromTier(ctx, tier, shortage);
    if (pick !== null) return { decision: 'sell_property', spaceId: pick };
  }

  if (withTokens.length > 0) {
    return { decision: 'sell_token', spaceId: withTokens[0] };
  }

  const lastResort = pickFromTier(ctx, monopolyHorses, shortage);
  if (lastResort !== null) return { decision: 'sell_property', spaceId: lastResort };

  return { decision: 'declare_bankrupt' };
}

/** Nejlevnější pole, které dluh pokryje samo; jinak nejdražší (nejmíň prodejů). */
function pickFromTier(ctx, tier, shortage) {
  if (tier.length === 0) return null;
  const sorted = [...tier].sort((a, b) => propertySellValue(ctx, a) - propertySellValue(ctx, b));
  const covering = sorted.find(sid => propertySellValue(ctx, sid) >= shortage);
  return covering !== undefined ? covering : sorted[sorted.length - 1];
}

// ─── Dispatcher ───────────────────────────────────────────────────────────────

/**
 * Jediný vstupní bod pro BotsMixin. Vrací akci k provedení, nebo null.
 * Čte jen stav — nic nemění.
 */
function decideAction(ctx, botId) {
  const bot = ctx.players.get(botId);
  if (!bot || bot.bankrupt) return null;

  // Fronta obchodů má přednost: nabídka může mířit na bota, který není na tahu.
  // Veřejné nabídky (targetId === null) se ignorují — _handleTradeResponse
  // je odstraní z fronty pro všechny hráče, včetně lidí.
  const offer = (ctx.tradeOffers || []).find(o => o.targetId === botId);
  if (offer) {
    return { kind: 'respond', data: { decision: 'decline', tradeOfferId: offer.id } };
  }

  const pa = ctx.pendingAction;
  if (!pa || pa.targetId !== botId) return null;
  const d = pa.data || {};

  switch (pa.type) {
    case 'wait_roll':
    case 'service_roll':
      return { kind: 'roll' };

    case 'card_ack':
      return { kind: 'respond', data: { decision: 'ack' } };

    case 'buy_offer': {
      const { buy } = evaluatePurchase(ctx, botId, d.spaceId);
      return { kind: 'respond', data: { decision: buy ? 'buy' : 'decline', spaceId: d.spaceId } };
    }

    case 'buyout_offer': {
      const space = BOARD[d.spaceId];
      const peers = groupSpaces(space.group).filter(s => s.id !== d.spaceId);
      const completes = peers.every(s => ctx.ownerships[s.id] === botId);
      const left = bot.balance - d.buyoutCost;
      const ok = completes && left >= calcReserve(ctx, botId) + space.tokenCost;
      return { kind: 'respond', data: { decision: ok ? 'buy' : 'decline', spaceId: d.spaceId } };
    }

    case 'token_manage': {
      const spaceId = (d.eligible || [])[0];
      if (spaceId === undefined) return { kind: 'respond', data: { decision: 'end_turn' } };
      const space = BOARD[spaceId];
      const tok = ctx.tokens[spaceId] || { small: 0, big: false };
      const tokenType = tok.small >= 4 ? 'big' : 'small';
      const cost = tokenType === 'big' ? space.bigTokenCost : space.tokenCost;
      if (bot.balance - cost >= calcReserve(ctx, botId)) {
        return { kind: 'respond', data: { decision: 'add_token', spaceId, tokenType } };
      }
      return { kind: 'respond', data: { decision: 'end_turn' } };
    }

    case 'jail_choice':
      return {
        kind: 'respond',
        data: { decision: bot.jailFreeCards > 0 ? 'use_jail_card' : 'roll_jail' },
      };

    case 'airport_choice':
      return {
        kind: 'respond',
        data: { decision: decideAirport(ctx, botId) === null ? 'roll' : 'fly' },
      };

    case 'airport_select_target': {
      const target = decideAirport(ctx, botId);
      if (target === null) return { kind: 'respond', data: { decision: 'cancel' } };
      return { kind: 'respond', data: { decision: 'fly', spaceId: target } };
    }

    case 'debt_manage': {
      const action = pickDebtAction(ctx, botId);
      return action ? { kind: 'respond', data: action } : null;
    }

    case 'trade_offer':
      return { kind: 'respond', data: { decision: 'decline' } };

    default:
      // insufficient_funds, selecting_starter, game_over — engine si poradí sám
      return null;
  }
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
  evaluatePurchase,
  scoreSpace,
  decideAirport,
  pickDebtAction,
  decideAction,
};
