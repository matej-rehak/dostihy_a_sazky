import { dom } from '../dom.js';
import { state } from '../state.js';
import { socket } from '../socket.js';

const FINANCE_LABELS = [
  'Zaplať pojistku 1.000 Kč',
  'Pokuta za nedodržení předpisů 400 Kč',
  'Renovuješ stáje: za každý dostih 500 Kč',
  'Mimořádný zisk z dostihů 2.000 Kč',
  'Narozeniny: od každého 200 Kč',
  'Mimořádná prémie 500 Kč',
  'Obdržíš dotaci 4.000 Kč',
  'Zaplať dluh 3.000 Kč',
  'Za každý dostih 800 Kč / hlavní 2.300 Kč',
  'Zaplať příspěvek 2.000 Kč',
  'Nákup materiálu 100 Kč',
  'Výhra v loterii 1.000 Kč',
  'Obdržíš dotaci 2.000 Kč',
  'Přeplatek z banky 3.000 Kč',
];

const NAHODA_LABELS = [
  'Jdi o 3 pole zpět',
  'Zrušen distanc (karta)',
  'Postoupíš na nejbližší Trenér',
  'Zdržíš se na 2 kola',
  'Distanc (bez 4.000 Kč)',
  'Zpět na nejbližší Finance',
  'Zpět na Napoli + 4.000 Kč',
  'Zpět na Distanc + START bonus',
  'Zpět na nejbližší Finance (2)',
  'Zpět na START + 4.000 Kč',
  'Zpět na START (bez bonus)',
  'Zdržíš se na 2 kola (2)',
  'Zdržíš se na 1 kolo',
  'Zpět na Parkoviště + START bonus',
];

let debugDraft = {};

export function initDebugPanel() {
  document.getElementById('debug-close')?.addEventListener('click', closePanel);
  document.getElementById('debug-cancel')?.addEventListener('click', closePanel);
  document.getElementById('debug-apply')?.addEventListener('click', applyDebugState);
  dom.debugBtn?.addEventListener('click', openPanel);
}

export function showDebugBtnIfNeeded(gameState) {
  if (!dom.debugBtn) return;
  if (gameState?.phase === 'playing') {
    dom.debugBtn.classList.remove('hidden');
  } else {
    dom.debugBtn.classList.add('hidden');
  }
}

function openPanel() {
  const gs = state.gameState;
  if (!gs || !state.boardData) return;
  renderPanel(gs);
  dom.debugPanel.classList.remove('hidden');
}

function closePanel() {
  dom.debugPanel?.classList.add('hidden');
}

