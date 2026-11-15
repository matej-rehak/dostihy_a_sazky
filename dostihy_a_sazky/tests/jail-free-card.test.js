'use strict';

// Karta „Zrušen distanc": ve hře je jen jedna. Dokud ji někdo drží, nedá se
// znovu líznout (ani po zamíchání balíčku); vrací se do balíčku po použití
// nebo bankrotu majitele. Hráči s ní můžou obchodovat.

const test = require('node:test');
const assert = require('node:assert/strict');

const GameEngine = require('../src/GameEngine');
const { NahodaDeck } = require('../src/Cards');

const FANTOME = 1;

const isJail = c => c?.type === 'jail_free_card';

function makeEngine() {
  const engine = new GameEngine({ to: () => ({ emit: () => {} }) }, 'room-test');
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
  return engine;
}

function socketOf(pid) {
  const errors = [];
  return { playerId: pid, id: `sock-${pid}`, emit: (name, data) => { if (name === 'game:error') errors.push(data.message); }, errors };
}

/** Lízne kartu „Zrušen distanc" z balíčku enginu a dá ji hráči `pid`. */
function giveCard(engine, pid) {
  const deck = engine.nahodaCards;
  for (let i = 0; i < 100; i++) {
    const card = deck.draw();
    if (isJail(card)) {
      engine._applyCard(pid, card);
      return;
    }
    // Jinou drženou kartu („Opakovaný hod") nikdo nedostal — zpět do balíčku.
    if (card?.keep) deck.returnCard(card.type);
  }
  throw new Error('karta Zrušen distanc se nedala líznout');
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

// ─── Balíček ─────────────────────────────────────────────────────────────────

test('balíček obsahuje kartu Zrušen distanc právě jednou', () => {
  const deck = NahodaDeck();
  assert.equal(deck.original.filter(isJail).length, 1);
});

test('držená karta se po zamíchání balíčku znovu nelízne', () => {
  const deck = NahodaDeck();
  let drawn = 0;
  // Projde balíček desetkrát dokola, tedy přes mnoho zamíchání.
  for (let i = 0; i < deck.original.length * 10; i++) {
    if (isJail(deck.draw())) drawn++;
  }
  assert.equal(drawn, 1, 'karta se lízla víckrát, i když ji hráč drží');
});

test('vrácená karta jde na spodek balíčku a dá se znovu líznout', () => {
  const deck = NahodaDeck();
  while (!isJail(deck.draw())) { /* líznout, dokud nepřijde */ }
  assert.equal(deck.returnCard('jail_free_card'), true);
  assert.equal(isJail(deck.pile[0]), true, 'vrácená karta má být na spodku');
  assert.equal(deck.pile.filter(isJail).length, 1);
  assert.equal(deck.returnCard('jail_free_card'), false, 'podruhé už není co vracet');
});

test('debug vynucení karty ji nezdvojí ani nevytáhne, když ji někdo drží', () => {
  const deck = NahodaDeck();
  const idx = deck.original.findIndex(isJail);
  deck.forceDraw(idx);
  deck.forceDraw(idx);
  assert.equal(deck.pile.filter(isJail).length, 1);
  assert.equal(isJail(deck.draw()), true);
  deck.forceDraw(idx); // teď ji někdo drží
  assert.equal(deck.pile.filter(isJail).length, 0);
});

// ─── Návrat do balíčku ────────────────────────────────────────────────────────

test('použitím karty v Distancu se karta vrací do balíčku', () => {
  const engine = makeEngine();
  giveCard(engine, 'A');
  assert.equal(engine.players.get('A').jailFreeCards, 1);
  assert.equal(engine.nahodaCards.held.size, 1);

  const a = engine.players.get('A');
  a.inJail = true;
  a.jailTurns = 3;
  engine.pendingAction = { type: 'jail_choice', targetId: 'A' };
  engine.handleRespond(socketOf('A'), { decision: 'use_jail_card' });

  assert.equal(a.inJail, false);
  assert.equal(a.jailFreeCards, 0);
  assert.equal(engine.nahodaCards.held.size, 0);
  assert.equal(engine.nahodaCards.pile.filter(isJail).length, 1);
});

test('bankrotem majitele se karta vrací do balíčku', () => {
  const engine = makeEngine();
  giveCard(engine, 'B');
  engine._declareBankrupt('B');
  assert.equal(engine.players.get('B').jailFreeCards, 0);
  assert.equal(engine.nahodaCards.held.size, 0);
  assert.equal(engine.nahodaCards.pile.filter(isJail).length, 1);
});

// ─── Obchod ──────────────────────────────────────────────────────────────────

test('kartu lze prodat — přijetím přejde k druhému hráči', () => {
  const engine = makeEngine();
  giveCard(engine, 'A');
  const { socket, trade } = propose(engine, 'A', 'B', { jailCard: true }, { money: 2000 });
  assert.deepEqual(socket.errors, []);
  assert.equal(trade.offer.jailCard, true);

  engine.handleRespond(socketOf('B'), { decision: 'accept', tradeOfferId: trade.id });

  assert.equal(engine.players.get('A').jailFreeCards, 0);
  assert.equal(engine.players.get('B').jailFreeCards, 1);
  assert.equal(engine.players.get('A').balance, 32000);
  assert.equal(engine.players.get('B').balance, 28000);
  // Karta jen změnila majitele — v balíčku pořád není.
  assert.equal(engine.nahodaCards.held.size, 1);
  assert.equal(engine.nahodaCards.pile.filter(isJail).length, 0);
});

test('kartu lze od soupeře koupit (žádat)', () => {
  const engine = makeEngine();
  giveCard(engine, 'B');
  engine.ownerships[FANTOME] = 'A';
  engine.players.get('A').properties.push(FANTOME);
  const { trade } = propose(engine, 'A', 'B', { horses: [FANTOME] }, { jailCard: true });

  engine.handleRespond(socketOf('B'), { decision: 'accept', tradeOfferId: trade.id });

  assert.equal(engine.players.get('A').jailFreeCards, 1);
  assert.equal(engine.players.get('B').jailFreeCards, 0);
  assert.equal(engine.ownerships[FANTOME], 'B');
});

test('nabídnout ani žádat kartu, kterou strana nemá, nejde', () => {
  const engine = makeEngine();
  const offered = propose(engine, 'A', 'B', { jailCard: true }, { money: 100 });
  assert.equal(offered.socket.errors.length, 1);

  const requested = propose(engine, 'A', 'B', { money: 100 }, { jailCard: true });
  assert.equal(requested.socket.errors.length, 1);
  assert.equal(engine.tradeOffers.length, 0);
});

test('veřejná nabídka nemůže kartu žádat, ale může ji nabízet', () => {
  const engine = makeEngine();
  giveCard(engine, 'A');
  const bad = propose(engine, 'A', 'public', {}, { jailCard: true });
  assert.equal(bad.socket.errors.length, 1);

  const ok = propose(engine, 'A', 'public', { jailCard: true }, { money: 1500 });
  assert.deepEqual(ok.socket.errors, []);
  engine.handleRespond(socketOf('C'), { decision: 'accept', tradeOfferId: ok.trade.id });
  assert.equal(engine.players.get('C').jailFreeCards, 1);
  assert.equal(engine.players.get('A').jailFreeCards, 0);
});

test('obchod se zruší, když karta mezitím zmizela (byla použita)', () => {
  const engine = makeEngine();
  giveCard(engine, 'A');
  const { trade } = propose(engine, 'A', 'B', { jailCard: true }, { money: 2000 });

  // A kartu mezitím použije
  const a = engine.players.get('A');
  a.jailFreeCards = 0;
  engine.nahodaCards.returnCard('jail_free_card');

  engine.handleRespond(socketOf('B'), { decision: 'accept', tradeOfferId: trade.id });

  assert.equal(engine.players.get('B').jailFreeCards, 0, 'karta se nesmí vyrobit z ničeho');
  assert.equal(engine.players.get('B').balance, 30000, 'peníze se nesmí převést');
  assert.equal(engine.players.get('A').balance, 30000);
});

test('protinabídka může kartu obsahovat', () => {
  const engine = makeEngine();
  giveCard(engine, 'B');
  const { trade } = propose(engine, 'A', 'B', { money: 500 }, {});

  engine.handleRespond(socketOf('B'), {
    decision: 'counter', tradeOfferId: trade.id,
    offer: { horses: [], money: 0, jailCard: true },
    request: { horses: [], money: 2500 },
  });

  const counter = engine.tradeOffers.find(o => o.fromId === 'B');
  assert.ok(counter, 'protinabídka chybí');
  assert.equal(counter.offer.jailCard, true);

  engine.handleRespond(socketOf('A'), { decision: 'accept', tradeOfferId: counter.id });
  assert.equal(engine.players.get('A').jailFreeCards, 1);
  assert.equal(engine.players.get('B').jailFreeCards, 0);
});

test('protinabídka s kartou, kterou hráč nemá, se zamítne', () => {
  const engine = makeEngine();
  const { trade } = propose(engine, 'A', 'B', { money: 500 }, {});

  engine.handleRespond(socketOf('B'), {
    decision: 'counter', tradeOfferId: trade.id,
    offer: { horses: [], money: 0, jailCard: true },
    request: { horses: [], money: 0 },
  });

  assert.equal(engine.tradeOffers.find(o => o.fromId === 'B'), undefined);
});
