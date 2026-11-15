import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

import { horseRent } from '../public/js/ui/rentView.mjs';

const require = createRequire(import.meta.url);
const GameEngine = require('../src/GameEngine');
const BOARD = require('../src/data/boardData');

// Pole z boardData: 1+3 = oranžová (2 koně), 6+8+9 = hnědá (3 koně).

function player(id, overrides = {}) {
  return { id, name: id, position: 0, balance: 30000, properties: [], bankrupt: false,
    inJail: false, jailTurns: 0, skipTurns: 0, jailFreeCards: 0, ...overrides };
}

/** Engine se stejným stavem, jaký dostane klient — ať jde porovnat s _calcRent. */
function engineFor(state) {
  const engine = new GameEngine({ to: () => ({ emit: () => {} }) }, 'room-test');
  engine.phase = 'playing';
  state.players.forEach(p => engine.players.set(p.id, p));
  engine.ownerships = state.ownerships;
  engine.tokens = state.tokens;
  engine.inflation = state.inflation || 0;
  engine._addLog = () => {};   // _calcRent loguje, proč žetony nefungují
  return engine;
}

function stateWith({ owned, tokens = {}, owner = {}, inflation = 0 }) {
  const opp = player('opp', owner);
  opp.properties = owned.slice();
  const ownerships = Object.fromEntries(owned.map(id => [id, 'opp']));
  return { players: [player('me'), opp], ownerships, tokens, inflation };
}

const CASES = [
  { name: 'bez monopolu, bez žetonů', spaceId: 1, owned: [1] },
  { name: 'monopol, bez žetonů', spaceId: 1, owned: [1, 3] },
  { name: 'monopol, 1 žeton', spaceId: 1, owned: [1, 3], tokens: { 1: { small: 1, big: false } } },
  { name: 'monopol, 4 žetony', spaceId: 9, owned: [6, 8, 9], tokens: { 9: { small: 4, big: false } } },
  { name: 'monopol, hlavní dostih', spaceId: 6, owned: [6, 8, 9], tokens: { 6: { small: 0, big: true } } },
  { name: 'žetony bez celé stáje', spaceId: 6, owned: [6, 8], tokens: { 6: { small: 2, big: false } } },
  { name: 'majitel v Distancu', spaceId: 1, owned: [1, 3], tokens: { 1: { small: 3, big: false } }, owner: { inJail: true } },
  { name: 'majitel pod podezřením z dopingu', spaceId: 1, owned: [1, 3], tokens: { 1: { small: 2, big: false } }, owner: { skipTurns: 1 } },
  { name: 'inflace, bez žetonů', spaceId: 1, owned: [1], inflation: 1 },
  { name: 'dvojí inflace, hlavní dostih', spaceId: 6, owned: [6, 8, 9], tokens: { 6: { small: 0, big: true } }, inflation: 2 },
  { name: 'inflace, žetony bez celé stáje', spaceId: 6, owned: [6, 8], tokens: { 6: { small: 3, big: false } }, inflation: 3 },
];

for (const c of CASES) {
  test(`nájem na plánu = nájem ze serveru: ${c.name}`, () => {
    const state = stateWith(c);
    assert.equal(horseRent(BOARD, state, c.spaceId), engineFor(state)._calcRent(c.spaceId, 0));
  });
}

test('stav po JSON (klíče vlastnictví a žetonů jako řetězce) dává stejný nájem', () => {
  const state = JSON.parse(JSON.stringify(stateWith({ owned: [1, 3], tokens: { 1: { small: 2, big: false } } })));
  assert.equal(horseRent(BOARD, state, 1), BOARD[1].rents[2]);
});

test('volný kůň a jiná pole nemají nájem', () => {
  const state = stateWith({ owned: [] });
  assert.equal(horseRent(BOARD, state, 1), null);   // nikdo nevlastní
  assert.equal(horseRent(BOARD, state, 5), null);   // trenér — služba
  assert.equal(horseRent(BOARD, state, 0), null);   // START
});
