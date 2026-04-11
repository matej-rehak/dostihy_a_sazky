'use strict';
/* ─── State ──────────────────────────────────────────────────────────────── */
let myId      = null;
let boardData = null;
let gameState = null;
let boardBuilt = false;

const DICE_FACES = ['','⚀','⚁','⚂','⚃','⚄','⚅'];
const fmt = n  => Number(n).toLocaleString('cs-CZ');
const esc = s  => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

/* ─── DOM refs ───────────────────────────────────────────────────────────── */
const $ = id => document.getElementById(id);
const dom = {
  lobbyView:    $('lobby-view'),
  gameView:     $('game-view'),
  joinForm:     $('join-form'),
  joinedWait:   $('joined-wait'),
  nameInput:    $('name-input'),
  colorPicker:  $('color-picker'),
  joinBtn:      $('join-btn'),
  lobbyPlayers: $('lobby-players'),
  hostControls: $('host-controls'),
  startBtn:     $('start-btn'),
  board:        $('board'),
  playersList:  $('players-list'),
  actionTitle:  $('action-title'),
  actionContent:$('action-content'),
  logList:      $('log-list'),
  bcDice:       $('bc-dice'),
  bcTurn:       $('bc-turn'),
  bcRound:      $('bc-round'),
  toast:        $('toast'),
  tooltip:      $('space-tip'),
};

/* ─── Socket ─────────────────────────────────────────────────────────────── */
const socket = io();
let myColor   = null;
let selectedColor = null;

socket.on('game:init', ({ board, colors, state }) => {
  boardData = board;
  buildColorPicker(colors);
  processState(state);
});

socket.on('game:state', state => processState(state));

socket.on('game:error', ({ message }) => showToast(message, true));

/* ─── State processing ──────────────────────────────────────────────────── */
function processState(state) {
  gameState = state;
  identifyMe(state.players);                           // ← vždy, i v lobby
  const me = state.players.find(p => p.id === myId);

  if (state.phase === 'lobby') {
    renderLobby(state, me);
  } else {
    dom.lobbyView.classList.add('hidden');
    dom.gameView.classList.remove('hidden');
    if (!boardBuilt && boardData) { buildBoard(boardData); boardBuilt = true; }
    updatePlayers(state);
    updateBoard(state);
    updateActionPanel(state);
    updateLog(state);
    updateCenter(state);
  }
}

/* ─── Lobby ──────────────────────────────────────────────────────────────── */
function renderLobby(state, me) {
  dom.lobbyView.classList.remove('hidden');
  dom.gameView.classList.add('hidden');

  // Player list
  if (!state.players.length) {
    dom.lobbyPlayers.innerHTML = '<p class="dim">Zatím nikdo...</p>';
  } else {
    dom.lobbyPlayers.innerHTML = state.players.map(p => `
      <div class="lp-row">
        <div class="lp-avatar" style="background:${esc(p.color)}">${esc(p.name[0]).toUpperCase()}</div>
        <span class="lp-name">${esc(p.name)}</span>
        ${p.isHost ? '<span class="lp-host">HOST</span>' : ''}
      </div>
    `).join('');
  }

  if (me) {
    // Already joined
    dom.joinForm.classList.add('hidden');
    dom.joinedWait.classList.remove('hidden');

    if (me.isHost) {
      dom.hostControls.classList.remove('hidden');
      dom.startBtn.disabled = state.players.length < 2;
      dom.startBtn.textContent = state.players.length < 2
        ? `▶ Spustit hru (min. 2 hráče — ${state.players.length}/2)`
        : `▶ Spustit hru (${state.players.length} hráči)`;
    }
  }
}

