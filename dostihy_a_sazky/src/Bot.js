'use strict';

const BOARD = require('./data/boardData');
const { inflate, bankSaleValue, SERVICE_RENT_SINGLE, SERVICE_RENT_PAIR } = require('./constants');

// ─── Ladicí konstanty ─────────────────────────────────────────────────────────

const BOT_THINK_MS       = 800;    // pauza „bot přemýšlí"; musí být < turnTimeLimitSeconds
const RESERVE_MIN        = 2000;
const RESERVE_MAX        = 12000;
const EARLY_ROUND_MAX    = 3;      // do kolikátého kola bot expanduje agresivněji
const EARLY_ROUND_FACTOR = 0.6;
const AVG_DICE           = 3.5;    // průměr kostky pro odhady bez konkrétního hodu
const HAZARD_PENALTY     = 8000;   // srážka za Distanc / doping při skórování polí

// Riskování botů (config.botRisk, nastavuje hostitel v lobby) násobí rezervu.
// Rezerva řídí každé rozhodnutí o penězích — koupi, výkup, žetony i Ruletu —
// takže jeden koeficient posune chování bota konzistentně. Neznámá hodnota
// = vyvážený (dnešní chování).
const RISK_FACTORS = { cautious: 1.6, balanced: 1, risky: 0.4 };

// Obchod — ocenění nabídky (evaluateTrade). Násobky ceny pole.
const JAIL_CARD_VALUE      = 1500;  // karta „Zrušen distanc"
const TRADE_COMPLETE_BONUS = 1.0;   // získaný kůň doplní botovi stáj
const TRADE_PROGRESS_BONUS = 0.25;  // kůň do stáje, kde bot má koně a zbytek je volný
const TRADE_PAIR_BONUS     = 0.5;   // druhá služba do páru Přeprava + Stáje
const TRADE_BREAK_PENALTY  = 1.5;   // bot by přišel o celou stáj (žetony přestanou platit)
const TRADE_GIFT_PENALTY   = 1.0;   // soupeř by díky koni měl celou stáj
const TRADE_MIN_MARGIN     = 500;   // nabídka musí být lepší aspoň o tolik…
const TRADE_MARGIN_RATE    = 0.1;   // …nebo o 10 % z toho, co bot dává

// ─── Sdílené helpery ──────────────────────────────────────────────────────────

function groupSpaces(group) {
  return BOARD.filter(s => s.group === group);
}

function ownsFullGroup(ctx, pid, group) {
  return groupSpaces(group).every(s => ctx.ownerships[s.id] === pid);
}

/** Platba po inflaci z Rulety — zrcadlí EconomyMixin._price. */
function priced(ctx, amount) {
  return inflate(amount, ctx.inflation || 0, ctx.autoInflation || 0, ctx.config?.inflationRate || 0);
}

/** Zrcadlí _calcTokenSellValue ze state.js — kolik dá prodej žetonů na poli. */
function tokenSellValue(ctx, spaceId) {
  const space = BOARD[spaceId];
  const tok = ctx.tokens[spaceId];
  if (!tok) return 0;
  const ratio = ctx.config?.bankSaleRatio;
  if (tok.big) return bankSaleValue(space.bigTokenCost, ratio) + bankSaleValue(space.tokenCost, ratio) * 4;
  if (tok.small > 0) return bankSaleValue(space.tokenCost, ratio) * tok.small;
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
      return priced(ctx, count * 1000);
    }
    const hasPreprava = owner.properties.some(sid => BOARD[sid].serviceType === 'preprava');
    const hasStaje    = owner.properties.some(sid => BOARD[sid].serviceType === 'staje');
    return priced(ctx, (hasPreprava && hasStaje ? SERVICE_RENT_PAIR : SERVICE_RENT_SINGLE) * dice);
  }

  if (space.type !== 'horse') return 0;

  const tok = ctx.tokens[spaceId] || { small: 0, big: false };
  const baseRent = space.rents[0];

  if (!tok.big && tok.small === 0) return priced(ctx, baseRent);
  if (owner.inJail || owner.skipTurns > 0) return priced(ctx, baseRent);
  if (!ownsFullGroup(ctx, ownerId, space.group)) return priced(ctx, baseRent);

  return priced(ctx, tok.big ? space.rents[5] : space.rents[tok.small]);
}

