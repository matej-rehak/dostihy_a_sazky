'use strict';

// Pole 20 a 30 mění podobu podle nastavení hostitele (Parkoviště ↔ Letiště,
// Podezření z dopingu ↔ Ruleta). Texty karet a logy nesmí mít název natvrdo
// z boardData — dřív karta Náhoda posílala hráče „Zpět na pole Parkoviště",
// i když na plánu bylo Letiště.

const test = require('node:test');
const assert = require('node:assert/strict');

const GameEngine = require('../src/GameEngine');
const { NahodaDeck, FinanceDeck } = require('../src/Cards');

function makeEngine(config = {}) {
  const engine = new GameEngine({ to: () => ({ emit: () => {} }) }, 'room-test');
  engine._broadcast = () => {};
  engine._scheduleAction = () => {};
  engine.phase = 'playing';
  ['A', 'B'].forEach(id => engine.players.set(id, {
    id, name: id, position: 0, balance: 30000, bankrupt: false, inJail: false,
    jailTurns: 0, skipTurns: 0, properties: [], rollAccumulator: 0, jailFreeCards: 0, canFly: false,
  }));
  engine.turnOrder = ['A', 'B'];
  engine.currentTurnIdx = 0;
  Object.assign(engine.config, config);
  return engine;
}

test('název pole 20 a 30 odpovídá nastavení', () => {
  assert.equal(makeEngine()._spaceName(20), 'Parkoviště');
  assert.equal(makeEngine({ field20Mode: 'airport' })._spaceName(20), 'Letiště');
  assert.equal(makeEngine()._spaceName(30), 'Podezření z dopingu');
  assert.equal(makeEngine({ field30Mode: 'roulette' })._spaceName(30), 'Ruleta');
  assert.equal(makeEngine()._spaceName(1), 'Fantome', 'ostatní pole beze změny');
});

/** Lízne z balíčku Náhoda kartu „zpět na pole 20" tak, jak ji dostane hráč. */
function drawParkingCard(engine) {
  const idx = engine.nahodaCards.original.findIndex(c => c.type === 'move_backward_to' && c.space === 20);
  assert.notEqual(idx, -1, 'karta „zpět na pole 20" v balíčku chybí');
  engine.nahodaCards.forceDraw(idx);
  engine.players.get('A').position = 22; // Náhoda
  engine._evaluateSpace('A');
  return engine.pendingAction.data.card;
}

test('karta „zpět na pole 20" píše Letiště, když je na plánu Letiště', () => {
  const card = drawParkingCard(makeEngine({ field20Mode: 'airport' }));
  assert.match(card.text, /Letiště/);
  assert.doesNotMatch(card.text, /Parkoviště/);
});

test('karta „zpět na pole 20" píše Parkoviště ve výchozím režimu', () => {
  const card = drawParkingCard(makeEngine());
  assert.match(card.text, /Parkoviště/);
});

test('žádná karta nemá natvrdo název pole, které se mění podle nastavení', () => {
  for (const deck of [NahodaDeck(), FinanceDeck()]) {
    for (const card of deck.original) {
      assert.doesNotMatch(card.text, /Parkoviště|Letiště|Ruleta|Podezření z dopingu/,
        `karta „${card.text}" má název pole natvrdo — použij {space:N}`);
    }
  }
});

test('log pohybu používá název podle nastavení', () => {
  const engine = makeEngine({ field20Mode: 'airport' });
  engine.players.get('A').position = 15;
  engine._movePlayer('A', 5);
  const moved = engine.log.map(l => l.text ?? l).find(t => /přesunul\(a\) se na/.test(t));
  assert.match(moved, /Letiště/);
});

/** Server (logy, karty) a plán (cornerArt.mjs) musí pole pojmenovat stejně. */
test('server a plán používají stejné názvy polí 20 a 30', async () => {
  const { cornerArt } = await import('../public/js/ui/cornerArt.mjs');
  for (const field20Mode of ['parking', 'airport']) {
    for (const field30Mode of ['doping', 'roulette']) {
      const config = { field20Mode, field30Mode };
      const engine = makeEngine(config);
      for (const id of [20, 30]) {
        assert.equal(engine._spaceName(id), cornerArt(id, config).name, `pole ${id}, ${JSON.stringify(config)}`);
      }
    }
  }
});
