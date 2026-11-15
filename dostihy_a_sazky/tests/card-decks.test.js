'use strict';

// Přehled balíčků Finance a Náhoda (klik na pole v detailu). Texty musí být
// stejné jako u vytažené karty — s inflací, bonusem za START a názvem pole 20.

const test = require('node:test');
const assert = require('node:assert/strict');

const GameEngine = require('../src/GameEngine');
const { fmt } = require('../src/constants');

function makeEngine() {
  const engine = new GameEngine({ to: () => ({ emit: () => {} }) }, 'room-test');
  engine._broadcast = () => {};
  engine.phase = 'playing';
  return engine;
}

const count = list => list.reduce((s, c) => s + c.count, 0);

test('přehled obsahuje celý balíček, stejné karty sloučené s počtem', () => {
  const engine = makeEngine();
  const { finance, nahoda } = engine._buildState().cardDecks;
  assert.equal(count(finance), engine.financeCards.original.length);
  assert.equal(count(nahoda), engine.nahodaCards.original.length);
  const twoTurns = nahoda.find(c => c.text === 'Zdržíš se na 2 kola.');
  assert.equal(twoTurns.count, 2);
  assert.equal(new Set(nahoda.map(c => c.text)).size, nahoda.length, 'každý text jen jednou');
});

test('tón karty: příjem dobrý, platba a trest špatný, pohyb neutrální', () => {
  const { finance, nahoda } = makeEngine()._buildState().cardDecks;
  assert.equal(finance.find(c => c.text.startsWith('Obdržíš dotaci 4.000')).tone, 'good');
  assert.equal(finance.find(c => c.text.startsWith('Zaplať pojistku')).tone, 'bad');
  assert.equal(nahoda.find(c => c.text.startsWith('Distanc')).tone, 'bad');
  assert.equal(nahoda.find(c => c.text === 'Jdi o 3 pole zpět.').tone, 'neutral');
  assert.equal(nahoda.find(c => c.text.startsWith('Zrušen distanc')).tone, 'good');
});

test('texty v přehledu = texty vytažené karty (inflace, START, Letiště)', () => {
  const engine = makeEngine();
  engine.inflation = 1;
  engine.config.startBonus = 5000;
  engine.config.field20Mode = 'airport';
  const { finance, nahoda } = engine._buildState().cardDecks;
  for (const raw of engine.financeCards.original) {
    assert.ok(finance.some(c => c.text === engine._cardView(raw).text), raw.text);
  }
  for (const raw of engine.nahodaCards.original) {
    assert.ok(nahoda.some(c => c.text === engine._cardView(raw).text), raw.text);
  }
  assert.ok(finance.some(c => c.text === 'Zaplať pojistku 1.100 Kč.'), 'inflace +10 %');
  assert.ok(nahoda.some(c => c.text.includes('Letiště')), 'název pole 20 podle nastavení');
  assert.ok(nahoda.some(c => c.text.includes(`${fmt(5000)} Kč`)), 'bonus za START z nastavení');
  assert.ok(!nahoda.some(c => /\{.*\}/.test(c.text)), 'žádný nenahrazený zástupný text');
});

test('držená karta „Zrušen distanc" je v přehledu označená', () => {
  const engine = makeEngine();
  const jail = () => engine._buildState().cardDecks.nahoda.find(c => c.text.startsWith('Zrušen distanc'));
  assert.equal(jail().held, false);
  engine.nahodaCards.setHeld('jail_free_card', true);
  assert.equal(jail().held, true);
});
