import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

import { horseRentRow, serviceRentRow, horseRent, serviceRent } from '../public/js/ui/rentView.mjs';

const require = createRequire(import.meta.url);
const BOARD = require('../src/data/boardData');

// Pole: 1+3 oranžová, 6+8+9 hnědá. Řádek = index v tabulce nájmů v detailu
// políčka a tooltipu; musí ukazovat na nájem, který se opravdu zaplatí.

function player(id, overrides = {}) {
  return { id, properties: [], inJail: false, skipTurns: 0, ...overrides };
}

function stateWith({ owned, tokens = {}, owner = {} }) {
  return {
    players: [player('me'), player('opp', { properties: owned.slice(), ...owner })],
    ownerships: Object.fromEntries(owned.map(id => [id, 'opp'])),
    tokens,
  };
}

test('volný kůň nemá aktivní řádek', () => {
  assert.deepEqual(horseRentRow(BOARD, stateWith({ owned: [] }), 1), { row: null, idle: null });
});

test('kůň bez žetonů → základní nájem', () => {
  assert.deepEqual(horseRentRow(BOARD, stateWith({ owned: [1] }), 1), { row: 0, idle: null });
});

test('fungující žetony → řádek podle žetonů, hlavní dostih = poslední', () => {
  const two = stateWith({ owned: [1, 3], tokens: { 1: { small: 2, big: false } } });
  assert.deepEqual(horseRentRow(BOARD, two, 1), { row: 2, idle: null });
  const big = stateWith({ owned: [1, 3], tokens: { 1: { small: 4, big: true } } });
  assert.deepEqual(horseRentRow(BOARD, big, 1), { row: 5, idle: null });
});

test('nefungující žetony → základní nájem a důvod', () => {
  const tokens = { 1: { small: 2, big: false } };
  assert.deepEqual(horseRentRow(BOARD, stateWith({ owned: [1], tokens }), 1), { row: 0, idle: 'group' });
  assert.deepEqual(horseRentRow(BOARD, stateWith({ owned: [1, 3], tokens, owner: { inJail: true } }), 1), { row: 0, idle: 'jail' });
  assert.deepEqual(horseRentRow(BOARD, stateWith({ owned: [1, 3], tokens, owner: { skipTurns: 1 } }), 1), { row: 0, idle: 'doping' });
});

test('aktivní řádek koně ukazuje přesně nájem z horseRent (= server)', () => {
  const cases = [
    stateWith({ owned: [1] }),
    stateWith({ owned: [1], tokens: { 1: { small: 3, big: false } } }),
    stateWith({ owned: [1, 3], tokens: { 1: { small: 3, big: false } } }),
    stateWith({ owned: [1, 3], tokens: { 1: { small: 4, big: true } }, owner: { inJail: true } }),
    stateWith({ owned: [1, 3], tokens: { 1: { small: 4, big: true } } }),
  ];
  for (const gs of cases) {
    assert.equal(BOARD[1].rents[horseRentRow(BOARD, gs, 1).row], horseRent(BOARD, gs, 1));
  }
});

const TRENERS = BOARD.filter(s => s.serviceType === 'trener').map(s => s.id);
const PREPRAVA = BOARD.find(s => s.serviceType === 'preprava').id;
const STAJE = BOARD.find(s => s.serviceType === 'staje').id;

test('trenéři: řádek = počet trenérů majitele − 1', () => {
  assert.equal(serviceRentRow(BOARD, stateWith({ owned: [] }), TRENERS[0]), null);
  for (let n = 1; n <= 4; n++) {
    const gs = stateWith({ owned: TRENERS.slice(0, n) });
    const row = serviceRentRow(BOARD, gs, TRENERS[0]);
    assert.equal(row, n - 1);
    assert.equal((row + 1) * 1000, serviceRent(BOARD, gs, TRENERS[0]).amount);
  }
});

test('Přeprava a Stáje: řádek 0 = jedna služba, 1 = obě', () => {
  assert.equal(serviceRentRow(BOARD, stateWith({ owned: [PREPRAVA] }), PREPRAVA), 0);
  assert.equal(serviceRentRow(BOARD, stateWith({ owned: [PREPRAVA, STAJE] }), STAJE), 1);
});
