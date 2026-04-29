import { makeEl, fmt, safeColor } from '../utils.js';
import { dom } from '../dom.js';
import { state } from '../state.js';
import { socket } from '../socket.js';
import { audioManager } from '../audio.js';
import { buildWaitEl } from './actionsHelpers.js';
import { showTip, moveTip } from './tooltip.js';
import { tradeDraft, setTradeDraft, renderTradeBuild, renderIncomingTradeOffer } from './actionsTrade.js';
import { confirmDialog } from './confirm.js';

let selectedIds = [];

export function renderDebtModal(isTargeted, targetPlayer, gameState, me) {
  // Always hide trade draft context if we are in debt modal and not in trade
  if (tradeDraft?.context === 'debt_manage' && dom.tradeOverlay && !dom.tradeOverlay.classList.contains('hidden')) {
    return;
  }

  if (!isTargeted) {
    dom.debtOverlay.classList.add('hidden');
    return;
  }

  dom.debtOverlay.classList.remove('hidden');
  if (dom.debtCloseBtn) {
    dom.debtCloseBtn.onclick = () => dom.debtOverlay.classList.add('hidden');
  }
  dom.debtContent.innerHTML = '';
  
  const currentBalance = me.balance;
  const projectedTotal = selectedIds.reduce((sum, sid) => {
    const sp = state.boardData[sid];
    const tok = gameState.tokens[sid];
    let val = Math.floor(sp.price / 2);
    if (tok) {
      if (tok.big) val += Math.floor(sp.bigTokenCost / 2) + Math.floor(sp.tokenCost / 2) * 4;
      else if (tok.small) val += Math.floor(sp.tokenCost / 2) * tok.small;
    }
    return sum + val;
  }, 0);

  const finalBalance = currentBalance + projectedTotal;

  // Banner with debt info
  const banner = makeEl('div', 'debt-banner');
  const amount = makeEl('div', 'debt-amount', `${fmt(currentBalance)} Kč`);
  
  const projectedInfo = makeEl('div', 'debt-projected');
  projectedInfo.style.marginTop = '10px';
  if (selectedIds.length > 0) {
    projectedInfo.innerHTML = `Získáte: <span style="color:var(--green)">+${fmt(projectedTotal)} Kč</span><br>` +
                              `Výsledek: <span style="color:${finalBalance < 0 ? 'var(--red)' : 'var(--green)'}">${fmt(finalBalance)} Kč</span>`;
  } else {
    projectedInfo.textContent = 'Vyberte stáje k prodeji';
  }

  banner.appendChild(amount);
  banner.appendChild(projectedInfo);
  dom.debtContent.appendChild(banner);

  // Property list
  if (me.properties?.length) {
    // Filter out horses I no longer own
    selectedIds = selectedIds.filter(sid => me.properties.includes(sid));

    dom.debtContent.appendChild(makeEl('div', 'debt-grid-title', 'Vaše stáje k prodeji (50% ceny):'));
    const grid = makeEl('div', 'trade-grid');
    
    me.properties.forEach(sid => {
      const sp = state.boardData[sid];
      const tok = gameState.tokens[sid];
      
      // Calculate sell value
      let val = Math.floor(sp.price / 2);
      if (tok) {
        if (tok.big) val += Math.floor(sp.bigTokenCost / 2) + Math.floor(sp.tokenCost / 2) * 4;
        else if (tok.small) val += Math.floor(sp.tokenCost / 2) * tok.small;
      }

      const isSelected = selectedIds.includes(sid);

      // Create card
      const card = makeEl('div', `trade-card debt-card ${isSelected ? 'selected' : ''}`);
      const strip = makeEl('div', 'trade-card-strip');
      strip.style.background = safeColor(sp.groupColor);
      card.appendChild(strip);
      
      const name = makeEl('div', 'trade-card-name', sp.name);
      card.appendChild(name);

      // Tokens indicator
      if (tok && (tok.big || tok.small > 0)) {
        const tokensDiv = makeEl('div', 'trade-card-tokens clickable-tokens');
        tokensDiv.title = 'Kliknutím prodáte žeton (50% ceny)';
        
        if (tok.big) {
          const star = makeEl('div', 'trade-token-star', '★');
          star.onclick = async (ev) => {
            ev.stopPropagation();
            const val = Math.floor(sp.bigTokenCost / 2);
            if (await confirmDialog(`Prodat Hlavní dostih za ${fmt(val)} Kč? (Vrátí se 4 malé dostihy)`)) {
              audioManager.play('money_out');
              socket.emit('game:respond', { decision: 'sell_token', spaceId: sid });
            }
          };
          tokensDiv.appendChild(star);
        } else {
          for (let i = 0; i < tok.small; i++) {
            const dot = makeEl('div', 'trade-token-dot');
            dot.onclick = async (ev) => {
              ev.stopPropagation();
              const val = Math.floor(sp.tokenCost / 2);
              if (await confirmDialog(`Prodat 1 žeton dostihů za ${fmt(val)} Kč?`)) {
                audioManager.play('money_out');
                socket.emit('game:respond', { decision: 'sell_token', spaceId: sid });
              }
            };
            tokensDiv.appendChild(dot);
          }
        }
        card.appendChild(tokensDiv);
      }

      // Value label
      const valLabel = makeEl('div', 'debt-card-val', `+${fmt(val)}`);
      card.appendChild(valLabel);
      
      // Checkmark for selection
      const check = makeEl('div', 'trade-card-check', '✓');
      card.appendChild(check);

      // Info button for tooltip
      const infoBtn = makeEl('div', 'trade-info-btn', '?');
      infoBtn.addEventListener('mouseenter', (ev) => {
        ev.stopPropagation();
        showTip(sp, gameState, ev);
      });
      infoBtn.addEventListener('mousemove', (ev) => {
        ev.stopPropagation();
        moveTip(ev);
      });
      infoBtn.addEventListener('mouseleave', (ev) => {
        ev.stopPropagation();
        dom.tooltip?.classList.add('hidden');
      });
      card.appendChild(infoBtn);

      card.addEventListener('click', () => {
        if (selectedIds.includes(sid)) {
          selectedIds = selectedIds.filter(id => id !== sid);
        } else {
          selectedIds.push(sid);
        }
        renderDebtModal(isTargeted, targetPlayer, gameState, me);
      });

      grid.appendChild(card);
    });
    dom.debtContent.appendChild(grid);
  } else {
    selectedIds = []; // Reset if no horses
    dom.debtContent.appendChild(makeEl('div', 'trade-empty-msg', 'Nemáte žádné stáje k prodeji. Musíte vyhlásit bankrot.'));
  }

  // Footer buttons
  const footer = makeEl('div', 'debt-footer');
  
  const leftBtns = makeEl('div', 'action-buttons row');
  leftBtns.style.gap = '10px';
  
  // Incoming trade offers count
  const myOffers = gameState.tradeOffers?.filter(o => o.targetId === state.myId || o.fromId === state.myId || o.targetId === null) || [];
  if (myOffers.length > 0) {
    const offerBtn = makeEl('button', 'btn btn-gold', `📩 Obchodní nabídky (${myOffers.length})`);
    offerBtn.onclick = () => {
      // Zavřeme dluhový modal a otevřeme nabídku — X vrátí zpět do dluhu
      dom.debtOverlay.classList.add('hidden');
      renderIncomingTradeOffer(myOffers[0], gameState, () => {
        renderDebtModal(isTargeted, targetPlayer, gameState, me);
      });
    };
    leftBtns.appendChild(offerBtn);
  }

  const others = gameState.players.filter(p => p.id !== state.myId && !p.bankrupt);
  if (others.length > 0) {
    const tradeBtn = makeEl('button', 'btn btn-outline', '🤝 Vyjednat obchod');
    tradeBtn.onclick = () => {
      dom.debtOverlay.classList.add('hidden');
      setTradeDraft({ targetId: others[0].id, offer: { horses: [], money: 0 }, request: { horses: [], money: 0 }, context: 'debt_manage' });
      renderTradeBuild(gameState, me, () => {
        renderDebtModal(true, me, gameState, me);
      });
    };
    leftBtns.appendChild(tradeBtn);
  }
  footer.appendChild(leftBtns);

  const rightBtns = makeEl('div', 'action-buttons row');
  rightBtns.style.gap = '10px';
  
  const confirmBtn = makeEl('button', 'btn btn-green', selectedIds.length > 0 ? `Potvrdit prodej (+${fmt(projectedTotal)})` : 'Vyberte k prodeji');
  if (selectedIds.length === 0) confirmBtn.disabled = true;
  confirmBtn.onclick = async () => {
    if (await confirmDialog(`Opravdu chcete prodat vybrané stáje za celkem ${fmt(projectedTotal)} Kč?`)) {
      audioManager.play('money_out');
      socket.emit('game:respond', { decision: 'sell_batch', spaceIds: [...selectedIds] });
      selectedIds = [];
      dom.debtOverlay.classList.add('hidden');
    }
  };
  rightBtns.appendChild(confirmBtn);

  const bankruptBtn = makeEl('button', 'btn btn-red', 'Vyhlásit bankrot 💀');
  bankruptBtn.onclick = async () => {
    if (await confirmDialog('Opravdu chcete vyhlásit bankrot? Tato akce vás vyřadí ze hry.')) {
      audioManager.play('gameover');
      socket.emit('game:respond', { decision: 'declare_bankrupt' });
      selectedIds = [];
      dom.debtOverlay.classList.add('hidden');
    }
  };
  rightBtns.appendChild(bankruptBtn);
  
  footer.appendChild(rightBtns);
  dom.debtContent.appendChild(footer);
}
