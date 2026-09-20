'use strict';

const { ACTION_DELAY_MS } = require('../constants');
const { OUTCOMES, spin } = require('../Roulette');
const BOARD = require('../data/boardData');

/**
 * Na kolik ZAČÁTKŮ VLASTNÍCH TAHŮ cíle se stávka nabíjí.
 *
 * `tokenStrike` se odečítá v `_startTurn` cílového hráče. S hodnotou 1 by
 * stávka zhasla hned na začátku jeho nejbližšího tahu — ve hře dvou hráčů
 * by tedy nezafungovala vůbec: točící hráč by se ke svému dalšímu tahu dostal
 * až po jejím vypršení a platil by plný nájem.
 *
 * Dvojka nechá stávku přežít cílův nejbližší tah a zhasne až na začátku toho
 * druhého. Tím pokryje celé kolo soupeřů mezi dvěma tahy cíle — a hlavně tah
 * hráče, který stávku vyvolal. Hlídá to tests/roulette-modifiers.test.js.
 */
const STRIKE_TARGET_TURNS = 2;

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
      case 'bet': {
        // Strhává se HNED, ne až při hodu — jinak by hráč mohl mezitím
        // zbankrotovat a sázka by zmizela bez zaplacení.
        const stake = Math.min(outcome.stake, player.balance);
        if (stake <= 0) {
          this._addLog(`🎲 ${player.name} nemá na sázku — Totalizátor tentokrát nepřijímá.`);
          return false;
        }
        player.balance -= stake;
        player.pendingBet = {
          stake,
          threshold: outcome.threshold,
          payout: stake * outcome.payoutMultiplier,
        };
        this._addLog(`🎲 ${player.name} vsadil(a) ${stake} Kč na vlastní hod (${outcome.threshold}+).`);
        return false;
      }

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

      case 'strike':
      case 'report': {
        const candidates = this.turnOrder.filter(
          id => id !== pid && !this.players.get(id)?.bankrupt
        );
        if (candidates.length === 0) {
          this._addLog(`🎰 ${player.name} nemá koho vybrat — efekt propadá.`);
          return false;
        }
        this._setPendingAction({
          type: 'roulette_pick_player',
          targetId: pid,
          data: { outcomeId: outcome.id, candidates },
        });
        return true;
      }

      case 'auction': {
        const options = BOARD
          .filter(s => s.type === 'horse' && !this.ownerships[s.id])
          .map(s => ({
            spaceId: s.id,
            price: Math.round(s.price * (1 + outcome.surchargePct / 100)),
          }))
          .filter(o => o.price <= player.balance);

        if (options.length === 0) {
          this._addLog(`🏇 ${player.name} nemá na žádného volného koně — dražba propadá.`);
          return false;
        }
        this._setPendingAction({
          type: 'roulette_pick_horse',
          targetId: pid,
          data: { outcomeId: outcome.id, options },
        });
        return true;
      }

      case 'free_token': {
        const options = player.properties
          .filter(sid => {
            const space = BOARD[sid];
            if (space.type !== 'horse') return false;
            if (!this._ownsFullGroup(pid, space.group)) return false;
            const tok = this.tokens[sid] || { small: 0, big: false };
            return !tok.big && tok.small < 4;
          })
          .map(sid => ({ spaceId: sid, price: 0 }));

        if (options.length === 0) {
          this._addLog(`🏗️ ${player.name} nemá koně z úplné stáje — dostih zdarma propadá.`);
          return false;
        }
        this._setPendingAction({
          type: 'roulette_pick_horse',
          targetId: pid,
          data: { outcomeId: outcome.id, options },
        });
        return true;
      }

      default:
        return false;
    }
  },

  /**
   * Vyhodnotí volbu koně z dražby nebo dostihu zdarma.
   *
   * `options` v `actionData` je jen SNÍMEK z okamžiku otevření promptu —
   * `_handleTradeResponse` je routováno nezávisle na `pendingAction` (viz
   * komentář v `handleRespond`), takže zatímco tento prompt visí otevřený,
   * soupeř může přijmout dřívější obchodní nabídku od `pid` a změnit mu
   * zůstatek nebo vlastnictví koní. Proto se tady živý stav ověřuje ZNOVU,
   * ne jen podle `chosen` ze snímku — jinak by dražba mohla hráče poslat
   * do záporu a nechtěně zbankrotovat, nebo by dostih zdarma přistál na
   * koni, který mezitím patří někomu jinému.
   */
  _handleRoulettePickHorse(pid, decision, actionData) {
    const { outcomeId, options } = actionData || {};
    const player = this.players.get(pid);
    const chosen = (options || []).find(o => o.spaceId === decision);

    if (!player || !chosen) {
      // Odmítnutí i nesmysl z klienta efekt spotřebují — nedrží se na příště.
      this._addLog('🎰 Nabídka Totalizátoru nevyužita.');
    } else if (outcomeId === 'auction') {
      const stillFree = !this.ownerships[chosen.spaceId];
      if (stillFree && player.balance >= chosen.price) {
        // Vlastní cena → `_buyProperty` nespotřebuje přednostní právo.
        this._buyProperty(pid, chosen.spaceId, chosen.price);
      } else {
        this._addLog(`🏇 Nabídka Totalizátoru na ${BOARD[chosen.spaceId].name} mezitím propadla.`);
      }
    } else if (outcomeId === 'free_token') {
      const space = BOARD[chosen.spaceId];
      const stillEligible = this.ownerships[chosen.spaceId] === pid
        && this._ownsFullGroup(pid, space.group);
      const tok = this.tokens[chosen.spaceId] || { small: 0, big: false };
      if (stillEligible && !tok.big && tok.small < 4) {
        if (!this.tokens[chosen.spaceId]) this.tokens[chosen.spaceId] = tok;
        tok.small++;
        this._addLog(`🏗️ ${player.name} dostal(a) žeton dostihů na ${space.name} zdarma.`);
      } else {
        this._addLog(`🏗️ Nabídka Totalizátoru na ${space.name} mezitím propadla.`);
      }
    }

    this._broadcast();
    this._scheduleAction(ACTION_DELAY_MS, () => this._offerTokensOrEnd(pid));
  },

  _handleRoulettePickPlayer(pid, decision, actionData) {
    const { outcomeId, candidates } = actionData || {};
    const target = this.players.get(decision);

    // Neplatný cíl (vlastní id, bankrotář, nesmysl z klienta) efekt zahodí.
    // `target.bankrupt` se ověřuje ZNOVU tady, ne jen při vytvoření promptu —
    // kandidát mohl mezi otevřením promptu a odpovědí zbankrotovat (odpojení
    // hráče), a `candidates` je jen snímek z okamžiku otočení kolem.
    // Tah musí pokračovat, jinak by hra zamrzla.
    if (!target || target.bankrupt || !candidates || !candidates.includes(decision)) {
      this._addLog('🎰 Neplatný cíl — efekt Totalizátoru propadá.');
    } else if (outcomeId === 'strike') {
      target.tokenStrike = STRIKE_TARGET_TURNS;
      this._addLog(`🚧 Ve stáji ${target.name} je stávka — jedno kolo mu nefungují žetony.`);
    } else if (outcomeId === 'report') {
      this._sendToJail(decision);
      this._addLog(`🎯 ${target.name} byl(a) udán(a) a míří na Distanc.`);
    }

    this._broadcast();
    this._scheduleAction(ACTION_DELAY_MS, () => this._offerTokensOrEnd(pid));
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

  /** Vyhodnotí a vynuluje sázku. Volá se z `handleRoll` na prvním hodu po vsazení. */
  _resolvePendingBet(pid, dice) {
    const player = this.players.get(pid);
    if (!player || !player.pendingBet) return;

    const { threshold, payout } = player.pendingBet;
    player.pendingBet = null;

    if (dice >= threshold) {
      player.balance += payout;
      this._addLog(`🎉 ${player.name} trefil(a) sázku (${dice}) a bere ${payout} Kč!`);
    } else {
      this._addLog(`💸 ${player.name} sázku neuhrál(a) (${dice}) — vklad propadá.`);
    }
  },
};
