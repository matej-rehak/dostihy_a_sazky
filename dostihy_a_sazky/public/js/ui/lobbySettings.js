import { makeEl, uiIcon } from '../utils.js';
import { socket } from '../socket.js';
import { confirmDialog } from './confirm.js';
import { isVisible, readInput, formatValue, defaultsOf, isDefault, changedGroups } from './settingsView.mjs';

// ─── Nastavení hry v lobby ────────────────────────────────────────────────────
// Formulář hostitele i přehled pravidel pro ostatní se kreslí ze schématu,
// které posílá server (src/gameSettings.js). Nové nastavení tu nepotřebuje
// žádný kód — stačí záznam ve schématu.

/**
 * Formulář hostitele — skupiny jako záložky, takže výška formuláře nezávisí
 * na počtu nastavení (tlačítko „Spustit hru" zůstane na obrazovce i na
 * notebooku) a nová nastavení ani skupiny layout nerozbijí.
 *
 * Ovládací prvky se vytvoří jednou pro dané schéma a při dalších stavech hry
 * se jen srovnají hodnoty a viditelnost — jinak by každý broadcast hostiteli
 * ukradl kurzor z políčka, do kterého právě píše.
 */
export function renderSettingsForm(container, schema, config) {
  if (!container || !schema) return;
  if (container._schema !== schema) buildForm(container, schema);

  for (const field of schema.fields) {
    const row = container.querySelector(`[data-setting="${field.key}"]`);
    if (!row) continue;
    row.classList.toggle('hidden', !isVisible(field, config));
    const input = row.querySelector('[data-input]');
    const value = config?.[field.key] ?? field.default;
    if (input && document.activeElement !== input) {
      if (field.type === 'toggle') input.checked = !!value;
      else input.value = String(value);
    }
  }
  markChangedTabs(container, schema, config);
  const resetBtn = container.querySelector('[data-reset]');
  if (resetBtn) resetBtn.disabled = isDefault(schema, config);
}

function selectTab(container, groupId) {
  container._activeGroup = groupId;
  container.querySelectorAll('[data-tab]').forEach(tab => {
    const on = tab.dataset.tab === groupId;
    tab.classList.toggle('active', on);
    tab.setAttribute('aria-selected', String(on));
    tab.tabIndex = on ? 0 : -1;
  });
  container.querySelectorAll('[data-group]').forEach(panel => {
    panel.classList.toggle('hidden', panel.dataset.group !== groupId);
  });
}

/** Tečka na záložce: skupina, kde hostitel něco změnil proti výchozímu. */
function markChangedTabs(container, schema, config) {
  const changed = changedGroups(schema, config);
  container.querySelectorAll('[data-tab]').forEach(tab => {
    tab.classList.toggle('changed', changed.has(tab.dataset.tab));
  });
}

/**
 * Záložky skupin + panel pro každou z nich. Sdílí formulář hostitele
 * i přehled pro ostatní, aby obě strany vypadaly stejně.
 * @param {(field: object) => HTMLElement} buildRow řádek jednoho nastavení
 */
function buildTabbedPanels(container, schema, idPrefix, buildRow) {
  container._schema = schema;
  container.innerHTML = '';
  const groups = schema.groups.filter(g => schema.fields.some(f => f.group === g.id));

  const tabs = makeEl('div', 'gs-tabs');
  tabs.setAttribute('role', 'tablist');
  tabs.setAttribute('aria-label', 'Skupiny nastavení');
  groups.forEach((group, i) => {
    const tab = makeEl('button', 'gs-tab');
    tab.type = 'button';
    tab.id = `${idPrefix}-tab-${group.id}`;
    tab.dataset.tab = group.id;
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-controls', `${idPrefix}-panel-${group.id}`);
    if (group.icon) tab.appendChild(uiIcon(group.icon, true));
    tab.appendChild(makeEl('span', 'gs-tab-label', group.label));
    tab.onclick = () => selectTab(container, group.id);
    // Šipky vlevo/vpravo přepínají záložky (vzor WAI-ARIA tabs)
    tab.onkeydown = e => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      const next = groups[(i + (e.key === 'ArrowRight' ? 1 : groups.length - 1)) % groups.length];
      selectTab(container, next.id);
      container.querySelector(`[data-tab="${next.id}"]`)?.focus();
    };
    tabs.appendChild(tab);
  });
  container.appendChild(tabs);

  for (const group of groups) {
    const panel = makeEl('div', 'gs-panel');
    panel.id = `${idPrefix}-panel-${group.id}`;
    panel.dataset.group = group.id;
    panel.setAttribute('role', 'tabpanel');
    panel.setAttribute('aria-labelledby', `${idPrefix}-tab-${group.id}`);
    schema.fields.filter(f => f.group === group.id).forEach(field => panel.appendChild(buildRow(field)));
    container.appendChild(panel);
  }
  return groups;
}

