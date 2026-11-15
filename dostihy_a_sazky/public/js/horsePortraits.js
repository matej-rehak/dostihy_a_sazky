// Portréty koní (olejomalba ve stylu obrazu uprostřed plánu). Soubor se jmenuje
// podle id políčka: img/horses/{id}.webp. Portréty přibývají stáj po stáji,
// proto se vede seznam hotových — koně bez portrétu se zobrazí bez obrázku
// a prohlížeč se na neexistující soubor vůbec neptá.
const READY = new Set([1, 3, 6, 8, 9, 11, 13, 14, 16, 18, 19, 21, 23, 24, 26, 27, 29, 31, 32, 34, 37, 39]);

export function horsePortrait(spaceId) {
  return READY.has(spaceId) ? `img/horses/${spaceId}.webp` : null;
}
