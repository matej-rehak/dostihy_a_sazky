import test from 'node:test';
import assert from 'node:assert/strict';
import { draftBannerText, tradeBadge, newOfferNotices } from '../public/js/ui/tradeNoticeView.mjs';

const players = [{ id: 'A', name: 'Matěj' }, { id: 'B', name: 'Petr' }, { id: 'C', name: 'Eva' }];

test('lišta se ukáže jen cílovému hráči, ne autorovi ani ostatním', () => {
  const gs = { players, tradeDrafts: { A: { targetId: 'B' } } };
  assert.equal(draftBannerText(gs, 'B'), 'Matěj pro tebe skládá nabídku obchodu');
  assert.equal(draftBannerText(gs, 'A'), null);
  assert.equal(draftBannerText(gs, 'C'), null);
});

test('veřejnou nabídku vidí v liště všichni kromě autora', () => {
  const gs = { players, tradeDrafts: { A: { targetId: 'public' } } };
  assert.equal(draftBannerText(gs, 'C'), 'Matěj připravuje veřejnou nabídku');
  assert.equal(draftBannerText(gs, 'A'), null);
});

test('štítky u obou stran rozpracované nabídky', () => {
  const gs = { players, tradeDrafts: { A: { targetId: 'B' } }, tradeOffers: [] };
  assert.deepEqual(tradeBadge(gs, 'A'), { text: 'skládá nabídku → Petr', live: true });
  assert.deepEqual(tradeBadge(gs, 'B'), { text: 'dostane nabídku ← Matěj', live: true });
  assert.equal(tradeBadge(gs, 'C'), null);
});

test('štítky u odeslané nabídky, dokud se nevyřeší', () => {
  const gs = { players, tradeDrafts: {}, tradeOffers: [{ id: 't1', fromId: 'A', targetId: 'B' }, { id: 't2', fromId: 'C', targetId: null }] };
  assert.deepEqual(tradeBadge(gs, 'A'), { text: 'nabídka → Petr', live: false });
  assert.deepEqual(tradeBadge(gs, 'B'), { text: 'nabídka ← Matěj', live: false });
  assert.deepEqual(tradeBadge(gs, 'C'), { text: 'veřejná nabídka', live: false });
});

test('první stav po připojení nic neoznamuje', () => {
  const gs = { players, tradeOffers: [{ id: 't1', fromId: 'A', targetId: 'B' }] };
  assert.deepEqual(newOfferNotices(gs, null, 'B').notices, []);
});

test('nová nabídka: cíl dostane osobní oznámení, ostatní obecné, autor nic', () => {
  const gs = { players, tradeOffers: [{ id: 't1', fromId: 'A', targetId: 'B' }] };
  const prev = new Set();
  assert.deepEqual(newOfferNotices(gs, prev, 'B').notices, [{ text: 'Matěj ti posílá nabídku obchodu', forMe: true }]);
  assert.deepEqual(newOfferNotices(gs, prev, 'C').notices, [{ text: 'Matěj navrhuje obchod hráči Petr', forMe: false }]);
  assert.deepEqual(newOfferNotices(gs, prev, 'A').notices, []);
});

test('už známá nabídka se neoznamuje znovu', () => {
  const gs = { players, tradeOffers: [{ id: 't1', fromId: 'A', targetId: 'B' }] };
  assert.deepEqual(newOfferNotices(gs, new Set(['t1']), 'B').notices, []);
});
