'use strict';

const { shortId } = require('../random');

module.exports = {

  /**
   * Smí hráč navrhnout obchod? Na svém tahu (hod, Distanc, dluh) komukoli,
   * mimo něj jen hráči, který právě řeší dluh.
   */
  _mayProposeTrade(fromId, targetId) {
    const pa = this.pendingAction;
    const isMyTurn = (pa?.type === 'wait_roll' || pa?.type === 'debt_manage' || pa?.type === 'jail_choice')
      && pa.targetId === fromId;
    const isTargetInDebt = pa?.type === 'debt_manage' && targetId === pa.targetId;
    return isMyTurn || isTargetInDebt;
  },

  // ─── „Skládá nabídku" ─────────────────────────────────────────────────────
  // Klient pošle `game:trade_drafting` s { targetId } při otevření okna
  // obchodu (targetId = id hráče nebo 'public') a s { targetId: null } při
  // zavření. Ostatní tak vědí, že se vyjednává, a cílový hráč, že má počkat.
  // Jen informace — nic neblokuje. Neplatné záznamy (konec tahu, odpojení,
  // bankrot) se zahodí při sestavení stavu, viz _activeTradeDrafts.

  setTradeDrafting(socket, { targetId } = {}) {
    const fromId = socket.playerId;
    if (this.phase !== 'playing' || !this.players.has(fromId)) return;
    this.tradeDrafts ??= new Map();

    if (targetId == null) {
      if (this.tradeDrafts.delete(fromId)) this._broadcast();
      return;
    }
    const from = this.players.get(fromId);
    if (from.bankrupt) return;
    if (targetId !== 'public') {
      const target = this.players.get(targetId);
      if (!target || target.bankrupt || targetId === fromId) return;
    }
    if (!this._mayProposeTrade(fromId, targetId)) return;

    const prev = this.tradeDrafts.get(fromId);
    const turnKey = this._tradeTurnKey();
    if (prev && prev.targetId === targetId && prev.turnKey === turnKey) return;
    this.tradeDrafts.set(fromId, { targetId, turnKey });
    this._broadcast();
  },

  /** Klíč tahu — záznam „skládá nabídku" platí jen v tahu, kdy vznikl. */
  _tradeTurnKey() {
    return `${this.round}:${this.currentTurnIdx}`;
  },

  /**
   * Platné záznamy pro klienty: { [fromId]: { targetId } }, targetId je
   * id hráče nebo 'public'. Zahodí záznamy z jiného tahu a hráče, kteří
   * zbankrotovali nebo se odpojili (na obou stranách).
   */
  _activeTradeDrafts() {
    const out = {};
    if (!this.tradeDrafts?.size) return out;
    const turnKey = this._tradeTurnKey();
    const alive = id => {
      const p = this.players.get(id);
      return p && !p.bankrupt && !p.disconnected;
    };
    for (const [fromId, draft] of this.tradeDrafts) {
      const ok = draft.turnKey === turnKey && alive(fromId)
        && (draft.targetId === 'public' || alive(draft.targetId));
      if (ok) out[fromId] = { targetId: draft.targetId };
      else this.tradeDrafts.delete(fromId);
    }
    return out;
  },

  initiateTrade(socket, { targetId, offer, request } = {}) {
    const fromId = socket.playerId;

    if (this.phase !== 'playing') return;

    const targetPlayerInDebt = this.pendingAction?.type === 'debt_manage' ? this.pendingAction.targetId : null;
    const isTargetInDebt = targetId === targetPlayerInDebt;

    if (!this._mayProposeTrade(fromId, targetId)) {
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
    const offerJailCard = offer?.jailCard === true;
    const requestJailCard = request?.jailCard === true;

    if (offerJailCard && !(initiator.jailFreeCards > 0)) {
      return socket.emit('game:error', { message: 'Kartu „Zrušen distanc" nevlastníte.' });
    }
    if (requestJailCard && (targetId === 'public' || !(target.jailFreeCards > 0))) {
      return socket.emit('game:error', { message: 'Cílový hráč kartu „Zrušen distanc" nevlastní.' });
    }

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

    const fromContext = (fromId === targetPlayerInDebt || isTargetInDebt)
      ? 'debt_manage'
      : (this.pendingAction?.type === 'jail_choice' ? 'jail_choice' : 'wait_roll');
    const turnPlayerId = this.turnOrder[this.currentTurnIdx];

    const offerId = 'trade_' + shortId();
    const newOffer = {
      id: offerId,
      fromId,
      targetId: targetId === 'public' ? null : targetId,
      fromContext,
      turnPlayerId,
      offer: { horses: offerHorses, money: offerMoney, jailCard: offerJailCard },
      request: { horses: requestHorses, money: requestMoney, jailCard: requestJailCard },
      timestamp: Date.now()
    };

    // Pokud už od stejného hráče stejnému hráči nabídka existuje, nahradíme ji
    this.tradeOffers = this.tradeOffers.filter(o => !(o.fromId === fromId && o.targetId === newOffer.targetId));
    this.tradeOffers.push(newOffer);
    // Nabídka je odeslaná — „skládá nabídku" už neplatí
    this.tradeDrafts?.delete(fromId);

    if (targetId === 'public') {
      this._addLog(`📢 ${initiator.name} vystavil(a) veřejnou nabídku!`);
    } else {
      this._addLog(`🤝 ${initiator.name} navrhuje obchod hráči ${target.name}...`);
    }

    this._broadcast();
    // Nabídka se do fronty vkládá mimo `_setPendingAction`, které je jediným
    // dalším místem, odkud se boti probouzejí. Bez tohoto volání by bot na
    // nabídku neodpověděl, dokud hru nepohne něco jiného.
    if (typeof this._notifyBots === 'function') this._notifyBots();
  },
};
