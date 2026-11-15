// Čistá matematika hodu 3D kostkou — bez Three.js a bez DOM, aby šla otestovat.
// Časování hodu přebírá dice3d.js z diceAnimationGate.mjs, tady je jen tvar pohybu.

/**
 * Normála stěny s danou hodnotou v souřadnicích modelu (Three.js, y nahoru).
 * Musí odpovídat modelu public/models/kostka.glb — v Blenderu (z nahoru):
 * +Z = 1, -Z = 6, -Y = 2, +Y = 5, +X = 3, -X = 4. Export do glTF převádí
 * Blender (x, y, z) na (x, z, -y).
 */
export const FACE_NORMALS = Object.freeze({
  1: [0, 1, 0],
  6: [0, -1, 0],
  2: [0, 0, 1],
  5: [0, 0, -1],
  3: [1, 0, 0],
  4: [-1, 0, 0],
});

/** Normála stěny, která má po dopadu mířit nahoru; null pro neplatnou hodnotu. */
export function faceUpNormal(value) {
  return FACE_NORMALS[value] ?? null;
}

const clamp01 = t => Math.min(1, Math.max(0, t));
export const easeOutCubic = t => 1 - (1 - clamp01(t)) ** 3;

/** Kdy kostka poprvé dopadne (zlomek celého hodu). */
export const FIRST_IMPACT = 0.55;

// Odskoky po prvním dopadu: [začátek, konec, výška v jednotkách scény]
const BOUNCES = [
  [FIRST_IMPACT, 0.80, 0.16],
  [0.80, 0.93, 0.05],
];

/**
 * Výška kostky nad místem dopadu v čase t ∈ [0, 1].
 * Do prvního dopadu padá z `startHeight` (zrychleně), pak dvakrát odskočí.
 */
export function throwHeight(t, startHeight) {
  const u = clamp01(t);
  if (u < FIRST_IMPACT) {
    const s = u / FIRST_IMPACT;
    return startHeight * (1 - s * s);
  }
  for (const [from, to, h] of BOUNCES) {
    if (u >= from && u < to) {
      const s = (u - from) / (to - from);
      return 4 * h * s * (1 - s);
    }
  }
  return 0;
}

/** Jak daleko je kostka po vodorovné dráze (0 = start, 1 = místo dopadu). */
export function throwTravel(t) {
  return easeOutCubic(clamp01(t) / BOUNCES[BOUNCES.length - 1][1]);
}

/** Kolik z otáčení ještě zbývá (1 = na začátku, 0 = leží na výsledku). */
export function spinRemaining(t) {
  return 1 - easeOutCubic(t);
}

/** Zvětšení kostky při oslavě šestky, t ∈ [0, 1]; začíná i končí na 1. */
export function sixPulseScale(t) {
  const u = clamp01(t);
  return 1 + 0.25 * Math.sin(Math.PI * u);
}
