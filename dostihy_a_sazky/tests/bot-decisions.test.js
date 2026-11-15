'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const Bot = require('../src/Bot');
const { makeCtx, makePlayer, addPlayer, own } = require('./helpers/botCtx');

function twoPlayerCtx(overrides = {}) {
  const ctx = makeCtx(overrides);
  addPlayer(ctx, makePlayer('bot', { isBot: true }));
  addPlayer(ctx, makePlayer('opp'));
  return ctx;
}

test('calcReserve: prázdný plán → spodní mez', () => {
  const ctx = twoPlayerCtx();
  assert.equal(Bot.calcReserve(ctx, 'bot'), Bot.RESERVE_MIN);
});

test('calcReserve: vlastní majetek bota hrozbu netvoří', () => {
  const ctx = twoPlayerCtx();
  own(ctx, 'bot', 37, 39);
  ctx.tokens[39] = { small: 0, big: true };
  assert.equal(Bot.calcReserve(ctx, 'bot'), Bot.RESERVE_MIN);
});

test('calcReserve: Napoli s velkým dostihem → horní mez', () => {
  const ctx = twoPlayerCtx();
  own(ctx, 'opp', 37, 39);
  ctx.tokens[39] = { small: 0, big: true };   // nájem 40 000 → clamp
  assert.equal(Bot.calcReserve(ctx, 'bot'), Bot.RESERVE_MAX);
});

test('calcReserve: hrozba mezi mezemi se propíše přímo', () => {
  const ctx = twoPlayerCtx();
  own(ctx, 'opp', 1, 3);
  ctx.tokens[1] = { small: 2, big: false };   // rents[2] = 600 → pod minimem
  ctx.tokens[3] = { small: 4, big: false };   // rents[4] = 3200
  assert.equal(Bot.calcReserve(ctx, 'bot'), 3200);
});

test('calcReserve: raná fáze hry rezervu snižuje', () => {
  const ctx = twoPlayerCtx({ round: Bot.EARLY_ROUND_MAX });
  own(ctx, 'opp', 1, 3);
  ctx.tokens[3] = { small: 4, big: false };   // 3200
  assert.equal(Bot.calcReserve(ctx, 'bot'), Math.round(3200 * Bot.EARLY_ROUND_FACTOR));
});

test('calcReserve: hned po rané fázi je rezerva plná', () => {
  const ctx = twoPlayerCtx({ round: Bot.EARLY_ROUND_MAX + 1 });
  own(ctx, 'opp', 1, 3);
  ctx.tokens[3] = { small: 4, big: false };
  assert.equal(Bot.calcReserve(ctx, 'bot'), 3200);
});

// ─── evaluatePurchase ─────────────────────────────────────────────────────────

test('nákup: blokace — soupeř drží zbytek stáje, bot bere i bez výhledu', () => {
  const ctx = twoPlayerCtx();
  own(ctx, 'opp', 1);                         // oranzova má jen 1 a 3
  ctx.players.get('bot').balance = 10000;
  const r = Bot.evaluatePurchase(ctx, 'bot', 3);
  assert.equal(r.reason, 'block');
  assert.equal(r.buy, true);
});

test('nákup: blokace se odmítne, když by nezbyla rezerva', () => {
  const ctx = twoPlayerCtx();
  own(ctx, 'opp', 1);
  ctx.players.get('bot').balance = 2500;      // 2500 - 1200 = 1300 < 2000
  const r = Bot.evaluatePurchase(ctx, 'bot', 3);
  assert.equal(r.reason, 'block');
  assert.equal(r.buy, false);
});

test('nákup: kompletace stáje projde, když zbyde i na žeton', () => {
  const ctx = twoPlayerCtx();
  own(ctx, 'bot', 1);
  ctx.players.get('bot').balance = 1200 + 2000 + 1000;   // price + reserve + tokenCost
  const r = Bot.evaluatePurchase(ctx, 'bot', 3);
  assert.equal(r.reason, 'complete');
  assert.equal(r.buy, true);
});

