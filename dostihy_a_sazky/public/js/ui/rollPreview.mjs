// Náhled hodu u karty „Opakovaný hod": kam by hráč došel, kdyby hod nechal.
// Server posílá v promptu reroll_offer `data.preview` (src/mixins/reroll.js,
// _rollPreview). Čistý modul bez DOM, aby šel otestovat.
import { cornerArt } from './cornerArt.mjs';

/** Id pole, které se má na plánu zvýraznit, nebo null. */
export function previewSpaceId(pendingAction) {
  if (pendingAction?.type !== 'reroll_offer') return null;
  const id = pendingAction.data?.preview?.spaceId;
  return Number.isInteger(id) ? id : null;
}

/**
 * Věta do panelu akcí: „Dojdeš na Japan — patří hráči Petr."
 * @param {object} preview  data.preview z promptu
 * @param {object} gameState
 * @param {object[]} board  state.boardData
 * @param {string} myId
 * @returns {string|null}
 */
export function previewText(preview, gameState, board, myId) {
  if (!preview) return null;
  if (preview.kind === 'again') return `Šestka — házel(a) bys znovu (zatím ${preview.steps} polí).`;
  if (preview.kind === 'jail') return 'Druhá šestka po sobě — šel(a) bys do Distancu!';
  if (preview.kind !== 'move' || !Number.isInteger(preview.spaceId)) return null;

  const id = preview.spaceId;
  const space = board?.[id];
  const name = cornerArt(id, gameState?.config)?.name ?? space?.name ?? `pole ${id}`;
  const ownerId = gameState?.ownerships?.[id];
  let note = '';
  if (ownerId === myId) note = ' — tvoje pole';
  else if (ownerId) {
    const owner = gameState.players?.find(p => p.id === ownerId);
    note = ` — patří hráči ${owner?.name ?? '?'}`;
  } else if (space?.type === 'horse' || space?.type === 'service') note = ' — volné';
  return `Dojdeš na ${name}${note}.`;
}
