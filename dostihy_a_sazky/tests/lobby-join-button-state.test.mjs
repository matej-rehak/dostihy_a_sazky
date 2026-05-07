import test from 'node:test';
import assert from 'node:assert/strict';

import { syncJoinButtonState } from '../public/js/ui/lobbyState.mjs';

test('enables join button when the current client is not joined in the lobby', () => {
  const button = { disabled: true };

  syncJoinButtonState(button, false);

  assert.equal(button.disabled, false);
});

test('keeps join button disabled after the current client is joined in the lobby', () => {
  const button = { disabled: true };

  syncJoinButtonState(button, true);

  assert.equal(button.disabled, true);
});