// ─── Rezerva ──────────────────────────────────────────────────────────────────

/**
 * Kolik hotovosti chce bot držet. Vychází z nejdražšího nájmu, který mu na
 * plánu hrozí od soupeřů, oříznutého do [RESERVE_MIN, RESERVE_MAX].
 * V prvních kolech je plán prázdný a expanze je důležitější než polštář.
 * Nakonec se vynásobí koeficientem riskování (RISK_FACTORS).
 */
/**
 * Karta „Opakovaný hod": bot ji spálí jen na opravdu špatný hod — druhou
 * šestku po sobě (Distanc) nebo dopad na soupeřova koně / službu s nájmem
 * aspoň max(2 000 Kč, 15 % hotovosti). Jinak si ji šetří.
 */
function shouldReroll(ctx, botId, dice) {
  const bot = ctx.players.get(botId);
  if (!bot || !Number.isInteger(dice)) return false;
  const acc = bot.rollAccumulator || 0;
  if (dice === 6) return acc > 0;
  const target = (bot.position + acc + dice) % BOARD.length;
  const ownerId = ctx.ownerships[target];
  if (!ownerId || ownerId === botId) return false;
  return estimateRent(ctx, target) >= Math.max(2000, bot.balance * 0.15);
}

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
  reserve *= RISK_FACTORS[ctx.config?.botRisk] ?? RISK_FACTORS.balanced;
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
  const left = bot.balance - priced(ctx, space.price);
  const tokenCost = priced(ctx, space.tokenCost);

  if (space.type === 'service') {
    if (space.serviceType === 'trener') {
      // Nájem = počet trenérů × 1000, bez podmínky monopolu → bezpečná investice.
      return { buy: left >= reserve, reason: 'trener' };
    }
    // Přeprava a Stáje: v páru 500×kostka, sólo 200×kostka. Dřív se kupovala
    // jen jako druhá do páru — první tak bot nekoupil nikdy a pár nesložil.
    // První půlka páru se vyplatí (a drží-li druhou soupeř, blokuje mu 500×).
    const other = space.serviceType === 'preprava' ? 'staje' : 'preprava';
    const hasOther = bot.properties.some(sid => BOARD[sid].serviceType === other);
    return { buy: left >= reserve, reason: hasOther ? 'service_pair' : 'service_first' };
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
    return { buy: left >= reserve + tokenCost, reason: 'complete' };
  }

  // Postup: bot ve stáji už koně má a zbytek je volný → monopol je na dosah.
  if (mine > 0 && opponentOwned === 0) {
    return { buy: left >= reserve + tokenCost, reason: 'progress' };
  }

  // Stáj, ve které má koně soupeř a bot nic: koupě soupeři stáj zablokuje —
  // bez tohohle koně ji nikdy nedoplní. Dřív se tu nekupovalo vůbec, boti
  // tak nechávali třetinu plánu neprodanou a hra stála.
  if (mine === 0 && opponentOwned > 0) {
    return { buy: left >= reserve, reason: 'deny' };
  }

  return { buy: left >= reserve * 2, reason: 'default' };
}

/**
 * Má bot odkoupit soupeřova koně? `balance` je, kolik bot bude mít v ruce
 * v okamžiku nabídky (po nájmu, případně po poplatku za let).
 * Engine odkup nenabízí, když má majitel celou stáj (_offerBuyoutOrEnd),
 * takže rozbít soupeři stáj odkupem nejde — zbývá doplnit si vlastní.
 */
function evaluateBuyout(ctx, botId, spaceId, balance, cost) {
  const space = BOARD[spaceId];
  const ownerId = ctx.ownerships[spaceId];
  if (!space || space.type !== 'horse' || !ownerId || ownerId === botId) {
    return { buy: false, reason: 'default' };
  }
  if (ownsFullGroup(ctx, ownerId, space.group)) return { buy: false, reason: 'owner_full' };

  const peers = groupSpaces(space.group).filter(s => s.id !== spaceId);
  const mine   = peers.filter(s => ctx.ownerships[s.id] === botId).length;
  const others = peers.filter(s => ctx.ownerships[s.id] && ctx.ownerships[s.id] !== botId).length;
  const left = balance - cost;
  const reserve = calcReserve(ctx, botId);

  // Kompletace: druhá šance nemusí přijít. Žeton se po odkupu stejně staví
  // až při příštím zastavení, do té doby bot peníze dorovná — stačí rezerva.
  if (mine === peers.length) return { buy: left >= reserve, reason: 'complete' };

  // Postup: po odkupu drží stáj jen bot a banka → monopol je na dosah.
  if (mine > 0 && others === 0) {
    return { buy: left >= reserve + priced(ctx, space.tokenCost), reason: 'progress' };
  }

  return { buy: false, reason: 'default' };
}

