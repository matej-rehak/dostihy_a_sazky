import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { playerSoundEvents, betWinFromLog, rouletteResultSound } from '../public/js/soundEvents.mjs';

const P = (o = {}) => ({ id: 'A', name: 'Matěj', position: 5, skipTurns: 0, canFly: false, rerollCards: 0, bankrupt: false, ...o });

test('bez změny žádný zvuk', () => {
  assert.deepEqual(playerSoundEvents([P()], [P()]), []);
});

test('doping: skipTurns z 0 na víc', () => {
  assert.deepEqual(playerSoundEvents([P()], [P({ skipTurns: 2 })]), ['doping']);
  // odpočet kol už nehraje
  assert.deepEqual(playerSoundEvents([P({ skipTurns: 2 })], [P({ skipTurns: 1 })]), []);
});

test('let z Letiště: canFly zhasne a figurka se přesune', () => {
  assert.deepEqual(playerSoundEvents([P({ canFly: true, position: 20 })], [P({ canFly: false, position: 33 })]), ['airport']);
  // odmítnutý let (hází se kostkou) — pozice stejná
  assert.deepEqual(playerSoundEvents([P({ canFly: true, position: 20 })], [P({ canFly: false, position: 20 })]), []);
});

test('opakovaný hod: karta ubyde, ale ne při bankrotu', () => {
  assert.deepEqual(playerSoundEvents([P({ rerollCards: 1 })], [P({ rerollCards: 0 })]), ['reroll']);
  assert.deepEqual(playerSoundEvents([P({ rerollCards: 1 })], [P({ rerollCards: 0, bankrupt: true })]), []);
});

test('první stav (bez předchozích hráčů) nic nehraje', () => {
  assert.deepEqual(playerSoundEvents(undefined, [P({ skipTurns: 2 })]), []);
});

test('výhra sázky jen pro mě a jen z nových řádků logu', () => {
  const old = ['starý řádek'];
  const win = ['🎉 Matěj trefil(a) 4 a bere 25 000 Kč!', 'starý řádek'];
  assert.equal(betWinFromLog(old[0], win, 'Matěj'), true);
  assert.equal(betWinFromLog(old[0], win, 'Pavel'), false);
  assert.equal(betWinFromLog(win[0], win, 'Matěj'), false, 'už slyšený řádek se neopakuje');
  assert.equal(betWinFromLog(undefined, win, 'Matěj'), false, 'po načtení stránky nic');
});

test('serverové texty výhry sázky odpovídají tomu, co klient hledá', () => {
  const require = createRequire(import.meta.url);
  const fs = require('node:fs');
  const dice = fs.readFileSync(new URL('../src/mixins/diceBet.js', import.meta.url), 'utf8');
  const roul = fs.readFileSync(new URL('../src/mixins/roulette.js', import.meta.url), 'utf8');
  assert.match(dice, /`🎉 \$\{player\.name\} trefil\(a\)/);
  assert.match(roul, /`🎉 \$\{player\.name\} trefil\(a\) sázku/);
});

test('výsledek rulety podle skupiny výseče', () => {
  assert.equal(rouletteResultSound('good'), 'roulette_good');
  assert.equal(rouletteResultSound('bad'), 'roulette_bad');
  assert.equal(rouletteResultSound('neutral'), null);
});
