'use strict';

// Hod na poplatek (Přeprava / Stáje) a hod v Distancu: výsledek — peníze
// a zápis do logu — se nesmí ukázat, dokud se kostka na klientovi točí.
// Jinak hráč vidí, kolik hodil, dřív než kostka dopadne.

const test = require('node:test');
const assert = require('node:assert/strict');

const GameEngine = require('../src/GameEngine');
const { DICE_REVEAL_MS } = require('../src/constants');

const PREPRAVA = 12;

function makeEngine(t) {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const engine = new GameEngine({ to: () => ({ emit: () => {} }) }, 'room-test');
  engine._broadcast = () => {};
  engine._notifyBots = () => {};
  engine.phase = 'playing';
  ['A', 'B'].forEach(id => {
    engine.players.set(id, {
      id, socketId: `sock-${id}`, name: id, color: '#fff', isHost: false, isBot: false,
      position: 0, balance: 30000, bankrupt: false, inJail: false, jailTurns: 0,
      skipTurns: 0, properties: [], rollAccumulator: 0, moveDirection: 1,
      jailFreeCards: 0, ready: true, disconnected: false, canFly: false,
      pendingBet: null, halfPriceNext: false, canSpin: false,
    });
  });
  engine.turnOrder = ['A', 'B'];
  engine.currentTurnIdx = 0;
  return engine;
}

const socketOf = pid => ({ playerId: pid, id: `sock-${pid}`, emit: () => {} });
const logText = engine => engine.log.map(l => (typeof l === 'string' ? l : l.text ?? JSON.stringify(l))).join('\n');

test('hod na poplatek: peníze a log až po dotočení kostky', (t) => {
  const engine = makeEngine(t);
  engine.ownerships[PREPRAVA] = 'B';
  engine.players.get('B').properties = [PREPRAVA];
  engine.players.get('A').position = PREPRAVA;
  engine.pendingAction = { type: 'service_roll', targetId: 'A', data: { spaceId: PREPRAVA } };
  engine._forceDice = 4;

  engine.handleRoll(socketOf('A'));

  assert.equal(engine.lastDice.value, 4, 'kostka se hodí hned (klient ji animuje)');
  assert.equal(engine.players.get('A').balance, 30000, 'peníze se ještě nepřevedly');
  assert.ok(!/poplatek/.test(logText(engine)), 'log výsledek ještě neprozradí');
  assert.equal(engine.pendingAction, null, 'mezitím se znovu hodit nedá');

  t.mock.timers.tick(DICE_REVEAL_MS);

  const rent = 200 * 4;
  assert.equal(engine.players.get('A').balance, 30000 - rent);
  assert.equal(engine.players.get('B').balance, 30000 + rent);
  assert.match(logText(engine), /hází pro poplatek: 4/);
});

test('hod v Distancu bez šestky: výsledek až po dotočení kostky', (t) => {
  const engine = makeEngine(t);
  const a = engine.players.get('A');
  Object.assign(a, { inJail: true, jailTurns: 3, position: 10 });
  engine.pendingAction = { type: 'jail_choice', targetId: 'A' };
  engine._forceDice = 3;
  engine._handleJailChoice('A', 'roll_jail');

  assert.equal(a.jailTurns, 3, 'kolo v Distancu se ještě neodečetlo');
  assert.ok(!/zůstává v Distancu/.test(logText(engine)));

  t.mock.timers.tick(DICE_REVEAL_MS);
  assert.equal(a.jailTurns, 2);
  assert.match(logText(engine), /zůstává v Distancu/);
});

test('hod v Distancu se šestkou: propuštění až po dotočení kostky', (t) => {
  const engine = makeEngine(t);
  const a = engine.players.get('A');
  Object.assign(a, { inJail: true, jailTurns: 3, position: 10 });
  engine.pendingAction = { type: 'jail_choice', targetId: 'A' };
  engine._forceDice = 6;
  engine._handleJailChoice('A', 'roll_jail');

  assert.equal(a.inJail, true);
  assert.equal(engine.pendingAction, null, 'hodit znovu jde až po animaci');

  t.mock.timers.tick(DICE_REVEAL_MS);
  assert.equal(a.inJail, false);
  assert.deepEqual(engine.pendingAction, { type: 'wait_roll', targetId: 'A' });
});
