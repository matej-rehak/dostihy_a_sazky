'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const GameEngine = require('../src/GameEngine');
const { spinRoulette } = require('./helpers/roulette');
const BOARD = require('../src/data/boardData');
const { rndFor, GIFT_FALLBACK_FINE } = require('../src/Roulette');

const FANTOME = 1;
const GAVORA = 3;
const LADY_ANNE = 6;

function makeEngine(outcomeId) {
  const engine = new GameEngine({ to: () => ({ emit: () => {} }) }, 'room-test');
  engine._broadcast = () => {};
  engine._scheduleAction = (delay, fn) => fn();
  engine.phase = 'playing';
  engine.config.field30Mode = 'roulette';
  engine.config.rouletteFee = 0;   // točí se hned, bez volby zaplatit

  ['A', 'B'].forEach(id => {
    engine.players.set(id, {
      id, socketId: `sock-${id}`, name: id, color: '#fff', isHost: false,
      position: 0, balance: 30000, bankrupt: false, inJail: false, jailTurns: 0,
      skipTurns: 0, properties: [], rollAccumulator: 0, moveDirection: 1,
      jailFreeCards: 0, ready: true, disconnected: false, canFly: false, left: false,
      pendingBet: null, halfPriceNext: false,
    });
  });
  engine.turnOrder = ['A', 'B'];
  engine.currentTurnIdx = 0;

  engine._rouletteRnd = () => rndFor(outcomeId);
  return engine;
}

function spinAndAck(engine) {
  spinRoulette(engine);
  engine.handleRespond({ playerId: 'A', emit: () => {} }, { decision: 'ack' });
}

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

// ─── Daruješ koně ───────────────────────────────────────────────────────────

function own(engine, pid, ...sids) {
  sids.forEach(sid => {
    engine.ownerships[sid] = pid;
    engine.players.get(pid).properties.push(sid);
  });
}

test('dar koně nabídne vlastní koně a soupeře', () => {
  const engine = makeEngine('give_horse');
  own(engine, 'A', FANTOME, 5);   // 5 = služba, darovat se nedá
  spinAndAck(engine);

  assert.equal(engine.pendingAction.type, 'roulette_give_horse');
  assert.deepEqual(engine.pendingAction.data.options, [FANTOME]);
  assert.deepEqual(engine.pendingAction.data.candidates, ['B']);
});

test('dar převede zvoleného koně zvolenému soupeři i se žetony', () => {
  const engine = makeEngine('give_horse');
  own(engine, 'A', FANTOME, LADY_ANNE);
  engine.tokens[LADY_ANNE] = { small: 2, big: false };
  spinAndAck(engine);
  engine.handleRespond({ playerId: 'A', emit: () => {} }, { decision: 'B', spaceId: LADY_ANNE });

  assert.equal(engine.ownerships[LADY_ANNE], 'B');
  assert.deepEqual(engine.players.get('A').properties, [FANTOME]);
  assert.deepEqual(engine.players.get('B').properties, [LADY_ANNE]);
  assert.deepEqual(engine.tokens[LADY_ANNE], { small: 2, big: false });
  assert.equal(engine.players.get('A').balance, 30000, 'dar se neplatí');
});

test('neplatná volba daru se nahradí — špatná výseč se nedá obejít', () => {
  const engine = makeEngine('give_horse');
  own(engine, 'A', FANTOME, LADY_ANNE);
  spinAndAck(engine);
  // cizí kůň a neexistující hráč
  engine.handleRespond({ playerId: 'A', emit: () => {} }, { decision: 'X', spaceId: 39 });

  // náhradní volba bere nejlevnějšího koně
  assert.equal(engine.ownerships[FANTOME], 'B');
  assert.equal(engine.ownerships[LADY_ANNE], 'A');
});

test('vypršelý limit dar provede za hráče', () => {
  const engine = makeEngine('give_horse');
  own(engine, 'A', LADY_ANNE);
  spinAndAck(engine);
  engine._handleTurnTimeout();

  assert.equal(engine.ownerships[LADY_ANNE], 'B');
});

test('bez koně se místo daru platí pokuta', () => {
  const engine = makeEngine('give_horse');
  spinAndAck(engine);

  assert.notEqual(engine.pendingAction?.type, 'roulette_give_horse');
  assert.equal(engine.players.get('A').balance, 30000 - GIFT_FALLBACK_FINE);
});

test('dar propadne, pokud hráč mezitím o koně přišel', () => {
  const engine = makeEngine('give_horse');
  own(engine, 'A', FANTOME);
  spinAndAck(engine);
  engine.ownerships[FANTOME] = 'B';
  engine.players.get('A').properties = [];
  engine.players.get('B').properties = [FANTOME];
  engine.handleRespond({ playerId: 'A', emit: () => {} }, { decision: 'B', spaceId: FANTOME });

  assert.equal(engine.ownerships[FANTOME], 'B');
  assert.deepEqual(engine.players.get('B').properties, [FANTOME]);
});
