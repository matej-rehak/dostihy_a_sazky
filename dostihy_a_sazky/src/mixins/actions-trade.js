'use strict';

const { ACTION_DELAY_MS, fmt } = require('../constants');

module.exports = {

  _handleTradeResponse(pid, decision, tradeOfferId, clientOffer, clientRequest) {
    const offerIdx = this.tradeOffers.findIndex(o => o.id === tradeOfferId);
    if (offerIdx === -1) return;
    const offerData = this.tradeOffers[offerIdx];

    // Iniciátor nesmí odpovídat na vlastní nabídku (zabrání samo-akceptaci protinabídky)
    if (offerData.fromId === pid) return;

    // Cílená nabídka: jen určený příjemce; veřejná nabídka (targetId === null): kdokoli kromě iniciátora
    if (offerData.targetId !== null && offerData.targetId !== pid) return;

    this._handleTradeOffer(pid, decision, offerData, clientOffer, clientRequest);

    // Odstraníme nabídku z fronty po zpracování
    this.tradeOffers = this.tradeOffers.filter(o => o.id !== tradeOfferId);

    this._broadcast();
  },

  _handleTradeOffer(pid, decision, actionData, clientOffer, clientRequest) {
    const { fromId, offer, request, fromContext } = actionData;
    const turnPlayerId = actionData.turnPlayerId || fromId;
    const initiator = this.players.get(fromId);
    const target = this.players.get(pid);

    if (decision === 'counter' && clientOffer && clientRequest) {
      const cOfferHorses   = Array.isArray(clientOffer.horses)   ? clientOffer.horses.map(Number)   : [];
      const cRequestHorses = Array.isArray(clientRequest.horses) ? clientRequest.horses.map(Number) : [];
      const cOfferMoney    = Math.max(0, Number(clientOffer.money)   || 0);
      const cRequestMoney  = Math.max(0, Number(clientRequest.money) || 0);

      let valid = true;
      for (const sid of cOfferHorses) {
        if (this.ownerships[sid] !== pid) { valid = false; break; }
      }
      if (valid) {
        for (const sid of cRequestHorses) {
          if (this.ownerships[sid] !== fromId) { valid = false; break; }
        }
      }
      if (valid && cOfferMoney > 0 && target && target.balance < cOfferMoney) valid = false;

      if (valid) {
        this._addLog(`🔄 ${target?.name ?? '?'} posílá protinabídku hráči ${initiator?.name ?? '?'}...`);
        const counterOfferId = 'trade_' + Math.random().toString(36).substr(2, 9);
        const newOffer = {
          id: counterOfferId,
          fromId: pid,
          targetId: fromId,
          fromContext,
          turnPlayerId,
          offer:   { horses: cOfferHorses,   money: cOfferMoney   },
          request: { horses: cRequestHorses, money: cRequestMoney },
          timestamp: Date.now()
        };
        // Odstraníme starší nabídku mezi stejnými hráči
        this.tradeOffers = this.tradeOffers.filter(o => !(o.fromId === pid && o.targetId === fromId));
        this.tradeOffers.push(newOffer);
        this._broadcast();
        return;
      }
      decision = 'decline';
    }

    if (decision === 'accept' && initiator && target) {
      if (request.money > 0 && target.balance < request.money) {
        this._addLog(`❌ Obchod zrušen — ${target.name} nemá dostatek peněz (potřeba ${fmt(request.money)} Kč, má ${fmt(target.balance)} Kč)`);
        decision = 'decline';
      } else if (fromContext !== 'debt_manage' && offer.money > 0 && initiator.balance < offer.money) {
        this._addLog(`❌ Obchod zrušen — ${initiator.name} nemá dostatek peněz (potřeba ${fmt(offer.money)} Kč, má ${fmt(initiator.balance)} Kč)`);
        decision = 'decline';
      }
    }

    if (decision === 'accept' && initiator && target) {
      // Koně: initiator → target
      offer.horses.forEach(sid => {
        this.ownerships[sid] = pid;
        initiator.properties = initiator.properties.filter(id => id !== sid);
        if (!target.properties.includes(sid)) target.properties.push(sid);
        this._checkStableCompletion(pid, sid);
      });
      // Koně: target → initiator
      request.horses.forEach(sid => {
        this.ownerships[sid] = fromId;
        target.properties = target.properties.filter(id => id !== sid);
        if (!initiator.properties.includes(sid)) initiator.properties.push(sid);
        this._checkStableCompletion(fromId, sid);
      });
      // Peníze
      initiator.balance -= offer.money;
      initiator.balance += request.money;
      target.balance -= request.money;
      target.balance += offer.money;
      this._checkBankrupt(fromId);
      this._checkBankrupt(pid);
      this._addLog(`🤝 ${initiator.name} a ${target.name} uzavřeli obchod!`);
      const allTradedHorses = [...offer.horses, ...request.horses];
      if (allTradedHorses.length > 0) {
        this._cancelStaleTradeOffers(allTradedHorses);
      }
    } else {
      this._addLog(`❌ ${target?.name ?? '?'} odmítl(a) nabídku od ${initiator?.name ?? '?'}`);
    }

    if (fromContext === 'debt_manage') {
      // Obchod byl zahájen z dluhové situace
      const fn = this._resumeFn;
      this._resumeFn = null;
      this._scheduleAction(ACTION_DELAY_MS, fn);
    } else {
      // Frontovaný systém nabídek pendingAction iniciátora nekonzumuje, takže když se
      // hra mezitím posunula (např. do debt_manage po hodu kostkou), nepřepisujeme stav
      // stale fromContextem — jinak by hráč po vyřešení dluhu znovu hodil kostkou.
      const turnPlayer = this.players.get(turnPlayerId);
      if (!turnPlayer || turnPlayer.bankrupt) {
        if (this.pendingAction) this._broadcast();
        else this._advanceTurn();
      } else if (this.pendingAction) {
        this._broadcast();
      } else {
        this._scheduleAction(ACTION_DELAY_MS, () => {
          if (this.pendingAction) { this._broadcast(); return; }
          const tp = this.players.get(turnPlayerId);
          if (!tp || tp.bankrupt) { this._advanceTurn(); return; }
          const resumeType = fromContext === 'jail_choice' ? 'jail_choice' : 'wait_roll';
          this._setPendingAction({ type: resumeType, targetId: turnPlayerId });
          this._broadcast();
        });
      }
    }
  },

};
