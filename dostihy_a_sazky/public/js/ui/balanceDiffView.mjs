/**
 * Kam nakreslit vyskakující částku („+4 000 Kč") u zůstatku hráče.
 *
 * Částka je `position: fixed` mimo seznam hráčů — ten se posouvá
 * (overflow-y: auto) a dřív ji u prvního hráče ořízl. Tady se jen spočítá
 * pozice z obdélníku zůstatku tak, aby celá animace zůstala na obrazovce.
 * Testy: tests/balance-diff-position.test.mjs
 */

/** O kolik částka během animace vystoupá (keyframes floatDiff ve style.css). */
export const DIFF_RISE_PX = 30;
const START_ABOVE_PX = 15;
const MARGIN_PX = 4;

export function balanceDiffPosition(rect, width, viewportWidth) {
  const top = Math.max(rect.top - START_ABOVE_PX, DIFF_RISE_PX + MARGIN_PX);
  const maxLeft = viewportWidth - MARGIN_PX - width;
  const left = Math.max(MARGIN_PX, Math.min(rect.right - width, maxLeft));
  return { left: Math.round(left), top: Math.round(top) };
}
