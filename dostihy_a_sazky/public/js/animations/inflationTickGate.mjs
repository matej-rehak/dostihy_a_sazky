/**
 * Inflace z Rulety na plánu: ceny se „protočí" nahoru jako počítadlo.
 * Čistá logika bez DOM — kreslení řeší ./inflationTick.js.
 */

export const INFLATION_TICK_MS = 1400;

/**
 * Stoupla inflace mezi dvěma stavy? Při prvním stavu (načtení, reconnect)
 * je `prev` null — tehdy se nic neanimuje, ceny se jen ukážou.
 */
export function inflationRaised(prev, next) {
  return Number.isFinite(prev) && (next || 0) > prev;
}

/**
 * Hodnota počítadla v čase t ∈ [0, 1] — rychlý rozjezd, pomalý dojezd,
 * vždy celé koruny a na konci přesně cílová částka.
 */
export function tickValue(from, to, t) {
  if (t >= 1) return to;
  if (t <= 0) return from;
  const eased = 1 - (1 - t) ** 3;
  return Math.round(from + (to - from) * eased);
}
