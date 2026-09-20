// Čistá logika losování prvního hráče — bez DOM a bez vedlejších efektů.
// Stejný vzor jako pawnAnimationGate.mjs a diceAnimationGate.mjs.

/** Jak dlouho svítí jedno jméno. */
export const TICK_MS = 100;

/** Kolik jmen se vystřídá, než padne výherce. */
export const TICK_COUNT = 30;

/**
 * Kolik tiků už uplynulo od začátku losování.
 *
 * Počítá se z času, ne z počtu snímků — zdržený snímek tak tiky nezahodí,
 * ale dožene. Dřív to řešil `setInterval`, který se ale pod zátěží slučuje
 * a vůči snímkům drifruje.
 */
export function ticksElapsed(elapsedMs, tickMs = TICK_MS) {
  return Math.floor(elapsedMs / tickMs);
}

/** Padl už výherce? */
export function isStarterFinished(ticks, total = TICK_COUNT) {
  return ticks >= total;
}

/**
 * Další jméno v pořadí.
 *
 * Záměrně se střídá dokola, ne náhodně: náhodný výběr u dvou hráčů ukázal
 * stejné jméno zhruba v polovině tiků a kolo vypadalo zaseknuté.
 */
export function nextFlickerIndex(prevIndex, playerCount) {
  if (playerCount <= 0) return 0;
  return (prevIndex + 1) % playerCount;
}
