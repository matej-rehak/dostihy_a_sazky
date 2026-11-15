// Legenda Rulety do tooltipu pole 30: všechny výseče po skupinách s šancí.
// Čistý modul bez DOM, pracuje s výsečemi, které posílá server (game:init
// → state.rouletteOutcomes). Hlídá ho tests/roulette-view.test.mjs.

import { groupOdds } from '../animations/rouletteAnimationGate.mjs';

/** Šance jako celá procenta; nenulová šance nikdy neukáže „0 %". */
function percent(share) {
  const p = Math.round(share * 100);
  return p === 0 && share > 0 ? '<1 %' : `${p} %`;
}

/**
 * @returns {{ group, share, percent, items: { id, icon, name, summary, share, percent }[] }[]}
 *          skupiny v pořadí dobré, neutrální, špatné; ve skupině od nejčastější výseče
 */
export function rouletteLegend(outcomes) {
  if (!Array.isArray(outcomes) || outcomes.length === 0) return [];
  const total = outcomes.reduce((s, o) => s + (o.weight || 1), 0);
  return groupOdds(outcomes).map(({ group, share }) => ({
    group,
    share,
    percent: percent(share),
    items: outcomes
      .filter(o => o.group === group)
      .map(o => {
        const itemShare = (o.weight || 1) / total;
        return { id: o.id, icon: o.icon, name: o.name, summary: o.summary, share: itemShare, percent: percent(itemShare) };
      })
      .sort((a, b) => b.share - a.share),
  }));
}
