import test from 'node:test';
import assert from 'node:assert/strict';

import { clearStoredIdentity } from '../public/js/identity.mjs';

test('clearStoredIdentity removes only the persisted player identity', () => {
  const removed = [];
  const storage = {
    removeItem(key) {
      removed.push(key);
    },
  };

  clearStoredIdentity(storage);

  assert.deepEqual(removed, ['ds_jwt', 'ds_player_id']);
});
