'use strict';

/**
 * Zatočí Ruletou za hráče `pid` tak, jak to jde ve hře: hráč minule zastavil
 * na poli 30 (má `canSpin`), na začátku tahu dostal volbu a zvolil „zatočit".
 * Výsledek si test vynutí přes `engine._rouletteRnd`. Po návratu čeká
 * `roulette_ack` (pokud má hráč na poplatek).
 */
function spinRoulette(engine, pid = 'A') {
  const player = engine.players.get(pid);
  player.position = 30;
  player.canSpin = true;
  engine._offerRoulette(pid);
  engine.handleRespond({ playerId: pid, emit: () => {} }, { decision: 'spin' });
}

module.exports = { spinRoulette };
