'use strict';

// Obchod mezi hráči: návrh (initiateTrade), přijetí / odmítnutí / protinabídka
// (_handleTradeResponse → _handleTradeOffer) a zrušení zastaralých nabídek.
// Návaznost na dluh a stav tahu hlídá tests/trade-debt-resume.test.js.

const test = require('node:test');
const assert = require('node:assert/strict');

const GameEngine = require('../src/GameEngine');

const FANTOME = 1;   // oranžová stáj (1, 3)
const GAVORA = 3;
const LADY_ANNE = 6; // hnědá stáj (6, 8, 9)
const TRENER = 5;    // služba

function makeEngine() {
  const events = [];
  const engine = new GameEngine({ to: () => ({ emit: (name, data) => events.push({ name, data }) }) }, 'room-test');
  engine._broadcast = () => {};
  engine._scheduleAction = (delay, fn) => fn && fn();
  engine.phase = 'playing';
  ['A', 'B', 'C'].forEach(id => {
    engine.players.set(id, {
      id, socketId: `sock-${id}`, name: id, color: '#fff', isHost: false,
      position: 0, balance: 30000, bankrupt: false, inJail: false, jailTurns: 0,
      skipTurns: 0, properties: [], rollAccumulator: 0, moveDirection: 1,
      jailFreeCards: 0, ready: true, disconnected: false, canFly: false, left: false,
      pendingBet: null, halfPriceNext: false, canSpin: false,
    });
  });
  engine.turnOrder = ['A', 'B', 'C'];
  engine.currentTurnIdx = 0;
  engine.pendingAction = { type: 'wait_roll', targetId: 'A' };
  engine.events = events;
  return engine;
}

function own(engine, pid, ...sids) {
  sids.forEach(sid => {
    engine.ownerships[sid] = pid;
    engine.players.get(pid).properties.push(sid);
  });
}

/** Socket, který si pamatuje chyby poslané hráči. */
function socketOf(pid) {
  const errors = [];
  return { playerId: pid, id: `sock-${pid}`, emit: (name, data) => { if (name === 'game:error') errors.push(data.message); }, errors };
}

function propose(engine, fromId, targetId, offer = {}, request = {}) {
  const socket = socketOf(fromId);
  engine.initiateTrade(socket, {
    targetId,
    offer: { horses: [], money: 0, ...offer },
    request: { horses: [], money: 0, ...request },
  });
  return { socket, trade: engine.tradeOffers[engine.tradeOffers.length - 1] };
}

function respond(engine, pid, trade, decision, extra = {}) {
  engine.handleRespond(socketOf(pid), { decision, tradeOfferId: trade.id, ...extra });
}

const bal = (engine, pid) => engine.players.get(pid).balance;
const props = (engine, pid) => [...engine.players.get(pid).properties].sort((a, b) => a - b);

// ─── Přijetí a odmítnutí ──────────────────────────────────────────────────────

test('přijetí přesune koně i peníze oběma směry a nabídku odstraní', () => {
  const engine = makeEngine();
  own(engine, 'A', FANTOME);
  own(engine, 'B', LADY_ANNE);
  const { trade } = propose(engine, 'A', 'B', { horses: [FANTOME], money: 1000 }, { horses: [LADY_ANNE], money: 300 });

  respond(engine, 'B', trade, 'accept');

  assert.equal(engine.ownerships[FANTOME], 'B');
  assert.equal(engine.ownerships[LADY_ANNE], 'A');
  assert.deepEqual(props(engine, 'A'), [LADY_ANNE]);
  assert.deepEqual(props(engine, 'B'), [FANTOME]);
  assert.equal(bal(engine, 'A'), 30000 - 1000 + 300);
  assert.equal(bal(engine, 'B'), 30000 + 1000 - 300);
  assert.equal(engine.tradeOffers.length, 0);
});

