// České názvy stájí podle interního `group` z boardData — pro texty v UI.
// Že má název každá stáj z plánu, hlídá tests/stable-names.test.mjs.

export const STABLE_NAMES = {
  oranzova: 'Oranžová stáj',
  hneda: 'Hnědá stáj',
  sv_modra: 'Světle modrá stáj',
  zelena: 'Zelená stáj',
  cervena: 'Červená stáj',
  zluta: 'Žlutá stáj',
  tm_zelena: 'Tmavě zelená stáj',
  tm_modra: 'Tmavě modrá stáj',
};

/** Neznámá stáj (budoucí změna plánu) dostane aspoň obecný název. */
export function stableName(group) {
  return STABLE_NAMES[group] ?? 'Stáj';
}