test('nákup: kompletace se odmítne, když by nezbylo na žeton', () => {
  const ctx = twoPlayerCtx();
  own(ctx, 'bot', 1);
  ctx.players.get('bot').balance = 1200 + 2000 + 999;
  const r = Bot.evaluatePurchase(ctx, 'bot', 3);
  assert.equal(r.reason, 'complete');
  assert.equal(r.buy, false);
});

test('nákup: postup ve volné stáji vyžaduje rezervu i cenu žetonu', () => {
  const ctx = twoPlayerCtx();
  own(ctx, 'bot', 6);                         // hneda = 6, 8, 9; zbytek volný
  ctx.players.get('bot').balance = 2000 + 2000 + 1000;
  const r = Bot.evaluatePurchase(ctx, 'bot', 8);
  assert.equal(r.reason, 'progress');
  assert.equal(r.buy, true);
});

test('nákup: kůň ve stáji soupeře se kupuje kvůli blokaci, když zbyde rezerva', () => {
  const ctx = twoPlayerCtx();
  own(ctx, 'opp', 6);                         // hneda má 3 koně → 8 a 9 volné
  ctx.players.get('bot').balance = 2000 + 2000;   // cena + rezerva
  const r = Bot.evaluatePurchase(ctx, 'bot', 8);
  assert.equal(r.reason, 'deny');
  assert.equal(r.buy, true);

  ctx.players.get('bot').balance = 2000 + 2000 - 1;
  assert.equal(Bot.evaluatePurchase(ctx, 'bot', 8).buy, false, 'rezervu nesmí prolomit');
});

test('nákup: úplně volná stáj vyžaduje dvojnásobnou rezervu', () => {
  const ctx = twoPlayerCtx();
  ctx.players.get('bot').balance = 2000 + 2 * 2000;
  assert.equal(Bot.evaluatePurchase(ctx, 'bot', 6).reason, 'default');
  assert.equal(Bot.evaluatePurchase(ctx, 'bot', 6).buy, true);

  ctx.players.get('bot').balance = 2000 + 2 * 2000 - 1;
  assert.equal(Bot.evaluatePurchase(ctx, 'bot', 6).buy, false);
});

test('nákup: trenér stačí s běžnou rezervou', () => {
  const ctx = twoPlayerCtx();
  ctx.players.get('bot').balance = 4000 + 2000;
  const r = Bot.evaluatePurchase(ctx, 'bot', 5);
  assert.equal(r.reason, 'trener');
  assert.equal(r.buy, true);
});

test('nákup: první z dvojice Přeprava/Stáje se kupuje, když zbyde rezerva', () => {
  const ctx = twoPlayerCtx();
  ctx.players.get('bot').balance = 3000 + 2000;
  const r = Bot.evaluatePurchase(ctx, 'bot', 12);
  assert.equal(r.reason, 'service_first');
  assert.equal(r.buy, true);

  ctx.players.get('bot').balance = 3000 + 2000 - 1;
  assert.equal(Bot.evaluatePurchase(ctx, 'bot', 12).buy, false, 'rezervu nesmí prolomit');
});

test('nákup: Přeprava se kupuje, když bot už má Stáje', () => {
  const ctx = twoPlayerCtx();
  own(ctx, 'bot', 28);
  ctx.players.get('bot').balance = 3000 + 2000;
  const r = Bot.evaluatePurchase(ctx, 'bot', 12);
  assert.equal(r.reason, 'service_pair');
  assert.equal(r.buy, true);
});

// ─── scoreSpace / decideAirport ───────────────────────────────────────────────

test('skóre: Distanc je past, ne jen pole', () => {
  const ctx = twoPlayerCtx();
  ctx.players.get('bot').position = 5;
  assert.equal(Bot.scoreSpace(ctx, 'bot', 10), -Bot.HAZARD_PENALTY);
});

test('skóre: doping se trestá stejně jako Distanc', () => {
  const ctx = twoPlayerCtx();
  ctx.players.get('bot').position = 25;
  assert.equal(Bot.scoreSpace(ctx, 'bot', 30), -Bot.HAZARD_PENALTY);
});