test('odmítnutí nic nezmění a nabídku odstraní', () => {
  const engine = makeEngine();
  own(engine, 'A', FANTOME);
  const { trade } = propose(engine, 'A', 'B', { horses: [FANTOME] }, { money: 2000 });

  respond(engine, 'B', trade, 'decline');

  assert.equal(engine.ownerships[FANTOME], 'A');
  assert.equal(bal(engine, 'A'), 30000);
  assert.equal(bal(engine, 'B'), 30000);
  assert.equal(engine.tradeOffers.length, 0);
});

test('služby se dají vyměnit stejně jako koně', () => {
  const engine = makeEngine();
  own(engine, 'A', TRENER);
  const { trade } = propose(engine, 'A', 'B', { horses: [TRENER] }, { money: 3000 });
  respond(engine, 'B', trade, 'accept');
  assert.equal(engine.ownerships[TRENER], 'B');
  assert.equal(bal(engine, 'A'), 33000);
});

test('žetony zůstanou na koni i u nového majitele', () => {
  const engine = makeEngine();
  own(engine, 'A', FANTOME);
  engine.tokens[FANTOME] = { small: 2, big: false };
  const { trade } = propose(engine, 'A', 'B', { horses: [FANTOME] });
  respond(engine, 'B', trade, 'accept');
  assert.deepEqual(engine.tokens[FANTOME], { small: 2, big: false });
});

test('obchod, který doplní stáj, ohlásí dokončenou stáj novému majiteli', () => {
  const engine = makeEngine();
  own(engine, 'A', FANTOME);
  own(engine, 'B', GAVORA);
  const { trade } = propose(engine, 'A', 'B', { horses: [FANTOME] });
  respond(engine, 'B', trade, 'accept');

  const done = engine.events.find(e => e.name === 'game_event' && e.data.type === 'stable_completed');
  assert.ok(done, 'chybí stable_completed');
  assert.equal(done.data.pid, 'B');
});

// ─── Kontroly při návrhu ─────────────────────────────────────────────────────

test('nejde nabídnout koně, kterého nemám', () => {
  const engine = makeEngine();
  own(engine, 'B', FANTOME);
  const { socket } = propose(engine, 'A', 'B', { horses: [FANTOME] });
  assert.equal(engine.tradeOffers.length, 0);
  assert.equal(socket.errors.length, 1);
});

test('nejde nabídnout víc peněz, než mám', () => {
  const engine = makeEngine();
  const { socket } = propose(engine, 'A', 'B', { money: 30001 });
  assert.equal(engine.tradeOffers.length, 0);
  assert.equal(socket.errors.length, 1);
});

test('nejde žádat koně, kterého soupeř nemá', () => {
  const engine = makeEngine();
  own(engine, 'C', LADY_ANNE);
  const { socket } = propose(engine, 'A', 'B', {}, { horses: [LADY_ANNE] });
  assert.equal(engine.tradeOffers.length, 0);
  assert.equal(socket.errors.length, 1);
});

test('nejde obchodovat sám se sebou ani s bankrotářem', () => {
  const engine = makeEngine();
  engine.players.get('C').bankrupt = true;
  assert.equal(propose(engine, 'A', 'A', { money: 100 }).socket.errors.length, 1);
  assert.equal(propose(engine, 'A', 'C', { money: 100 }).socket.errors.length, 1);
  assert.equal(engine.tradeOffers.length, 0);
});

test('mimo svůj tah obchod navrhnout nejde', () => {
  const engine = makeEngine();
  const { socket } = propose(engine, 'B', 'A', { money: 100 });
  assert.equal(engine.tradeOffers.length, 0);
  assert.equal(socket.errors.length, 1);
});

test('záporné nebo nesmyslné částky se berou jako 0', () => {
  const engine = makeEngine();
  own(engine, 'A', FANTOME);
  const { trade } = propose(engine, 'A', 'B', { horses: [FANTOME], money: -5000 }, { money: 'hodně' });
  assert.equal(trade.offer.money, 0);
  assert.equal(trade.request.money, 0);
  respond(engine, 'B', trade, 'accept');
  assert.equal(bal(engine, 'A'), 30000);
  assert.equal(bal(engine, 'B'), 30000);
});