function renderPanel(gs) {
  const body = dom.debugBody;
  body.innerHTML = '';

  // ── Hráči ──────────────────────────────────────────────────────────────────
  const playersSection = makeSection('Hráči');
  gs.players.forEach(p => {
    const block = document.createElement('div');
    block.className = 'debug-player';

    const posOptions = state.boardData.map((sp, i) =>
      `<option value="${i}" ${p.position === i ? 'selected' : ''}>${i}: ${sp.name}</option>`
    ).join('');

    block.innerHTML = `
      <div class="debug-player-name">${p.name}</div>
      <div class="debug-row">
        <label>Pozice
          <select name="pos-${p.id}">${posOptions}</select>
        </label>
        <label>Zůstatek
          <input type="number" name="bal-${p.id}" value="${p.balance}" step="1000" style="width:90px"> Kč
        </label>
      </div>
      <div class="debug-row">
        <label><input type="checkbox" name="jail-${p.id}" ${p.inJail ? 'checked' : ''}> Distanc</label>
        <label>Kola v distancu
          <input type="number" name="jt-${p.id}" min="1" max="3" value="${p.jailTurns || 3}" style="width:50px">
        </label>
        <label>Karty Zrušen
          <input type="number" name="jfc-${p.id}" min="0" max="3" value="${p.jailFreeCards || 0}" style="width:50px">
        </label>
      </div>
    `;
    playersSection.appendChild(block);
  });
  body.appendChild(playersSection);

  // ── Na tahu ────────────────────────────────────────────────────────────────
  const turnSection = makeSection('Na tahu');
  const turnSel = document.createElement('select');
  turnSel.name = 'current-turn';
  gs.players.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = p.name;
    if (p.id === gs.currentTurnId) opt.selected = true;
    turnSel.appendChild(opt);
  });
  turnSection.appendChild(turnSel);
  body.appendChild(turnSection);

  // ── Vlastnictví ────────────────────────────────────────────────────────────
  const ownSection = makeSection('Vlastnictví polí');
  const purchasable = state.boardData.filter(sp => sp.type === 'horse' || sp.type === 'service');
  purchasable.forEach(sp => {
    const row = document.createElement('div');
    row.className = 'debug-prop-row';

    const dot = document.createElement('span');
    dot.className = 'debug-color-dot';
    dot.style.background = sp.groupColor || '#888';

    const label = document.createElement('span');
    label.textContent = sp.name;
    label.className = 'debug-prop-name';

    const sel = document.createElement('select');
    sel.name = `own-${sp.id}`;
    const noneOpt = document.createElement('option');
    noneOpt.value = '';
    noneOpt.textContent = 'Nikdo';
    sel.appendChild(noneOpt);
    gs.players.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.name;
      if (gs.ownerships?.[sp.id] === p.id) opt.selected = true;
      sel.appendChild(opt);
    });

    row.appendChild(dot);
    row.appendChild(label);
    row.appendChild(sel);
    ownSection.appendChild(row);
  });
  body.appendChild(ownSection);

  // ── Žetony ─────────────────────────────────────────────────────────────────
  const tokSection = makeSection('Žetony (pouze koně)');
  const horseSpaces = state.boardData.filter(sp => sp.type === 'horse');
  horseSpaces.forEach(sp => {
    const tok = gs.tokens?.[sp.id] || { small: 0, big: false };
    const row = document.createElement('div');
    row.className = 'debug-token-row';

    const dot = document.createElement('span');
    dot.className = 'debug-color-dot';
    dot.style.background = sp.groupColor || '#888';

    const nameSp = document.createElement('span');
    nameSp.textContent = sp.name;
    nameSp.className = 'debug-prop-name';

    row.innerHTML = ``;
    row.appendChild(dot);
    row.appendChild(nameSp);

    const smallLabel = document.createElement('label');
    smallLabel.innerHTML = `Malé <input type="number" name="ts-${sp.id}" min="0" max="4" value="${tok.small}" style="width:45px">`;

    const bigLabel = document.createElement('label');
    bigLabel.innerHTML = `<input type="checkbox" name="tb-${sp.id}" ${tok.big ? 'checked' : ''}> Hlavní`;

    row.appendChild(smallLabel);
    row.appendChild(bigLabel);
    tokSection.appendChild(row);
  });
  body.appendChild(tokSection);

  // ── Kostka & Karty ────────────────────────────────────────────────────────
  const diceSection = makeSection('Příští hod & karty');

  const diceRow = document.createElement('div');
  diceRow.className = 'debug-row';
  const diceSel = document.createElement('select');
  diceSel.name = 'force-dice';
  diceSel.innerHTML = '<option value="0">Náhodné</option>' +
    [1,2,3,4,5,6].map(n => `<option value="${n}">${n}</option>`).join('');
  const diceLabel = document.createElement('label');
  diceLabel.textContent = 'Kostka: ';
  diceLabel.appendChild(diceSel);
  diceRow.appendChild(diceLabel);
  diceSection.appendChild(diceRow);

  const finRow = document.createElement('div');
  finRow.className = 'debug-row';
  const finSel = document.createElement('select');
  finSel.name = 'force-finance';
  finSel.innerHTML = '<option value="-1">Náhodná</option>' +
    FINANCE_LABELS.map((lbl, i) => `<option value="${i}">${i}: ${lbl}</option>`).join('');
  const finLabel = document.createElement('label');
  finLabel.textContent = 'Finance: ';
  finLabel.appendChild(finSel);
  finRow.appendChild(finLabel);
  diceSection.appendChild(finRow);

  const nahRow = document.createElement('div');
  nahRow.className = 'debug-row';
  const nahSel = document.createElement('select');
  nahSel.name = 'force-nahoda';
  nahSel.innerHTML = '<option value="-1">Náhodná</option>' +
    NAHODA_LABELS.map((lbl, i) => `<option value="${i}">${i}: ${lbl}</option>`).join('');
  const nahLabel = document.createElement('label');
  nahLabel.textContent = 'Náhoda: ';
  nahLabel.appendChild(nahSel);
  nahRow.appendChild(nahLabel);
  diceSection.appendChild(nahRow);

  body.appendChild(diceSection);
}

function makeSection(title) {
  const sec = document.createElement('div');
  sec.className = 'debug-section';
  const h = document.createElement('h4');
  h.textContent = title;
  sec.appendChild(h);
  return sec;
}

function applyDebugState() {
  const gs = state.gameState;
  if (!gs) return;

  const body = dom.debugBody;

  const players = gs.players.map(p => ({
    id: p.id,
    position: Number(body.querySelector(`[name="pos-${p.id}"]`)?.value ?? p.position),
    balance: Number(body.querySelector(`[name="bal-${p.id}"]`)?.value ?? p.balance),
    inJail: body.querySelector(`[name="jail-${p.id}"]`)?.checked ?? p.inJail,
    jailTurns: Number(body.querySelector(`[name="jt-${p.id}"]`)?.value ?? p.jailTurns ?? 3),
    jailFreeCards: Number(body.querySelector(`[name="jfc-${p.id}"]`)?.value ?? p.jailFreeCards ?? 0),
  }));

  const purchasable = state.boardData.filter(sp => sp.type === 'horse' || sp.type === 'service');
  const ownerships = {};
  purchasable.forEach(sp => {
    const val = body.querySelector(`[name="own-${sp.id}"]`)?.value;
    if (val) ownerships[sp.id] = val;
  });

  const tokens = {};
  state.boardData.filter(sp => sp.type === 'horse').forEach(sp => {
    const small = Number(body.querySelector(`[name="ts-${sp.id}"]`)?.value || 0);
    const big = body.querySelector(`[name="tb-${sp.id}"]`)?.checked || false;
    if (small > 0 || big) tokens[sp.id] = { small, big };
  });

  const currentTurnId = body.querySelector('[name="current-turn"]')?.value;
  const forceDice = Number(body.querySelector('[name="force-dice"]')?.value || 0);
  const forceFinanceIdx = Number(body.querySelector('[name="force-finance"]')?.value ?? -1);
  const forceNahodaIdx = Number(body.querySelector('[name="force-nahoda"]')?.value ?? -1);

  socket.emit('game:debug_set_state', {
    players, ownerships, tokens, currentTurnId,
    forceDice: forceDice > 0 ? forceDice : undefined,
    forceFinanceIdx: forceFinanceIdx >= 0 ? forceFinanceIdx : undefined,
    forceNahodaIdx: forceNahodaIdx >= 0 ? forceNahodaIdx : undefined,
  });
  closePanel();
}
