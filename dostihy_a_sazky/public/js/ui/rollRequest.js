// Hod kostkou kliknutím na kostku — sdílí ho CSS kostka (main.js) i 3D kostka (board3d.js).
import { state }  from '../state.js';
import { socket } from '../socket.js';

const ROLL_TYPES = ['wait_roll', 'service_roll', 'jail_choice'];

/** Smí právě tento hráč hodit? */
export function canRollNow(gameState) {
  const pa = gameState?.pendingAction;
  return !!pa && pa.targetId === state.myId && ROLL_TYPES.includes(pa.type);
}

/** Pošle hod serveru, pokud je hráč na řadě; jinak nic. */
export function requestRoll() {
  const pa = state.gameState?.pendingAction;
  if (!canRollNow(state.gameState)) return;
  if (pa.type === 'jail_choice') socket.emit('game:respond', { decision: 'roll_jail' });
  else                           socket.emit('game:roll');
}