test('nová nabídka stejnému hráči nahradí tu předchozí', () => {
  const engine = makeEngine();
  propose(engine, 'A', 'B', { money: 100 });
  propose(engine, 'A', 'B', { money: 200 });
  assert.equal(engine.tradeOffers.length, 1);
  assert.equal(engine.tradeOffers[0].offer.money, 200);
});

// ─── Kdo smí odpovědět ───────────────────────────────────────────────────────

test('na cílenou nabídku smí odpovědět jen její příjemce', () => {
  const engine = makeEngine();
  own(engine, 'A', FANTOME);
  const { trade } = propose(engine, 'A', 'B', { horses: [FANTOME] });
  respond(engine, 'C', trade, 'accept');
  respond(engine, 'A', trade, 'accept');
  assert.equal(engine.ownerships[FANTOME], 'A');
  assert.equal(engine.tradeOffers.length, 1, 'nabídka musí zůstat pro B');
});

test('veřejnou nabídku přijme kdokoli kromě autora', () => {
  const engine = makeEngine();
  own(engine, 'A', FANTOME);
  const { trade, socket } = propose(engine, 'A', 'public', { horses: [FANTOME] }, { money: 1500 });
  assert.equal(socket.errors.length, 0);
  assert.equal(trade.targetId, null);

  respond(engine, 'A', trade, 'accept');
  assert.equal(engine.ownerships[FANTOME], 'A', 'autor si vlastní nabídku přijmout nesmí');

  respond(engine, 'C', trade, 'accept');
  assert.equal(engine.ownerships[FANTOME], 'C');
  assert.equal(bal(engine, 'C'), 28500);
  assert.equal(bal(engine, 'A'), 31500);
});

test('veřejná nabídka nesmí žádat koně', () => {
  const engine = makeEngine();
  own(engine, 'B', LADY_ANNE);
  const { socket } = propose(engine, 'A', 'public', { money: 100 }, { horses: [LADY_ANNE] });
  assert.equal(engine.tradeOffers.length, 0);
  assert.equal(socket.errors.length, 1);
});

// ─── Protinabídka ────────────────────────────────────────────────────────────

test('protinabídka nahradí původní nabídku opačnou a po přijetí platí její podmínky', () => {
  const engine = makeEngine();
  own(engine, 'A', FANTOME);
  own(engine, 'B', LADY_ANNE);
  const { trade } = propose(engine, 'A', 'B', { horses: [FANTOME] }, { horses: [LADY_ANNE] });

  // B chce za Lady Anne ještě 500 Kč navíc
  respond(engine, 'B', trade, 'counter', {
    offer: { horses: [LADY_ANNE], money: 0 },
    request: { horses: [FANTOME], money: 500 },
  });

  assert.equal(engine.tradeOffers.length, 1);
  const counter = engine.tradeOffers[0];
  assert.notEqual(counter.id, trade.id);
  assert.equal(counter.fromId, 'B');
  assert.equal(counter.targetId, 'A');
  assert.equal(engine.ownerships[FANTOME], 'A', 'protinabídka sama nic nepřevádí');

  respond(engine, 'A', counter, 'accept');
  assert.equal(engine.ownerships[FANTOME], 'B');
  assert.equal(engine.ownerships[LADY_ANNE], 'A');
  assert.equal(bal(engine, 'A'), 29500);
  assert.equal(bal(engine, 'B'), 30500);
});

