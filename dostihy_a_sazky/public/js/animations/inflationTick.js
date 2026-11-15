import { prefersReducedMotion } from '../reducedMotion.mjs';
import { INFLATION_TICK_MS, tickValue } from './inflationTickGate.mjs';

/**
 * Protočí číslo z `from` na `to` a každou mezihodnotu předá do `render`.
 * `minStepMs` zředí překreslování (3D textury nemá smysl kreslit 60× za s).
 * Bez animace (omezený pohyb v systému) vykreslí rovnou cíl.
 *
 * @returns {() => void} zrušení — dál už se nekreslí nic
 */
export function tickNumber(from, to, render, { minStepMs = 0, onDone = null } = {}) {
  if (prefersReducedMotion() || from === to) {
    render(to);
    onDone?.();
    return () => {};
  }
  const start = performance.now();
  let last = -Infinity;
  let id = null;
  let cancelled = false;

  const frame = now => {
    if (cancelled) return;
    const t = (now - start) / INFLATION_TICK_MS;
    if (t >= 1) {
      render(to);
      onDone?.();
      return;
    }
    if (now - last >= minStepMs) {
      last = now;
      render(tickValue(from, to, t));
    }
    id = requestAnimationFrame(frame);
  };
  id = requestAnimationFrame(frame);
  return () => { cancelled = true; if (id) cancelAnimationFrame(id); };
}
