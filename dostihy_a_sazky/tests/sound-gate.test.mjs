import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { isRouletteMoment } from '../public/js/soundGate.mjs';
import { playsStepSound, getPawnStepDelay } from '../public/js/animations/pawnAnimationGate.mjs';

const read = rel => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

test('peníze kolem Rulety se neozvučují', () => {
  assert.equal(isRouletteMoment('roulette_choice', 'roulette_ack'), true);   // poplatek za zatočení
  assert.equal(isRouletteMoment('roulette_ack', null), true);                // Jackpot / Pokuta
  assert.equal(isRouletteMoment('roulette_ack', 'roulette_choice'), true);   // Toč znovu
  assert.equal(isRouletteMoment('wait_roll', null), false);                  // běžný nájem
  assert.equal(isRouletteMoment(null, 'buy_offer'), false);
});

test('main.js tlumí zvuky peněz během Rulety', () => {
  assert.match(read('../public/js/main.js'), /id === state\.myId && !silentMoney/);
});

test('krok figurky zní jen u běžného tahu, ne při dlouhém přesunu', () => {
  assert.equal(playsStepSound(4), true);
  assert.equal(playsStepSound(11), true);
  assert.equal(playsStepSound(12), false);
  assert.equal(playsStepSound(30), false);
  // hranice sedí s přechodem na zrychlenou chůzi
  assert.equal(getPawnStepDelay(11), 180);
  assert.notEqual(getPawnStepDelay(12), 180);
  assert.match(read('../public/js/animations/pawns.js'), /if \(stepSound\) audioManager\.play\('step'\)/);
});
