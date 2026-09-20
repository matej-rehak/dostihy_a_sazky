import { fmt, esc, safeColor } from '../utils.js';
import { dom } from '../dom.js';

export function showTip(space, gameState, ev) {
  if (!gameState || !dom.tooltip) return;
  const ownerId = gameState.ownerships?.[space.id];
  const owner = ownerId ? gameState.players.find(p => p.id === ownerId) : null;
  const tok = gameState.tokens?.[space.id] || { small: 0, big: false };

  // Pole 30 může hostitel přepnout na Totalizátor (`field30Mode`). Popisek musí
  // jít za tím, stejně jako jméno políčka v ui/board.js — jinak by tooltip
  // v režimu rulety aktivně lhal o pravidlech.
  const isRoulette30 = space.id === 30 && (gameState.config?.field30Mode ?? 'doping') === 'roulette';
  const title = isRoulette30 ? 'Totalizátor' : space.name;

  let html = `<div class="tip-header" style="background:${safeColor(space.groupColor ?? '', 'var(--bg-card2)').replace('var(--bg-card2)', '')}">${esc(title)}</div>`;
  html += `<div class="tip-body">`;

  if (space.type === 'horse') {
    html += `<table class="tip-table">`;
    const rents = space.rents ?? [];
    const labels = ['Základní nájem', 'S 1 dostihem', 'S 2 dostihy', 'S 3 dostihy', 'S 4 dostihy', 'HLAVNÍ DOSTIH'];
    rents.forEach((r, i) => {
      const active = (tok.big && i === 5) || (!tok.big && tok.small === i);
      html += `<tr class="${active ? 'active-rent' : ''}"><td>${labels[i]}</td><td>${fmt(r)} Kč</td></tr>`;
    });
    html += `</table>`;
    html += `<div class="tip-prices">
      <div class="price-tag">Cena koně: <b>${fmt(space.price)} Kč</b></div>
      <div class="price-tag">Cena žetonu: <b>${fmt(space.tokenCost)} Kč</b></div>
    </div>`;
  } else if (space.type === 'service') {
    const formula = space.serviceType === 'trener'
      ? '1.000 Kč × počet trenérů'
      : 'Jedna: 80× hod kostkou<br/>Obě: 200× hod kostkou';
    html += `<div class="tip-group">Specifické služby</div>
             <div style="font-size:12px;margin-top:10px;line-height:1.4">${formula}</div>
             <div class="price-tag" style="margin-top:10px">Pořizovací cena: <b>${fmt(space.price)} Kč</b></div>`;
  } else if (space.type === 'tax') {
    html += `<div class="tip-group" style="color:var(--red)">Pravidelná platba</div>
             <div class="tip-impact neg" style="font-size:24px;font-weight:800;text-align:center;padding:10px 0">-${fmt(space.amount)} Kč</div>`;
  } else if (space.type === 'start') {
    const startBonus = Number(gameState?.config?.startBonus ?? 4000);
    html += `<div class="tip-group" style="color:var(--green)">Průchod startem</div>
             <div style="font-size:13px;margin:10px 0">Získáváte finanční bonus za dokončené kolo.</div>
             <div style="text-align:right;font-weight:800;color:var(--green)">+${fmt(startBonus)} Kč</div>`;
  } else if (space.type === 'finance') {
    html += `<div class="tip-group">Finance</div>
             <div style="font-size:12px;margin-top:10px;line-height:1.5">
               Táhnete kartu Finance a ihned provedete její efekt.
             </div>`;
  } else if (space.type === 'nahoda') {
    html += `<div class="tip-group">Náhoda</div>
             <div style="font-size:12px;margin-top:10px;line-height:1.5">
               Táhnete kartu Náhoda. Efekt může měnit pozici figurky,
               stav hráče nebo finanční situaci.
             </div>`;
  } else if (space.type === 'jail') {
    html += `<div class="tip-group" style="color:var(--blue)">Distanc</div>
             <div style="font-size:12px;margin-top:10px;line-height:1.5">
               Jste na návštěvě. Při běžném zastavení se nic neplatí.
             </div>`;
  } else if (space.type === 'free_parking') {
    html += `<div class="tip-group">Parkoviště</div>
             <div style="font-size:12px;margin-top:10px;line-height:1.5">
               Bezpečné pole bez postihu i odměny.
             </div>`;
  } else if (space.type === 'skip_turn') {
    if (isRoulette30) {
      html += `<div class="tip-group" style="color:var(--gold)">Totalizátor</div>
               <div style="font-size:12px;margin-top:10px;line-height:1.5">
                 Roztočí se ruleta o devíti výsečích se stejnou šancí — sázka,
                 dražba, dvojitý nájem, imunita, stávka u soupeře a další.
                 Výsledek určuje server.
               </div>`;
    } else {
      html += `<div class="tip-group" style="color:var(--red)">Podezření z dopingu</div>
               <div style="font-size:12px;margin-top:10px;line-height:1.5">
                 Hráč vynechá ${Number(space.turns ?? 1)} ${Number(space.turns ?? 1) === 1 ? 'kolo' : 'kola'}.
               </div>`;
    }
  }
  html += `</div>`;

  if (owner) {
    html += `<div class="tip-owner-info">
      <div class="owner-dot" style="background:${safeColor(owner.color)}"></div>
      <div>${esc(owner.name)}</div>
    </div>`;
  }

  dom.tooltip.innerHTML = html;
  dom.tooltip.classList.remove('hidden');
  measureTip();
  moveTip(ev);
}

