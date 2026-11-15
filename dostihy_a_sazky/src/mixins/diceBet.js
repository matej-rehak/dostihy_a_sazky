'use strict';

const { fmt, DICE_BET_MIN_STAKE } = require('../constants');

/**
 * Sázka na vlastní hod kostkou (volitelné pravidlo, výchozí vypnuto).
 *
 * Hráč před běžným hodem (`wait_roll`) tipne číslo 1–6 a vsadí částku do
 * `config.diceBetMaxStake`. Vklad se strhne hned; padne-li tipnuté číslo,
 * dostane `vklad × config.diceBetMultiplier`, jinak vklad propadá.
 * Férová hra by vyplácela 6× — výchozích 5× dává bance mírnou výhodu.
 *
 * Sázka přichází spolu s hodem (`game:roll` s `{ bet }`), takže neexistuje
 * rozsázený mezistav, který by šlo zneužít nebo zapomenout.
 */

module.exports = {

  /**
   * Ověří a přijme sázku z požadavku na hod — strhne vklad.
   * @returns {{ ok: boolean, bet?: { number: number, stake: number }, error?: string }}
   *   `bet` je undefined, když hráč nesází.
   */
  _takeDiceBet(pid, rawBet) {
    if (rawBet == null) return { ok: true };
    if (!this.config.diceBetEnabled) return { ok: false, error: 'Sázky na hod jsou v této hře vypnuté.' };

    const player = this.players.get(pid);
    const number = Number(rawBet.number);
    const stake = Number(rawBet.stake);
    if (!Number.isInteger(number) || number < 1 || number > 6) {
      return { ok: false, error: 'Vsaď na číslo 1 až 6.' };
    }
    if (!Number.isInteger(stake) || stake < DICE_BET_MIN_STAKE) {
      return { ok: false, error: `Nejmenší vklad je ${fmt(DICE_BET_MIN_STAKE)} Kč.` };
    }
    if (stake > this.config.diceBetMaxStake) {
      return { ok: false, error: `Nejvyšší vklad je ${fmt(this.config.diceBetMaxStake)} Kč.` };
    }
    if (stake > player.balance) return { ok: false, error: 'Na takový vklad nemáš peníze.' };

    player.balance -= stake;
    this._addLog(`🎲 ${player.name} sází ${fmt(stake)} Kč, že padne ${number}.`);
    return { ok: true, bet: { number, stake } };
  },

  /** Vyhodnotí sázku po hodu. */
  _resolveDiceBet(pid, bet, dice) {
    if (!bet) return;
    const player = this.players.get(pid);
    if (!player) return;
    if (dice === bet.number) {
      const payout = bet.stake * this.config.diceBetMultiplier;
      player.balance += payout;
      this._addLog(`🎉 ${player.name} trefil(a) ${dice} a bere ${fmt(payout)} Kč!`);
    } else {
      this._addLog(`💸 Padlo ${dice}, ne ${bet.number} — ${player.name} přichází o vklad ${fmt(bet.stake)} Kč.`);
    }
  },
};
