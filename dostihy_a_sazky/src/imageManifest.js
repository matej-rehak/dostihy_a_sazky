'use strict';

const fs = require('fs');
const path = require('path');

const IMAGE_EXT = new Set(['.png', '.webp', '.jpg', '.jpeg', '.gif', '.svg']);

/**
 * Seznam obrázků ve složce (i v podsložkách) jako URL cesty pro klienta —
 * např. `img/horses/1.webp`. Klient si je po načtení stránky stáhne dopředu
 * (public/js/imagePreload.js), aby karta, Ruleta nebo portrét koně neukázaly
 * prázdné místo, než obrázek dorazí přes pomalé připojení.
 *
 * Čte se při každém požadavku, takže nově přidané portréty jsou v seznamu hned.
 * @param {string} dir    absolutní cesta ke složce s obrázky
 * @param {string} prefix URL prefix složky (např. 'img')
 * @returns {string[]}
 */
function listImages(dir, prefix) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out = [];
  for (const entry of entries) {
    const url = `${prefix}/${entry.name}`;
    if (entry.isDirectory()) out.push(...listImages(path.join(dir, entry.name), url));
    else if (IMAGE_EXT.has(path.extname(entry.name).toLowerCase())) out.push(url);
  }
  return out.sort();
}

module.exports = { listImages };
