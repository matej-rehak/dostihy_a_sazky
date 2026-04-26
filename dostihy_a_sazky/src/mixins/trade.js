'use strict';

module.exports = {

  initiateTrade(socket, { targetId, offer, request } = {}) {
    const fromId = socket.playerId;

    if (this.phase !== 'playing') return;

    const isMyTurn = (this.pendingAction?.type === 'wait_roll' || this.pendingAction?.type === 'debt_manage' || this.pendingAction?.type === 'jail_choice') 
                   && this.pendingAction.targetId === fromId;
    
    const targetPlayerInDebt = this.pendingAction?.type === 'debt_manage' ? this.pendingAction.targetId : null;
    const isTargetInDebt = targetId === targetPlayerInDebt;

    if (!isMyTurn && !isTargetInDebt) {
      return socket.emit('game:error', { message: 'Obchod lze navrhnout pouze na vašem tahu, nebo hráči, který řeší dluh.' });
    }

    const initiator = this.players.get(fromId);
    let target = null;
    
    if (targetId !== 'public') {
      target = this.players.get(targetId);
      if (!target || target.bankrupt || targetId === fromId) {
        return socket.emit('game:error', { message: 'Neplatný cílový hráč.' });
      }
    }

    const offerHorses = Array.isArray(offer?.horses) ? offer.horses.map(Number) : [];
    const requestHorses = Array.isArray(request?.horses) ? request.horses.map(Number) : [];
    const offerMoney = Math.max(0, Number(offer?.money) || 0);
    const requestMoney = Math.max(0, Number(request?.money) || 0);

    // Kontrola peněz (pokud není initiator v dluhu a nabízí peníze)
    if (fromId !== targetPlayerInDebt && initiator.balance < offerMoney) {
      return socket.emit('game:error', { message: 'Nemáte dostatek peněz pro tuto nabídku.' });
    }
    for (const sid of offerHorses) {
      if (this.ownerships[sid] !== fromId) {
        return socket.emit('game:error', { message: 'Nabízíte koně, který vám nepatří.' });
      }
    }
    
    if (targetId !== 'public') {
      for (const sid of requestHorses) {
        if (this.ownerships[sid] !== targetId) {
          return socket.emit('game:error', { message: 'Požadujete koně, který cílovému hráči nepatří.' });
        }
      }
    } else {
      if (requestHorses.length > 0) {
        return socket.emit('game:error', { message: 'U veřejné nabídky můžete žádat pouze peníze.' });
      }
    }

    const fromContext = fromId === targetPlayerInDebt ? 'debt_manage' : (this.pendingAction?.type === 'jail_choice' ? 'jail_choice' : 'wait_roll');
    const turnPlayerId = this.turnOrder[this.currentTurnIdx];

    const offerId = 'trade_' + Math.random().toString(36).substr(2, 9);
    const newOffer = {
      id: offerId,
      fromId,
      targetId: targetId === 'public' ? null : targetId,
      fromContext,
      turnPlayerId,
      offer: { horses: offerHorses, money: offerMoney },
      request: { horses: requestHorses, money: requestMoney },
      timestamp: Date.now()
    };

    // Pokud už od stejného hráče stejnému hráči nabídka existuje, nahradíme ji
    this.tradeOffers = this.tradeOffers.filter(o => !(o.fromId === fromId && o.targetId === newOffer.targetId));
    this.tradeOffers.push(newOffer);

    if (targetId === 'public') {
      this._addLog(`📢 ${initiator.name} vystavil(a) veřejnou nabídku!`);
    } else {
      this._addLog(`🤝 ${initiator.name} navrhuje obchod hráči ${target.name}...`);
    }

    this._broadcast();
  },
};
