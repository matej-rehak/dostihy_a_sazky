/**
 * Čistá fyzika konfet — bez DOM a canvasu, aby šla testovat.
 * Kreslení a smyčku snímků řeší ./confetti.js.
 *
 * Konfety vystřelí dvě „děla" ze spodních rohů obrazovky šikmo nahoru ke
 * středu; odpor vzduchu je rychle zbrzdí a padají pak pomalu (každý má
 * vlastní mezní rychlost pádu), houpou se a točí jako papír.
 */

export const CONFETTI_MS = 4000;      // jak dlouho se konfety kreslí
export const CONFETTI_COUNT = 160;    // počet papírků na jeden výstřel
const GRAVITY = 900;                  // px / s²
const DRAG = 2.2;                     // útlum rychlosti za sekundu (exponenciální)
const FADE_FROM = 0.72;               // od jaké části trvání konfety mizí

/**
 * Paleta pro dokončenou stáj: barva stáje, zlatá hry a bílá. Barva stáje
 * je dvakrát, aby převažovala.
 */
export function stableConfettiColors(groupColor) {
  const base = typeof groupColor === 'string' && groupColor ? groupColor : '#ffd700';
  return [base, base, '#ffd700', '#b8960c', '#ffffff'];
}

/**
 * @param {{ width: number, height: number, colors: string[], count?: number, rnd?: () => number }} opts
 * @returns {object[]} papírky s polohou, rychlostí a rotací
 */
export function makeConfetti({ width, height, colors, count = CONFETTI_COUNT, rnd = Math.random }) {
  const pieces = [];
  for (let i = 0; i < count; i++) {
    const fromLeft = i % 2 === 0;
    // úhel od svislice, míří dovnitř obrazovky: 8°–35°
    const angle = (8 + rnd() * 27) * Math.PI / 180;
    // vrchol letu zhruba mezi horním okrajem a čtvrtinou výšky obrazovky
    const speed = height * (2.4 + rnd() * 0.9);
    const dir = fromLeft ? 1 : -1;
    pieces.push({
      x: fromLeft ? width * 0.02 : width * 0.98,
      y: height + 10,
      vx: dir * Math.sin(angle) * speed,
      vy: -Math.cos(angle) * speed,
      w: 7 + rnd() * 7,
      h: 4 + rnd() * 6,
      color: colors[Math.floor(rnd() * colors.length) % colors.length],
      rot: rnd() * Math.PI * 2,
      vrot: (rnd() - 0.5) * 14,
      wobble: rnd() * Math.PI * 2,
      round: rnd() < 0.25,
      term: 150 + rnd() * 110,   // mezní rychlost pádu, px / s
    });
  }
  return pieces;
}

/** Posune papírek o `dt` sekund. Mění předaný objekt a vrací ho. */
export function stepConfetti(p, dt) {
  const damp = Math.exp(-DRAG * dt);
  p.vx *= damp;
  p.vy = Math.min(p.vy * damp + GRAVITY * dt, p.term);
  p.wobble += dt * 6;
  p.x += (p.vx + Math.sin(p.wobble) * 40) * dt;
  p.y += p.vy * dt;
  p.rot += p.vrot * dt;
  return p;
}

/** Průhlednost podle uplynulého času — na konci konfety plynule zmizí. */
export function confettiOpacity(elapsedMs, durationMs = CONFETTI_MS) {
  const t = elapsedMs / durationMs;
  if (t <= FADE_FROM) return 1;
  if (t >= 1) return 0;
  return 1 - (t - FADE_FROM) / (1 - FADE_FROM);
}
