// Počet připojených lidí na úvodní obrazovce (událost `server:online`).
// Čistý modul bez DOM, aby šel otestovat.

/** „1 hráč online", „3 hráči online", „5 hráčů online". */
export function onlineLabel(count) {
  const n = Math.max(0, Math.floor(Number(count) || 0));
  if (n === 1) return '1 hráč online';
  if (n >= 2 && n <= 4) return `${n} hráči online`;
  return `${n} hráčů online`;
}
