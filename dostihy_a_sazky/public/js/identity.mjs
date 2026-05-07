const IDENTITY_STORAGE_KEYS = ['ds_jwt', 'ds_player_id'];

export function clearStoredIdentity(storage = globalThis.localStorage) {
  if (!storage) return;
  IDENTITY_STORAGE_KEYS.forEach(key => storage.removeItem(key));
}

