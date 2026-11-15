import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

import { tileAmount, serviceRent, tileSuffix, tileShowsRent, SERVICE_DICE_RENT } from '../public/js/ui/rentView.mjs';

const require = createRequire(import.meta.url);
const BOARD = require('../src/data/boardData');
const { SERVICE_RENT_SINGLE, SERVICE_RENT_PAIR } = require('../src/constants');

/**
 * Regrese: políčko na plánu vypisovalo částku jen polím s nákupní cenou
 * (`price`). Veterinární vyšetření má místo ní poplatek (`amount`), takže
 * na plánu (2D i 3D) nebylo vidět, kolik stojí.
 */

const EMPTY = { players: [], ownerships: {}, tokens: {} };

test('každé placené pole má na plánu částku', () => {
  for (const space of BOARD) {
    const pays = space.price > 0 || space.amount > 0;
    const shown = tileAmount(BOARD, EMPTY, space.id);
    if (pays) assert.ok(shown > 0, `${space.name} (${space.id}) nemá na plánu částku`);
    else assert.equal(shown, null, `${space.name} (${space.id}) nemá co ukazovat`);
  }
});

test('veterinář ukazuje svůj poplatek a zdražuje se inflací', () => {
  for (const vet of BOARD.filter(s => s.type === 'tax')) {
    assert.equal(tileAmount(BOARD, EMPTY, vet.id), vet.amount);
    assert.equal(tileAmount(BOARD, { ...EMPTY, inflation: 1 }, vet.id), Math.round(vet.amount * 1.1));
  }
});

test('volný kůň ukazuje cenu, koupený nájem', () => {
  assert.equal(tileAmount(BOARD, EMPTY, 1), BOARD[1].price);
  const owned = {
    players: [{ id: 'A', properties: [1], inJail: false, skipTurns: 0 }],
    ownerships: { 1: 'A' }, tokens: {},
  };
  assert.equal(tileAmount(BOARD, owned, 1), BOARD[1].rents[0]);
});

test('2D i 3D plán berou částku z tileAmount', () => {
  const read = rel => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
  for (const file of ['../public/js/ui/board.js', '../public/js/ui/board3d.js']) {
    assert.match(read(file), /tileAmount\(/, `${file} nepoužívá tileAmount`);
  }
});

// ─── Služby: nájem místo nákupní ceny ───────────────────────────────────────

const GameEngine = require('../src/GameEngine');

function withServices(owned, inflation = 0) {
  const players = [{ id: 'A', properties: owned.slice(), inJail: false, skipTurns: 0, balance: 30000 }];
  return { players, ownerships: Object.fromEntries(owned.map(id => [id, 'A'])), tokens: {}, inflation };
}

function engineRent(gs, spaceId, dice) {
  const engine = new GameEngine({ to: () => ({ emit: () => {} }) }, 'room-test');
  gs.players.forEach(p => engine.players.set(p.id, { ...p }));
  engine.ownerships = gs.ownerships;
  engine.tokens = gs.tokens;
  engine.inflation = gs.inflation;
  return engine._calcRent(spaceId, dice);
}

const TRENERS = BOARD.filter(s => s.serviceType === 'trener').map(s => s.id);
const PREPRAVA = BOARD.find(s => s.serviceType === 'preprava').id;
const STAJE = BOARD.find(s => s.serviceType === 'staje').id;

test('koupený trenér ukazuje nájem jako server (1 000 Kč × počet trenérů)', () => {
  for (const [owned, inflation] of [[[TRENERS[0]], 0], [TRENERS.slice(0, 3), 0], [TRENERS.slice(0, 2), 2]]) {
    const gs = withServices(owned, inflation);
    assert.equal(tileAmount(BOARD, gs, owned[0]), engineRent(gs, owned[0], 1));
    assert.equal(tileSuffix(BOARD, gs, owned[0]), ' Kč');
    assert.equal(tileShowsRent(BOARD, gs, owned[0]), true);
  }
});

test('Přeprava a Stáje ukazují násobek hodu jako server (200×, s oběma 500×)', () => {
  for (const owned of [[PREPRAVA], [STAJE], [PREPRAVA, STAJE]]) {
    for (const inflation of [0, 1]) {
      const gs = withServices(owned, inflation);
      // hod 1 = přesně ten násobek, který políčko ukazuje
      assert.equal(tileAmount(BOARD, gs, owned[0]), engineRent(gs, owned[0], 1));
      assert.equal(tileSuffix(BOARD, gs, owned[0]), '× hod');
    }
  }
  assert.equal(serviceRent(BOARD, withServices([PREPRAVA]), PREPRAVA).amount, 200);
  assert.equal(serviceRent(BOARD, withServices([PREPRAVA, STAJE]), STAJE).amount, 500);
});

test('násobky Přepravy a Stájí na klientovi zrcadlí server', () => {
  assert.equal(SERVICE_DICE_RENT.single, SERVICE_RENT_SINGLE);
  assert.equal(SERVICE_DICE_RENT.pair, SERVICE_RENT_PAIR);
});

test('volná služba ukazuje nákupní cenu', () => {
  assert.equal(serviceRent(BOARD, EMPTY, PREPRAVA), null);
  assert.equal(tileAmount(BOARD, EMPTY, PREPRAVA), BOARD[PREPRAVA].price);
  assert.equal(tileSuffix(BOARD, EMPTY, PREPRAVA), ' Kč');
  assert.equal(tileShowsRent(BOARD, EMPTY, PREPRAVA), false);
});
