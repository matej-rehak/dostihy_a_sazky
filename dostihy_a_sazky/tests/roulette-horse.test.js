'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const GameEngine = require('../src/GameEngine');
const BOARD = require('../src/data/boardData');
const { OUTCOMES } = require('../src/Roulette');

const FANTOME = 1;
const GAVORA = 3;
const AUCTION = OUTCOMES.find(o => o.id === 'auction');

function makeEngine(outcomeId) {
  const engine = new GameEngine({ to: () => ({ emit: () => {} }) }, 'room-test');
  engine._broadcast = () => {};
  engine._scheduleAction = (delay, fn) => fn();
  engine.phase = 'playing';
  engine.config.field30Mode = 'roulette';

  ['A', 'B'].forEach(id => {
    engine.players.set(id, {
      id, socketId: `sock-${id}`, name: id, color: '#fff', isHost: false,
      position: 0, balance: 30000, bankrupt: false, inJail: false, jailTurns: 0,
      skipTurns: 0, properties: [], rollAccumulator: 0, moveDirection: 1,
      jailFreeCards: 0, ready: true, disconnected: false, canFly: false, left: false,
      pendingBet: null, doubleRent: 0, rentImmunity: 0, halfPriceNext: false, tokenStrike: 0,
    });
  });
  engine.turnOrder = ['A', 'B'];
  engine.currentTurnIdx = 0;

  const idx = OUTCOMES.findIndex(o => o.id === outcomeId);
  engine._rouletteRnd = () => (idx + 0.5) / OUTCOMES.length;
  return engine;
}

function spinAndAck(engine) {
  engine.players.get('A').position = 30;
  engine._evaluateSpace('A');
  engine.handleRespond({ playerId: 'A', emit: () => {} }, {});
}

test('dražba nabídne volné koně s přirážkou 50 %', () => {
  const engine = makeEngine('auction');
  engine.ownerships[GAVORA] = 'B';
  spinAndAck(engine);

  assert.equal(engine.pendingAction.type, 'roulette_pick_horse');
  const option = engine.pendingAction.data.options.find(o => o.spaceId === FANTOME);
  const expected = Math.round(BOARD[FANTOME].price * (1 + AUCTION.surchargePct / 100));
  assert.equal(option.price, expected);
  // obsazený kůň v nabídce být nesmí
  assert.equal(engine.pendingAction.data.options.some(o => o.spaceId === GAVORA), false);
});

test('dražba převede koně a strhne cenu s přirážkou', () => {
  const engine = makeEngine('auction');
  spinAndAck(engine);
  const price = engine.pendingAction.data.options.find(o => o.spaceId === FANTOME).price;
  engine.handleRespond({ playerId: 'A', emit: () => {} }, { decision: FANTOME });

  assert.equal(engine.ownerships[FANTOME], 'A');
  assert.equal(engine.players.get('A').balance, 30000 - price);
});

test('dražba nespotřebuje přednostní právo', () => {
  const engine = makeEngine('auction');
  engine.players.get('A').halfPriceNext = true;
  spinAndAck(engine);
  engine.handleRespond({ playerId: 'A', emit: () => {} }, { decision: FANTOME });

  assert.equal(engine.players.get('A').halfPriceNext, true);
});

test('odmítnutá dražba efekt spotřebuje a tah pokračuje', () => {
  const engine = makeEngine('auction');
  spinAndAck(engine);
  engine.handleRespond({ playerId: 'A', emit: () => {} }, { decision: 'decline' });

  assert.equal(engine.ownerships[FANTOME], undefined);
  assert.notEqual(engine.pendingAction?.type, 'roulette_pick_horse');
});

test('nabídnou se jen koně, na které hráč má', () => {
  const engine = makeEngine('auction');
  engine.players.get('A').balance = 1900; // Fantome 1200 → 1800 ano, Lady Anne 2000 → 3000 ne
  spinAndAck(engine);

  const ids = engine.pendingAction.data.options.map(o => o.spaceId);
  assert.ok(ids.includes(FANTOME));
  assert.equal(ids.includes(6), false, 'Lady Anne je nad rozpočet');
});

test('dostih zdarma položí žeton bez placení', () => {
  const engine = makeEngine('free_token');
  [FANTOME, GAVORA].forEach(sid => {
    engine.ownerships[sid] = 'A';
    engine.players.get('A').properties.push(sid);
  });
  spinAndAck(engine);
  engine.handleRespond({ playerId: 'A', emit: () => {} }, { decision: FANTOME });

  assert.equal(engine.tokens[FANTOME].small, 1);
  assert.equal(engine.players.get('A').balance, 30000, 'žeton musí být zdarma');
});

