'use strict';

// Počítání kol: kolo přibude, až když tah oběhne všechny hráče a vrátí se na
// prvního v pořadí. Bankrot mění pořadí hráčů (`_removeFromTurnOrder`) —
// dřív, když zbankrotoval PRVNÍ hráč na svém vlastním tahu, se kolo přičetlo
// hned a počítadlo bylo celou zbytek hry o jedno kolo napřed.

const test = require('node:test');
const assert = require('node:assert/strict');

const GameEngine = require('../src/GameEngine');

function makeEngine(ids) {
  const engine = new GameEngine({ to: () => ({ emit: () => {} }) }, 'room-test');
  engine._broadcast = () => {};
  engine._scheduleAction = () => {}; // testuje se jen posun tahu, ne jeho průběh
  engine.phase = 'playing';
  ids.forEach(id => engine.players.set(id, {
    id, name: id, position: 0, balance: 30000, bankrupt: false, inJail: false,
    jailTurns: 0, skipTurns: 0, properties: [], rollAccumulator: 0, jailFreeCards: 0,
  }));
  engine.turnOrder = [...ids];
  engine.currentTurnIdx = 0;
  return engine;
}

/** Zbankrotuje `victim` na tahu `onTurnOf` a vrátí dalších `n` tahů jako „hráč@kolo". */
function afterBankrupt(ids, victim, onTurnOf, n = 5) {
  const engine = makeEngine(ids);
  engine.currentTurnIdx = engine.turnOrder.indexOf(onTurnOf);
  engine._declareBankrupt(victim);
  const seq = [];
  for (let i = 0; i < n; i++) {
    engine._advanceTurn();
    seq.push(`${engine.turnOrder[engine.currentTurnIdx]}@${engine.round}`);
  }
  return seq.join(' ');
}

test('bez bankrotu přibude kolo po každém oběhu', () => {
  const engine = makeEngine(['A', 'B', 'C']);
  const seq = [];
  for (let i = 0; i < 6; i++) {
    engine._advanceTurn();
    seq.push(`${engine.turnOrder[engine.currentTurnIdx]}@${engine.round}`);
  }
  assert.equal(seq.join(' '), 'B@1 C@1 A@2 B@2 C@2 A@3');
});

test('první hráč zbankrotuje na svém tahu — kolo se nepřeskočí', () => {
  assert.equal(afterBankrupt(['A', 'B', 'C'], 'A', 'A'), 'B@1 C@1 B@2 C@2 B@3');
});

test('prostřední hráč zbankrotuje na svém tahu', () => {
  assert.equal(afterBankrupt(['A', 'B', 'C'], 'B', 'B'), 'C@1 A@2 C@2 A@3 C@3');
});

test('poslední hráč zbankrotuje na svém tahu', () => {
  assert.equal(afterBankrupt(['A', 'B', 'C'], 'C', 'C'), 'A@2 B@2 A@3 B@3 A@4');
});

test('první hráč zbankrotuje na tahu posledního — kolo skončí normálně', () => {
  assert.equal(afterBankrupt(['A', 'B', 'C'], 'A', 'C'), 'B@2 C@2 B@3 C@3 B@4');
});

test('poslední hráč zbankrotuje na tahu prvního', () => {
  assert.equal(afterBankrupt(['A', 'B', 'C'], 'C', 'A'), 'B@1 A@2 B@2 A@3 B@3');
});

test('první hráč zbankrotuje na tahu jiného hráče uprostřed kola', () => {
  assert.equal(afterBankrupt(['A', 'B', 'C', 'D'], 'A', 'B'), 'C@1 D@1 B@2 C@2 D@2');
});

test('první hráč odejde ze hry na svém tahu — kolo se nepřeskočí', () => {
  const engine = makeEngine(['A', 'B', 'C']);
  engine.players.get('A').socketId = 'sock-A';
  engine.removePlayer({ playerId: 'A', id: 'sock-A', emit: () => {} });
  engine._advanceTurn();
  assert.equal(engine.turnOrder[engine.currentTurnIdx], 'B');
  assert.equal(engine.round, 1);
});
