import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BOARD_SPACES,
  getPawnDistance,
  nextPawnSpace,
  rectOffsetWithin,
  getPawnArcLift,
} from '../public/js/animations/pawnAnimationGate.mjs';

test('plán má 40 polí', () => {
  assert.equal(BOARD_SPACES, 40);
});

test('vzdálenost vpřed se počítá po směru hry', () => {
  assert.equal(getPawnDistance(4, 10, 1), 6);
  assert.equal(getPawnDistance(0, 39, 1), 39);
});

test('vzdálenost vpřed umí přes START', () => {
  assert.equal(getPawnDistance(38, 2, 1), 4);
  assert.equal(getPawnDistance(39, 0, 1), 1);
});

test('vzdálenost vzad se počítá opačně', () => {
  assert.equal(getPawnDistance(10, 4, -1), 6);
  assert.equal(getPawnDistance(2, 38, -1), 4);
});

test('stání na místě je nulová vzdálenost v obou směrech', () => {
  assert.equal(getPawnDistance(7, 7, 1), 0);
  assert.equal(getPawnDistance(7, 7, -1), 0);
});

test('další pole vpřed přeteče přes START', () => {
  assert.equal(nextPawnSpace(38, 1), 39);
  assert.equal(nextPawnSpace(39, 1), 0);
});

test('další pole vzad podteče pod START', () => {
  assert.equal(nextPawnSpace(1, -1), 0);
  assert.equal(nextPawnSpace(0, -1), 39);
});

// Figurka se během pohybu překládá do vrstvy nad plánem, aby ji neořízlo
// `overflow: hidden` na políčku. Souřadnice se proto musí přepočítat
// z viewportu na vrstvu.
test('souřadnice se přepočítají vůči vrstvě', () => {
  const rect = { left: 320, top: 210 };
  const layerRect = { left: 100, top: 60 };
  assert.deepEqual(rectOffsetWithin(rect, layerRect), { left: 220, top: 150 });
});

test('vrstva v počátku souřadnic nic nemění', () => {
  assert.deepEqual(
    rectOffsetWithin({ left: 12, top: 34 }, { left: 0, top: 0 }),
    { left: 12, top: 34 }
  );
});

// Při rychlém sledu kroků se oblouk nestihne přečíst a působí jako blikání,
// proto se u nejrychlejšího stupně jede rovně.
test('pomalý krok skáče vysoko, nejrychlejší vůbec', () => {
  assert.equal(getPawnArcLift(180), 20);
  assert.equal(getPawnArcLift(80), 12);
  assert.equal(getPawnArcLift(60), 0);
});

test('výška oblouku nikdy neklesne pod nulu', () => {
  assert.ok(getPawnArcLift(0) >= 0);
  assert.ok(getPawnArcLift(1000) >= 0);
});
