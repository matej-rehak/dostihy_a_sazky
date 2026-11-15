/**
 * Stavy hráče — čistá logika bez DOM (testy: tests/player-status.test.mjs).
 *
 * statusBadges → štítky u jména v panelu hráčů (ui/players.js)
 * skipBanner   → banner „Toto kolo stojíš" pro přeskočeného hráče (ui/skipBanner.js)
 */

/** „1 kolo", „2 kola", „5 kol" */
export function turnsLabel(n) {
  if (n === 1) return '1 kolo';
  if (n >= 2 && n <= 4) return `${n} kola`;
  return `${n} kol`;
}

/**
 * Štítky aktivních stavů hráče v pořadí: stání (zdržení, doping, Distanc),
 * pak výhody a nároky na příští tah.
 * `kind` = CSS modifikátor, `short` = zkrácený text pro mobil.
 */
export function statusBadges(p, config = {}) {
  const out = [];
  if (p.waitTurns > 0) {
    out.push({ kind: 'wait', icon: '⏳', text: `Zdržen · ${turnsLabel(p.waitTurns)}`, short: String(p.waitTurns),
      title: `Zdržení z karty — stojí ještě ${turnsLabel(p.waitTurns)}, žetony dál platí` });
  }
  if (p.skipTurns > 0) {
    out.push({ kind: 'doping', icon: '🤒', text: `Doping · ${turnsLabel(p.skipTurns)}`, short: String(p.skipTurns),
      title: `Doping — stojí ještě ${turnsLabel(p.skipTurns)}, žetony mezitím neplatí` });
  }
  if (p.inJail) {
    const n = p.jailTurns > 0 ? p.jailTurns : 0;
    out.push({ kind: 'jail', icon: '🔒', text: n ? `Distanc · ${turnsLabel(n)}` : 'Distanc', short: n ? String(n) : '',
      title: n ? `Distanc — ještě ${turnsLabel(n)}` : 'Distanc' });
  }
  if (p.halfPriceNext) {
    out.push({ kind: 'half', icon: '🎟️', text: 'Kůň za ½', short: '½', title: 'Přednostní právo — příští volný kůň za polovinu' });
  }
  if (p.pendingBet) {
    const { threshold, payout } = p.pendingBet;
    out.push({ kind: 'bet', icon: '🎲', text: `Sázka ${threshold}+`, short: `${threshold}+`,
      title: `Sázka na vlastní hod — padne-li ${threshold}+ při příštím hodu, výhra ${Number(payout).toLocaleString('cs-CZ')} Kč` });
  }
  if (p.canFly && config.field20Mode === 'airport') {
    out.push({ kind: 'fly', icon: '✈️', text: 'Letí', short: '', title: 'Na začátku příštího tahu může letět z Letiště' });
  }
  if (p.canSpin && config.field30Mode === 'roulette') {
    out.push({ kind: 'spin', icon: '🎡', text: 'Točí', short: '', title: 'Na začátku příštího tahu může zatočit Ruletou' });
  }
  return out;
}

const SKIP_REASON = {
  wait: { icon: '⏳', label: 'Zdržení z karty' },
  doping: { icon: '🤒', label: 'Doping · žetony ti neplatí' },
};

/**
 * Banner pro přeskočený tah — jen hráči, kterého server právě přeskočil,
 * dokud je na tahu, a jen jednou pro každé `turnSkip.id`.
 */
export function skipBanner(gameState, myId, lastShownId) {
  const s = gameState?.turnSkip;
  if (!s || !myId || s.playerId !== myId) return null;
  if (gameState.currentTurnId !== myId || s.id === lastShownId) return null;
  const r = SKIP_REASON[s.reason] || SKIP_REASON.wait;
  const rest = s.remaining > 0 ? `zbývá ještě ${turnsLabel(s.remaining)}` : 'tohle je poslední kolo';
  return { id: s.id, icon: r.icon, kind: s.reason === 'doping' ? 'doping' : 'wait',
    title: 'Toto kolo stojíš', text: `${r.label} · ${rest}`, remaining: s.remaining };
}
