export function isPawnTeleportMove(player, clientVisualPos, move) {
  if (!player || !move || move.type !== 'teleport') return false;
  if (move.playerId !== player.id) return false;
  if (move.to !== player.position) return false;
  return clientVisualPos[player.id] === move.from;
}

export function hasPendingPawnAnimation(players, clientVisualPos, move = null) {
  return players.some(
    p => !p.bankrupt && clientVisualPos[p.id] !== p.position && !isPawnTeleportMove(p, clientVisualPos, move)
  );
}

export function getPawnStepDelay(distance) {
  if (distance < 12) return 180;
  if (distance < 24) return 80;
  return 60;
}

/** Počet polí herního plánu. */
export const BOARD_SPACES = 40;

/** Kolik polí figurka ujede, se započítáním přechodu přes START. */
export function getPawnDistance(from, to, direction, boardSize = BOARD_SPACES) {
  const forward = (to - from + boardSize) % boardSize;
  const backward = (from - to + boardSize) % boardSize;
  return direction === -1 ? backward : forward;
}

/** Sousední pole ve směru pohybu, s přechodem přes START. */
export function nextPawnSpace(current, direction, boardSize = BOARD_SPACES) {
  return direction === -1
    ? (current - 1 + boardSize) % boardSize
    : (current + 1) % boardSize;
}

/**
 * Přepočet souřadnic z viewportu na vrstvu, do které se figurka překládá.
 * Obě hodnoty pochází z `getBoundingClientRect()`.
 */
export function rectOffsetWithin(rect, layerRect) {
  return { left: rect.left - layerRect.left, top: rect.top - layerRect.top };
}

/**
 * Výška oblouku skoku podle délky kroku.
 *
 * Při nejrychlejším stupni (60 ms) se oblouk nestihne přečíst a působí jako
 * blikání, proto se jede rovně — čitelnost má přednost před efektem.
 */
export function getPawnArcLift(stepDelay) {
  if (stepDelay >= 180) return 20;
  if (stepDelay >= 80) return 12;
  return 0;
}