test('skóre: veterinární vyšetření se trestá svou částkou', () => {
  const ctx = twoPlayerCtx();
  ctx.players.get('bot').position = 35;
  assert.equal(Bot.scoreSpace(ctx, 'bot', 38), -1000);
});

test('skóre: soupeřův kůň se trestá odhadem nájmu', () => {
  const ctx = twoPlayerCtx();
  ctx.players.get('bot').position = 30;
  own(ctx, 'opp', 37, 39);
  ctx.tokens[39] = { small: 0, big: true };
  assert.equal(Bot.scoreSpace(ctx, 'bot', 39), -40000);
});

test('skóre: START ani jeho průchod se nezapočítává', () => {
  const ctx = twoPlayerCtx();
  ctx.players.get('bot').position = 38;
  // Bonus za START přinese i obyčejný pohyb — nesmí ospravedlnit placený let.
  assert.equal(Bot.scoreSpace(ctx, 'bot', 0), 0);
  assert.equal(Bot.scoreSpace(ctx, 'bot', 2), 0);   // pole 2 = Finance, za STARTem
});

test('skóre: volný kůň, který kompletuje stáj, má hodnotu celé stáje', () => {
  const ctx = twoPlayerCtx();
  const bot = ctx.players.get('bot');
  bot.position = 20;
  bot.balance = 50000;
  own(ctx, 'bot', 1);
  assert.equal(Bot.scoreSpace(ctx, 'bot', 3), 1200 + 1200);
});

test('skóre: vlastní kůň s monopolem láká na stavbu žetonu', () => {
  const ctx = twoPlayerCtx();
  ctx.players.get('bot').position = 20;
  own(ctx, 'bot', 1, 3);
  assert.equal(Bot.scoreSpace(ctx, 'bot', 1), 1000);   // tokenCost oranzové
});

test('letiště: bot letí za koněm, který mu zkompletuje stáj', () => {
  const ctx = twoPlayerCtx();
  const bot = ctx.players.get('bot');
  bot.position = 20;
  bot.balance = 50000;
  own(ctx, 'bot', 37);              // tm_modra: 37 + 39, Napoli za 8000
  assert.equal(Bot.decideAirport(ctx, 'bot'), 39);
});

test('letiště: na prázdném plánu se let nevyplatí', () => {
  const ctx = twoPlayerCtx();
  ctx.players.get('bot').position = 20;
  assert.equal(Bot.decideAirport(ctx, 'bot'), null);
});

test('letiště: bot bez peněz na poplatek nelétá', () => {
  const ctx = twoPlayerCtx();
  const bot = ctx.players.get('bot');
  bot.position = 20;
  bot.balance = ctx.config.airportFee - 1;
  own(ctx, 'bot', 37);
  assert.equal(Bot.decideAirport(ctx, 'bot'), null);
});

// ─── pickDebtAction ───────────────────────────────────────────────────────────

test('dluh: bez dluhu se nic neprodává', () => {
  const ctx = twoPlayerCtx();
  own(ctx, 'bot', 1);
  assert.equal(Bot.pickDebtAction(ctx, 'bot'), null);
});

test('dluh: přednost má kůň mimo monopol a bez žetonů', () => {
  const ctx = twoPlayerCtx();
  const bot = ctx.players.get('bot');
  own(ctx, 'bot', 1, 3, 6);          // 1+3 = monopol oranzova, 6 = osamocený
  bot.balance = -500;
  assert.deepEqual(Bot.pickDebtAction(ctx, 'bot'), { decision: 'sell_property', spaceId: 6 });
});

test('dluh: z postradatelných se bere nejlevnější, který dluh pokryje', () => {
  const ctx = twoPlayerCtx();
  const bot = ctx.players.get('bot');
  own(ctx, 'bot', 6, 16, 31);        // prodejní hodnoty 1000, 1800, 3000
  bot.balance = -1500;
  // 6 (1000) nestačí, 16 (1800) ano → 16
  assert.deepEqual(Bot.pickDebtAction(ctx, 'bot'), { decision: 'sell_property', spaceId: 16 });
});

