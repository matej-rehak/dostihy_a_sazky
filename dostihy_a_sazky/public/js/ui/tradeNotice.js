// Oznámení vyjednávání: lišta „X pro tebe skládá nabídku…", toast a zvuk
// při odeslané nabídce. Logika textů je v tradeNoticeView.mjs, štítky
// u hráčů kreslí players.js. Klient serveru hlásí, že skládá nabídku,
// přes `game:trade_drafting` (src/mixins/trade.js, setTradeDrafting).
import { socket } from '../socket.js';
import { state } from '../state.js';
import { showToast, uiIcon } from '../utils.js';
import { audioManager } from '../audio.js';
import { draftBannerText, newOfferNotices } from './tradeNoticeView.mjs';

let prevOfferIds = null;
let lastSent;   // naposledy odeslaná hodnota game:trade_drafting

/**
 * Pošle serveru, pro koho právě skládám nabídku (id hráče / 'public'),
 * nebo null, když okno obchodu zavřu. Posílá jen změnu proti stavu, který
 * server naposledy poslal — server stejně zahazuje duplicity.
 */
export function syncTradeDrafting(targetId) {
  const want = targetId ?? null;
  const known = state.gameState?.tradeDrafts?.[state.myId]?.targetId ?? null;
  // Server záznam může odmítnout (např. protinabídka mimo vlastní tah) —
  // stejnou hodnotu pak neposílat znovu s každým stavem hry.
  if (want === known) { lastSent = undefined; return; }   // srovnáno se serverem
  if (want === lastSent) return;
  lastSent = want;
  socket.emit('game:trade_drafting', { targetId: want });
}

/** Volá se s každým stavem hry. */
export function updateTradeNotices(gameState) {
  renderBanner(draftBannerText(gameState, state.myId));

  const { ids, notices } = newOfferNotices(gameState, prevOfferIds, state.myId);
  prevOfferIds = ids;
  if (!notices.length) return;
  // Nabídka pro mě má přednost — ta se navíc sama otevře (actions.js)
  const notice = notices.find(n => n.forMe) ?? notices[0];
  showToast(notice.text);
  if (notice.forMe) audioManager.play('trade_offer');
}

/** Nová hra / odchod z místnosti — první stav pak nic neoznamuje. */
export function resetTradeNotices() {
  prevOfferIds = null;
  lastSent = undefined;
  renderBanner(null);
}

function renderBanner(text) {
  const el = document.getElementById('trade-drafting-banner');
  if (!el) return;
  if (!text) {
    el.classList.add('hidden');
    el.dataset.text = '';
    return;
  }
  if (el.dataset.text === text && !el.classList.contains('hidden')) return;
  el.dataset.text = text;
  el.replaceChildren(uiIcon('obchod', true), document.createTextNode(text), makeDots());
  el.classList.remove('hidden');
}

function makeDots() {
  const dots = document.createElement('span');
  dots.className = 'trade-drafting-dots';
  dots.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < 3; i++) dots.appendChild(document.createElement('span'));
  return dots;
}
