'use strict';

module.exports = {

  initiateTrade(socket, { targetId, offer, request } = {}) {
    const fromId = socket.playerId;

    if (this.phase !== 'playing') return;

    const isWaitRoll  = this.pendingAction?.type === 'wait_roll'  && this.pendingAction.targetId === fromId;
    const isDebtManage = this.pendingAction?.type === 'debt_manage' && this.pendingAction.targetId === fromId;

    if (!isWaitRoll && !isDebtManage) {
      return socket.emit('game:error', { message: 'Obchod lze navrhnout pouze na vašem tahu nebo při řešení dluhu.' });
    }

    const initiator = this.players.get(fromId);
    const target    = this.players.get(targetId);
    if (!target || target.bankrupt || targetId === fromId) {
      return socket.emit('game:error', { message: 'Neplatný cílový hráč.' });
    }

    const offerHorses   = Array.isArray(offer?.horses)   ? offer.horses.map(Number)   : [];
    const requestHorses = Array.isArray(request?.horses)  ? request.horses.map(Number) : [];
    const offerMoney    = Math.max(0, Number(offer?.money)   || 0);
    const requestMoney  = Math.max(0, Number(request?.money) || 0);

    if (!isDebtManage && initiator.balance < offerMoney) {
      return socket.emit('game:error', { message: 'Nemáte dostatek peněz pro tuto nabídku.' });
    }
    for (const sid of offerHorses) {
      if (this.ownerships[sid] !== fromId) {
        return socket.emit('game:error', { message: 'Nabízíte koně, který vám nepatří.' });
      }
    }
    for (const sid of requestHorses) {
      if (this.ownerships[sid] !== targetId) {
        return socket.emit('game:error', { message: 'Požadujete koně, který cílovému hráči nepatří.' });
      }
    }

    this._addLog(`🤝 ${initiator.name} navrhuje obchod hráči ${target.name}...`);
    this.pendingAction = {
      type: 'trade_offer',
      targetId,
      data: {
        fromId,
        fromContext: isDebtManage ? 'debt_manage' : 'wait_roll',
        offer:   { horses: offerHorses,   money: offerMoney   },
        request: { horses: requestHorses,  money: requestMoney },
      },
    };
    this._broadcast();
  },
};
