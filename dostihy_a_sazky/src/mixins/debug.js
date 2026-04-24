'use strict';

module.exports = {
  handleDebugSetState(socket, data) {
    if (this.phase !== 'playing') return;
    const { players, ownerships, tokens, currentTurnId, forceDice, forceFinanceIdx, forceNahodaIdx } = data || {};

    if (players) {
      players.forEach(pd => {
        const p = this.players.get(pd.id);
        if (!p) return;
        if (pd.position !== undefined) p.position = pd.position;
        if (pd.balance !== undefined) p.balance = Number(pd.balance);
        if (pd.inJail !== undefined) {
          p.inJail = !!pd.inJail;
          p.jailTurns = p.inJail ? (pd.jailTurns ?? 3) : 0;
        }
        if (pd.jailFreeCards !== undefined) p.jailFreeCards = Number(pd.jailFreeCards);
      });
    }

    if (ownerships !== undefined) {
      Object.keys(this.ownerships).forEach(sid => {
        const prevOwner = this.players.get(this.ownerships[sid]);
        if (prevOwner) prevOwner.properties = prevOwner.properties.filter(id => Number(id) !== Number(sid));
        delete this.ownerships[sid];
      });
      Object.entries(ownerships).forEach(([sid, pid]) => {
        if (!pid) return;
        const spaceId = Number(sid);
        this.ownerships[spaceId] = pid;
        const p = this.players.get(pid);
        if (p && !p.properties.includes(spaceId)) p.properties.push(spaceId);
      });
    }

    if (tokens !== undefined) {
      this.tokens = {};
      Object.entries(tokens).forEach(([sid, tok]) => {
        if (tok && (tok.small > 0 || tok.big)) {
          this.tokens[Number(sid)] = { small: tok.small || 0, big: !!tok.big };
        }
      });
    }

    if (currentTurnId) {
      const idx = this.turnOrder.indexOf(currentTurnId);
      if (idx !== -1) {
        this.currentTurnIdx = idx;
        this._setPendingAction({ type: 'wait_roll', targetId: currentTurnId });
      }
    }

    if (forceDice >= 1 && forceDice <= 6) {
      this._forceDice = Number(forceDice);
      this._addLog(`🔧 DEBUG: Příští hod bude ${this._forceDice}`);
    }
    if (forceFinanceIdx >= 0 && forceFinanceIdx <= 13) {
      this.financeCards.forceDraw(Number(forceFinanceIdx));
      this._addLog(`🔧 DEBUG: Nastavena příští Finance karta (index ${forceFinanceIdx})`);
    }
    if (forceNahodaIdx >= 0 && forceNahodaIdx <= 13) {
      this.nahodaCards.forceDraw(Number(forceNahodaIdx));
      this._addLog(`🔧 DEBUG: Nastavena příští Náhoda karta (index ${forceNahodaIdx})`);
    }
    this._addLog('🔧 DEBUG: Stav hry byl manuálně nastaven');
    this._broadcast();
  },
};
