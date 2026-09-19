'use strict';

/**
 * Vrací true, pokud v dané mapě hráčů zůstává alespoň jeden přítomný člověk.
 *
 * Boti nikdy nedisconnectují (`socketId: null`, `isBot: true`), takže kdyby
 * se místnost mazala jen podle `players.size === 0`, místnost s botem by po
 * odchodu posledního člověka zůstala navždy viset.
 *
 * Pozor na fázi `playing`: `removePlayer` odcházejícího člověka ze `players`
 * NEMAŽE, jen ho zbankrotuje — proto se musí ignorovat i hráči s `left`.
 * Bez toho by opuštěná hra s boty běžela dál a trvale držela slot místnosti.
 * Zbankrotovaný člověk, který u hry zůstal (`left !== true`), se pořád počítá
 * — dívá se na dohrávku a místnost mu nesmíme zrušit pod rukama.
 *
 * Skuteční hráči z `addPlayer` mají `isBot` nedefinované (klíč se nenastavuje),
 * proto se testuje falsy hodnota, ne `=== false`.
 *
 * @param {Map<string, { isBot?: boolean, left?: boolean }>} players
 * @returns {boolean}
 */
function hasHumanPlayers(players) {
  for (const player of players.values()) {
    if (!player.isBot && !player.left) return true;
  }
  return false;
}

module.exports = { hasHumanPlayers };
