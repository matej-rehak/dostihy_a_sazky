import { makeEl, fmt, safeColor } from '../utils.js';
import { dom } from '../dom.js';
import { state } from '../state.js';
import { startTradeWith } from './actions.js';

function calcAssetsValue(p, gameState) {
  if (!state.boardData) return 0;
  let total = 0;
  if (p.properties) {
    p.properties.forEach(spId => {
      const sp = state.boardData[spId];
      if (sp) {
        total += (sp.price ?? 0);
        const tok = gameState.tokens?.[spId];
        if (tok) {
          if (tok.big) total += (sp.bigTokenCost ?? 0) + (sp.tokenCost ?? 0) * 4;
          else if (tok.small > 0) total += (sp.tokenCost ?? 0) * tok.small;
        }
      }
    });
  }
  return total;
}

export function updatePlayers(gameState) {
  if (!dom.playersList) return;
  dom.playersList.innerHTML = '';

  const pa = gameState.pendingAction;
  const meOnTurn = pa?.targetId === state.myId
    && (pa?.type === 'wait_roll' || pa?.type === 'debt_manage' || pa?.type === 'jail_choice');
  const targetInDebt = pa?.type === 'debt_manage' ? pa.targetId : null;

  // Výpočet majetků pro určení lídra (korunka)
  const playerAssets = gameState.players.map(p => ({
    id: p.id,
    total: p.bankrupt ? -1 : (p.balance + calcAssetsValue(p, gameState))
  }));
  const maxAssets = Math.max(...playerAssets.map(pa => pa.total));

  // Určení lídra — korunku dostane ten, kdo má nejvíce, ale jen pokud nejsou všichni nastejno
  const alivePlayers = gameState.players.filter(p => !p.bankrupt);
  let leaders = [];
  if (alivePlayers.length > 1) {
    const leaderCandidates = playerAssets.filter(pa => pa.total === maxAssets && pa.total > 0);
    // Pokud jsou všichni naživu nastejno (např. start hry), nikdo nemá korunku
    if (leaderCandidates.length < alivePlayers.length) {
      leaders = leaderCandidates.map(lc => lc.id);
    }
  } else if (alivePlayers.length === 1) {
    leaders = [alivePlayers[0].id];
  }

  // Seřadit hráče podle pořadí tahů (turnOrder)
  const sortedPlayers = [...gameState.players];
  if (gameState.turnOrder && gameState.turnOrder.length > 0) {
    sortedPlayers.sort((a, b) => {
      const idxA = gameState.turnOrder.indexOf(a.id);
      const idxB = gameState.turnOrder.indexOf(b.id);
      return idxA - idxB;
    });
  }

  sortedPlayers.forEach(p => {
    const isMe = p.id === state.myId;
    const isTurn = p.id === gameState.currentTurnId;

    const row = makeEl('div', `player-row${isTurn ? ' is-turn' : ''}${p.bankrupt ? ' bankrupt' : ''}${p.disconnected ? ' disconnected' : ''}`);

    const avatar = makeEl('div', 'p-avatar');
    avatar.style.background = safeColor(p.color);
    avatar.textContent = p.name[0].toUpperCase();
    if (leaders.includes(p.id)) {
      const crown = makeEl('div', 'p-crown', '👑');
      avatar.appendChild(crown);
    }
    row.appendChild(avatar);

    const info = makeEl('div', 'p-info');

    const nameEl = makeEl('div', 'p-name', p.name);
    if (isMe) {
      const badge = makeEl('span', '', ' (ty)');
      badge.style.cssText = 'color:var(--gold);font-size:10px';
      nameEl.appendChild(badge);
    }
    info.appendChild(nameEl);

    const pos = state.boardData ? (state.boardData[p.position]?.name ?? '?') : '?';
    const posEl = makeEl('div', 'p-pos', pos + ' ');
    if (p.inJail) posEl.appendChild(makeEl('span', 'p-badge jail', '🔒 Distanc'));
    if (p.bankrupt) posEl.appendChild(makeEl('span', 'p-badge bankrupt-badge', '💀 Bankrot'));
    if (p.disconnected) posEl.appendChild(makeEl('span', 'p-badge disconnected-badge', '📡 Odpojeno'));
    if (isTurn) posEl.appendChild(makeEl('span', 'p-badge', '▶ Na tahu'));
    if (p.jailFreeCards > 0) {
      const label = p.jailFreeCards > 1 ? `🔓 Zrušen distanc (${p.jailFreeCards}×)` : '🔓 Zrušen distanc';
      posEl.appendChild(makeEl('span', 'p-badge jail-free-badge', label));
    }
    info.appendChild(posEl);

    if (state.boardData && p.properties?.length > 0) {
      info.appendChild(buildInventory(p, gameState));
    }

    row.appendChild(info);

    // Balances: hotovost + celkový majetek
    const balWrap = makeEl('div', 'p-balance-wrap');
    const balEl = makeEl('div', `p-balance${p.balance < 2000 ? ' low' : ''}`, `${fmt(p.balance)} Kč`);
    balEl.id = `pb-${p.id}`;
    balWrap.appendChild(balEl);
    if (!p.bankrupt && state.boardData) {
      const total = p.balance + calcAssetsValue(p, gameState);
      const assetsEl = makeEl('div', 'p-assets', `Celkem ${fmt(total)} Kč`);
      balWrap.appendChild(assetsEl);
    }
    row.appendChild(balWrap);

    if ((meOnTurn || p.id === targetInDebt) && !isMe && !p.bankrupt) {
      const me = gameState.players.find(pl => pl.id === state.myId);
      const tradeBtn = makeEl('button', 'btn btn-xs btn-trade-icon', '🤝');
      tradeBtn.title = `Navrhnout obchod s ${p.name}`;
      tradeBtn.addEventListener('click', () => startTradeWith(p.id, gameState, me));
      row.appendChild(tradeBtn);
    }

    dom.playersList.appendChild(row);
  });
}

