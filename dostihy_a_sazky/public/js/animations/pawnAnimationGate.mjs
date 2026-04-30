export function hasPendingPawnAnimation(players, clientVisualPos) {
  return players.some(
    p => !p.bankrupt && clientVisualPos[p.id] !== p.position
  );
}

export function getPawnStepDelay(distance) {
  if (distance <= 12) return 180;
  return 80;
}