// Rozměr tooltipu se mění jen s jeho obsahem. Čtení offsetWidth/offsetHeight
// vynutí přepočet layoutu, takže se dělá jednou po naplnění obsahu — ne při
// každém pohybu myši, kterých je přes plán až sto za sekundu.
let tipW = 240;
let tipH = 200;

function measureTip() {
  const tip = dom.tooltip;
  if (!tip) return;
  tipW = tip.offsetWidth || 240;
  tipH = tip.offsetHeight || 200;
}

// Poloha se zapisuje jednou za snímek. Mousemove chodí hustěji než snímky,
// takže zápisy mezi nimi by se stejně zahodily.
let pendingMove = null;
let moveFrame = 0;

function applyMove() {
  moveFrame = 0;
  const tip = dom.tooltip;
  if (!tip || !pendingMove) return;

  const { cx, cy } = pendingMove;
  pendingMove = null;

  const m = 8;
  let x = cx + 14;
  let y = cy + 14;
  if (x + tipW > window.innerWidth  - m) x = cx - tipW - 10;
  if (y + tipH > window.innerHeight - m) y = cy - tipH - 10;
  if (x < m) x = m;
  if (y < m) y = m;
  tip.style.transform = `translate(${x}px, ${y}px)`;
}

export function moveTip(ev) {
  if (!dom.tooltip) return;
  pendingMove = {
    cx: ev.touches ? ev.touches[0].clientX : ev.clientX,
    cy: ev.touches ? ev.touches[0].clientY : ev.clientY,
  };
  if (!moveFrame) moveFrame = requestAnimationFrame(applyMove);
}

export function initTooltipListeners(playersList) {
  if (!playersList) return;
  playersList.addEventListener('mouseover', ev => {
    const bar = ev.target.closest('.inv-bar, .inv-service');
    if (bar) {
      const sid = parseInt(bar.dataset.sid, 10);
      const space = window.__boardData?.find(s => s.id === sid);
      if (space) showTip(space, window.__gameState, ev);
    }
  });
  playersList.addEventListener('mousemove', ev => {
    if (ev.target.closest('.inv-bar, .inv-service')) moveTip(ev);
  });
  playersList.addEventListener('mouseout', ev => {
    if (ev.target.closest('.inv-bar, .inv-service')) dom.tooltip?.classList.add('hidden');
  });
}
