'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { hasHumanPlayers } = require('../src/roomLifecycle');

function playersMap(entries) {
  return new Map(entries.map((p, i) => [p.id || `p${i}`, p]));
}

test('hasHumanPlayers vrací false pro prázdnou místnost', () => {
  assert.equal(hasHumanPlayers(playersMap([])), false);
});

test('hasHumanPlayers vrací true, pokud je v místnosti alespoň jeden člověk', () => {
  const players = playersMap([{ id: 'h1', isBot: false }]);
  assert.equal(hasHumanPlayers(players), true);
});

test('hasHumanPlayers vrací false, pokud zůstávají jen boti', () => {
  const players = playersMap([
    { id: 'bot-1', isBot: true },
    { id: 'bot-2', isBot: true },
  ]);
  assert.equal(hasHumanPlayers(players), false);
});

test('hasHumanPlayers vrací true, pokud jsou v místnosti boti i člověk', () => {
  const players = playersMap([
    { id: 'bot-1', isBot: true },
    { id: 'h1', isBot: false },
  ]);
  assert.equal(hasHumanPlayers(players), true);
});

test('hasHumanPlayers považuje chybějící isBot za člověka (zpětná kompatibilita)', () => {
  const players = playersMap([{ id: 'h1' }]);
  assert.equal(hasHumanPlayers(players), true);
});
