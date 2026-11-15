// Oznámení vyjednávání — čistá logika bez DOM, aby šla testovat.
// Zdroje: gameState.tradeDrafts (kdo právě skládá nabídku a pro koho,
// src/mixins/trade.js) a gameState.tradeOffers (odeslané nabídky).

const nameOf = (gameState, id) => gameState?.players?.find(p => p.id === id)?.name ?? '?';

/**
 * Lišta nahoře pro hráče, kterého se rozpracovaná nabídka týká:
 * cílový hráč, u veřejné nabídky všichni kromě autora.
 * @returns {string|null}
 */
export function draftBannerText(gameState, myId) {
  const drafts = gameState?.tradeDrafts || {};
  for (const [fromId, { targetId }] of Object.entries(drafts)) {
    if (fromId === myId) continue;
    if (targetId === myId) return `${nameOf(gameState, fromId)} pro tebe skládá nabídku obchodu`;
  }
  for (const [fromId, { targetId }] of Object.entries(drafts)) {
    if (fromId === myId) continue;
    if (targetId === 'public') return `${nameOf(gameState, fromId)} připravuje veřejnou nabídku`;
  }
  return null;
}

/**
 * Štítek u hráče v panelu hráčů — kdo s kým vyjednává.
 * Přednost má rozpracovaná nabídka, pak odeslaná, na kterou se čeká.
 * @returns {{ text: string, live: boolean }|null} live = právě se skládá
 */
export function tradeBadge(gameState, playerId) {
  const drafts = gameState?.tradeDrafts || {};
  const mine = drafts[playerId];
  if (mine) {
    return mine.targetId === 'public'
      ? { text: 'skládá veřejnou nabídku', live: true }
      : { text: `skládá nabídku → ${nameOf(gameState, mine.targetId)}`, live: true };
  }
  const toMe = Object.entries(drafts).find(([, d]) => d.targetId === playerId);
  if (toMe) return { text: `dostane nabídku ← ${nameOf(gameState, toMe[0])}`, live: true };

  const offers = gameState?.tradeOffers || [];
  const sent = offers.find(o => o.fromId === playerId);
  if (sent) {
    return sent.targetId == null
      ? { text: 'veřejná nabídka', live: false }
      : { text: `nabídka → ${nameOf(gameState, sent.targetId)}`, live: false };
  }
  const received = offers.find(o => o.targetId === playerId);
  if (received) return { text: `nabídka ← ${nameOf(gameState, received.fromId)}`, live: false };
  return null;
}

/**
 * Nově odeslané nabídky proti minulému stavu — co komu oznámit.
 * @param {Set<string>|null} prevIds  id nabídek z minulého stavu (null = první stav, nic neoznamovat)
 * @returns {{ ids: Set<string>, notices: { text: string, forMe: boolean }[] }}
 */
export function newOfferNotices(gameState, prevIds, myId) {
  const offers = gameState?.tradeOffers || [];
  const ids = new Set(offers.map(o => o.id));
  if (!prevIds) return { ids, notices: [] };
  const notices = [];
  for (const o of offers) {
    if (prevIds.has(o.id) || o.fromId === myId) continue;
    const from = nameOf(gameState, o.fromId);
    if (o.targetId === myId) notices.push({ text: `${from} ti posílá nabídku obchodu`, forMe: true });
    else if (o.targetId == null) notices.push({ text: `${from} vystavil(a) veřejnou nabídku`, forMe: true });
    else notices.push({ text: `${from} navrhuje obchod hráči ${nameOf(gameState, o.targetId)}`, forMe: false });
  }
  return { ids, notices };
}
