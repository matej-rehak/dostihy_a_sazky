// Čistá rozhodovací logika animace kostky — bez DOM a bez vedlejších efektů.
// Stejný vzor jako pawnAnimationGate.mjs, aby šla otestovat bez prohlížeče.

/** Roztočení kostky před dosednutím. Musí odpovídat `diceSpin` v style.css. */
export const SPIN_MS = 400;

/** Dosednutí na výslednou hodnotu. Musí odpovídat inline transition v dice.js. */
export const LAND_MS = 600;

/** Pulz a jiskry po šestce. Musí odpovídat `diceSixPulse` a `diceSparkOut`. */
export const SIX_ANIM_MS = 700;

/**
 * Celková doba od hodu po dohranou šestku.
 * O tuhle hodnotu se opírá SIX_REROLL_DELAY_MS v src/constants.js — server
 * o ni odkládá další hod, aby animaci neutnul.
 */
export const SIX_TOTAL_MS = SPIN_MS + LAND_MS + SIX_ANIM_MS;

/** Nový hod se pozná podle id; stejné id znamená jen překreslení stavu. */
export function shouldStartRollAnimation(lastDice, prevDiceId) {
  if (!lastDice) return false;
  return lastDice.id !== prevDiceId;
}

/**
 * Smí se spustit oslavná animace šestky?
 *
 * `rollSeq` je pořadí hodu, ke kterému odložená práce patří, `currentSeq`
 * pořadí hodu, který právě běží. Po šestce se hází znovu, takže odložená
 * práce staršího hodu může vybouchnout až uprostřed hodu dalšího — tehdy se
 * musí tiše vzdát, jinak zajiskří nad kostkou točící se na jinou hodnotu.
 */
export function shouldTriggerSixAnimation(diceValue, rollSeq, currentSeq) {
  if (diceValue !== 6) return false;
  return rollSeq === currentSeq;
}

/** Úklid po hodu smí sahat na DOM jen tehdy, když mezitím nezačal hod další. */
export function shouldClearRollVisuals(rollSeq, currentSeq) {
  return rollSeq === currentSeq;
}