test('dluh: když nic nestačí, prodá se nejdražší (nejmíň prodejů)', () => {
  const ctx = twoPlayerCtx();
  const bot = ctx.players.get('bot');
  own(ctx, 'bot', 6, 16, 31);
  bot.balance = -50000;
  assert.deepEqual(Bot.pickDebtAction(ctx, 'bot'), { decision: 'sell_property', spaceId: 31 });
});

test('dluh: služby se obětují až po osamocených koních', () => {
  const ctx = twoPlayerCtx();
  const bot = ctx.players.get('bot');
  own(ctx, 'bot', 5, 6);             // 5 = trenér, 6 = osamocený kůň
  bot.balance = -500;
  assert.deepEqual(Bot.pickDebtAction(ctx, 'bot'), { decision: 'sell_property', spaceId: 6 });
});

test('dluh: žeton se prodá dřív než se rozebere monopol', () => {
  const ctx = twoPlayerCtx();
  const bot = ctx.players.get('bot');
  own(ctx, 'bot', 1, 3);             // kompletní oranzova
  ctx.tokens[1] = { small: 2, big: false };
  bot.balance = -400;
  assert.deepEqual(Bot.pickDebtAction(ctx, 'bot'), { decision: 'sell_token', spaceId: 1 });
});

test('dluh: monopolní kůň padne až úplně nakonec', () => {
  const ctx = twoPlayerCtx();
  const bot = ctx.players.get('bot');
  own(ctx, 'bot', 1, 3);             // monopol bez žetonů
  bot.balance = -400;
  const r = Bot.pickDebtAction(ctx, 'bot');
  assert.equal(r.decision, 'sell_property');
  assert.ok([1, 3].includes(r.spaceId));
});

test('dluh: bez majetku zbývá jen bankrot', () => {
  const ctx = twoPlayerCtx();
  ctx.players.get('bot').balance = -400;
  assert.deepEqual(Bot.pickDebtAction(ctx, 'bot'), { decision: 'declare_bankrupt' });
});

// ─── decideAction ─────────────────────────────────────────────────────────────

test('dispatch: cizí pendingAction bota nezajímá', () => {
  const ctx = twoPlayerCtx();
  ctx.pendingAction = { type: 'wait_roll', targetId: 'opp' };
  assert.equal(Bot.decideAction(ctx, 'bot'), null);
});

test('dispatch: wait_roll → hod', () => {
  const ctx = twoPlayerCtx();
  ctx.pendingAction = { type: 'wait_roll', targetId: 'bot' };
  assert.deepEqual(Bot.decideAction(ctx, 'bot'), { kind: 'roll' });
});

test('dispatch: service_roll → hod', () => {
  const ctx = twoPlayerCtx();
  ctx.pendingAction = { type: 'service_roll', targetId: 'bot', data: { spaceId: 12 } };
  assert.deepEqual(Bot.decideAction(ctx, 'bot'), { kind: 'roll' });
});

test('dispatch: card_ack se jen potvrdí', () => {
  const ctx = twoPlayerCtx();
  ctx.pendingAction = { type: 'card_ack', targetId: 'bot', data: { card: {} } };
  assert.equal(Bot.decideAction(ctx, 'bot').kind, 'respond');
});

test('dispatch: buy_offer respektuje evaluatePurchase', () => {
  const ctx = twoPlayerCtx();
  ctx.players.get('bot').balance = 100;
  ctx.pendingAction = { type: 'buy_offer', targetId: 'bot', data: { spaceId: 6 } };
  assert.deepEqual(Bot.decideAction(ctx, 'bot'),
    { kind: 'respond', data: { decision: 'decline', spaceId: 6 } });
});

