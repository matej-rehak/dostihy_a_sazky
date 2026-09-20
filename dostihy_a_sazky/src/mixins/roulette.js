'use strict';

const { ACTION_DELAY_MS } = require('../constants');
const { OUTCOMES, spin } = require('../Roulette');

module.exports = {

  /**
   * Vylosuje výseč a otevře potvrzovací prompt.
   *
   * Výsledek určuje SERVER a pošle ho v `pendingAction`. Klient kolo jen
   * dojíždí na už rozhodnutý výsledek — stejně jako u kostky (`lastDice`)
   * a karet (`card_ack`). Reconnect uprostřed točení tím nic nerozbije
   * a výsledek nejde ovlivnit z klienta.
   */
  _spinRoulette(pid) {
    const player = this.players.get(pid);
    if (!player) return;

    // `_rouletteRnd` existuje jen kvůli testům, v provozu je undefined.
    const outcome = spin(this._rouletteRnd || undefined);
    this._addLog(`🎰 ${player.name} točí Totalizátorem: ${outcome.icon} ${outcome.name}`);
    // `spinId` odlišuje jednotlivá zatočení — klient podle něj pozná, že po
    // reconnectu dostal tentýž výsledek znovu, a kolo už neroztáčí.
    // Stejný vzor jako `lastDice.id`.
    // `index` je pozice výseče v OUTCOMES — klient podle něj otočí kolo, aniž
    // by potřeboval vlastní kopii seznamu.
    this._setPendingAction({
      type: 'roulette_ack',
      targetId: pid,
      data: {
        result: {
          ...outcome,
          index: OUTCOMES.indexOf(outcome),
          spinId: Math.random(),
        },
      },
    });
    this._broadcast();
  },

  _handleRouletteAck(pid, actionData) {
    const outcome = actionData && actionData.result;
    if (!outcome) { this._offerTokensOrEnd(pid); return; }

    const opened = this._applyRouletteOutcome(pid, outcome);
    // Efekt s volbou si otevřel vlastní prompt — tah pokračuje až po odpovědi.
    if (opened) { this._broadcast(); return; }

    this._broadcast();
    this._scheduleAction(ACTION_DELAY_MS, () => this._offerTokensOrEnd(pid));
  },

  /**
   * @returns {boolean} true, pokud efekt otevřel další prompt
   */
  _applyRouletteOutcome(pid, outcome) {
    const player = this.players.get(pid);
    if (!player) return false;

    switch (outcome.id) {
      case 'preemption':
        player.halfPriceNext = true;
        this._addLog(`🎟️ ${player.name} má přednostní právo — příští volný kůň za polovinu.`);
        return false;

      case 'double_rent':
        player.doubleRent++;
        this._addLog(`💵 ${player.name} vybere příští nájem dvojnásobně.`);
        return false;

      case 'immunity':
        player.rentImmunity++;
        this._addLog(`🛡️ ${player.name} příští nájem neplatí.`);
        return false;

      case 'doping':
        player.skipTurns = outcome.turns;
        this._addLog(`🤒 ${player.name} je pod podezřením z dopingu — vynechává příští tah.`);
        return false;

      default:
        return false;
    }
  },

  /**
   * Spotřebuje nabité modifikátory a vrátí skutečnou částku k zaplacení.
   *
   * Vědomě NEŽIJE v `_calcRent` — ta se volá i pro zobrazení a odhady, a
   * spotřebovávat nabití při výpočtu by je nenávratně sežralo. Tohle se volá
   * výhradně z platebních míst.
   *
   * Pořadí je určující: imunita se vyhodnocuje AŽ PO zdvojnásobení, takže
   * proti dvojitému nájmu vyhraje — ale obě nabití se spotřebují.
   */
  _applyRentModifiers(payerId, ownerId, rent) {
    const payer = this.players.get(payerId);
    const owner = this.players.get(ownerId);
    let amount = rent;

    if (owner && owner.doubleRent > 0) {
      owner.doubleRent--;
      amount *= 2;
      this._addLog(`💵 ${owner.name} uplatňuje dvojitý nájem — ${amount} Kč.`);
    }

    if (payer && payer.rentImmunity > 0) {
      payer.rentImmunity--;
      this._addLog(`🛡️ ${payer.name} uplatňuje imunitu — nájem neplatí.`);
      return 0;
    }

    return amount;
  },
};
