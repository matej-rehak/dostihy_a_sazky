'use strict';

// „Skládá nabídku": ostatní hráči i cílový hráč mají vědět, že se vyjednává,
// už když autor nabídku teprve skládá (game:trade_drafting).

const test = require('node:test');
const assert = require('node:assert/strict');

const GameEngine = require('../src/GameEngine');

function makeEngine() {
  const engine = new GameEngine({ to: () => ({ emit: () => {} }) }, 'room-test');
  engine.broadcasts = 0;
  engine._broadcast = () => { engine.broadcasts++; };
  engine._scheduleAction = () => {};
  engine.phase = 'playing';
  ['A', 'B', 'C'].forEach(id => {
    engine.players.set(id, {
      id, socketId: `sock-${id}`, name: id, color: '#fff', isHost: false,
      position: 0, balance: 30000, bankrupt: false, inJail: false, jailTurns: 0,
      skipTurns: 0, properties: [], rollAccumulator: 0, moveDirection: 1,
      jailFreeCards: 0, rerollCards: 0, ready: true, disconnected: false, canFly: false, left: false,
      pendingBet: null, halfPriceNext: false, canSpin: false,
    });
  });
  engine.turnOrder = ['A', 'B', 'C'];
  engine.currentTurnIdx = 0;
  engine.round = 1;
  engine.pendingAction = { type: 'wait_roll', targetId: 'A' };
  return engine;
}

const sock = pid => ({ playerId: pid, emit: () => {} });

test('hráč na tahu skládá nabídku — všichni to vidí ve stavu', () => {
  const engine = makeEngine();
  engine.setTradeDrafting(sock('A'), { targetId: 'B' });
  assert.deepEqual(engine._buildState().tradeDrafts, { A: { targetId: 'B' } });
  assert.equal(engine.broadcasts, 1);
});

test('veřejná nabídka se hlásí jako public', () => {
  const engine = makeEngine();
  engine.setTradeDrafting(sock('A'), { targetId: 'public' });
  assert.deepEqual(engine._buildState().tradeDrafts, { A: { targetId: 'public' } });
});

test('zavření okna (targetId null) záznam smaže', () => {
  const engine = makeEngine();
  engine.setTradeDrafting(sock('A'), { targetId: 'B' });
  engine.setTradeDrafting(sock('A'), { targetId: null });
  assert.deepEqual(engine._buildState().tradeDrafts, {});
});

test('stejná hodnota podruhé neposílá nový stav', () => {
  const engine = makeEngine();
  engine.setTradeDrafting(sock('A'), { targetId: 'B' });
  engine.setTradeDrafting(sock('A'), { targetId: 'B' });
  assert.equal(engine.broadcasts, 1);
});

test('hráč mimo tah nabídku skládat nemůže (stejně jako ji nemůže poslat)', () => {
  const engine = makeEngine();
  engine.setTradeDrafting(sock('B'), { targetId: 'C' });
  assert.deepEqual(engine._buildState().tradeDrafts, {});
});

test('hráči, který řeší dluh, smí skládat nabídku kdokoli', () => {
  const engine = makeEngine();
  engine.pendingAction = { type: 'debt_manage', targetId: 'B' };
  engine.setTradeDrafting(sock('C'), { targetId: 'B' });
  assert.deepEqual(engine._buildState().tradeDrafts, { C: { targetId: 'B' } });
});

test('neplatný cíl (sám sebe, neexistující, bankrot) se ignoruje', () => {
  const engine = makeEngine();
  engine.players.get('C').bankrupt = true;
  for (const targetId of ['A', 'X', 'C']) engine.setTradeDrafting(sock('A'), { targetId });
  assert.deepEqual(engine._buildState().tradeDrafts, {});
});

test('odeslaná nabídka záznam „skládá" ukončí', () => {
  const engine = makeEngine();
  engine._notifyBots = () => {};
  engine.setTradeDrafting(sock('A'), { targetId: 'B' });
  engine.initiateTrade(sock('A'), { targetId: 'B', offer: { horses: [], money: 100 }, request: { horses: [], money: 0 } });
  assert.equal(engine.tradeOffers.length, 1);
  assert.deepEqual(engine._buildState().tradeDrafts, {});
});

test('odpojený hráč nezůstane „vyjednávat" — ani autor, ani cíl', () => {
  const engine = makeEngine();
  engine.setTradeDrafting(sock('A'), { targetId: 'B' });
  engine.players.get('B').disconnected = true;
  assert.deepEqual(engine._buildState().tradeDrafts, {});
  engine.players.get('B').disconnected = false;
  assert.deepEqual(engine._buildState().tradeDrafts, {}, 'záznam se zahodil, po návratu se neobnoví sám');
});

test('záznam platí jen v tahu, kdy vznikl', () => {
  const engine = makeEngine();
  engine.setTradeDrafting(sock('A'), { targetId: 'B' });
  engine.currentTurnIdx = 1;
  assert.deepEqual(engine._buildState().tradeDrafts, {});
});

test('mimo hru se nic neukládá', () => {
  const engine = makeEngine();
  engine.phase = 'lobby';
  engine.setTradeDrafting(sock('A'), { targetId: 'B' });
  assert.deepEqual(engine._buildState().tradeDrafts, {});
});
