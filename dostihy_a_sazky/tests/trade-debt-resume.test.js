'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const GameEngine = require('../src/GameEngine');

// Regrese: dříve, když hráč na tahu vystavil obchod ve `wait_roll`, pak hodil kostkou
// a dostal se do `debt_manage`, akceptace té frontované nabídky přepsala `pendingAction`
// (a `_resumeFn`) zpět na `wait_roll` — hráč po vyřešení dluhu znovu hodil kostkou.
test('akceptace frontovaného obchodu nepřepíše debt_manage iniciátora', () => {
  const engine = new GameEngine({ to: () => ({ emit: () => {} }) }, 'room-test');
  engine.phase = 'playing';
  engine.players.set('A', { id: 'A', name: 'A', position: 0, balance: -1000, properties: [1], bankrupt: false });
  engine.players.set('B', { id: 'B', name: 'B', position: 5, balance: 5000, properties: [3], bankrupt: false });
  engine.turnOrder = ['A', 'B'];
  engine.currentTurnIdx = 0;
  engine.ownerships = { 1: 'A', 3: 'B' };

  // Stav před akceptací: A už řeší dluh.
  engine.pendingAction = { type: 'debt_manage', targetId: 'A' };
  const originalResume = () => engine._addLog('original-resume');
  engine._resumeFn = originalResume;

  let scheduled = null;
  engine._broadcast = () => {};
  engine._scheduleAction = (delay, fn) => { scheduled = { delay, fn }; };

  // B přijme nabídku, kterou A vystavil ještě ve `wait_roll`. Decline pro izolaci od balance flow.
  engine._handleTradeOffer('B', 'decline', {
    fromId: 'A',
    offer: { horses: [], money: 0 },
    request: { horses: [], money: 0 },
    fromContext: 'wait_roll',
    turnPlayerId: 'A',
  });

  assert.equal(engine.pendingAction.type, 'debt_manage');
  assert.equal(engine.pendingAction.targetId, 'A');
  assert.equal(engine._resumeFn, originalResume, '_resumeFn nesmí být přepsán trade lambdou');
  assert.equal(scheduled, null, 'žádné nové _scheduleAction se nesmí naplánovat');
});

test('akceptace frontovaného obchodu nepřepíše card_ack jiného hráče', () => {
  const engine = new GameEngine({ to: () => ({ emit: () => {} }) }, 'room-test');
  engine.phase = 'playing';
  engine.players.set('A', { id: 'A', name: 'A', position: 0, balance: 5000, properties: [], bankrupt: false });
  engine.players.set('B', { id: 'B', name: 'B', position: 5, balance: 5000, properties: [], bankrupt: false });
  engine.turnOrder = ['A', 'B'];
  engine.currentTurnIdx = 0;

  // Po hodu A se objevil card_ack — pendingAction nesmí zmizet kvůli obchodu.
  engine.pendingAction = { type: 'card_ack', targetId: 'A', data: { card: { type: 'pay', amount: 100 } } };

  let scheduled = null;
  engine._broadcast = () => {};
  engine._scheduleAction = (delay, fn) => { scheduled = { delay, fn }; };

  engine._handleTradeOffer('B', 'decline', {
    fromId: 'A',
    offer: { horses: [], money: 0 },
    request: { horses: [], money: 0 },
    fromContext: 'wait_roll',
    turnPlayerId: 'A',
  });

  assert.equal(engine.pendingAction.type, 'card_ack');
  assert.equal(engine.pendingAction.targetId, 'A');
  assert.equal(scheduled, null);
});

test('akceptace obchodu obnoví wait_roll, pokud žádná pendingAction není', () => {
  const engine = new GameEngine({ to: () => ({ emit: () => {} }) }, 'room-test');
  engine.phase = 'playing';
  engine.players.set('A', { id: 'A', name: 'A', position: 0, balance: 5000, properties: [], bankrupt: false });
  engine.players.set('B', { id: 'B', name: 'B', position: 5, balance: 5000, properties: [], bankrupt: false });
  engine.turnOrder = ['A', 'B'];
  engine.currentTurnIdx = 0;

  engine.pendingAction = null;

  let scheduled = null;
  engine._broadcast = () => {};
  engine._scheduleAction = (delay, fn) => { scheduled = { delay, fn }; };

  engine._handleTradeOffer('B', 'decline', {
    fromId: 'A',
    offer: { horses: [], money: 0 },
    request: { horses: [], money: 0 },
    fromContext: 'wait_roll',
    turnPlayerId: 'A',
  });

  assert.equal(typeof scheduled.fn, 'function', 'restore lambda se musí naplánovat');

  scheduled.fn();
  assert.equal(engine.pendingAction.type, 'wait_roll');
  assert.equal(engine.pendingAction.targetId, 'A');
});

test('akceptace obchodu zachová jail_choice fromContext při prázdné pendingAction', () => {
  const engine = new GameEngine({ to: () => ({ emit: () => {} }) }, 'room-test');
  engine.phase = 'playing';
  engine.players.set('A', { id: 'A', name: 'A', position: 10, balance: 5000, properties: [], bankrupt: false, inJail: true });
  engine.players.set('B', { id: 'B', name: 'B', position: 5, balance: 5000, properties: [], bankrupt: false });
  engine.turnOrder = ['A', 'B'];
  engine.currentTurnIdx = 0;

  engine.pendingAction = null;

  let scheduled = null;
  engine._broadcast = () => {};
  engine._scheduleAction = (delay, fn) => { scheduled = { delay, fn }; };

  engine._handleTradeOffer('B', 'decline', {
    fromId: 'A',
    offer: { horses: [], money: 0 },
    request: { horses: [], money: 0 },
    fromContext: 'jail_choice',
    turnPlayerId: 'A',
  });

  scheduled.fn();
  assert.equal(engine.pendingAction.type, 'jail_choice');
  assert.equal(engine.pendingAction.targetId, 'A');
});

test('akceptace obchodu posune tah, pokud turnPlayer mezitím zbankrotoval', () => {
  const engine = new GameEngine({ to: () => ({ emit: () => {} }) }, 'room-test');
  engine.phase = 'playing';
  engine.players.set('A', { id: 'A', name: 'A', position: 0, balance: -1, properties: [], bankrupt: true });
  engine.players.set('B', { id: 'B', name: 'B', position: 5, balance: 5000, properties: [], bankrupt: false });
  engine.turnOrder = ['B'];
  engine.currentTurnIdx = 0;

  engine.pendingAction = null;

  let advanced = false;
  engine._broadcast = () => {};
  engine._scheduleAction = (_delay, fn) => fn();
  engine._advanceTurn = () => { advanced = true; };

  engine._handleTradeOffer('B', 'decline', {
    fromId: 'A',
    offer: { horses: [], money: 0 },
    request: { horses: [], money: 0 },
    fromContext: 'wait_roll',
    turnPlayerId: 'A',
  });

  assert.equal(advanced, true);
});