test('neplatná protinabídka (cizí kůň) se bere jako odmítnutí', () => {
  const engine = makeEngine();
  own(engine, 'A', FANTOME);
  own(engine, 'C', LADY_ANNE);
  const { trade } = propose(engine, 'A', 'B', { horses: [FANTOME] });

  respond(engine, 'B', trade, 'counter', {
    offer: { horses: [LADY_ANNE], money: 0 },   // B Lady Anne nevlastní
    request: { horses: [FANTOME], money: 0 },
  });

  assert.equal(engine.tradeOffers.length, 0);
  assert.equal(engine.ownerships[FANTOME], 'A');
  assert.equal(engine.ownerships[LADY_ANNE], 'C');
});

// ─── Změny mezi návrhem a odpovědí ───────────────────────────────────────────

test('když příjemce mezitím nemá na požadované peníze, obchod se zruší', () => {
  const engine = makeEngine();
  own(engine, 'A', FANTOME);
  const { trade } = propose(engine, 'A', 'B', { horses: [FANTOME] }, { money: 5000 });
  engine.players.get('B').balance = 4000;

  respond(engine, 'B', trade, 'accept');

  assert.equal(engine.ownerships[FANTOME], 'A');
  assert.equal(bal(engine, 'A'), 30000);
  assert.equal(bal(engine, 'B'), 4000);
});

test('když autor mezitím nemá na nabízené peníze, obchod se zruší', () => {
  const engine = makeEngine();
  own(engine, 'B', LADY_ANNE);
  const { trade } = propose(engine, 'A', 'B', { money: 5000 }, { horses: [LADY_ANNE] });
  engine.players.get('A').balance = 1000;

  respond(engine, 'B', trade, 'accept');

  assert.equal(engine.ownerships[LADY_ANNE], 'B');
  assert.equal(bal(engine, 'A'), 1000);
  assert.equal(bal(engine, 'B'), 30000);
});

test('prodaný kůň zruší všechny nabídky, ve kterých figuruje', () => {
  const engine = makeEngine();
  own(engine, 'A', FANTOME);
  propose(engine, 'A', 'B', { horses: [FANTOME] });
  propose(engine, 'A', 'C', { horses: [FANTOME] });
  assert.equal(engine.tradeOffers.length, 2);

  engine._sellProperty('A', FANTOME);

  assert.equal(engine.tradeOffers.length, 0);
});

test('bankrot hráče zruší jeho nabídky', () => {
  const engine = makeEngine();
  propose(engine, 'A', 'B', { money: 100 });
  engine._declareBankrupt('A');
  assert.equal(engine.tradeOffers.length, 0);
});

test('přijetí jedné nabídky zruší ostatní nabídky se stejným koněm', () => {
  const engine = makeEngine();
  own(engine, 'A', FANTOME);
  const { trade: toB } = propose(engine, 'A', 'B', { horses: [FANTOME] }, { money: 1000 });
  propose(engine, 'A', 'C', { horses: [FANTOME] }, { money: 1200 });

  respond(engine, 'B', toB, 'accept');

  assert.equal(engine.ownerships[FANTOME], 'B');
  assert.equal(engine.tradeOffers.length, 0, 'nabídka pro C už nemá čím platit');
});

/**
 * Regrese: _handleTradeResponse kontroloval jen příjemce a autora, ne to, jestli
 * odpovídající hráč ještě hraje. Zbankrotovaný (ale připojený) hráč tak mohl
 * přijmout veřejnou nabídku a kůň skončil u hráče mimo hru — pro zbytek hry ztracený.
 */
test('zbankrotovaný hráč veřejnou nabídku nepřijme a nabídka zůstane ostatním', () => {
  const engine = makeEngine();
  own(engine, 'A', FANTOME);
  const { trade } = propose(engine, 'A', 'public', { horses: [FANTOME] });
  engine._declareBankrupt('C');

  respond(engine, 'C', trade, 'accept');

  assert.equal(engine.ownerships[FANTOME], 'A');
  assert.equal(engine.tradeOffers.length, 1, 'nabídka musí zůstat pro ostatní hráče');

  respond(engine, 'B', trade, 'accept');
  assert.equal(engine.ownerships[FANTOME], 'B');
});