test('dispatch: token_manage staví, když zbyde rezerva', () => {
  const ctx = twoPlayerCtx();
  const bot = ctx.players.get('bot');
  own(ctx, 'bot', 1, 3);
  bot.position = 1;
  bot.balance = 1000 + 2000;
  ctx.pendingAction = { type: 'token_manage', targetId: 'bot', data: { eligible: [1] } };
  assert.deepEqual(Bot.decideAction(ctx, 'bot'),
    { kind: 'respond', data: { decision: 'add_token', spaceId: 1, tokenType: 'small' } });
});

test('dispatch: token_manage ukončí tah, když by rezerva nezbyla', () => {
  const ctx = twoPlayerCtx();
  const bot = ctx.players.get('bot');
  own(ctx, 'bot', 1, 3);
  bot.position = 1;
  bot.balance = 1000 + 1999;
  ctx.pendingAction = { type: 'token_manage', targetId: 'bot', data: { eligible: [1] } };
  assert.deepEqual(Bot.decideAction(ctx, 'bot'),
    { kind: 'respond', data: { decision: 'end_turn' } });
});

test('dispatch: token_manage staví velký dostih po čtyřech malých', () => {
  const ctx = twoPlayerCtx();
  const bot = ctx.players.get('bot');
  own(ctx, 'bot', 1, 3);
  bot.position = 1;
  bot.balance = 50000;
  ctx.tokens[1] = { small: 4, big: false };
  ctx.pendingAction = { type: 'token_manage', targetId: 'bot', data: { eligible: [1] } };
  assert.deepEqual(Bot.decideAction(ctx, 'bot'),
    { kind: 'respond', data: { decision: 'add_token', spaceId: 1, tokenType: 'big' } });
});

test('dispatch: ve vězení použije kartu, když ji má', () => {
  const ctx = twoPlayerCtx();
  ctx.players.get('bot').jailFreeCards = 1;
  ctx.pendingAction = { type: 'jail_choice', targetId: 'bot' };
  assert.deepEqual(Bot.decideAction(ctx, 'bot'),
    { kind: 'respond', data: { decision: 'use_jail_card' } });
});

test('dispatch: ve vězení bez karty hází', () => {
  const ctx = twoPlayerCtx();
  ctx.pendingAction = { type: 'jail_choice', targetId: 'bot' };
  assert.deepEqual(Bot.decideAction(ctx, 'bot'),
    { kind: 'respond', data: { decision: 'roll_jail' } });
});

test('dispatch: airport_choice odmítne let, když se nevyplatí', () => {
  const ctx = twoPlayerCtx();
  ctx.players.get('bot').position = 20;
  ctx.pendingAction = { type: 'airport_choice', targetId: 'bot', data: { fee: 2000 } };
  assert.deepEqual(Bot.decideAction(ctx, 'bot'),
    { kind: 'respond', data: { decision: 'roll' } });
});

test('dispatch: airport_select_target pošle konkrétní cíl', () => {
  const ctx = twoPlayerCtx();
  const bot = ctx.players.get('bot');
  bot.position = 20;
  bot.balance = 50000;
  own(ctx, 'bot', 37);
  ctx.pendingAction = { type: 'airport_select_target', targetId: 'bot', data: { fee: 2000 } };
  assert.deepEqual(Bot.decideAction(ctx, 'bot'),
    { kind: 'respond', data: { decision: 'fly', spaceId: 39 } });
});

test('dispatch: prázdná cílená nabídka se odmítne i mimo tah bota', () => {
  const ctx = twoPlayerCtx();
  ctx.pendingAction = { type: 'wait_roll', targetId: 'opp' };
  ctx.tradeOffers = [{ id: 'o1', fromId: 'opp', targetId: 'bot', offer: {}, request: {} }];
  assert.deepEqual(Bot.decideAction(ctx, 'bot'),
    { kind: 'respond', data: { decision: 'decline', tradeOfferId: 'o1' } });
});