function keepActiveTab(container, groups) {
  const keep = groups.some(g => g.id === container._activeGroup) ? container._activeGroup : groups[0]?.id;
  if (keep) selectTab(container, keep);
}

function buildForm(container, schema) {
  const groups = buildTabbedPanels(container, schema, 'gs', buildField);

  const footer = makeEl('div', 'gs-footer');
  const reset = makeEl('button', 'btn btn-outline btn-xs', 'Výchozí nastavení');
  reset.type = 'button';
  reset.dataset.reset = '';
  reset.onclick = async () => {
    if (await confirmDialog('Vrátit všechna nastavení hry na výchozí hodnoty?')) {
      socket.emit('game:update_config', defaultsOf(schema));
    }
  };
  footer.appendChild(reset);
  container.appendChild(footer);

  keepActiveTab(container, groups);
}

function buildField(field) {
  const id = `cfg-${field.key}`;
  const row = makeEl('div', `gs-row gs-row-${field.type}`);
  row.dataset.setting = field.key;

  const label = makeEl('label', 'gs-label', field.label);
  label.htmlFor = id;
  if (field.unit && field.type === 'number') label.appendChild(makeEl('span', 'gs-unit', ` (${field.unit})`));

  let input;
  if (field.type === 'toggle') {
    // Přepínač: skutečný checkbox (klávesnice, čtečky) se stylem vypínače.
    const sw = makeEl('label', 'gs-switch');
    input = document.createElement('input');
    input.type = 'checkbox';
    input.id = id;
    input.setAttribute('role', 'switch');
    sw.append(input, makeEl('span', 'gs-switch-track'));
    row.append(label, sw);
  } else if (field.type === 'select') {
    input = document.createElement('select');
    input.id = id;
    input.className = 'text-input';
    field.options.forEach(o => {
      const opt = document.createElement('option');
      opt.value = o.value;
      opt.textContent = o.label;
      input.appendChild(opt);
    });
    row.append(label, input);
  } else {
    input = document.createElement('input');
    input.type = 'number';
    input.id = id;
    input.className = 'text-input';
    if (field.min != null) input.min = String(field.min);
    if (field.max != null) input.max = String(field.max);
    if (field.step != null) input.step = String(field.step);
    row.append(label, input);
  }
  input.dataset.input = '';
  input.addEventListener('change', () => {
    socket.emit('game:update_config', { [field.key]: readInput(field, input) });
  });

  if (field.hint) row.appendChild(makeEl('div', 'gs-hint', field.hint));
  return row;
}

/**
 * Přehled pravidel pro hráče, kteří nejsou hostitel — stejné záložky a řádky
 * jako formulář hostitele, jen místo ovládacích prvků hodnota ke čtení.
 * Hodnota změněná proti výchozí svítí zlatě, stejně jako tečka na záložce.
 */
export function renderSettingsSummary(container, schema, config) {
  if (!container || !schema) return;
  if (container._schema !== schema) {
    keepActiveTab(container, buildTabbedPanels(container, schema, 'gs-sum', buildSummaryRow));
  }

  for (const field of schema.fields) {
    const row = container.querySelector(`[data-setting="${field.key}"]`);
    if (!row) continue;
    const value = config?.[field.key] ?? field.default;
    row.classList.toggle('hidden', !isVisible(field, config));
    row.classList.toggle('is-changed', value !== field.default);
    row.querySelector('[data-value]').textContent = formatValue(field, value);
  }
  markChangedTabs(container, schema, config);
}

function buildSummaryRow(field) {
  const row = makeEl('div', 'gs-row gs-row-readonly');
  row.dataset.setting = field.key;
  const value = makeEl('span', 'gs-value');
  value.dataset.value = '';
  row.append(makeEl('span', 'gs-label', field.label), value);
  if (field.hint) row.appendChild(makeEl('div', 'gs-hint', field.hint));
  return row;
}