function buildColorPicker(colors) {
  dom.colorPicker.innerHTML = '';
  colors.forEach(c => {
    const btn = document.createElement('button');
    btn.className = 'color-btn';
    btn.style.background = c;
    btn.title = c;
    btn.onclick = () => {
      document.querySelectorAll('.color-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      selectedColor = c;
    };
    dom.colorPicker.appendChild(btn);
  });
  // Select first by default
  dom.colorPicker.firstChild?.click();
}

dom.joinBtn.onclick = () => {
  const name = dom.nameInput.value.trim();
  if (!name) { showToast('Zadejte jméno!', true); return; }
  socket.emit('game:join', { name, color: selectedColor });
  // After join, myId is our socket id — track it via a special event or on first state
  // We identify ourselves by matching name in players list on next state update
  dom.joinBtn.disabled = true;
};

dom.nameInput.addEventListener('keydown', e => { if (e.key === 'Enter') dom.joinBtn.click(); });

// Identify ourselves: after joining, find our player by matching name (best effort)
// Server sends updated state; we check for our socket's name
const _origOn = socket.on.bind(socket);
socket.id; // ensure id is available

// Use connect event to get socket id
socket.on('connect', () => { /* myId set below */ });

// Patch: after joining, we identify ourselves in the next state update
let pendingName = null;
dom.joinBtn.addEventListener('click', () => { pendingName = dom.nameInput.value.trim(); });

function identifyMe(players) {
  if (myId) return;
  // Try to match our socket.id
  if (socket.id && players.find(p => p.id === socket.id)) {
    myId = socket.id;
    return;
  }
  // Fallback: match by pending name
  if (pendingName) {
    const me = players.find(p => p.name === pendingName);
    if (me) { myId = me.id; }
  }
}

dom.startBtn.onclick = () => socket.emit('game:start');

/* ─── Board Building (once) ─────────────────────────────────────────────── */
function buildBoard(board) {
  board.forEach(space => {
    const [row, col] = getGridPos(space.id);
    const side = getSide(space.id);

    const el = document.createElement('div');
    el.className = `space space-${space.type} side-${side}`;
    el.dataset.id = String(space.id);
    el.style.gridRow    = row;
    el.style.gridColumn = col;

    // Color stripe
    if (space.type === 'horse') {
      const stripe = document.createElement('div');
      stripe.className = 'stripe';
      stripe.style.background = space.groupColor;
      el.appendChild(stripe);
    } else if (space.type === 'service') {
      const stripe = document.createElement('div');
      stripe.className = 'stripe';
      stripe.style.background = '#5b8dee';
      el.appendChild(stripe);
    }

    if (side === 'corner') {
      el.classList.add('space-corner');
      el.innerHTML += `
        <div class="corner-icon">${cornerIcon(space.id)}</div>
        <div class="corner-name">${esc(space.name)}</div>
        ${space.id === 10 ? '<div class="corner-sub">Jen návštěva / Distanc</div>' : ''}
      `;
    } else {
      el.innerHTML += `
        <div class="space-inner">
          ${typeIcon(space) ? `<div class="space-icon">${typeIcon(space)}</div>` : ''}
          <div class="space-name">${esc(space.name)}</div>
          ${space.price ? `<div class="space-price">${fmt(space.price)} Kč</div>` : ''}
        </div>
      `;
    }

    // Dynamic elements (updated per state)
    const ownBadge   = document.createElement('div');
    ownBadge.id      = `ob-${space.id}`;
    ownBadge.className = 'own-badge hidden';
    el.appendChild(ownBadge);

    const tokenDots  = document.createElement('div');
    tokenDots.id     = `td-${space.id}`;
    tokenDots.className = 'token-dots';
    el.appendChild(tokenDots);

    const pawns      = document.createElement('div');
    pawns.id         = `pw-${space.id}`;
    pawns.className  = 'space-pawns';
    el.appendChild(pawns);

    // Tooltip
    el.addEventListener('mouseenter', ev => showTip(space, ev));
    el.addEventListener('mousemove',  ev => moveTip(ev));
    el.addEventListener('mouseleave', () => dom.tooltip.classList.add('hidden'));

    dom.board.appendChild(el);
  });
}

function getGridPos(id) {
  if (id === 0)  return [11,11];
  if (id === 10) return [11,1];
  if (id === 20) return [1, 1];
  if (id === 30) return [1, 11];
  if (id >= 1  && id <= 9)  return [11,       11 - id];
  if (id >= 11 && id <= 19) return [11-(id-10), 1];
  if (id >= 21 && id <= 29) return [1,         id-19];
  if (id >= 31 && id <= 39) return [id-29,      11];
}

function getSide(id) {
  if ([0,10,20,30].includes(id)) return 'corner';
  if (id >= 1  && id <= 9)  return 'bottom';
  if (id >= 11 && id <= 19) return 'left';
  if (id >= 21 && id <= 29) return 'top';
  if (id >= 31 && id <= 39) return 'right';
}

function cornerIcon(id) {
  return { 0:'🏁', 10:'🔒', 20:'🌿', 30:'➡️' }[id] || '⬜';
}
function typeIcon(space) {
  return { finance:'💰', nahoda:'🎁', tax:'💸', go_to_jail:'🚔',
           free_parking:'🌿', service:'👤', start:'🏁' }[space.type] || '';
}

/* ─── Board Update (per state) ──────────────────────────────────────────── */
function updateBoard(state) {
  // Clear all pawns
  document.querySelectorAll('.space-pawns').forEach(el => el.innerHTML = '');
  // Reset highlights
  document.querySelectorAll('.space.current-turn').forEach(el => el.classList.remove('current-turn'));

  const currentPlayer = state.players.find(p => p.id === state.currentTurnId);

  // Place player pawns
  state.players.forEach(p => {
    if (p.bankrupt) return;
    const pawnsEl = $(`pw-${p.position}`);
    if (!pawnsEl) return;
    const pawn = document.createElement('div');
    pawn.className = 'pawn' + (p.id === state.currentTurnId ? ' is-active' : '');
    pawn.style.background = p.color;
    pawn.title = p.name;
    pawn.textContent = p.name[0].toUpperCase();
    pawnsEl.appendChild(pawn);
  });

  // Highlight current player's space
  if (currentPlayer) {
    const spaceEl = document.querySelector(`.space[data-id="${currentPlayer.position}"]`);
    if (spaceEl) spaceEl.classList.add('current-turn');
  }

  // Ownership badges
  document.querySelectorAll('.own-badge').forEach(el => el.classList.add('hidden'));
  Object.entries(state.ownerships || {}).forEach(([spaceId, playerId]) => {
    const el = $(`ob-${spaceId}`);
    if (!el) return;
    const owner = state.players.find(p => p.id === playerId);
    if (owner) {
      el.style.background = owner.color;
      el.classList.remove('hidden');
    }
  });

  // Dostih token dots
  document.querySelectorAll('.token-dots').forEach(el => el.innerHTML = '');
  Object.entries(state.tokens || {}).forEach(([spaceId, tok]) => {
    const el = $(`td-${spaceId}`);
    if (!el) return;
    if (tok.big) {
      el.innerHTML = '<div class="dot-big"></div>';
    } else {
      el.innerHTML = Array(tok.small).fill('<div class="dot-small"></div>').join('');
    }
  });
}

/* ─── Players list ──────────────────────────────────────────────────────── */
function updatePlayers(state) {
  identifyMe(state.players);
  dom.playersList.innerHTML = state.players.map(p => {
    const isMe   = p.id === myId;
    const isTurn = p.id === state.currentTurnId;
    let badges = '';
    if (p.inJail)   badges += '<span class="p-badge jail">🔒 Distanc</span>';
    if (p.bankrupt) badges += '<span class="p-badge bankrupt-badge">💀 Bankrot</span>';
    if (isTurn)     badges += '<span class="p-badge">▶ Na tahu</span>';
    const pos = boardData ? (boardData[p.position]?.name || '?') : '?';
    return `
      <div class="player-row ${isTurn ? 'is-turn' : ''} ${p.bankrupt ? 'bankrupt' : ''}">
        <div class="p-avatar" style="background:${esc(p.color)}">${esc(p.name[0]).toUpperCase()}</div>
        <div class="p-info">
          <div class="p-name">${esc(p.name)}${isMe ? ' <span style="color:var(--gold);font-size:10px">(ty)</span>' : ''}</div>
          <div class="p-pos">${esc(pos)} ${badges}</div>
        </div>
        <div class="p-balance ${p.balance < 2000 ? 'low' : ''}">${fmt(p.balance)} Kč</div>
      </div>
    `;
  }).join('');
}

/* ─── Board Center ──────────────────────────────────────────────────────── */
let prevDice = null;
function updateCenter(state) {
  dom.bcRound.textContent = `Kolo ${state.round}`;

  if (state.lastDice && state.lastDice !== prevDice) {
    prevDice = state.lastDice;
    dom.bcDice.classList.remove('rolling');
    void dom.bcDice.offsetWidth; // reflow
    dom.bcDice.classList.add('rolling');
    dom.bcDice.textContent = DICE_FACES[state.lastDice] || state.lastDice;
    setTimeout(() => dom.bcDice.classList.remove('rolling'), 600);
  }

  const current = state.players.find(p => p.id === state.currentTurnId);
  if (current) {
    dom.bcTurn.innerHTML = `<span style="color:${esc(current.color)};font-weight:700">${esc(current.name)}</span>`;
  }
}

/* ─── Action Panel ──────────────────────────────────────────────────────── */
function updateActionPanel(state) {
  const pa = state.pendingAction;
  if (!pa) {
    dom.actionTitle.textContent = 'Akce';
    dom.actionContent.innerHTML = '<p class="dim" style="text-align:center;padding:20px 0">⏳ Zpracovávám...</p>';
    return;
  }

  const isTargeted    = pa.targetId === myId;
  const targetPlayer  = state.players.find(p => p.id === pa.targetId);
  const targetName    = targetPlayer?.name || '?';
  const me            = state.players.find(p => p.id === myId);

  switch (pa.type) {
    // ── Roll ──
    case 'wait_roll':
      dom.actionTitle.textContent = isTargeted ? 'Váš tah' : 'Čeká se...';
      if (isTargeted) {
        dom.actionContent.innerHTML = `
          <p class="action-desc">Jste na řadě, ${esc(targetName)}!</p>
          <button id="roll-btn" class="btn btn-gold btn-lg">🎲 Hodit kostkou</button>
        `;
        $('roll-btn').onclick = () => socket.emit('game:roll');
      } else {
        dom.actionContent.innerHTML = waitHTML(targetPlayer, 'čeká na hod kostkou...');
      }
      break;

    // ── Buy offer ──
    case 'buy_offer': {
      const space  = boardData[pa.data.spaceId];
      const rents  = space.rents || [];
      dom.actionTitle.textContent = 'Nabídka koupě';
      if (isTargeted) {
        const balAfter = (me?.balance || 0) - space.price;
        dom.actionContent.innerHTML = `
          <div class="buy-card">
            <div class="buy-strip" style="background:${esc(space.groupColor || '#5b8dee')}"></div>
            <div class="buy-body">
              <div class="buy-name">${esc(space.name)}</div>
              <div class="buy-price">Cena: ${fmt(space.price)} Kč</div>
              ${rents.length ? `
                <div class="rent-table">
                  <div class="rent-row"><span>Základní:</span><span class="rent-val">${fmt(rents[0])} Kč</span></div>
                  <div class="rent-row"><span>1 žeton:</span><span class="rent-val">${fmt(rents[1])} Kč</span></div>
                  <div class="rent-row"><span>Velký dostih:</span><span class="rent-val">${fmt(rents[5])} Kč</span></div>
                </div>` : ''}
              <div class="buy-rest">Zůstatek po koupi: <strong style="color:${balAfter<0?'var(--red)':'var(--green)'}">${fmt(balAfter)} Kč</strong></div>
              <div class="action-buttons row" style="margin-top:6px">
                <button id="buy-yes" class="btn btn-green" style="flex:1">Koupit</button>
                <button id="buy-no"  class="btn btn-outline" style="flex:1">Pas</button>
              </div>
            </div>
          </div>
        `;
        $('buy-yes').onclick = () => socket.emit('game:respond', { decision:'buy',  spaceId: pa.data.spaceId });
        $('buy-no').onclick  = () => socket.emit('game:respond', { decision:'pass', spaceId: pa.data.spaceId });
      } else {
        dom.actionContent.innerHTML = waitHTML(targetPlayer, `zvažuje koupi <strong>${esc(space.name)}</strong>`);
      }
      break;
    }

    // ── Card ──
    case 'card_ack': {
      const { card, label } = pa.data;
      dom.actionTitle.textContent = `Karta: ${label}`;
      dom.actionContent.innerHTML = `
        <div class="card-display">
          <div class="card-label">🃏 ${esc(label)}</div>
          <div class="card-text">${esc(card.text)}</div>
          ${isTargeted ? '<button id="card-ok" class="btn btn-outline">OK →</button>' : '<p class="dim" style="font-size:11px">Čeká se na potvrzení hráče...</p>'}
        </div>
      `;
      if (isTargeted) $('card-ok').onclick = () => socket.emit('game:respond', { decision:'ok' });
      break;
    }

    // ── Jail ──
    case 'jail_choice': {
      dom.actionTitle.textContent = 'Distanc 🔒';
      if (isTargeted) {
        const jt = targetPlayer?.jailTurns || 0;
        dom.actionContent.innerHTML = `
          <div class="jail-display">
            <div class="jail-icon">🔒</div>
            <p class="jail-text">Jste v Distancu!<br/>Zbývá: <strong>${jt}</strong> ${jt===1?'kolo':'kola'}</p>
            <div class="action-buttons">
              <button id="jail-pay"  class="btn btn-gold">Zaplatit ${fmt(500)} Kč a hrát</button>
              <button id="jail-roll" class="btn btn-outline">🎲 Hodit (6 = volno)</button>
            </div>
          </div>
        `;
        $('jail-pay').onclick  = () => socket.emit('game:respond', { decision:'pay_fine' });
        $('jail-roll').onclick = () => socket.emit('game:respond', { decision:'roll_jail' });
      } else {
        dom.actionContent.innerHTML = waitHTML(targetPlayer, 'je v Distancu...');
      }
      break;
    }

    // ── Token manage ──
    case 'token_manage': {
      dom.actionTitle.textContent = 'Přidat žetony';
      if (isTargeted) {
        const eligible = pa.data.eligible || [];
        const tokRows = eligible.map(sid => {
          const sp  = boardData[sid];
          const tok = state.tokens[sid] || { small:0, big:false };
          const canS = !tok.big && tok.small < 4 && (me?.balance || 0) >= sp.tokenCost;
          const canB = !tok.big && tok.small >= 4 && (me?.balance || 0) >= sp.bigTokenCost;
          return `
            <div class="token-item">
              <div class="tok-name" style="border-left:3px solid ${esc(sp.groupColor)};padding-left:6px">
                ${esc(sp.name)}
                <span style="color:var(--text-muted);font-weight:400"> — ${tok.small}× ${tok.big?'🏆':''}</span>
              </div>
              <div class="tok-btns">
                ${canS ? `<button class="btn btn-xs btn-outline add-tok" data-sid="${sid}" data-t="small">+Žeton (${fmt(sp.tokenCost)} Kč)</button>` : ''}
                ${canB ? `<button class="btn btn-xs btn-gold add-tok" data-sid="${sid}" data-t="big">+Hlavní (${fmt(sp.bigTokenCost)} Kč)</button>` : ''}
              </div>
            </div>`;
        }).join('');
        dom.actionContent.innerHTML = `
          <p class="token-intro">Přidat žetony dostihů ke svým stájím?</p>
          <div class="token-list">${tokRows || '<p class="dim">Nelze přidat žetony (nedostatek peněz nebo žetonů).</p>'}</div>
          <button id="end-turn" class="btn btn-gold" style="margin-top:4px">Ukončit tah →</button>
        `;
        document.querySelectorAll('.add-tok').forEach(b => {
          b.onclick = () => socket.emit('game:respond', {
            decision:'add_token', spaceId:+b.dataset.sid, tokenType:b.dataset.t
          });
        });
        $('end-turn').onclick = () => socket.emit('game:respond', { decision:'end_turn' });
      } else {
        dom.actionContent.innerHTML = waitHTML(targetPlayer, 'spravuje své stáje...');
      }
      break;
    }

    // ── Game Over ──
    case 'game_over': {
      const w = pa.winner;
      dom.actionTitle.textContent = '🏆 Konec hry';
      dom.actionContent.innerHTML = `
        <div class="gameover-display">
          <div class="gameover-trophy">🏆</div>
          <div class="gameover-title">${w ? esc(w.name)+' vyhrál(a)!' : 'Konec hry!'}</div>
          ${w ? `<div class="gameover-balance">Výsledný zůstatek: ${fmt(w.balance)} Kč</div>` : ''}
          <button class="btn btn-gold btn-lg" onclick="location.reload()">Hrát znovu</button>
        </div>
      `;
      break;
    }

    default:
      dom.actionContent.innerHTML = '<p class="dim">...</p>';
  }
}

function waitHTML(player, msg) {
  return `
    <div class="action-waiting">
      <div class="waiting-icon">⏳</div>
      <p>Čeká se na <strong style="color:${esc(player?.color||'#fff')}">${esc(player?.name||'?')}</strong><br/><span class="dim">${msg}</span></p>
    </div>
  `;
}

/* ─── Log ────────────────────────────────────────────────────────────────── */
function updateLog(state) {
  dom.logList.innerHTML = (state.log || []).map(
    msg => `<div class="log-entry">${esc(msg)}</div>`
  ).join('');
}

/* ─── Tooltip ────────────────────────────────────────────────────────────── */
function showTip(space, ev) {
  if (!gameState) return;
  const ownerId = gameState.ownerships?.[space.id];
  const owner   = ownerId ? gameState.players.find(p => p.id === ownerId) : null;
  const tok     = gameState.tokens?.[space.id] || { small:0, big:false };

  let html = `<div class="tip-name">${esc(space.name)}</div>`;

  if (space.type === 'horse') {
    html += `<div class="tip-group" style="color:${esc(space.groupColor)}">● Stáj ${esc(space.group||'')}</div>`;
    html += `<div class="tip-row"><span>Cena:</span><span class="tip-val">${fmt(space.price)} Kč</span></div>`;
    html += `<div class="tip-row"><span>Základní nájem:</span><span class="tip-val">${fmt(space.rents[0])} Kč</span></div>`;
    if (tok.big) {
      html += `<div class="tip-row"><span>Hlavní dostih:</span><span class="tip-val">${fmt(space.rents[5])} Kč</span></div>`;
    } else if (tok.small > 0) {
      html += `<div class="tip-row"><span>Nájem (${tok.small}× žeton):</span><span class="tip-val">${fmt(space.rents[tok.small])} Kč</span></div>`;
    }
    if (owner) {
      html += `<div class="tip-owner" style="color:${esc(owner.color)}">🏠 Vlastní: ${esc(owner.name)}</div>`;
    }
  } else if (space.type === 'service') {
    html += `<div class="tip-row"><span>Cena:</span><span class="tip-val">${fmt(space.price)} Kč</span></div>`;
    if (owner) html += `<div class="tip-owner" style="color:${esc(owner.color)}">Vlastní: ${esc(owner.name)}</div>`;
  } else if (space.type === 'tax') {
    html += `<div class="tip-row"><span>Platíš:</span><span class="tip-val">${fmt(space.amount)} Kč</span></div>`;
  } else if (space.type === 'start') {
    html += `<div class="dim">Průchod: +4 000 Kč</div>`;
  }

  dom.tooltip.innerHTML = html;
  dom.tooltip.classList.remove('hidden');
  moveTip(ev);
}

function moveTip(ev) {
  const tip = dom.tooltip;
  let x = ev.clientX + 14, y = ev.clientY + 14;
  if (x + 230 > window.innerWidth)  x = ev.clientX - 230;
  if (y + 180 > window.innerHeight) y = ev.clientY - 180;
  tip.style.left = x + 'px';
  tip.style.top  = y + 'px';
}

/* ─── Toast ──────────────────────────────────────────────────────────────── */
let toastTimer;
function showToast(msg, err = false) {
  const t = dom.toast;
  t.textContent = msg;
  t.className = 'toast' + (err ? ' err' : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), 3500);
}