test('dispatch: výhodná cílená nabídka se přijme i mimo tah bota', () => {
  const ctx = twoPlayerCtx();
  own(ctx, 'bot', 6);
  ctx.pendingAction = { type: 'wait_roll', targetId: 'opp' };
  ctx.tradeOffers = [{ id: 'o1', fromId: 'opp', targetId: 'bot',
    offer: { horses: [], money: 3000 }, request: { horses: [6], money: 0 } }];
  assert.deepEqual(Bot.decideAction(ctx, 'bot'),
    { kind: 'respond', data: { decision: 'accept', tradeOfferId: 'o1' } });
});

test('dispatch: veřejná nabídka se ignoruje — smazala by ji i lidem', () => {
  const ctx = twoPlayerCtx();
  ctx.pendingAction = { type: 'wait_roll', targetId: 'opp' };
  ctx.tradeOffers = [{ id: 'o1', fromId: 'opp', targetId: null, offer: {}, request: {} }];
  assert.equal(Bot.decideAction(ctx, 'bot'), null);
});

test('dispatch: insufficient_funds a selecting_starter se neřeší', () => {
  const ctx = twoPlayerCtx();
  ctx.pendingAction = { type: 'insufficient_funds', targetId: 'bot', data: {} };
  assert.equal(Bot.decideAction(ctx, 'bot'), null);
  ctx.pendingAction = { type: 'selecting_starter', targetId: 'bot', data: {} };
  assert.equal(Bot.decideAction(ctx, 'bot'), null);
});

test('dispatch: bankrotující bot nic nedělá', () => {
  const ctx = twoPlayerCtx();
  ctx.players.get('bot').bankrupt = true;
  ctx.pendingAction = { type: 'wait_roll', targetId: 'bot' };
  assert.equal(Bot.decideAction(ctx, 'bot'), null);
});

// ─── Riskování botů (config.botRisk) ──────────────────────────────────────────

function riskCtx(risk) {
  const ctx = twoPlayerCtx();
  ctx.config.botRisk = risk;
  return ctx;
}

test('riskování: rezerva roste od riskujícího k opatrnému', () => {
  const reserveAt = risk => Bot.calcReserve(riskCtx(risk), 'bot');
  assert.equal(reserveAt('balanced'), Bot.RESERVE_MIN);
  assert.equal(reserveAt('risky'), Math.round(Bot.RESERVE_MIN * Bot.RISK_FACTORS.risky));
  assert.equal(reserveAt('cautious'), Math.round(Bot.RESERVE_MIN * Bot.RISK_FACTORS.cautious));
  assert.ok(reserveAt('risky') < reserveAt('balanced'));
  assert.ok(reserveAt('balanced') < reserveAt('cautious'));
});

test('riskování: bez nastavení nebo s neznámou hodnotou se bot chová vyváženě', () => {
  const ctx = twoPlayerCtx();
  delete ctx.config.botRisk;
  assert.equal(Bot.calcReserve(ctx, 'bot'), Bot.RESERVE_MIN);
  ctx.config.botRisk = 'nesmysl';
  assert.equal(Bot.calcReserve(ctx, 'bot'), Bot.RESERVE_MIN);
});

test('riskování: riskující bot koupí koně, kterého vyvážený odmítne', () => {
  const decide = risk => {
    const ctx = riskCtx(risk);
    own(ctx, 'opp', 1);
    ctx.players.get('bot').balance = 2500;    // 2500 - 1200 = 1300 < 2000
    return Bot.evaluatePurchase(ctx, 'bot', 3).buy;
  };
  assert.equal(decide('balanced'), false);
  assert.equal(decide('risky'), true);
});

test('riskování: opatrný bot odmítne koupi, kterou vyvážený udělá', () => {
  const decide = risk => {
    const ctx = riskCtx(risk);
    own(ctx, 'opp', 1);
    ctx.players.get('bot').balance = 1200 + 2500;   // zbyde 2500 ≥ 2000, ale < 3200
    return Bot.evaluatePurchase(ctx, 'bot', 3).buy;
  };
  assert.equal(decide('balanced'), true);
  assert.equal(decide('cautious'), false);
});

// ─── Obchod (evaluateTrade) ───────────────────────────────────────────────────

