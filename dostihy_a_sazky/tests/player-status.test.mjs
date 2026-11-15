import test from 'node:test';
import assert from 'node:assert/strict';
import { statusBadges, skipBanner } from '../public/js/ui/playerStatusView.mjs';

const cfg = { field20Mode: 'airport', field30Mode: 'roulette' };
const base = { id: 'A', inJail: false, jailTurns: 0, skipTurns: 0, waitTurns: 0, halfPriceNext: false, pendingBet: null, canFly: false, canSpin: false };
const kinds = p => statusBadges({ ...base, ...p }, cfg).map(b => b.kind);

test('bez stavů žádné štítky', () => {
  assert.deepEqual(statusBadges(base, cfg), []);
});

test('zdržení a doping ukazují počet kol', () => {
  const [wait] = statusBadges({ ...base, waitTurns: 2 }, cfg);
  assert.equal(wait.kind, 'wait');
  assert.equal(wait.text, 'Zdržen · 2 kola');
  assert.equal(wait.short, '2');
  const [dop] = statusBadges({ ...base, skipTurns: 1 }, cfg);
  assert.equal(dop.kind, 'doping');
  assert.equal(dop.text, 'Doping · 1 kolo');
});

test('české skloňování kol', () => {
  assert.equal(statusBadges({ ...base, waitTurns: 5 }, cfg)[0].text, 'Zdržen · 5 kol');
});

test('Distanc s počtem kol i bez', () => {
  assert.equal(statusBadges({ ...base, inJail: true, jailTurns: 3 }, cfg)[0].text, 'Distanc · 3 kola');
  assert.equal(statusBadges({ ...base, inJail: true, jailTurns: 0 }, cfg)[0].text, 'Distanc');
});

test('výhody a nároky', () => {
  assert.deepEqual(
    kinds({ halfPriceNext: true, pendingBet: { threshold: 5, payout: 15000, stake: 5000 }, canFly: true, canSpin: true }),
    ['half', 'bet', 'fly', 'spin'],
  );
  const bet = statusBadges({ ...base, pendingBet: { threshold: 5, payout: 15000, stake: 5000 } }, cfg)[0];
  assert.equal(bet.text, 'Sázka 5+');
});

test('let a točení jen v odpovídajícím režimu pole', () => {
  const p = { ...base, canFly: true, canSpin: true };
  assert.deepEqual(statusBadges(p, { field20Mode: 'parking', field30Mode: 'doping' }), []);
});

test('banner jen přeskočenému hráči, který je zrovna na tahu', () => {
  const gs = { currentTurnId: 'A', turnSkip: { id: 'x1', playerId: 'A', reason: 'wait', remaining: 1 } };
  const b = skipBanner(gs, 'A', null);
  assert.equal(b.id, 'x1');
  assert.equal(b.title, 'Toto kolo stojíš');
  assert.equal(b.text, 'Zdržení z karty · zbývá ještě 1 kolo');
  assert.equal(skipBanner(gs, 'B', null), null);
});

test('banner se neukáže podruhé ani po posunu tahu', () => {
  const gs = { currentTurnId: 'A', turnSkip: { id: 'x1', playerId: 'A', reason: 'doping', remaining: 0 } };
  assert.equal(skipBanner(gs, 'A', 'x1'), null);
  assert.equal(skipBanner({ ...gs, currentTurnId: 'B' }, 'A', null), null);
  assert.equal(skipBanner(gs, 'A', null).text, 'Doping · žetony ti neplatí · tohle je poslední kolo');
});
