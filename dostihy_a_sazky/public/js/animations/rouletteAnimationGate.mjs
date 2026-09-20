/**
 * Čistá geometrie a načasování rulety — bez DOM, aby šla testovat.
 * Hodnota SPIN_MS musí sedět s `transition` na `.roulette-wheel`
 * v public/style.css; hlídá to tests/roulette-gate.test.mjs.
 */
export const SPIN_MS = 3200;
export const SPIN_TURNS = 4;

/**
 * Jak naložit s (dalším) požadavkem na zobrazení zatočení.
 *
 * `updateActionPanel` běží při KAŽDÉM `game:state`, ne jen při změně promptu —
 * během 3,2s točení sem tedy snadno přijde druhé zavolání se stejným `spinId`
 * (cizí reconnect, odpověď na obchodní nabídku). Dokud běží animace, musí být
 * takové zavolání no-op; dřív spadlo do větve „už viděno" a živé kolo skočilo
 * rovnou na výsledek.
 *
 * Paměť „už odanimováno" (`animatedSpinId`) je jiná otázka než „právě se točí"
 * (`spinningSpinId`) — první přežívá dotočení kvůli reconnectu, druhá ne.
 *
 * @returns {'ignore'|'snap'|'spin'}
 *   `ignore` = nesahat na běžící kolo, `snap` = ukázat rovnou dojeté,
 *   `spin` = roztočit.
 */
export function spinPlan({ spinId, animatedSpinId, spinningSpinId, animationEnabled }) {
  if (spinningSpinId != null && spinningSpinId === spinId) return 'ignore';
  if (!animationEnabled) return 'snap';
  if (animatedSpinId != null && animatedSpinId === spinId) return 'snap';
  return 'spin';
}

/** Kolik stupňů zabere jedna výseč. */
export function segmentAngle(count) {
  return 360 / count;
}

/**
 * O kolik stupňů otočit kolo, aby výseč `index` skončila pod ručičkou nahoře —
 * uprostřed svého pásma, ne na jeho okraji.
 *
 * Kolo se točí po směru, takže výseč se pod ručičku dostane odečtením jejího
 * počátečního úhlu od plné otáčky; odečtení poloviny `segmentAngle` pak
 * posune zastavení ze švu mezi výsečemi na střed té vybrané. `turns` přidává
 * celé otáčky kvůli efektu — na koncové poloze nic nemění.
 */
export function targetRotation(index, count, turns = SPIN_TURNS) {
  return turns * 360 - index * segmentAngle(count) - segmentAngle(count) / 2;
}
