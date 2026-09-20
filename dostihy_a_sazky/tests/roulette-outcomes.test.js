'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { OUTCOMES, spin } = require('../src/Roulette');

test('devět výsečí s povinnými poli a unikátními id', () => {
  assert.equal(OUTCOMES.length, 9);

  const ids = new Set();
  for (const o of OUTCOMES) {
    assert.equal(typeof o.id, 'string', `id chybí u ${JSON.stringify(o)}`);
    assert.ok(o.icon && o.name && o.text, `popisná pole chybí u ${o.id}`);
    assert.ok(
      o.prompt === null || o.prompt === 'pick_horse' || o.prompt === 'pick_player',
      `neplatný prompt u ${o.id}: ${o.prompt}`
    );
    assert.equal(ids.has(o.id), false, `duplicitní id ${o.id}`);
    ids.add(o.id);
  }
});

test('spin vrací prvky podle rovnoměrného rozdělení', () => {
  // rnd je injektovaná, aby šlo testovat deterministicky
  assert.equal(spin(() => 0).id, OUTCOMES[0].id);
  assert.equal(spin(() => 0.999).id, OUTCOMES[8].id);

  // každá výseč je dosažitelná právě v jednom 1/9 pásmu
  for (let i = 0; i < 9; i++) {
    const middle = (i + 0.5) / 9;
    assert.equal(spin(() => middle).id, OUTCOMES[i].id, `pásmo ${i} nesedí`);
  }
});

test('sázka má férovou očekávanou hodnotu', () => {
  const bet = OUTCOMES.find(o => o.id === 'bet');
  // 1d6, hranice 5 → výhra ve 2 z 6 případů
  const winChance = (6 - bet.threshold + 1) / 6;
  const ev = winChance * bet.stake * bet.payoutMultiplier - bet.stake;
  assert.equal(ev, 0, `sázka není férová, EV = ${ev}`);
});

test('prompty sedí na očekávané výseče', () => {
  const byId = Object.fromEntries(OUTCOMES.map(o => [o.id, o]));
  assert.equal(byId.auction.prompt, 'pick_horse');
  assert.equal(byId.free_token.prompt, 'pick_horse');
  assert.equal(byId.strike.prompt, 'pick_player');
  assert.equal(byId.report.prompt, 'pick_player');
  assert.equal(byId.doping.prompt, null);
});
