'use strict';

const BOARD = require('../data/boardData');
const { ACTION_DELAY_MS, roll, fmt } = require('../constants');

module.exports = {

  _startTurn() {
    if (this.phase !== 'playing') return;
    const pid = this._currentPlayerId();
    const player = this.players.get(pid);
    if (!player || player.bankrupt) { this._advanceTurn(); return; }

    if (player.skipTurns > 0) {
      player.skipTurns--;
      this._addLog(`🚫 ${player.name} vynechává tah (${player.skipTurns} kol zbývá)`);
      this._scheduleAction(ACTION_DELAY_MS * 1.5, () => this._advanceTurn());
      return;
    }

    if (player.inJail) {
      if (player.jailTurns <= 0) {
        player.inJail = false;
        this._addLog(`${player.name} je propuštěn(a) z Distancu`);
        this.pendingAction = { type: 'wait_roll', targetId: pid };
      } else {
        this.pendingAction = { type: 'jail_choice', targetId: pid };
      }
    } else {
      this.pendingAction = { type: 'wait_roll', targetId: pid };
    }
    this._broadcast();
  },

  handleRoll(socket) {
    const pid = socket.playerId;
    const player = this.players.get(pid);
    if (!player) return;
    if (this._currentPlayerId() !== pid) { socket.emit('game:error', { message: 'Nejsi na řadě.' }); return; }
    if (!this.pendingAction) { socket.emit('game:error', { message: 'Teď nelze hodit.' }); return; }

    if (this.pendingAction.type === 'wait_roll') {
      const prevAccumulator = player.rollAccumulator || 0;
      const dice = (this._forceDice >= 1 && this._forceDice <= 6) ? this._forceDice : roll();
      if (this._forceDice) this._forceDice = null;
      this.lastDice = { value: dice, id: Math.random() };

      if (dice === 6 && prevAccumulator > 0) {
        // Dvojitá šestka → jde do Distancu z libovolného místa
        player.rollAccumulator = 0;
        this._addLog(`🎲 ${player.name} hodil(a) 6 dvakrát za sebou → jde do Distancu! 🔒`);
        this.pendingAction = null;
        this._sendToJail(pid);
        this._scheduleAction(ACTION_DELAY_MS, () => this._advanceTurn());
      } else {
        player.rollAccumulator = prevAccumulator + dice;
        if (dice === 6) {
          this._addLog(`🎲 ${player.name} hodil(a) 6! Celkem nasčítáno: ${player.rollAccumulator}. Hází znovu...`);
          this.pendingAction = { type: 'wait_roll', targetId: pid };
          this._broadcast();
        } else {
          const totalSteps = player.rollAccumulator;
          player.rollAccumulator = 0;
          this._addLog(`🎲 ${player.name} hodil(a) ${dice}. Celkem se posouvá o ${totalSteps} polí.`);
          player.moveDirection = 1;
          this.pendingAction = null;
          this._scheduleAction(ACTION_DELAY_MS, () => this._movePlayer(pid, totalSteps));
        }
      }
    } else if (this.pendingAction.type === 'service_roll') {
      const dice = (this._forceDice >= 1 && this._forceDice <= 6) ? this._forceDice : roll();
      if (this._forceDice) this._forceDice = null;
      this.lastDice = { value: dice, id: Math.random() };
      const { spaceId } = this.pendingAction.data;
      const space = BOARD[spaceId];
      const owner = this.ownerships[spaceId];
      const ownerPlayer = this.players.get(owner);

      this._addLog(`🎲 ${player.name} hází pro poplatek: ${dice}`);
      const rent = this._calcRent(spaceId, dice);
      this._scheduleAction(ACTION_DELAY_MS, () => {
        this._addLog(`💸 ${player.name} platí poplatek ${fmt(rent)} Kč → ${ownerPlayer.name} (${space.name})`);
      });

      this.pendingAction = null;
      this._transfer(pid, owner, rent);
      this._scheduleAction(ACTION_DELAY_MS, () => this._offerTokensOrEnd(pid));
    } else {
      socket.emit('game:error', { message: 'Teď nelze hodit.' });
    }
  },

  _advanceTurn() {
    const active = this.turnOrder.filter(id => {
      const p = this.players.get(id);
      return p && !p.bankrupt;
    });
    if (active.length <= 1) { this._endGame(active[0]); return; }

    let tries = 0;
    do {
      this.currentTurnIdx = (this.currentTurnIdx + 1) % this.turnOrder.length;
      tries++;
    } while (
      this.players.get(this.turnOrder[this.currentTurnIdx])?.bankrupt &&
      tries < this.turnOrder.length
    );

    this.pendingAction = null;
    if (this.currentTurnIdx === 0) this.round++;
    this._scheduleAction(600, () => this._startTurn());
  },
};
