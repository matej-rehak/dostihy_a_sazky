'use strict';

const { eventId } = require('../random');
const { BOARD_SIZE, JAIL_SPACE } = require('../constants');

/**
 * Karta „Opakovaný hod" (Náhoda, jediná v balíčku, hráč si ji drží jako
 * „Zrušen distanc"). Po běžném hodu dostane držitel krátké okno
 * (DECISION_WINDOW_MS): hod nechat, nebo kartou hodit znovu. Nový hod
 * starý nahradí a karta se vrátí na spodek balíčku Náhoda.
 */
module.exports = {

  _offerReroll(pid, dice, bet) {
    const player = this.players.get(pid);
    // Kartu mohl mezitím ztratit (bankrot) — hod se prostě dohraje.
    if (!player || player.bankrupt || !(player.rerollCards > 0)) {
      return this._finishRoll(pid, dice, bet);
    }
    this._setTimedPendingAction('reroll_offer', pid, { dice, bet: bet || null, preview: this._rollPreview(pid, dice) });
  },

  /**
   * Co by hod udělal, kdyby ho hráč nechal — klient podle toho zvýrazní cílové
   * pole, aby se hráč mohl rozhodnout. Zrcadlí `_finishRoll`:
   * druhá šestka po sobě → Distanc, první šestka → hází znovu, jinak pohyb
   * o nasčítané hody.
   * @returns {{ kind: 'move', spaceId: number, steps: number }
   *         | { kind: 'jail', spaceId: number }
   *         | { kind: 'again', steps: number }}
   */
  _rollPreview(pid, dice) {
    const player = this.players.get(pid);
    const acc = player?.rollAccumulator || 0;
    if (dice === 6 && acc > 0) return { kind: 'jail', spaceId: JAIL_SPACE };
    if (dice === 6) return { kind: 'again', steps: acc + dice };
    const steps = acc + dice;
    return { kind: 'move', spaceId: ((player?.position || 0) + steps) % BOARD_SIZE, steps };
  },

  /** `decision === 'reroll'` kartu použije; cokoli jiného (i vypršení) hod ponechá. */
  _handleRerollOffer(pid, decision, actionData) {
    const player = this.players.get(pid);
    if (!player) return;
    const { dice, bet } = actionData || {};

    if (decision === 'reroll' && player.rerollCards > 0) {
      player.rerollCards--;
      this.nahodaCards.returnCard('reroll_card');
      const newDice = this._rollDie();
      this.lastDice = { value: newDice, id: eventId() };
      this._addLog(`🔁 ${player.name} nechce ${dice} a kartou „Opakovaný hod" hází znovu.`);
      return this._finishRoll(pid, newDice, bet);
    }
    this._finishRoll(pid, dice, bet);
  },
};