/** Nabídka od soupeře botovi: offer = co bot dostane, request = co dá. */
function tradeOffer(offer = {}, request = {}) {
  return {
    id: 't1', fromId: 'opp', targetId: 'bot',
    offer:   { horses: [], money: 0, jailCard: false, ...offer },
    request: { horses: [], money: 0, jailCard: false, ...request },
  };
}

test('obchod: férové peníze za koně bot přijme', () => {
  const ctx = twoPlayerCtx();
  own(ctx, 'bot', 6);                         // hnědá 2000 Kč, zbytek stáje volný
  assert.equal(Bot.evaluateTrade(ctx, 'bot', tradeOffer({ money: 2500 }, { horses: [6] })), true);
});

test('obchod: laciná nabídka za koně se odmítne', () => {
  const ctx = twoPlayerCtx();
  own(ctx, 'bot', 6);
  assert.equal(Bot.evaluateTrade(ctx, 'bot', tradeOffer({ money: 2100 }, { horses: [6] })), false);
});

test('obchod: o celou stáj bot nepřijde ani za slušné peníze', () => {
  const ctx = twoPlayerCtx();
  own(ctx, 'bot', 1, 3);                      // celá oranžová
  assert.equal(Bot.evaluateTrade(ctx, 'bot', tradeOffer({ money: 3000 }, { horses: [3] })), false);
});

test('obchod: žetony na koni se počítají do ceny', () => {
  const ctx = twoPlayerCtx();
  own(ctx, 'bot', 6);
  ctx.tokens[6] = { small: 2, big: false };   // +2000 Kč ve stavbách
  assert.equal(Bot.evaluateTrade(ctx, 'bot', tradeOffer({ money: 2500 }, { horses: [6] })), false);
});

test('obchod: koně, který soupeři doplní stáj, bot nedá za pouhou cenu', () => {
  const ctx = twoPlayerCtx();
  own(ctx, 'opp', 1);
  own(ctx, 'bot', 3);
  assert.equal(Bot.evaluateTrade(ctx, 'bot', tradeOffer({ money: 1500 }, { horses: [3] })), false);
});

test('obchod: koně, který botovi doplní stáj, zaplatí i nad cenu', () => {
  const ctx = twoPlayerCtx();
  own(ctx, 'bot', 1);
  own(ctx, 'opp', 3);
  assert.equal(Bot.evaluateTrade(ctx, 'bot', tradeOffer({ horses: [3] }, { money: 1800 })), true);
});

test('obchod: stejného koně bez doplnění stáje za tu cenu nekoupí', () => {
  const ctx = twoPlayerCtx();
  own(ctx, 'opp', 3);                         // bot v oranžové nic nemá
  assert.equal(Bot.evaluateTrade(ctx, 'bot', tradeOffer({ horses: [3] }, { money: 1800 })), false);
});

test('obchod: po zaplacení musí botovi zůstat rezerva', () => {
  const ctx = twoPlayerCtx();
  own(ctx, 'bot', 1);
  own(ctx, 'opp', 3);
  ctx.players.get('bot').balance = 2500;      // 2500 - 1800 = 700 < 2000
  assert.equal(Bot.evaluateTrade(ctx, 'bot', tradeOffer({ horses: [3] }, { money: 1800 })), false);
});

test('obchod: dar bez protihodnoty bot přijme, prázdnou nabídku ne', () => {
  const ctx = twoPlayerCtx();
  own(ctx, 'opp', 3);
  assert.equal(Bot.evaluateTrade(ctx, 'bot', tradeOffer({ horses: [3] })), true);
  assert.equal(Bot.evaluateTrade(ctx, 'bot', tradeOffer()), false);
});

test('obchod: karta „Zrušen distanc" má cenu', () => {
  const ctx = twoPlayerCtx();
  ctx.players.get('bot').jailFreeCards = 1;
  assert.equal(Bot.evaluateTrade(ctx, 'bot', tradeOffer({ money: 500 }, { jailCard: true })), false);
  assert.equal(Bot.evaluateTrade(ctx, 'bot', tradeOffer({ money: 2500 }, { jailCard: true })), true);
});

