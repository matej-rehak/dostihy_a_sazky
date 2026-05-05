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
  if (distance <= 12) return 180;
  return 80;
}
