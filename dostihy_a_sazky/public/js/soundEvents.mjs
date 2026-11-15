/**
 * Kdy zahrát který zvuk — čistá logika bez DOM a audia
 * (testy: tests/sound-events.test.mjs). Přehrává main.js / roulette.js.
 */

/**
 * Zvuky ze změn hráčů mezi dvěma stavy hry (pro všechny hráče — vidí to
 * všichni u stolu, stejně jako Distanc).
 */
export function playerSoundEvents(prevPlayers, players) {
  if (!prevPlayers) return [];
  const prevById = new Map(prevPlayers.map(p => [p.id, p]));
  const out = [];
  for (const p of players) {
    const old = prevById.get(p.id);
    if (!old || p.bankrupt) continue;
    if (!(old.skipTurns > 0) && p.skipTurns > 0) out.push('doping');
    if (old.canFly && !p.canFly && old.position !== p.position) out.push('airport');
    if ((p.rerollCards || 0) < (old.rerollCards || 0)) out.push('reroll');
  }
  return out;
}

/**
 * Vyhrál jsem právě sázku (na vlastní hod nebo z Rulety)? Server ji ohlásí
 * řádkem logu „🎉 <jméno> trefil(a) …" — hledá se jen v řádcích, které
 * přibyly nad posledním známým horním řádkem.
 */
export function betWinFromLog(prevTop, log, myName) {
  if (prevTop === undefined || !myName || !Array.isArray(log)) return false;
  const prefix = `🎉 ${myName} trefil(a)`;
  for (const line of log) {
    if (line === prevTop) break;
    if (typeof line === 'string' && line.startsWith(prefix)) return true;
  }
  return false;
}

/** Zvuk výsledku Rulety podle skupiny výseče; neutrální bez zvuku. */
export function rouletteResultSound(group) {
  if (group === 'good') return 'roulette_good';
  if (group === 'bad') return 'roulette_bad';
  return null;
}
