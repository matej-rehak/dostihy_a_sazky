// Rozhodnutí „vyplatí se překreslit?" — čistá logika bez DOM.
//
// Server posílá `game:state` s debounce 50 ms, takže při rušné hře jich chodí
// až 20 za sekundu. Panel logu, závoje vlastnictví i tečky žetonů se přitom
// přestavovaly pokaždé, i když v nich byla pořád stejná data.

/** Změnil se herní log? Porovnává se po záznamech, log je krátký (≤20). */
export function logChanged(prev, next) {
  const a = prev ?? [];
  const b = next ?? [];
  if (a.length !== b.length) return true;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return true;
  }
  return false;
}

/** Změnilo se vlastnictví koní? Mapa políčko → hráč. */
export function ownershipsChanged(prev, next) {
  const a = prev ?? {};
  const b = next ?? {};
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return true;
  for (const key of aKeys) {
    if (a[key] !== b[key]) return true;
  }
  return false;
}

/** Změnily se žetony dostihů? Mapa políčko → { small, big }. */
export function tokensChanged(prev, next) {
  const a = prev ?? {};
  const b = next ?? {};
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return true;
  for (const key of aKeys) {
    const ta = a[key];
    const tb = b[key];
    if (!tb) return true;
    if (ta.small !== tb.small || ta.big !== tb.big) return true;
  }
  return false;
}
