/**
 * Čistá geometrie a načasování rulety — bez DOM, aby šla testovat.
 * Hodnota SPIN_MS musí sedět s `transition` na `.roulette-wheel`
 * v public/style.css; hlídá to tests/roulette-gate.test.mjs.
 */
export const SPIN_MS = 3200;
export const SPIN_TURNS = 4;

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