test('bez úplné stáje dostih zdarma propadne', () => {
  const engine = makeEngine('free_token');
  engine.ownerships[FANTOME] = 'A';
  engine.players.get('A').properties.push(FANTOME);
  spinAndAck(engine);

  assert.notEqual(engine.pendingAction?.type, 'roulette_pick_horse');
  assert.equal(engine.tokens[FANTOME], undefined);
});

test('dražba propadne, pokud hráč mezi otevřením a odpovědí zchudl (schválená obchodem)', () => {
  const engine = makeEngine('auction');
  spinAndAck(engine);
  const price = engine.pendingAction.data.options.find(o => o.spaceId === FANTOME).price;
  // simuluje, že hráč mezitím utratil peníze (např. přijetím obchodu) a na koně už nemá
  engine.players.get('A').balance = price - 1;
  engine.handleRespond({ playerId: 'A', emit: () => {} }, { decision: FANTOME });

  assert.equal(engine.ownerships[FANTOME], undefined);
  assert.equal(engine.players.get('A').balance, price - 1);
  assert.notEqual(engine.pendingAction?.type, 'roulette_pick_horse');
});

test('dražba propadne, pokud koně mezitím koupil někdo jiný', () => {
  const engine = makeEngine('auction');
  spinAndAck(engine);
  // simuluje, že koně mezitím získal jiný hráč (např. kartou) dřív, než A odpověděl(a)
  engine.ownerships[FANTOME] = 'B';
  engine.handleRespond({ playerId: 'A', emit: () => {} }, { decision: FANTOME });

  assert.equal(engine.ownerships[FANTOME], 'B');
  assert.equal(engine.players.get('A').balance, 30000);
  assert.notEqual(engine.pendingAction?.type, 'roulette_pick_horse');
});

test('dostih zdarma propadne, pokud hráč mezitím přišel o koně', () => {
  const engine = makeEngine('free_token');
  [FANTOME, GAVORA].forEach(sid => {
    engine.ownerships[sid] = 'A';
    engine.players.get('A').properties.push(sid);
  });
  spinAndAck(engine);
  // simuluje, že mezitím proběhl obchod a kůň už A nepatří
  engine.ownerships[FANTOME] = 'B';
  engine.players.get('A').properties = engine.players.get('A').properties.filter(sid => sid !== FANTOME);
  engine.handleRespond({ playerId: 'A', emit: () => {} }, { decision: FANTOME });

  assert.equal(engine.tokens[FANTOME], undefined);
  assert.notEqual(engine.pendingAction?.type, 'roulette_pick_horse');
});

test('dostih zdarma propadne, pokud stáj mezitím přestala být úplná', () => {
  const engine = makeEngine('free_token');
  [FANTOME, GAVORA].forEach(sid => {
    engine.ownerships[sid] = 'A';
    engine.players.get('A').properties.push(sid);
  });
  spinAndAck(engine);
  // simuluje ztrátu druhého koně ze stáje mezi otevřením promptu a odpovědí
  engine.ownerships[GAVORA] = 'B';
  engine.players.get('A').properties = engine.players.get('A').properties.filter(sid => sid !== GAVORA);
  engine.handleRespond({ playerId: 'A', emit: () => {} }, { decision: FANTOME });

  assert.equal(engine.tokens[FANTOME], undefined);
  assert.notEqual(engine.pendingAction?.type, 'roulette_pick_horse');
});

test('dostih zdarma propadne, pokud mezitím žetony dosáhly stropu', () => {
  const engine = makeEngine('free_token');
  [FANTOME, GAVORA].forEach(sid => {
    engine.ownerships[sid] = 'A';
    engine.players.get('A').properties.push(sid);
  });
  spinAndAck(engine);
  // simuluje, že hráč mezitím sám doplnil žeton na plný počet (4 malé)
  engine.tokens[FANTOME] = { small: 4, big: false };
  engine.handleRespond({ playerId: 'A', emit: () => {} }, { decision: FANTOME });

  assert.equal(engine.tokens[FANTOME].small, 4);
  assert.notEqual(engine.pendingAction?.type, 'roulette_pick_horse');
});
