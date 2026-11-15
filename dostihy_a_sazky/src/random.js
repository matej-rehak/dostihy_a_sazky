'use strict';

/**
 * Veškerá náhoda na serveru — kostka, Ruleta, míchání karet, pořadí hráčů
 * i identifikátory posílané klientům.
 *
 * Záměrně z `crypto`, ne z `Math.random`: ten je ve V8 předvídatelný
 * (xorshift128+) — z pár jeho výstupů jde dopočítat všechny další. Server
 * je dřív posílal hráčům jako identifikátory, takže kdo se podíval do síťové
 * komunikace, mohl předpovědět příští hody. Hlídá tests/secure-random.test.js.
 */
const crypto = require('node:crypto');

/** Celé číslo z [min, max) — rovnoměrně, bez zkreslení modulem. */
function randomInt(min, max) {
  return crypto.randomInt(min, max);
}

/** Desetinné číslo z [0, 1) — náhrada `Math.random` pro vážené výběry. */
function randomFloat() {
  // 48 náhodných bitů; `crypto.randomInt` tak velký rozsah neumí.
  return crypto.randomBytes(6).readUIntBE(0, 6) / 2 ** 48;
}

/** Fisher–Yates; vrací nové pole, vstup nemění. */
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(0, i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Jednoznačný identifikátor události (hod, pohyb figurky, zatočení…).
 * Klient ho jen porovnává s minulým, aby poznal novou událost.
 */
function eventId() {
  return crypto.randomUUID();
}

/** Krátký identifikátor (místnost, bot, obchod) — `length` hex znaků. */
function shortId(length = 9) {
  return crypto.randomBytes(Math.ceil(length / 2)).toString('hex').slice(0, length);
}

module.exports = { randomInt, randomFloat, shuffle, eventId, shortId };
