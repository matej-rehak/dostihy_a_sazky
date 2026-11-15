'use strict';

const { ACTION_DELAY_MS, INFLATION_RATE, fmt } = require('../constants');
const { eventId } = require('../random');
const { OUTCOMES, JACKPOT_BONUS, FINE_EXTRA, GIFT_FALLBACK_FINE, spin } = require('../Roulette');
const { pickGift } = require('../Bot');
const BOARD = require('../data/boardData');

module.exports = {

  /**
   * Volba „zatočit / hodit kostkou". Běžně ji otevře _startTurn na začátku
   * tahu po zastavení na poli 30 (jako Letiště); tady ji volá výseč
   * „Toč znovu". Nabízí se i při poplatku 0 — jen je zatočení zdarma.
   */
  _offerRoulette(pid) {
    this._setPendingAction({ type: 'roulette_choice', targetId: pid, data: { fee: this._rouletteFee() } });
    this._broadcast();
  },

  /**
   * Konec Rulety: tah pokračuje hodem kostkou, protože se točilo na začátku
   * tahu. Bankrotář nebo hráč poslaný na Distanc už nehází.
   */
  _afterRoulette(pid) {
    const player = this.players.get(pid);
    if (!player || player.bankrupt || player.inJail || this._currentPlayerId() !== pid) {
      this._advanceTurn();
      return;
    }
    this._setPendingAction({ type: 'wait_roll', targetId: pid });
    this._broadcast();
  },

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
    this._addLog(`🎰 ${player.name} točí Ruletou: ${outcome.icon} ${outcome.name}`);
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
          spinId: eventId(),
        },
      },
    });
    this._broadcast();
  },

  /**
   * Odpověď na volbu Rulety: 'spin' zaplatí a zatočí, cokoli jiného (i vypršený
   * limit tahu) znamená netočit a hodit kostkou. Bez peněz se točit nedá —
   * volba se vrátí a hráč může jen hodit. Právo zatočit se spotřebuje tak i tak.
   */
  _handleRouletteChoice(pid, decision) {
    const player = this.players.get(pid);
    if (!player) return;
    const fee = this._rouletteFee();

    if (decision === 'spin') {
      if (player.balance < fee) {
        this._setPendingAction({ type: 'roulette_choice', targetId: pid, data: { fee } });
        this._broadcast();
        return;
      }
      player.canSpin = false;
      if (fee > 0) {
        player.balance -= fee;
        this._addLog(`🎰 ${player.name} platí ${fmt(fee)} Kč za zatočení Ruletou.`);
      }
      this._spinRoulette(pid);
      return;
    }

    player.canSpin = false;
    this._addLog(`${player.name} netočí Ruletou.`);
    this._afterRoulette(pid);
  },

  _handleRouletteAck(pid, actionData) {
    const outcome = actionData && actionData.result;
    if (!outcome) { this._afterRoulette(pid); return; }

    const next = this._applyRouletteOutcome(pid, outcome);
    this._broadcast();

    switch (next) {
      // Efekt s volbou si otevřel vlastní prompt — tah pokračuje až po odpovědi.
      case 'prompt':
        return;
      case 'end_turn':
        this._scheduleAction(ACTION_DELAY_MS, () => this._advanceTurn());
        return;
      case 'respin':
        this._scheduleAction(ACTION_DELAY_MS, () => this._offerRoulette(pid));
        return;
      default:
        this._scheduleAction(ACTION_DELAY_MS, () => this._afterRoulette(pid));
    }
  },

  /**
   * @returns {'continue'|'prompt'|'end_turn'|'respin'} jak má tah pokračovat
   */
  _applyRouletteOutcome(pid, outcome) {
    const player = this.players.get(pid);
    if (!player) return 'continue';

    switch (outcome.id) {
      case 'jackpot': {
        const win = this._rouletteFee() + JACKPOT_BONUS;
        player.balance += win;
        this._addLog(`💰 ${player.name} trefil(a) Jackpot a bere ${fmt(win)} Kč!`);
        return 'continue';
      }

      case 'fine': {
        const fine = this._rouletteFee() + FINE_EXTRA;
        player.balance -= fine;
        this._addLog(`💸 ${player.name} platí Ruletě pokutu ${fmt(fine)} Kč.`);
        this._checkBankrupt(pid);
        return 'continue';
      }

      case 'bet': {
        // Strhává se HNED, ne až při hodu — jinak by hráč mohl mezitím
        // zbankrotovat a sázka by zmizela bez zaplacení.
        const stake = Math.min(outcome.stake, player.balance);
        if (stake <= 0) {
          this._addLog(`🎲 ${player.name} nemá na sázku — Ruleta tentokrát nepřijímá.`);
          return 'continue';
        }
        player.balance -= stake;
        player.pendingBet = {
          stake,
          threshold: outcome.threshold,
          payout: stake * outcome.payoutMultiplier,
        };
        this._addLog(`🎲 ${player.name} vsadil(a) ${fmt(stake)} Kč na vlastní hod (${outcome.threshold}+).`);
        return 'continue';
      }

      case 'preemption':
        player.halfPriceNext = true;
        this._addLog(`🎟️ ${player.name} má přednostní právo — příští volný kůň za polovinu.`);
        return 'continue';

      case 'spin_again':
        this._addLog(`🔁 ${player.name} může točit znovu.`);
        return 'respin';

      case 'inflation': {
        this.inflation++;
        const total = Math.round((this._inflationFactor() - 1) * 100);
        this._addLog(`📈 Inflace! Všechno zdražuje o ${Math.round(INFLATION_RATE * 100)} % (od začátku hry +${total} %).`);
        return 'continue';
      }

      case 'jail':
        this._sendToJail(pid);
        return 'end_turn';

      case 'doping':
        player.skipTurns = outcome.turns;
        this._addLog(`🤒 ${player.name} je pod podezřením z dopingu — vynechává ${outcome.turns} tahy.`);
        return 'continue';

      case 'report': {
        const candidates = this._rouletteOpponents(pid);
        if (candidates.length === 0) {
          this._addLog(`🎰 ${player.name} nemá koho vybrat — efekt propadá.`);
          return 'continue';
        }
        this._setPendingAction({
          type: 'roulette_pick_player',
          targetId: pid,
          data: { outcomeId: outcome.id, candidates },
        });
        return 'prompt';
      }

      case 'free_token': {
        const options = player.properties
          .filter(sid => this._canPlaceFreeToken(pid, sid))
          .map(sid => ({ spaceId: sid, price: 0 }));

        if (options.length === 0) {
          this._addLog(`🏗️ ${player.name} nemá koně z úplné stáje — dostih zdarma propadá.`);
          return 'continue';
        }
        this._setPendingAction({
          type: 'roulette_pick_horse',
          targetId: pid,
          data: { outcomeId: outcome.id, options },
        });
        return 'prompt';
      }

      case 'give_horse': {
        const options = this._giftableHorses(pid);
        if (options.length === 0) {
          const fine = this._price(GIFT_FALLBACK_FINE);
          player.balance -= fine;
          this._addLog(`🎁 ${player.name} nemá koně k darování — platí ${fmt(fine)} Kč.`);
          this._checkBankrupt(pid);
          return 'continue';
        }
        const candidates = this._rouletteOpponents(pid);
        if (candidates.length === 0) {
          this._addLog(`🎁 ${player.name} nemá komu darovat — efekt propadá.`);
          return 'continue';
        }
        this._setPendingAction({
          type: 'roulette_give_horse',
          targetId: pid,
          data: { options, candidates },
        });
        return 'prompt';
      }

      default:
        return 'continue';
    }
  },

  _rouletteOpponents(pid) {
    return this.turnOrder.filter(id => id !== pid && !this.players.get(id)?.bankrupt);
  },

  _canPlaceFreeToken(pid, spaceId) {
    const space = BOARD[spaceId];
    if (!space || space.type !== 'horse') return false;
    if (this.ownerships[spaceId] !== pid) return false;
    if (!this._ownsFullGroup(pid, space.group)) return false;
    const tok = this.tokens[spaceId] || { small: 0, big: false };
    return !tok.big && tok.small < 4;
  },

  /** Koně (ne služby), které hráč právě vlastní — kandidáti na dar. */
  _giftableHorses(pid) {
    const player = this.players.get(pid);
    if (!player) return [];
    return player.properties.filter(sid => BOARD[sid].type === 'horse' && this.ownerships[sid] === pid);
  },

  /**
   * Vyhodnotí volbu koně pro dostih zdarma.
   *
   * `options` v `actionData` je jen SNÍMEK z okamžiku otevření promptu —
   * `_handleTradeResponse` je routováno nezávisle na `pendingAction` (viz
   * komentář v `handleRespond`), takže zatímco tento prompt visí otevřený,
   * soupeř může přijmout dřívější obchodní nabídku od `pid` a změnit mu
   * vlastnictví koní. Proto se tady živý stav ověřuje ZNOVU — jinak by
   * dostih zdarma přistál na koni, který mezitím patří někomu jinému.
   */
  _handleRoulettePickHorse(pid, decision, actionData) {
    const { options } = actionData || {};
    const player = this.players.get(pid);
    const chosen = (options || []).find(o => o.spaceId === decision);

    if (!player || !chosen) {
      // Odmítnutí i nesmysl z klienta efekt spotřebují — nedrží se na příště.
      this._addLog('🎰 Nabídka Rulety nevyužita.');
    } else {
      const space = BOARD[chosen.spaceId];
      if (this._canPlaceFreeToken(pid, chosen.spaceId)) {
        if (!this.tokens[chosen.spaceId]) this.tokens[chosen.spaceId] = { small: 0, big: false };
        this.tokens[chosen.spaceId].small++;
        this._addLog(`🏗️ ${player.name} dostal(a) žeton dostihů na ${space.name} zdarma.`);
      } else {
        this._addLog(`🏗️ Nabídka Rulety na ${space.name} mezitím propadla.`);
      }
    }

    this._broadcast();
    this._scheduleAction(ACTION_DELAY_MS, () => this._afterRoulette(pid));
  },

  _handleRoulettePickPlayer(pid, decision, actionData) {
    const { candidates } = actionData || {};
    const target = this.players.get(decision);

    // Neplatný cíl (vlastní id, bankrotář, nesmysl z klienta) efekt zahodí.
    // `target.bankrupt` se ověřuje ZNOVU tady, ne jen při vytvoření promptu —
    // kandidát mohl mezi otevřením promptu a odpovědí zbankrotovat (odpojení
    // hráče), a `candidates` je jen snímek z okamžiku otočení kolem.
    // Tah musí pokračovat, jinak by hra zamrzla.
    if (!target || target.bankrupt || !candidates || !candidates.includes(decision)) {
      this._addLog('🎰 Neplatný cíl — efekt Rulety propadá.');
    } else {
      this._sendToJail(decision);
      this._addLog(`🎯 ${target.name} byl(a) udán(a) a míří na Distanc.`);
    }

    this._broadcast();
    this._scheduleAction(ACTION_DELAY_MS, () => this._afterRoulette(pid));
  },

  /**
   * „Daruješ koně" — hráč vybral koně (`spaceId`) a obdarovaného (`recipientId`).
   *
   * Špatná výseč se nesmí dát obejít: neplatná volba (vypršený limit,
   * nesmysl z klienta, kůň mezitím prodaný) se nezahazuje, ale nahradí se
   * volbou, kterou by udělal bot (`pickGift`). Kandidáti se berou ze ŽIVÉHO
   * stavu — `actionData` je jen snímek z okamžiku otočení.
   */
  _handleRouletteGiveHorse(pid, spaceId, recipientId, actionData) {
    const player = this.players.get(pid);
    if (!player) return;
    const snapshot = actionData || {};

    const horses = this._giftableHorses(pid).filter(sid => (snapshot.options || []).includes(sid));
    const recipients = this._rouletteOpponents(pid).filter(id => (snapshot.candidates || []).includes(id));

    if (horses.length === 0 || recipients.length === 0) {
      this._addLog(`🎁 Dar ${player.name} mezitím propadl.`);
    } else {
      let horse = horses.includes(spaceId) ? spaceId : null;
      let recipient = recipients.includes(recipientId) ? recipientId : null;
      if (horse === null || recipient === null) {
        const pick = pickGift(this, pid, horses, recipients);
        if (horse === null) horse = pick.spaceId;
        if (recipient === null) recipient = pick.recipientId;
      }
      this._giveHorse(pid, recipient, horse);
    }

    this._broadcast();
    this._scheduleAction(ACTION_DELAY_MS, () => this._afterRoulette(pid));
  },

  /** Převede koně i s žetony — stejně jako obchod mezi hráči. */
  _giveHorse(fromId, toId, spaceId) {
    const from = this.players.get(fromId);
    const to = this.players.get(toId);
    from.properties = from.properties.filter(id => id !== spaceId);
    to.properties.push(spaceId);
    this.ownerships[spaceId] = toId;
    this._addLog(`🎁 ${from.name} daroval(a) ${BOARD[spaceId].name} hráči ${to.name}.`);
    this._cancelStaleTradeOffers([spaceId]);
    this._checkStableCompletion(toId, spaceId);
  },

  /** Vyhodnotí a vynuluje sázku. Volá se z `handleRoll` na prvním hodu po vsazení. */
  _resolvePendingBet(pid, dice) {
    const player = this.players.get(pid);
    if (!player || !player.pendingBet) return;

    const { threshold, payout } = player.pendingBet;
    player.pendingBet = null;

    if (dice >= threshold) {
      player.balance += payout;
      this._addLog(`🎉 ${player.name} trefil(a) sázku (${dice}) a bere ${fmt(payout)} Kč!`);
    } else {
      this._addLog(`💸 ${player.name} sázku neuhrál(a) (${dice}) — vklad propadá.`);
    }
  },
};
