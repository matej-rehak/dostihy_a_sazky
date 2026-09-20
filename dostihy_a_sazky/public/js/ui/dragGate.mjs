// Meze posouvání modálních oken — čistá logika bez DOM.

/**
 * Kolik pixelů okna musí za každých okolností zůstat na obrazovce.
 * Bez toho si ho člověk jednou zasune za okraj a už ho nechytne zpátky.
 */
export const MIN_VISIBLE = 80;

function clamp(value, min, max) {
  // Když je okno větší než viewport, vyjde min > max. `max` pak vyhraje,
  // což drží levý horní roh v obraze — lepší než vracet NaN.
  return Math.max(Math.min(value, max), Math.min(min, max));
}

/**
 * Omezí posun okna tak, aby zůstalo chytitelné.
 *
 * @param pos       zamýšlený posun `{ x, y }` oproti původní poloze
 * @param rect      okno před posunem `{ left, top, width, height }`
 * @param viewport  `{ width, height }`
 */
export function clampDragPosition(pos, rect, viewport, minVisible = MIN_VISIBLE) {
  const minX = minVisible - rect.left - rect.width;
  const maxX = viewport.width - minVisible - rect.left;

  // Nahoru jen po okraj obrazovky — záhlaví nesmí zmizet pod horní hranou.
  const minY = -rect.top;
  const maxY = viewport.height - minVisible - rect.top;

  return {
    x: clamp(pos.x, minX, maxX),
    y: clamp(pos.y, minY, maxY),
  };
}
