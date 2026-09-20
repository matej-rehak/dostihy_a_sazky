/**
 * Má uživatel v systému vypnuté animace?
 *
 * Vlastní modul, aby závislosti netvořily kruh: utils.js → settings.js →
 * reducedMotion.mjs. Kdyby to bydlelo v utils.js, musel by si settings.js
 * importovat utils a utils zpátky settings.
 *
 * Redukovaný pohyb neznamená nulový — barva a prolnutí zůstávají, mizí
 * posuny, rotace a nekonečné smyčky. CSS část řeší blok @media v style.css.
 */
export const prefersReducedMotion = () =>
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