// ─── Odkup (buyout_offer) ─────────────────────────────────────────────────────

function buyoutDecision(ctx, spaceId, buyoutCost) {
  ctx.pendingAction = { type: 'buyout_offer', targetId: 'bot', data: { spaceId, buyoutCost } };
  return Bot.decideAction(ctx, 'bot').data.decision;
}

test('odkup: kůň doplní botovi stáj → koupí, zbyde-li rezerva', () => {
  const ctx = twoPlayerCtx();
  own(ctx, 'bot', 1);
  own(ctx, 'opp', 3);
  // Žeton se po odkupu staví až při příštím zastavení — stačí rezerva.
  ctx.players.get('bot').balance = 2400 + 2000;
  assert.equal(buyoutDecision(ctx, 3, 2400), 'buy');
  ctx.players.get('bot').balance -= 1;
  assert.equal(buyoutDecision(ctx, 3, 2400), 'decline');
});

test('odkup: postup ve stáji (zbytek je botův nebo volný) → koupí s rezervou a žetonem', () => {
  const ctx = twoPlayerCtx();
  own(ctx, 'bot', 6);
  own(ctx, 'opp', 8);                         // hnědá: 9 volný
  ctx.players.get('bot').balance = 4000 + 2000 + 1000;
  assert.equal(buyoutDecision(ctx, 8, 4000), 'buy');
  ctx.players.get('bot').balance -= 1;
  assert.equal(buyoutDecision(ctx, 8, 4000), 'decline');
});

test('odkup: když zbytek stáje drží i jiný soupeř, bot neodkupuje', () => {
  const ctx = twoPlayerCtx();
  addPlayer(ctx, makePlayer('opp2'));
  own(ctx, 'bot', 6);
  own(ctx, 'opp', 8);
  own(ctx, 'opp2', 9);
  assert.equal(buyoutDecision(ctx, 8, 4000), 'decline');
});

test('odkup: běžného koně (soupeř nemá celou stáj) bot neodkoupí', () => {
  const ctx = twoPlayerCtx();
  own(ctx, 'opp', 6, 8);                      // hnědá: soupeř 2 ze 3, 9 volný
  assert.equal(buyoutDecision(ctx, 6, 4000), 'decline');
});

// ─── Letiště → odkup ─────────────────────────────────────────────────────────

test('letiště: bot letí na soupeřova koně, jehož odkupem doplní stáj', () => {
  const ctx = twoPlayerCtx();
  ctx.config.buyoutMultiplier = 2;
  const bot = ctx.players.get('bot');
  bot.position = 20;
  bot.balance = 30000;
  own(ctx, 'bot', 37);
  own(ctx, 'opp', 39);                        // Napoli: odkup 16 000
  assert.equal(Bot.decideAirport(ctx, 'bot'), 39);
});

test('letiště: bez zapnutého odkupu na soupeřova koně nelétá', () => {
  const ctx = twoPlayerCtx();
  const bot = ctx.players.get('bot');
  bot.position = 20;
  bot.balance = 30000;
  own(ctx, 'bot', 37);
  own(ctx, 'opp', 39);
  assert.equal(Bot.decideAirport(ctx, 'bot'), null);
});

test('letiště: na odkup nelétá, když by po poplatku a nájmu nezbyla rezerva', () => {
  const ctx = twoPlayerCtx();
  ctx.config.buyoutMultiplier = 2;
  const bot = ctx.players.get('bot');
  bot.position = 20;
  own(ctx, 'bot', 37);
  own(ctx, 'opp', 39);
  // poplatek 2000 + nájem 1000 + odkup 16 000 + rezerva 2000
  bot.balance = 2000 + 1000 + 16000 + 2000;
  assert.equal(Bot.decideAirport(ctx, 'bot'), 39);
  bot.balance -= 1;
  assert.equal(Bot.decideAirport(ctx, 'bot'), null);
});
