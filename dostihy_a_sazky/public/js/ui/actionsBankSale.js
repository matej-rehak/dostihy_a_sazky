import { makeEl, fmt, safeColor, imgIcon, setIconText } from '../utils.js';
import { state } from '../state.js';
import { socket } from '../socket.js';
import { audioManager } from '../audio.js';
import { confirmDialog } from './confirm.js';
import { propertySellValue, tokenSellValue, bankSaleLabel } from './bankSale.mjs';

// ─── Prodej bance ─────────────────────────────────────────────────────────────
// Hráč na tahu (před hodem nebo v Distancu) může bance prodat koně, služby
// i žetony za podíl ceny podle nastavení `bankSaleRatio`. Tah se tím neposouvá — okno zůstává otevřené a
// po každém prodeji se překreslí z nového stavu hry (`syncBankSale`).

const SALE_ACTIONS = new Set(['wait_roll', 'jail_choice']);

const el = id => document.getElementById(id);

/** Smí hráč teď prodávat? Stejná pravidla jako na serveru (BANK_SALE_ACTIONS). */
export function canSellToBank(gameState) {
  const pa = gameState?.pendingAction;
  return !!pa && SALE_ACTIONS.has(pa.type) && pa.targetId === state.myId;
}

export function openBankSale(gameState) {
  el('bank-overlay')?.classList.remove('hidden');
  const closeBtn = el('bank-close-btn');
  if (closeBtn) closeBtn.onclick = closeBankSale;
  renderBankSale(gameState);
}

export function closeBankSale() {
  el('bank-overlay')?.classList.add('hidden');
}

/** Volá se při každém stavu hry: otevřené okno obnoví, nebo ho zavře. */
export function syncBankSale(gameState) {
  const overlay = el('bank-overlay');
  if (!overlay || overlay.classList.contains('hidden')) return;
  if (!canSellToBank(gameState)) { closeBankSale(); return; }
  renderBankSale(gameState);
}

async function sell(decision, spaceId, question) {
  if (!(await confirmDialog(question))) return;
  audioManager.play('money_out');
  socket.emit('game:respond', { decision, spaceId });
}

function saleCard(sid, gameState) {
  const sp = state.boardData[sid];
  const tok = gameState.tokens?.[sid];
  const ratio = gameState.config?.bankSaleRatio;
  const value = propertySellValue(sp, tok, ratio);

  const card = makeEl('div', 'trade-card bank-card no-check');
  if (sp.type === 'service') {
    const icon = imgIcon(`img/${sp.serviceType}.png`);
    icon.className = 'bank-card-icon';
    card.appendChild(icon);
  } else {
    const strip = makeEl('div', 'trade-card-strip');
    strip.style.background = safeColor(sp.groupColor);
    card.appendChild(strip);
  }
  card.appendChild(makeEl('div', 'trade-card-name', sp.name));

  if (tok && (tok.big || tok.small > 0)) {
    const tokens = makeEl('div', 'trade-card-tokens');
    if (tok.big) tokens.appendChild(makeEl('div', 'trade-token-star', '★'));
    else for (let i = 0; i < tok.small; i++) tokens.appendChild(makeEl('div', 'trade-token-dot'));
    card.appendChild(tokens);
  }

  const actions = makeEl('div', 'bank-card-actions');
  const sellBtn = makeEl('button', 'btn btn-green btn-xs', `Prodat +${fmt(value)} Kč`);
  sellBtn.onclick = () => sell('bank_sell_property', sid, tok
    ? `Prodat ${sp.name} i se žetony bance za ${fmt(value)} Kč?`
    : `Prodat ${sp.name} bance za ${fmt(value)} Kč?`);
  actions.appendChild(sellBtn);

  if (tok && (tok.big || tok.small > 0)) {
    const one = tokenSellValue(sp, tok, ratio);
    const label = tok.big ? 'Hlavní dostih' : 'Žeton';
    const tokBtn = makeEl('button', 'btn btn-outline btn-xs', `${label} +${fmt(one)} Kč`);
    tokBtn.onclick = () => sell('bank_sell_token', sid, tok.big
      ? `Prodat Hlavní dostih na ${sp.name} za ${fmt(one)} Kč? (Vrátí se 4 malé dostihy)`
      : `Prodat 1 žeton dostihů na ${sp.name} za ${fmt(one)} Kč?`);
    actions.appendChild(tokBtn);
  }
  card.appendChild(actions);
  return card;
}

function renderBankSale(gameState) {
  const content = el('bank-content');
  if (!content) return;
  const me = gameState.players.find(p => p.id === state.myId);
  content.innerHTML = '';

  const banner = makeEl('div', 'bank-banner');
  banner.appendChild(makeEl('div', 'bank-balance', `${fmt(me?.balance ?? 0)} Kč`));
  banner.appendChild(makeEl('div', 'dim', `Banka vykupuje koně, služby i žetony za ${bankSaleLabel(gameState.config?.bankSaleRatio)}.`));
  content.appendChild(banner);

  const owned = me?.properties || [];
  if (!owned.length) {
    content.appendChild(makeEl('div', 'trade-empty-msg', 'Nemáte nic, co by šlo prodat.'));
  } else {
    // Koně podle pořadí na plánu, služby až za nimi
    const sorted = [...owned].sort((a, b) =>
      (state.boardData[a].type === 'service') - (state.boardData[b].type === 'service') || a - b);
    const grid = makeEl('div', 'trade-grid');
    sorted.forEach(sid => grid.appendChild(saleCard(sid, gameState)));
    content.appendChild(grid);
  }

  const footer = makeEl('div', 'bank-footer');
  const done = makeEl('button', 'btn btn-outline');
  setIconText(done, 'zavrit', 'Hotovo');
  done.onclick = closeBankSale;
  footer.appendChild(done);
  content.appendChild(footer);
}
