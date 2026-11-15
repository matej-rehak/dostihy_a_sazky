'use strict';

// Debug panel: vynucení příští karty musí sedět na skutečný balíček
// (popisky v public/js/ui/debug.js ve stejném pořadí, celý rozsah indexů)
// a karta „Opakovaný hod" se dá hráči nastavit jako „Zrušen distanc".

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const GameEngine = require('../src/GameEngine');

function makeEngine() {
  const engine = new GameEngine({ to: () => ({ emit: () => {} }) }, 'room-test');
  engine._broadcast = () => {};
  engine._scheduleAction = (delay, fn) => fn && fn();
  engine.phase = 'playing';
  ['A', 'B'].forEach(id => {
    engine.players.set(id, {
      id, socketId: `sock-${id}`, name: id, color: '#fff', isHost: false,
      position: 0, balance: 30000, bankrupt: false, inJail: false, jailTurns: 0,
      skipTurns: 0, properties: [], rollAccumulator: 0, moveDirection: 1,
      jailFreeCards: 0, rerollCards: 0, ready: true, disconnected: false, canFly: false, left: false,
      pendingBet: null, halfPriceNext: false, canSpin: false,
    });
  });
  engine.turnOrder = ['A', 'B'];
  engine.currentTurnIdx = 0;
  engine.pendingAction = { type: 'wait_roll', targetId: 'A' };
  return engine;
}

function labelCount(name) {
  const src = fs.readFileSync(path.join(__dirname, '../public/js/ui/debug.js'), 'utf8');
  const body = src.match(new RegExp(`const ${name} = \\[([\\s\\S]*?)\\];`))[1];
  return body.split('\n').filter(l => l.trim().startsWith("'")).length;
}

test('popisky debug panelu odpovídají velikosti balíčků', () => {
  const engine = makeEngine();
  assert.equal(labelCount('NAHODA_LABELS'), engine.nahodaCards.original.length);
  assert.equal(labelCount('FINANCE_LABELS'), engine.financeCards.original.length);
});

test('popisek „Opakovaný hod" je na indexu karty reroll_card', () => {
  const engine = makeEngine();
  const idx = engine.nahodaCards.original.findIndex(c => c.type === 'reroll_card');
  const src = fs.readFileSync(path.join(__dirname, '../public/js/ui/debug.js'), 'utf8');
  const labels = src.match(/const NAHODA_LABELS = \[([\s\S]*?)\];/)[1]
    .split('\n').map(l => l.trim()).filter(l => l.startsWith("'"));
  assert.match(labels[idx], /Opakovaný hod/);
});

test('vynutit jde i poslední kartu Náhody', () => {
  const engine = makeEngine();
  const last = engine.nahodaCards.original.length - 1;
  engine.handleDebugSetState(null, { forceNahodaIdx: last });
  assert.equal(engine.nahodaCards.draw(), engine.nahodaCards.original[last]);
});

test('vynucená karta Opakovaný hod se líznout dá', () => {
  const engine = makeEngine();
  const idx = engine.nahodaCards.original.findIndex(c => c.type === 'reroll_card');
  engine.handleDebugSetState(null, { forceNahodaIdx: idx });
  assert.equal(engine.nahodaCards.draw().type, 'reroll_card');
});

test('debug nastaví hráči kartu Opakovaný hod a vyřadí ji z balíčku', () => {
  const engine = makeEngine();
  engine.handleDebugSetState(null, { players: [{ id: 'A', rerollCards: 1 }, { id: 'B', rerollCards: 1 }] });
  assert.equal(engine.players.get('A').rerollCards, 1);
  assert.equal(engine.players.get('B').rerollCards, 0, 'karta je ve hře jen jedna');
  assert.ok(!engine.nahodaCards.pile.some(c => c.type === 'reroll_card'));

  engine.handleDebugSetState(null, { players: [{ id: 'A', rerollCards: 0 }] });
  assert.equal(engine.players.get('A').rerollCards, 0);
  assert.ok(engine.nahodaCards.pile.some(c => c.type === 'reroll_card'));
});
