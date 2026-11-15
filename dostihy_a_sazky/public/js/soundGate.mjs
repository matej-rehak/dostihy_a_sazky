// Kdy hra zvuk NEpřehraje — čistá logika bez DOM a Audio, aby šla testovat.

/**
 * Pohyby peněz kolem Rulety (poplatek za zatočení, Jackpot, Pokuta, sázka)
 * se neozvučují — kolo má běžet potichu. Peníze se mění při přechodu
 * z jednoho promptu Rulety do dalšího, proto se dívá na předchozí i nový.
 */
export function isRouletteMoment(prevPaType, paType) {
  return [prevPaType, paType].some(t => typeof t === 'string' && t.startsWith('roulette'));
}