function buildInventory(p, gameState) {
  const ownedSpaces = p.properties
    .map(id => state.boardData.find(s => s.id === id))
    .filter(Boolean);

  const groups = {};
  ownedSpaces.forEach(sp => {
    const g = sp.type === 'service' ? 'S' : (sp.groupColor || '#000');
    if (!groups[g]) groups[g] = [];
    groups[g].push(sp);
  });

  const invDiv = makeEl('div', 'p-inventory');
  Object.entries(groups).forEach(([gColor, spcList]) => {
    const totalInGroup = state.boardData.filter(s => s.type === 'horse' && s.groupColor === gColor).length;
    const isMonopoly = spcList.length === totalInGroup && totalInGroup > 0 && spcList[0].type !== 'service';

    const grpDiv = makeEl('div', `inv-group${isMonopoly ? ' monopoly-glow' : ''}`);
    spcList.forEach(sp => {
      if (sp.type === 'service') {
        const icon = sp.serviceType === 'trener' ? '👤' : sp.serviceType === 'staje' ? '🏠' : '🚐';
        const svc = makeEl('div', 'inv-service', icon);
        svc.dataset.sid = sp.id;
        grpDiv.appendChild(svc);
      } else {
        const tok = gameState?.tokens?.[sp.id];
        const bar = makeEl('div', 'inv-bar');
        bar.dataset.sid = sp.id;
        bar.style.background = safeColor(sp.groupColor);
        if (tok?.big) {
          bar.appendChild(makeEl('span', 'inv-crown', '👑'));
        } else if (tok?.small > 0) {
          for (let i = 0; i < tok.small; i++) bar.appendChild(makeEl('span', 'inv-dot'));
        }
        grpDiv.appendChild(bar);
      }
    });
    invDiv.appendChild(grpDiv);
  });
  return invDiv;
}
