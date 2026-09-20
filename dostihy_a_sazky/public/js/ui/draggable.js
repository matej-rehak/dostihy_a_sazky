import { clampDragPosition } from './dragGate.mjs';

// Prvky, u kterých pointerdown NESMÍ začít tažení — jinak by v záhlaví
// přestal fungovat zavírací křížek a vstupní pole.
const INTERACTIVE = 'button, a, input, select, textarea, [contenteditable]';

/**
 * Umožní posouvat `card` tažením za `handle`.
 *
 * Posun jde přes `transform`, ne `left`/`top` — běží po kompozitoru a
 * nevyvolává přepočet layoutu. Poloha se při každém otevření resetuje
 * doprostřed: zapamatovat si ji zní lákavě, ale po změně velikosti okna
 * nebo otočení telefonu by modál skončil mimo obraz.
 */
export function makeDraggable(card, handle) {
  if (!card || !handle || handle.dataset.dragReady === '1') return;
  handle.dataset.dragReady = '1';
  handle.classList.add('drag-handle');

  let pos = { x: 0, y: 0 };
  let start = null;

  const apply = () => { card.style.transform = `translate(${pos.x}px, ${pos.y}px)`; };

  const onPointerDown = ev => {
    if (ev.button !== undefined && ev.button !== 0) return;
    if (ev.target.closest(INTERACTIVE)) return;

    // Rect bez aktuálního posunu — meze se počítají z výchozí polohy.
    const rect = card.getBoundingClientRect();
    start = {
      px: ev.clientX,
      py: ev.clientY,
      ox: pos.x,
      oy: pos.y,
      rect: {
        left: rect.left - pos.x,
        top: rect.top - pos.y,
        width: rect.width,
        height: rect.height,
      },
    };

    handle.setPointerCapture?.(ev.pointerId);
    handle.classList.add('is-dragging');
    ev.preventDefault();
  };

  const onPointerMove = ev => {
    if (!start) return;
    pos = clampDragPosition(
      { x: start.ox + (ev.clientX - start.px), y: start.oy + (ev.clientY - start.py) },
      start.rect,
      { width: window.innerWidth, height: window.innerHeight }
    );
    apply();
  };

  const onPointerUp = ev => {
    if (!start) return;
    start = null;
    handle.releasePointerCapture?.(ev.pointerId);
    handle.classList.remove('is-dragging');
  };

  handle.addEventListener('pointerdown', onPointerDown);
  handle.addEventListener('pointermove', onPointerMove);
  handle.addEventListener('pointerup', onPointerUp);
  handle.addEventListener('pointercancel', onPointerUp);

  // Vrací funkci, kterou otevření modálu srovná okno zpátky doprostřed.
  card.__resetDrag = () => { pos = { x: 0, y: 0 }; card.style.transform = ''; };
}

/** Srovná okno zpět na výchozí polohu. */
function resetDrag(card) {
  card?.__resetDrag?.();
}

// Pracovní modaly — ta okna, u kterých chceš vidět plán pod nimi. Karta
// Finance/Náhoda, losování, oslavné obrazovky ani potvrzovací dialog tu
// schválně nejsou: buď zmizí samy za pár vteřin, nebo tě mají zastavit.
const MODALS = [
  { overlay: 'trade-overlay',         card: '.trade-modal',           handle: '.modal-header' },
  { overlay: 'debt-overlay',          card: '.debt-modal',            handle: '.modal-header' },
  { overlay: 'settings-overlay',      card: '.settings-modal',        handle: '.modal-header' },
  { overlay: 'debug-panel',           card: '.debug-modal',           handle: '.debug-header' },
  { overlay: 'space-inspect-overlay', card: '.space-inspect-content', handle: '.space-inspect-grip' },
];

/** Zapne posouvání u všech pracovních modálů. Volá se po načtení partials. */
export function initModalDragging() {
  for (const conf of MODALS) {
    const overlay = document.getElementById(conf.overlay);
    const card = overlay?.querySelector(conf.card);
    const handle = card?.querySelector(conf.handle);
    if (!overlay || !card || !handle) continue;

    makeDraggable(card, handle);

    // Otevření modálu srovná okno doprostřed. Sleduje se třída na overlayi,
    // protože otevíracích míst je přes deset ve čtyřech souborech — volání
    // roztroušená po nich by se u dalšího nového místa zapomnělo přidat.
    new MutationObserver(() => {
      if (!overlay.classList.contains('hidden')) resetDrag(card);
    }).observe(overlay, { attributes: true, attributeFilter: ['class'] });
  }
}
