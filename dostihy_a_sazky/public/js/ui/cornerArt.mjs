// Rohová pole: název, emoji a obrázková ikonka. Sdílí je 2D (board.js) i 3D
// (board3d.js). Pole 20 a 30 mění podobu podle nastavení hostitele
// (field20Mode / field30Mode). Čistý modul bez DOM, aby šel otestovat.

const ART = {
  start:    { name: 'START',               icon: '🚩', file: 'start' },
  jail:     { name: 'Distanc',             icon: '🔒', file: 'distanc' },
  parking:  { name: 'Parkoviště',          icon: '🅿️', file: 'parkoviste' },
  airport:  { name: 'Letiště',             icon: '✈️', file: 'letiste' },
  doping:   { name: 'Podezření z dopingu', icon: '💉', file: 'doping' },
  roulette: { name: 'Ruleta',              icon: '🎰', file: 'ruleta' },
};

// Ikonky, které už v public/img/ leží. Ostatní rohy zůstávají u emoji a
// prohlížeč se na neexistující soubor vůbec neptá (stejně jako horsePortraits.js).
const READY = new Set(['start', 'distanc', 'parkoviste', 'letiste', 'doping', 'ruleta']);

function artKey(spaceId, config) {
  if (spaceId === 0)  return 'start';
  if (spaceId === 10) return 'jail';
  if (spaceId === 20) return config?.field20Mode === 'airport' ? 'airport' : 'parking';
  if (spaceId === 30) return config?.field30Mode === 'roulette' ? 'roulette' : 'doping';
  return null;
}

/** { name, icon, img } rohového pole; img je null, dokud ikonka neexistuje. Pro jiná pole null. */
export function cornerArt(spaceId, config = {}) {
  const key = artKey(spaceId, config);
  if (!key) return null;
  const art = ART[key];
  return { name: art.name, icon: art.icon, img: READY.has(art.file) ? `img/${art.file}.png` : null };
}

/** Všechny soubory ikonek rohů, které hra umí použít (i ty, co ještě nejsou hotové). */
export const CORNER_ART_FILES = Object.values(ART).map(a => `img/${a.file}.png`);
