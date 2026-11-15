'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { OUTCOMES, TOTAL_WEIGHT, GROUP_WEIGHT, spin, rndFor } = require('../src/Roulette');

const PROMPTS = new Set([null, 'pick_horse', 'pick_player', 'give_horse']);
const GROUPS = ['good', 'neutral', 'bad'];

test('výseče mají povinná pole a unikátní id', () => {
  const ids = new Set();
  for (const o of OUTCOMES) {
    assert.equal(typeof o.id, 'string', `id chybí u ${JSON.stringify(o)}`);
    assert.ok(o.icon && o.name && o.short && o.text, `popisná pole chybí u ${o.id}`);
    assert.ok(PROMPTS.has(o.prompt), `neplatný prompt u ${o.id}: ${o.prompt}`);
    assert.ok(GROUPS.includes(o.group), `neplatná skupina u ${o.id}: ${o.group}`);
    assert.ok(Number.isInteger(o.weight) && o.weight > 0, `neplatná váha u ${o.id}`);
    assert.equal(ids.has(o.id), false, `duplicitní id ${o.id}`);
    ids.add(o.id);
  }
});

test('dobré, neutrální a špatné výseče padají každá s třetinovou šancí', () => {
  for (const group of GROUPS) {
    const sum = OUTCOMES.filter(o => o.group === group).reduce((s, o) => s + o.weight, 0);
    assert.equal(sum, GROUP_WEIGHT, `skupina ${group} má váhu ${sum}`);
  }
  assert.equal(TOTAL_WEIGHT, GROUP_WEIGHT * 3);
});

test('silnější efekt je vzácnější', () => {
  const w = Object.fromEntries(OUTCOMES.map(o => [o.id, o.weight]));
  // dobré: jackpot < dostih zdarma < udání < přednostní právo
  assert.ok(w.jackpot < w.free_token && w.free_token < w.report && w.report < w.preemption);
  // špatné: pokuta < dar koně < doping < Distanc
  assert.ok(w.fine < w.give_horse && w.give_horse < w.doping && w.doping < w.jail);
});

test('spin vybírá podle vah', () => {
  assert.equal(spin(() => 0).id, OUTCOMES[0].id);
  assert.equal(spin(() => 0.999999).id, OUTCOMES[OUTCOMES.length - 1].id);

  // pásmo každé výseče je přesně tak široké, jaká je její váha
  let start = 0;
  for (const o of OUTCOMES) {
    const from = start / TOTAL_WEIGHT;
    const to = (start + o.weight) / TOTAL_WEIGHT;
    assert.equal(spin(() => from + 1e-9).id, o.id, `začátek pásma ${o.id}`);
    assert.equal(spin(() => to - 1e-9).id, o.id, `konec pásma ${o.id}`);
    start += o.weight;
  }
});

test('rndFor padne do výseče, kterou jmenuje', () => {
  for (const o of OUTCOMES) {
    assert.equal(spin(() => rndFor(o.id)).id, o.id);
  }
  assert.throws(() => rndFor('neexistuje'));
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
  assert.equal(byId.free_token.prompt, 'pick_horse');
  assert.equal(byId.report.prompt, 'pick_player');
  assert.equal(byId.give_horse.prompt, 'give_horse');
  assert.equal(byId.doping.prompt, null);
  assert.equal(byId.doping.turns, 2);
});
