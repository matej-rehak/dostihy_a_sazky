export function syncJoinButtonState(joinButton, isJoined) {
  if (!joinButton) return;
  joinButton.disabled = !!isJoined;
}

