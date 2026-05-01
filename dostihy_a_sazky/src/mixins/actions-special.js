'use strict';

const BOARD = require('../data/boardData');
const { ACTION_DELAY_MS, BOARD_SIZE, roll, fmt } = require('../constants');

module.exports = {

  _handleJailChoice(pid, decision) {
    const player = this.players.get(pid);
    if (decision === 'roll_jail') {
      const dice = roll();
      this.lastDice = { value: dice, id: Math.random() };
      this._addLog(`🎲 ${player.name} (v Distancu) hodil(a) ${dice}`);
      if (dice === 6) {
        player.inJail = false;
        player.jailTurns = 0;
        player.rollAccumulator = 0;
        this._addLog(`🔓 ${player.name} hodil(a) šestku — opouští Distanc a hází ještě jednou!`);
        this._setPendingAction({ type: 'wait_roll', targetId: pid });
        this._broadcast();
      } else {
        player.jailTurns--;
        this._addLog(`${player.name} zůstává v Distancu (${player.jailTurns} kol zbývá)`);
        this._scheduleAction(ACTION_DELAY_MS, () => this._advanceTurn());
      }
    } else if (decision === 'use_jail_card' && player.jailFreeCards > 0) {
      player.jailFreeCards--;
      player.inJail = false;
      player.jailTurns = 0;
      this._addLog(`${player.name} použil(a) kartu "Zrušen distanc" a opouští vězení!`);
      this._setPendingAction({ type: 'wait_roll', targetId: pid });
      this._broadcast();
    }
  },

  _handleAirportChoice(pid, decision) {
    const player = this.players.get(pid);
    if (!player) return;
    if (decision === 'fly') {
      this._setPendingAction({
        type: 'airport_select_target',
        targetId: pid,
        data: { fee: this.config.airportFee },
      });
      this._broadcast();
    } else {
      player.canFly = false;
      this._setPendingAction({ type: 'wait_roll', targetId: pid });
      this._broadcast();
    }
  },

  _handleAirportSelectTarget(pid, decision, spaceId) {
    const player = this.players.get(pid);
    if (!player) return;
    const fee = this.config.airportFee;

    if (decision === 'cancel') {
      this._setPendingAction({
        type: 'airport_choice',
        targetId: pid,
        data: { fee },
      });
      this._broadcast();
      return;
    }

    const target = Number(spaceId);

    if (!Number.isInteger(target) || target < 0 || target >= BOARD_SIZE || target === player.position) {
      this._setPendingAction({
        type: 'airport_select_target',
        targetId: pid,
        data: { fee },
      });
      this._broadcast();
      return;
    }

    if (player.balance < fee) {
      this._addLog(`✈️ ${player.name} nemá dostatek na let (${fmt(fee)} Kč) — letiště ruší.`);
      player.canFly = false;
      this._setPendingAction({ type: 'wait_roll', targetId: pid });
      this._broadcast();
      return;
    }

    player.balance -= fee;
    player.canFly = false;
    player.moveDirection = 1;
    this._addLog(`✈️ ${player.name} odlétá z letiště na ${BOARD[target].name} (poplatek ${fmt(fee)} Kč)`);

    const steps = (target - player.position + BOARD_SIZE) % BOARD_SIZE;
    this._setPendingAction(null);
    this._scheduleAction(ACTION_DELAY_MS, () => this._movePlayer(pid, steps));
  },

};
