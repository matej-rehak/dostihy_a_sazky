import { makeEl } from '../utils.js';

/**
 * Ubývající lišta časovaného rozhodnutí (odkup koně, karta „Opakovaný hod").
 *
 * Server posílá v `pa.data` délku okna `windowMs` a `windowId`. Začátek se
 * počítá od chvíle, kdy klient okno poprvé uviděl — ne podle serverových
 * hodin, které se s klientem nemusí shodovat. Překreslení panelu tak lištu
 * nerestartuje; server čeká o chvilku déle (DECISION_GRACE_MS), takže klik
 * na konci lišty ještě projde.
 */
const firstSeen = new Map();

export function decisionTimerBar(pa) {
  const windowMs = Number(pa?.data?.windowMs);
  const windowId = pa?.data?.windowId;
  if (!windowMs || !windowId) return null;

  if (!firstSeen.has(windowId)) {
    // Stará okna nepotřebujeme — paměť drží jen pár posledních.
    if (firstSeen.size > 20) firstSeen.clear();
    firstSeen.set(windowId, Date.now());
  }
  const elapsed = Math.min(windowMs, Date.now() - firstSeen.get(windowId));

  const bar = makeEl('div', 'decision-timer');
  bar.setAttribute('role', 'progressbar');
  bar.setAttribute('aria-label', 'Zbývající čas na rozhodnutí');
  const fill = makeEl('div', 'decision-timer-fill');
  // Záporné zpoždění = animace naskočí rovnou tam, kde lišta má být.
  fill.style.animationDuration = `${windowMs}ms`;
  fill.style.animationDelay = `-${elapsed}ms`;
  bar.appendChild(fill);

  const label = makeEl('span', 'decision-timer-label');
  const tick = () => {
    const left = Math.max(0, windowMs - (Date.now() - firstSeen.get(windowId)));
    label.textContent = `${Math.ceil(left / 1000)} s`;
    if (left > 0 && bar.isConnected) requestAnimationFrame(tick);
  };
  tick();
  // První snímek proběhne až po vložení do DOM.
  requestAnimationFrame(tick);
  bar.appendChild(label);
  return bar;
}
