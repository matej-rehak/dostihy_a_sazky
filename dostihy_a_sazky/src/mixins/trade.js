'use strict';

module.exports = {

  initiateTrade(socket, { targetId, offer, request } = {}) {
    const fromId = socket.playerId;

    if (this.phase !== 'playing') return;

    const isWaitRoll = this.pendingAction?.type === 'wait_roll' && this.pendingAction.targetId === fromId;
    const isDebtManage = this.pendingAction?.type === 'debt_manage' && this.pendingAction.targetId === fromId;
    const isJailChoice = this.pendingAction?.type === 'jail_choice' && this.pendingAction.targetId === fromId;

    if (!isWaitRoll && !isDebtManage && !isJailChoice) {
      return socket.emit('game:error', { message: 'Obchod lze navrhnout pouze na vasem tahu, v Distancu nebo pri reseni dluhu.' });
    }

    const initiator = this.players.get(fromId);
    let target = null;
    
    if (targetId !== 'public') {
      target = this.players.get(targetId);
      if (!target || target.bankrupt || targetId === fromId) {
        return socket.emit('game:error', { message: 'Neplatny cilovy hrac.' });
      }
    }

    const offerHorses = Array.isArray(offer?.horses) ? offer.horses.map(Number) : [];
    const requestHorses = Array.isArray(request?.horses) ? request.horses.map(Number) : [];
    const offerMoney = Math.max(0, Number(offer?.money) || 0);
    const requestMoney = Math.max(0, Number(request?.money) || 0);

    if (!isDebtManage && initiator.balance < offerMoney) {
      return socket.emit('game:error', { message: 'Nemate dostatek penez pro tuto nabidku.' });
    }
    for (const sid of offerHorses) {
      if (this.ownerships[sid] !== fromId) {
        return socket.emit('game:error', { message: 'Nabizite kone, ktery vam nepatri.' });
      }
    }
    
    if (targetId !== 'public') {
      for (const sid of requestHorses) {
        if (this.ownerships[sid] !== targetId) {
          return socket.emit('game:error', { message: 'Pozadujete kone, ktery cilovemu hraci nepatri.' });
        }
      }
    } else {
      if (requestHorses.length > 0) {
        return socket.emit('game:error', { message: 'U veřejné nabídky můžete žádat pouze peníze.' });
      }
    }

    const fromContext = isDebtManage ? 'debt_manage' : (isJailChoice ? 'jail_choice' : 'wait_roll');
    const turnPlayerId = this.turnOrder[this.currentTurnIdx];

    if (targetId === 'public') {
      this._addLog(`📢 ${initiator.name} vystavil(a) veřejnou nabídku!`);
    } else {
      this._addLog(`🤝 ${initiator.name} navrhuje obchod hráči ${target.name}...`);
    }

    this._setPendingAction({
      type: 'trade_offer',
      targetId: targetId === 'public' ? null : targetId, // null = everyone can respond
      data: {
        fromId,
        fromContext,
        turnPlayerId,
        offer: { horses: offerHorses, money: offerMoney },
        request: { horses: requestHorses, money: requestMoney },
      },
    });
    this._broadcast();
  },
};
