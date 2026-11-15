'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const GameEngine = require('../src/GameEngine');

/**
 * Regrese: hráč v dluhu prodal posledního koně a pořád byl v mínusu.
 * `_checkBankrupt` ho po prodeji prohlásil za bankrotáře, ale
 * `_handleDebtManage` mu hned nato znovu otevřel `debt_manage`. Na prompt
 * vyřazeného hráče nikdo neodpoví (bot bankrotáře ignoruje, člověk nemá co
 * prodat) — hra zamrzla pro všechny.
 */

const FANTOME = 1;

function makeEngine() {
  const engine = new GameEngine({ to: () => ({ emit: () => {} }) }, 'room-test');
  engine._broadcast = () => {};
  engine.phase = 'playing';

  ['A', 'B', 'C'].forEach(id => {
    engine.players.set(id, {
      id, socketId: `sock-${id}`, name: id, color: '#fff', isHost: false,
      position: 0, balance: 30000, bankrupt: false, inJail: false, jailTurns: 0,
      skipTurns: 0, properties: [], rollAccumulator: 0, moveDirection: 1,
      jailFreeCards: 0, ready: true, disconnected: false, canFly: false, left: false,
      pendingBet: null, halfPriceNext: false,
    });
  });
  engine.turnOrder = ['A', 'B', 'C'];
  engine.currentTurnIdx = 0;
  return engine;
}

test('prodej posledního koně, který dluh nepokryje, nenechá viset debt_manage', () => {
  const engine = makeEngine();
  const a = engine.players.get('A');
  a.balance = -5000;
  a.properties = [FANTOME];
  engine.ownerships[FANTOME] = 'A';

  let resumed = 0;
  engine._resumeFn = () => { resumed++; };
  engine._setPendingAction({ type: 'debt_manage', targetId: 'A' });
  engine._scheduleAction = (delay, fn) => fn();

  engine.handleRespond({ playerId: 'A', emit: () => {} }, { decision: 'sell_property', spaceId: FANTOME });

  assert.equal(a.bankrupt, true, 'hráč bez majetku v mínusu je v bankrotu');
  assert.notEqual(engine.pendingAction?.type, 'debt_manage', 'bankrotář nesmí dostat další debt_manage');
  assert.equal(resumed, 1, 'hra musí pokračovat přerušeným krokem');
});

test('prodej, po kterém dluh trvá a majetek zbývá, se dál ptá', () => {
  const engine = makeEngine();
  const a = engine.players.get('A');
  a.balance = -1000;   // prodej Fantome (+600) dluh nepokryje, Gavora ho kryje
  a.properties = [FANTOME, 3];
  engine.ownerships[FANTOME] = 'A';
  engine.ownerships[3] = 'A';
  engine._resumeFn = () => {};
  engine._setPendingAction({ type: 'debt_manage', targetId: 'A' });

  engine.handleRespond({ playerId: 'A', emit: () => {} }, { decision: 'sell_property', spaceId: FANTOME });

  assert.equal(a.bankrupt, false);
  assert.equal(engine.pendingAction?.type, 'debt_manage');
  assert.equal(engine.pendingAction?.targetId, 'A');
});