/** Hodnota, kterou bot přikládá doplnění celé stáje: cena všech jejích koní. */
function groupValue(ctx, group) {
  return groupSpaces(group).reduce((sum, s) => sum + priced(ctx, s.price), 0);
}

// ─── Skórování polí a letiště ─────────────────────────────────────────────────

/**
 * Hodnota pole pro bota, v korunách — aby šla přímo porovnat s airportFee.
 * Kladné = chci tam, záporné = radši ne.
 * `spent` = co bot zaplatí, než na pole dorazí (poplatek za let) — rozhoduje,
 * zda mu po nájmu zbude na odkup.
 */
function scoreSpace(ctx, botId, spaceId, spent = 0) {
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
      if (buy && reason === 'complete') {
        score += groupValue(ctx, space.group);
      } else if (buy && reason === 'block') {
        score += priced(ctx, space.price);
      } else if (buy && (reason === 'progress' || reason === 'deny')) {
        score += Math.floor(priced(ctx, space.price) / 2);
      }
    } else if (ownerId === botId) {
      // Vlastní kůň s monopolem → příští tah tam jde postavit žeton.
      if (space.type === 'horse' && ownsFullGroup(ctx, botId, space.group)) {
        const tok = ctx.tokens[spaceId] || { small: 0, big: false };
        if (!tok.big) score += priced(ctx, space.tokenCost);
      }
    } else {
      const rent = estimateRent(ctx, spaceId);
      score -= rent;
      // Soupeřův kůň, kterého jde po zaplacení nájmu odkoupit (movement.js).
      const mult = ctx.config?.buyoutMultiplier || 0;
      if (mult > 0 && space.type === 'horse') {
        const cost = priced(ctx, space.price) * mult;
        const { buy, reason } = evaluateBuyout(ctx, botId, spaceId, bot.balance - spent - rent, cost);
        if (buy && reason === 'complete') score += groupValue(ctx, space.group);
        else if (buy && reason === 'progress') score += Math.floor(priced(ctx, space.price) / 2);
      }
    }

    return score;
  }

  // Pole 10 má typ 'jail', ale _evaluateSpace ho řeší jako go_to_jail.
  if (space.type === 'jail' || space.type === 'go_to_jail') score -= HAZARD_PENALTY;
  else if (space.type === 'skip_turn') score -= HAZARD_PENALTY;
  else if (space.type === 'tax') score -= priced(ctx, space.amount);

  return score;
}

/**
 * Kam letět z letiště — nebo null, když se let nevyplatí.
 * Porovnává nejlepší dosažitelný cíl s průměrem polí, na která by bot doletěl
 * obyčejným hodem. Let musí být lepší aspoň o cenu poplatku.
 */
