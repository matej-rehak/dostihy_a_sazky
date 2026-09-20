// Přepínače efektů — čistá logika bez DOM a bez localStorage.
// Stejný vzor jako ostatní brány v projektu (pawnAnimationGate, renderGate).

/** Klíče v pořadí, v jakém se zobrazují v nastavení. */
export const SETTING_KEYS = [
  'pawnAnimation',      // pohyb figurky po plánu
  'cardFlip',           // otáčení karty Finance / Náhoda
  'particles',          // částice na pozadí
  'sixSparks',          // jiskry po hodu šestky
  'starterDraw',        // losování prvního hráče
  'celebrationOverlays',// oslavné obrazovky (dokončená stáj, bankrot)
  'toasts',             // informativní vyskakovací hlášky
];

/** Ve výchozím stavu je zapnuté všechno. */
export const DEFAULTS = Object.freeze(
  Object.fromEntries(SETTING_KEYS.map(key => [key, true]))
);

/**
 * Sloučí uložené nastavení s výchozím.
 *
 * Uloženému objektu se nevěří: může pocházet ze starší verze hry, mít klíče
 * navíc nebo hodnoty, které nejsou booleovské. Bere se jen to, čemu rozumíme.
 * Pozor na `stored[key] || DEFAULTS[key]` — to by vypnutý přepínač zase
 * zaplo, proto se testuje typ, ne pravdivost.
 */
export function mergeSettings(stored) {
  const result = { ...DEFAULTS };
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return result;

  for (const key of SETTING_KEYS) {
    if (typeof stored[key] === 'boolean') result[key] = stored[key];
  }
  return result;
}

/** Načte nastavení z uloženého řetězce. Rozbitý vstup dá výchozí nastavení. */
export function parseSettings(raw) {
  if (typeof raw !== 'string' || raw === '') return { ...DEFAULTS };
  try {
    return mergeSettings(JSON.parse(raw));
  } catch (err) {
    return { ...DEFAULTS };
  }
}

/** Připraví nastavení k uložení. */
export function serializeSettings(settings) {
  return JSON.stringify(mergeSettings(settings));
}
