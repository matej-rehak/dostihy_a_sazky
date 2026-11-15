import { fmt, esc, safeColor } from '../utils.js';
import { dom } from '../dom.js';
import { horsePortrait } from '../horsePortraits.js';
import { priced, stateInflationPercent } from './inflation.mjs';
import { cornerArt } from './cornerArt.mjs';
import { SERVICE_DICE_RENT, horseRentRow } from './rentView.mjs';
import { rouletteLegend } from './rouletteView.mjs';
import { GROUP_LABEL } from '../animations/rouletteAnimationGate.mjs';
import { state } from '../state.js';

export function showTip(space, gameState, ev) {
  if (!gameState || !dom.tooltip) return;
  const ownerId = gameState.ownerships?.[space.id];
  const owner = ownerId ? gameState.players.find(p => p.id === ownerId) : null;

  // Pole 20 a 30 může hostitel přepnout (Letiště, Ruleta). Název i popisek
  // musí jít za nastavením, stejně jako políčko na plánu (cornerArt) —
  // jinak by tooltip aktivně lhal o pravidlech.
  const isRoulette30 = space.id === 30 && (gameState.config?.field30Mode ?? 'doping') === 'roulette';
  const title = cornerArt(space.id, gameState.config)?.name ?? space.name;

  let html = `<div class="tip-header" style="background:${safeColor(space.groupColor ?? '', 'var(--bg-card2)').replace('var(--bg-card2)', '')}">${esc(title)}</div>`;
  const portrait = space.type === 'horse' ? horsePortrait(space.id) : null;
  if (portrait) html += `<img class="tip-portrait" src="${portrait}" alt="">`;
  html += `<div class="tip-body">`;

  if (space.type === 'horse') {
    html += `<table class="tip-table">`;
    const rents = space.rents ?? [];
    const labels = ['Základní nájem', 'S 1 dostihem', 'S 2 dostihy', 'S 3 dostihy', 'S 4 dostihy', 'HLAVNÍ DOSTIH'];
    // Zvýrazní se nájem, který se opravdu zaplatí — žetony platí jen při celé
    // stáji a když majitel není v Distancu ani na dopingu (viz rentView.mjs).
    const { row, idle } = window.__boardData
      ? horseRentRow(window.__boardData, gameState, space.id)
      : { row: null, idle: null };
    rents.forEach((r, i) => {
      html += `<tr class="${i === row ? 'active-rent' : ''}"><td>${labels[i]}</td><td>${fmt(priced(gameState, r))} Kč</td></tr>`;
    });
    html += `</table>`;
    if (idle) html += `<div class="tip-idle">Žetony teď nefungují (${IDLE_SHORT[idle]}).</div>`;
    html += `<div class="tip-prices">
      <div class="price-tag">Cena koně: <b>${fmt(priced(gameState, space.price))} Kč</b></div>
      <div class="price-tag">Cena žetonu: <b>${fmt(priced(gameState, space.tokenCost))} Kč</b></div>
    </div>`;
  } else if (space.type === 'service') {
    const formula = space.serviceType === 'trener'
      ? '1.000 Kč × počet trenérů'
      : `Jedna: ${SERVICE_DICE_RENT.single}× hod kostkou<br/>Obě: ${SERVICE_DICE_RENT.pair}× hod kostkou`;
    const inflPct = stateInflationPercent(gameState);
    const inflNote = inflPct ? `<br/>navíc inflace +${inflPct} %` : '';
    html += `<div class="tip-group">Specifické služby</div>
             <div style="font-size:12px;margin-top:10px;line-height:1.4">${formula}${inflNote}</div>
             <div class="price-tag" style="margin-top:10px">Pořizovací cena: <b>${fmt(priced(gameState, space.price))} Kč</b></div>`;
  } else if (space.type === 'tax') {
    html += `<div class="tip-group" style="color:var(--red)">Pravidelná platba</div>
             <div class="tip-impact neg" style="font-size:24px;font-weight:800;text-align:center;padding:10px 0">-${fmt(priced(gameState, space.amount))} Kč</div>`;
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
    // Pravidla viz _evaluateSpace (pole 10 = do Distancu), _handleJailChoice
    // a _calcRent (žetony majitele v Distancu neplatí).
    html += `<div class="tip-group" style="color:var(--blue)">Distanc</div>
             <div class="tip-rules">
               <p>Kdo tu zastaví, jde do Distancu a jeho tah končí.</p>
               <p><b>Ven:</b> hodit šestku (pak hází znovu), použít kartu „Zrušen distanc", nebo počkat 3 kola.</p>
               <p class="tip-warn">Dokud jsi v Distancu, žetony dostihů na tvých koních nefungují — soupeři platí jen základní nájem.</p>
             </div>`;
  } else if (space.type === 'free_parking') {
    if (gameState.config?.field20Mode === 'airport') {
      const fee = priced(gameState, gameState.config.airportFee ?? 0);
      html += `<div class="tip-group" style="color:var(--gold)">Letiště</div>
               <div style="font-size:12px;margin-top:10px;line-height:1.5">
                 Kdo tu zastaví, může v příštím tahu letět na libovolné pole
                 ${fee > 0 ? `za ${fmt(fee)} Kč` : 'zdarma'} — nebo hodit kostkou jako obvykle.
               </div>`;
    } else {
      html += `<div class="tip-group">Parkoviště</div>
               <div style="font-size:12px;margin-top:10px;line-height:1.5">
                 Bezpečné pole bez postihu i odměny.
               </div>`;
    }
  } else if (space.type === 'skip_turn') {
    if (isRoulette30) {
      const fee = gameState.config?.rouletteFee ?? 0;
      html += `<div class="tip-roulette-fee">
                 ${fee > 0
                   ? `Kdo tu zastaví, může v příštím tahu zatočit za <b>${fmt(priced(gameState, fee))} Kč</b>.`
                   : 'Kdo tu zastaví, může v příštím tahu <b>zdarma</b> zatočit.'}
               </div>`;
      html += rouletteLegendHtml(state.rouletteOutcomes);
    } else {
      html += `<div class="tip-group" style="color:var(--red)">Podezření z dopingu</div>
               <div style="font-size:12px;margin-top:10px;line-height:1.5">
                 Hráč vynechá ${Number(space.turns ?? 1)} ${Number(space.turns ?? 1) === 1 ? 'kolo' : 'kola'}.
               </div>
               <div class="tip-rules"><p class="tip-warn">Mezitím mu nefungují žetony dostihů — soupeři platí jen základní nájem.</p></div>`;
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
  dom.tooltip.classList.toggle('tip-wide', isRoulette30);
  dom.tooltip.classList.remove('hidden');
  measureTip();
  moveTip(ev);
}

const IDLE_SHORT = { group: 'majitel nemá celou stáj', jail: 'majitel je v Distancu', doping: 'majitel je na dopingu' };

// Všechny výseče Rulety po skupinách (dobré / neutrální / špatné) s šancí.
function rouletteLegendHtml(outcomes) {
  return rouletteLegend(outcomes).map(g => `
    <div class="tip-roulette-group" data-group="${g.group}">
      <div class="tip-roulette-head"><span>${GROUP_LABEL[g.group]}</span><span>${g.percent}</span></div>
      ${g.items.map(i => `
        <div class="tip-roulette-row">
          <span class="tip-roulette-icon">${esc(i.icon ?? '')}</span>
          <span class="tip-roulette-text"><b>${esc(i.name)}</b><small>${esc(i.summary ?? '')}</small></span>
          <span class="tip-roulette-pct">${i.percent}</span>
        </div>`).join('')}
    </div>`).join('');
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