function decideAirport(ctx, botId) {
  const bot = ctx.players.get(botId);
  const fee = priced(ctx, ctx.config.airportFee);
  if (!bot || bot.balance < fee) return null;

  let best = null;
  let bestScore = -Infinity;
  for (let id = 0; id < BOARD.length; id++) {
    if (id === bot.position) continue;
    const score = scoreSpace(ctx, botId, id, fee);
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

// ─── Obchod ───────────────────────────────────────────────────────────────────

/** Plná cena žetonů na poli — s koněm přechází i to, co do něj kdo postavil. */
function tokenValue(ctx, spaceId) {
  const space = BOARD[spaceId];
  const tok = ctx.tokens[spaceId];
  if (!tok) return 0;
  if (tok.big) return space.bigTokenCost + space.tokenCost * 4;
  return space.tokenCost * (tok.small || 0);
}

function ownsFullGroupIn(ownerships, pid, group) {
  return groupSpaces(group).every(s => ownerships[s.id] === pid);
}

function ownsBothTransport(ownerships, pid) {
  const owned = type => BOARD.some(s => s.serviceType === type && ownerships[s.id] === pid);
  return owned('preprava') && owned('staje');
}

/**
 * Přijme bot nabídku obchodu? `offer` je to, co bot dostane, `request` to, co
 * dá (pohled iniciátora). Pole se oceňují cenou + žetony, k tomu strategické
 * přirážky a srážky podle toho, jak obchod změní stáje obou stran. Bot přijme,
 * když zisk převýší ztrátu o rozumnou marži a po zaplacení mu zůstane rezerva.
 */
function evaluateTrade(ctx, botId, tradeOffer) {
  const bot = ctx.players.get(botId);
  if (!bot || !tradeOffer) return false;
  const fromId  = tradeOffer.fromId;
  const gets    = tradeOffer.offer   || {};
  const gives   = tradeOffer.request || {};
  const getHorses  = gets.horses  || [];
  const giveHorses = gives.horses || [];

  const before = ctx.ownerships;
  const after = { ...before };
  getHorses.forEach(sid => { after[sid] = botId; });
  giveHorses.forEach(sid => { after[sid] = fromId; });

  const fieldValue = sid => BOARD[sid].price + tokenValue(ctx, sid);

  let gain = (gets.money || 0) + (gets.jailCard ? JAIL_CARD_VALUE : 0);
  for (const sid of getHorses) {
    const space = BOARD[sid];
    if (!space) continue;
    gain += fieldValue(sid);
    if (space.type === 'horse') {
      const peers = groupSpaces(space.group);
      if (ownsFullGroupIn(after, botId, space.group) && !ownsFullGroupIn(before, botId, space.group)) {
        gain += space.price * TRADE_COMPLETE_BONUS;
      } else if (peers.every(s => !after[s.id] || after[s.id] === botId)) {
        gain += space.price * TRADE_PROGRESS_BONUS;
      }
    } else if (space.serviceType === 'preprava' || space.serviceType === 'staje') {
      if (ownsBothTransport(after, botId) && !ownsBothTransport(before, botId)) {
        gain += space.price * TRADE_PAIR_BONUS;
      }
    }
  }

  let loss = (gives.money || 0) + (gives.jailCard ? JAIL_CARD_VALUE : 0);
  for (const sid of giveHorses) {
    const space = BOARD[sid];
    if (!space) continue;
    loss += fieldValue(sid);
    if (space.type !== 'horse') continue;
    if (ownsFullGroupIn(before, botId, space.group) && !ownsFullGroupIn(after, botId, space.group)) {
      loss += space.price * TRADE_BREAK_PENALTY;
    }
    if (ownsFullGroupIn(after, fromId, space.group) && !ownsFullGroupIn(before, fromId, space.group)) {
      loss += space.price * TRADE_GIFT_PENALTY;
    }
  }

  const pays = gives.money || 0;
  if (pays > 0 && bot.balance + (gets.money || 0) - pays < calcReserve(ctx, botId)) return false;

  if (loss === 0) return gain > 0;
  return gain >= loss + Math.max(TRADE_MIN_MARGIN, loss * TRADE_MARGIN_RATE);
}

// ─── Dluhy ────────────────────────────────────────────────────────────────────

/** Kolik dá prodej pole — zrcadlí EconomyMixin._sellProperty. */
function propertySellValue(ctx, spaceId) {
  return bankSaleValue(BOARD[spaceId].price, ctx.config?.bankSaleRatio) + tokenSellValue(ctx, spaceId);
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

// ─── Dar koně (Ruleta) ────────────────────────────────────────────────────────

/**
 * Koho a kterého koně darovat, když Ruleta padne na „Daruješ koně".
 * Používá ho bot i engine jako náhradní volbu po vypršení limitu.
 *
 * Obdarovaný je nejslabší soupeř — dar vedoucímu hráči by mu jen pomohl
 * vyhrát. Kůň je ten, jehož ztráta bolí nejmíň: nejlevnější, bez žetonů,
 * a pokud to jde, ne z vlastní úplné stáje a ne takový, který obdarovanému
 * stáj doplní.
 *
 * @returns {{ spaceId: number, recipientId: string } | null}
 */
function pickGift(ctx, pid, horses, candidates) {
  if (horses.length === 0 || candidates.length === 0) return null;

  const worth = id => (ctx.players.get(id)?.balance || 0) + ctx._calcAssetsValue(id);
  const recipientId = [...candidates].sort((a, b) => worth(a) - worth(b))[0];

  const cost = sid => {
    const space = BOARD[sid];
    let c = space.price + tokenSellValue(ctx, sid) * 2;
    if (ownsFullGroup(ctx, pid, space.group)) c += 100000;
    const rest = groupSpaces(space.group).filter(s => s.id !== sid);
    if (rest.every(s => ctx.ownerships[s.id] === recipientId)) c += 50000;
    return c;
  };
  const spaceId = [...horses].sort((a, b) => cost(a) - cost(b))[0];
  return { spaceId, recipientId };
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
    const decision = evaluateTrade(ctx, botId, offer) ? 'accept' : 'decline';
    return { kind: 'respond', data: { decision, tradeOfferId: offer.id } };
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

    case 'reroll_offer':
      return { kind: 'respond', data: { decision: shouldReroll(ctx, botId, d.dice) ? 'reroll' : 'keep' } };

    case 'buy_offer': {
      const { buy } = evaluatePurchase(ctx, botId, d.spaceId);
      return { kind: 'respond', data: { decision: buy ? 'buy' : 'decline', spaceId: d.spaceId } };
    }

    case 'buyout_offer': {
      const { buy } = evaluateBuyout(ctx, botId, d.spaceId, bot.balance, d.buyoutCost);
      return { kind: 'respond', data: { decision: buy ? 'buy' : 'decline', spaceId: d.spaceId } };
    }

    case 'token_manage': {
      const spaceId = (d.eligible || [])[0];
      if (spaceId === undefined) return { kind: 'respond', data: { decision: 'end_turn' } };
      const space = BOARD[spaceId];
      const tok = ctx.tokens[spaceId] || { small: 0, big: false };
      const tokenType = tok.small >= 4 ? 'big' : 'small';
      const cost = priced(ctx, tokenType === 'big' ? space.bigTokenCost : space.tokenCost);
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

    case 'roulette_choice': {
      // Dobré a špatné výseče jsou stejně pravděpodobné — točí, pokud
      // poplatek nesáhne na rezervu
      const fee = d.fee ?? ctx.config.rouletteFee ?? 0;
      const spin = bot.balance - fee >= calcReserve(ctx, botId);
      return { kind: 'respond', data: { decision: spin ? 'spin' : 'skip' } };
    }

    case 'roulette_ack':
      // Výsledek je daný, není co rozhodovat — jen potvrdit, jako u karty.
      return { kind: 'respond', data: { decision: 'ack' } };

    case 'roulette_pick_player': {
      const candidates = d.candidates || [];
      if (candidates.length === 0) return { kind: 'respond', data: { decision: null } };
      // Vedoucí soupeř = ten s největším majetkem. Udání má smysl mířit
      // na něj, ne na hráče, který stejně dohrává.
      const leader = candidates
        .map(id => ({ id, worth: (ctx.players.get(id)?.balance || 0) + ctx._calcAssetsValue(id) }))
        .sort((a, b) => b.worth - a.worth)[0];
      return { kind: 'respond', data: { decision: leader.id } };
    }

    case 'roulette_pick_horse': {
      const options = d.options || [];
      if (options.length === 0) return { kind: 'respond', data: { decision: 'decline' } };

      // Dostih zdarma se vyplatí vždy — ber toho koně, kde zvedne nájem nejvíc.
      const best = options
        .map(o => ({ ...o, gain: estimateRent(ctx, o.spaceId) }))
        .sort((a, b) => b.gain - a.gain)[0];
      return { kind: 'respond', data: { decision: best.spaceId } };
    }

    case 'roulette_give_horse': {
      const pick = pickGift(ctx, botId, d.options || [], d.candidates || []);
      if (!pick) return null;
      return { kind: 'respond', data: { decision: pick.recipientId, spaceId: pick.spaceId } };
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
  RISK_FACTORS,
  evaluateTrade,
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
  evaluateBuyout,
  scoreSpace,
  decideAirport,
  pickDebtAction,
  pickGift,
  shouldReroll,
  priced,
  decideAction,
};
