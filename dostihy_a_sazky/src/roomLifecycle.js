'use strict';

/**
 * Vrací true, pokud v dané mapě hráčů zůstává alespoň jeden člověk.
 * Boti nikdy nedisconnectují (`socketId: null`, `isBot: true`), takže
 * kdyby se místnost mazala jen podle `players.size === 0`, místnost
 * s bytem by po odchodu posledního člověka zůstala navždy viset.
 *
 * @param {Map<string, { isBot?: boolean }>} players
 * @returns {boolean}
 */
function hasHumanPlayers(players) {
  for (const player of players.values()) {
    if (!player.isBot) return true;
  }
  return false;
}

module.exports = { hasHumanPlayers };
