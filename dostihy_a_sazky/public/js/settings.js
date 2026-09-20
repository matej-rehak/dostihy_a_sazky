import { SETTING_KEYS, parseSettings, serializeSettings, mergeSettings } from './settingsGate.mjs';
import { prefersReducedMotion } from './reducedMotion.mjs';

const STORAGE_KEY = 'ds_settings';

let settings = { ...parseSettings(null) };

/** Načte nastavení z localStorage. Volá se jednou při startu. */
export function initSettings() {
  let raw = null;
  try { raw = localStorage.getItem(STORAGE_KEY); }
  catch (err) { /* privátní okno nebo zakázané úložiště */ }

  settings = parseSettings(raw);
  syncSettingsUi();
}

/**
 * Je efekt zapnutý?
 *
 * Systémový redukovaný pohyb má přednost před nastavením hry — když si
 * uživatel vypnul animace v systému, nemá je zapínat herní zaškrtávátko.
 * Oznámení se tím neřídí, ta pohyb neobsahují.
 */
export function isEffectEnabled(key) {
  if (!settings[key]) return false;
  if (key === 'celebrationOverlays' || key === 'toasts') return true;
  return !prefersReducedMotion();
}

/** Vrátí kopii nastavení (pro UI). */
export function getSettings() {
  return { ...settings };
}

export function setEffectEnabled(key, enabled) {
  if (!SETTING_KEYS.includes(key)) return;
  settings = mergeSettings({ ...settings, [key]: Boolean(enabled) });
  try { localStorage.setItem(STORAGE_KEY, serializeSettings(settings)); }
  catch (err) { /* neuložíme, ale v rámci session to platí */ }
}

/** Srovná zaškrtávátka v panelu nastavení s načteným stavem. */
export function syncSettingsUi() {
  for (const key of SETTING_KEYS) {
    const el = document.getElementById(`set-${key}`);
    if (el) el.checked = settings[key];
  }
}

// Panel nastavení v index.html používá inline atributy a globály, stejně jako
// posuvníky hlasitosti. Držíme se stejné konvence.
window.setGameSetting = (key, enabled) => setEffectEnabled(key, enabled);
