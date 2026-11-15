// Čistá logika nastavení hry pro lobby — bez DOM, aby šla testovat.
// Schéma posílá server v `game:init` (src/gameSettings.js); tady se z něj
// jen čte. Nové nastavení se přidává do schématu, ne sem.

/** Má se pole ukázat? (`visibleIf` ze schématu — např. cena letu jen s Letištěm) */
export function isVisible(field, config) {
  const cond = field.visibleIf;
  if (!cond) return true;
  const value = config?.[cond.key];
  if ('equals' in cond) return value === cond.equals;
  if ('notEquals' in cond) return value !== cond.notEquals;
  return true;
}

const nf = new Intl.NumberFormat('cs-CZ');

/** Hodnota do přehledu pravidel: „30 000 Kč", „Bez limitu", „Letiště"… */
export function formatValue(field, value) {
  switch (field.type) {
    case 'toggle':
      return value ? 'Zapnuto' : 'Vypnuto';
    case 'select':
      return field.options.find(o => o.value === value)?.label ?? String(value);
    case 'number':
      if (value === 0 && field.zeroLabel) return field.zeroLabel;
      return field.unit ? `${nf.format(value)} ${field.unit}` : nf.format(value);
    default:
      return String(value);
  }
}

/** Hodnota z ovládacího prvku převedená na typ, který čeká server. */
export function readInput(field, input) {
  if (field.type === 'toggle') return !!input.checked;
  if (field.type === 'number') return Number(input.value);
  return input.value;
}

/**
 * Přehled pravidel po skupinách — jen viditelná pole, prázdné skupiny vynechá.
 * @returns {{ group: object, items: { key: string, label: string, value: string }[] }[]}
 */
export function summaryByGroup(schema, config) {
  return (schema?.groups || [])
    .map(group => ({
      group,
      items: schema.fields
        .filter(f => f.group === group.id && isVisible(f, config))
        .map(f => ({ key: f.key, label: f.label, value: formatValue(f, config?.[f.key] ?? f.default) })),
    }))
    .filter(g => g.items.length);
}

/** Výchozí konfigurace podle schématu (tlačítko „Výchozí nastavení"). */
export function defaultsOf(schema) {
  return Object.fromEntries((schema?.fields || []).map(f => [f.key, f.default]));
}

/** Id skupin, ve kterých se některá hodnota liší od výchozí. */
export function changedGroups(schema, config) {
  return new Set((schema?.fields || [])
    .filter(f => (config?.[f.key] ?? f.default) !== f.default)
    .map(f => f.group));
}

/** Liší se konfigurace od výchozí? */
export function isDefault(schema, config) {
  return (schema?.fields || []).every(f => (config?.[f.key] ?? f.default) === f.default);
}
