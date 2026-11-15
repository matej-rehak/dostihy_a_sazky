'use strict';

// Sázka na vlastní hod: hráč před hodem tipne číslo a vsadí. Trefa → vklad ×
// násobek, jinak vklad propadá. Pravidlo je výchozí vypnuté; hostitel nastaví
// násobek a nejvyšší vklad.

const test = require('node:test');
const assert = require('node:assert/strict');

const GameEngine = require('../src/GameEngine');

function makeEngine(config = {}) {
  const engine = new GameEngine({ to: () => ({ emit: () => {} }) }, 'room-test');
  engine._broadcast = () => {};
  engine._scheduleAction = () => {};
  engine._movePlayer = () => {}; // testuje se sázka, ne pohyb po plánu
  engine.phase = 'playing';
  ['A', 'B'].forEach(id => engine.players.set(id, {
    id, name: id, position: 0, balance: 30000, bankrupt: false, inJail: false,
    jailTurns: 0, skipTurns: 0, properties: [], rollAccumulator: 0, jailFreeCards: 0,
  }));
  engine.turnOrder = ['A', 'B'];
  engine.currentTurnIdx = 0;
  engine.pendingAction = { type: 'wait_roll', targetId: 'A' };
  Object.assign(engine.config, { diceBetEnabled: true }, config);
  return engine;
}

/** Hodí za hráče A se sázkou a vynuceným výsledkem kostky. */
function rollWith(engine, dice, bet) {
  const errors = [];
  engine._forceDice = dice;
  engine.handleRoll({ playerId: 'A', emit: (n, d) => { if (n === 'game:error') errors.push(d.message); } }, bet ? { bet } : undefined);
  return errors;
}

const bal = engine => engine.players.get('A').balance;

test('výchozí nastavení: vypnuto, výhra 5×, nejvýš 5 000 Kč', () => {
  const engine = new GameEngine({ to: () => ({ emit: () => {} }) }, 'r');
  assert.equal(engine.config.diceBetEnabled, false);
  assert.equal(engine.config.diceBetMultiplier, 5);
  assert.equal(engine.config.diceBetMaxStake, 5000);
});

test('trefa vyplatí vklad × násobek', () => {
  const engine = makeEngine({ diceBetMultiplier: 5 });
  const errors = rollWith(engine, 4, { number: 4, stake: 1000 });
  assert.deepEqual(errors, []);
  assert.equal(bal(engine), 30000 - 1000 + 5000);
});

test('netrefa — vklad propadá', () => {
  const engine = makeEngine();
  rollWith(engine, 2, { number: 4, stake: 1000 });
  assert.equal(bal(engine), 29000);
});

test('násobek z nastavení platí', () => {
  const engine = makeEngine({ diceBetMultiplier: 8 });
  rollWith(engine, 6, { number: 6, stake: 500 });
  assert.equal(bal(engine), 30000 - 500 + 4000);
});

test('hod bez sázky se chová jako dřív', () => {
  const engine = makeEngine();
  const errors = rollWith(engine, 3);
  assert.deepEqual(errors, []);
  assert.equal(bal(engine), 30000);
  assert.equal(engine.lastDice.value, 3);
});

test('neplatná sázka zruší celý hod a nic nestrhne', () => {
  const cases = [
    [{ number: 7, stake: 1000 }, 'číslo mimo 1–6'],
    [{ number: 0, stake: 1000 }, 'číslo 0'],
    [{ number: 2.5, stake: 1000 }, 'necelé číslo'],
    [{ number: 3, stake: 50 }, 'vklad pod minimem'],
    [{ number: 3, stake: 6000 }, 'vklad nad maximem'],
    [{ number: 3, stake: -500 }, 'záporný vklad'],
    [{ number: 3, stake: 'hodně' }, 'nečíselný vklad'],
  ];
  for (const [bet, label] of cases) {
    const engine = makeEngine();
    const errors = rollWith(engine, 3, bet);
    assert.equal(errors.length, 1, label);
    assert.equal(bal(engine), 30000, label);
    assert.equal(engine.lastDice, null, `${label}: hod se nesmí provést`);
    assert.equal(engine.pendingAction.type, 'wait_roll', `${label}: hráč pořád hází`);
  }
});

test('nejde vsadit víc, než má hráč', () => {
  const engine = makeEngine({ diceBetMaxStake: 50000 });
  engine.players.get('A').balance = 800;
  const errors = rollWith(engine, 3, { number: 3, stake: 1000 });
  assert.equal(errors.length, 1);
  assert.equal(bal(engine), 800);
});

test('vypnuté pravidlo sázku odmítne', () => {
  const engine = makeEngine({ diceBetEnabled: false });
  const errors = rollWith(engine, 3, { number: 3, stake: 1000 });
  assert.equal(errors.length, 1);
  assert.equal(bal(engine), 30000);
});

test('lobby hodnoty ořízne do rozumného rozsahu', () => {
  const engine = new GameEngine({ to: () => ({ emit: () => {} }) }, 'r');
  engine._broadcast = () => {};
  engine.players.set('H', { id: 'H', isHost: true });
  const set = cfg => { engine.updateConfig({ playerId: 'H', emit: () => {} }, { ...engine.config, ...cfg }); return engine.config; };

  assert.equal(set({ diceBetEnabled: true }).diceBetEnabled, true);
  assert.equal(set({ diceBetEnabled: 'ano' }).diceBetEnabled, false, 'zapíná se jen skutečným true');
  assert.equal(set({ diceBetMultiplier: 1 }).diceBetMultiplier, 2);
  assert.equal(set({ diceBetMultiplier: 50 }).diceBetMultiplier, 10);
  assert.equal(set({ diceBetMultiplier: 'x' }).diceBetMultiplier, 5);
  assert.equal(set({ diceBetMaxStake: 10 }).diceBetMaxStake, 100);
  assert.equal(set({ diceBetMaxStake: 2550 }).diceBetMaxStake, 2600);
  assert.equal(set({ diceBetMaxStake: 1e9 }).diceBetMaxStake, 100000);
});

/** Klient zobrazuje minimum a krok vkladu podle své kopie konstanty — musí sedět. */
test('klientský minimální vklad sedí se serverem', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const { DICE_BET_MIN_STAKE } = require('../src/constants');
  const src = fs.readFileSync(path.join(__dirname, '../public/js/ui/diceBet.js'), 'utf8');
  const client = Number(src.match(/export const DICE_BET_MIN_STAKE = (\d+);/)?.[1]);
  assert.equal(client, DICE_BET_MIN_STAKE);
});
