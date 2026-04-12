'use strict';
/* ─── State ──────────────────────────────────────────────────────────────── */
let myId = null;
let boardData = null;
let gameState = null;
let boardBuilt = false;
let clientVisualPos = {};
let isAnimatingPawn = false;
let prevOwnerships = {};
let prevTokens = {};
let prevBalances = {};
let allColors = []; // Store full color list from server

const DICE_FACES = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
const fmt = n => Number(n).toLocaleString('cs-CZ');
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/* ─── DOM refs ───────────────────────────────────────────────────────────── */
const $ = id => document.getElementById(id);
const dom = {
  introView: $('intro-view'),
  roomList: $('room-list'),
  lobbyView: $('lobby-view'),
  gameView: $('game-view'),
  joinForm: $('join-form'),
  joinedWait: $('joined-wait'),
  nameInput: $('name-input'),
  colorPicker: $('color-picker'),
  joinBtn: $('join-btn'),
  lobbyPlayers: $('lobby-players'),
  hostControls: $('host-controls'),
  startBtn: $('start-btn'),
  board: $('board'),
  playersList: $('players-list'),
  actionTitle: $('action-title'),
  actionContent: $('action-content'),
  logList: $('log-list'),
  bcDice: $('bc-dice'),
  bcTurn: $('bc-turn'),
  bcRound: $('bc-round'),
  toast: $('toast'),
  tooltip: $('space-tip'),
};

/* ─── Socket ─────────────────────────────────────────────────────────────── */
const socket = io();
let myColor = null;
let selectedColor = null;

socket.on('room:list', list => renderRoomList(list));

socket.on('room:created', ({ roomId, password }) => {
  // Automatically join created room
  socket.emit('room:join', { roomId, password });
  $('room-create-form').classList.add('hidden');
  // We don't restore room-selection here because we're entering the room
});

socket.on('game:init', ({ roomId, board, colors, state }) => {
  boardData = board;
  allColors = colors;
  // Initially build picker with used colors from state
  buildColorPicker(allColors, state.players.map(p => p.color));
  // Hide intro, show lobby or game
  dom.introView.classList.add('hidden');
  processState(state);

  // Focus name input if not joined
  if (!state.players.find(p => p.id === socket.id)) {
    setTimeout(() => dom.nameInput.focus(), 100);
  }
});

socket.on('game:state', state => processState(state));

socket.on('game:error', ({ message }) => showToast(message, true));

/* ─── State processing ──────────────────────────────────────────────────── */
function processState(state) {
  if (!state) {
    // No state = we are in room list
    dom.introView.classList.remove('hidden');
    dom.lobbyView.classList.add('hidden');
    dom.gameView.classList.add('hidden');
    return;
  }
  gameState = state;
  identifyMe(state.players);                           // ← vždy, i v lobby

  const me = state.players.find(p => p.id === myId);

  if (state.phase === 'lobby') {
    renderLobby(state, me);
    // If I'm not joined yet, refresh color picker to show only available colors
    if (!me && allColors.length > 0) {
      buildColorPicker(allColors, state.players.map(p => p.color));
    }
  } else {
    dom.lobbyView.classList.add('hidden');
    dom.gameView.classList.remove('hidden');
    if (!boardBuilt && boardData) {
      buildBoard(boardData);
      generateParticles();
      boardBuilt = true;
    }

    // Check animations
    const currentOwn = state.ownerships || {};
    const currentTok = state.tokens || {};
    if (boardBuilt) {
      Object.keys(currentOwn).forEach(sid => {
        if (currentOwn[sid] !== prevOwnerships[sid]) {
          const owner = state.players.find(p => p.id === currentOwn[sid]);
          if (owner) playBuyAnimation(sid, owner);
        }
      });
      Object.keys(currentTok).forEach(sid => {
        const tNew = currentTok[sid];
        const tOld = prevTokens[sid] || { small: 0, big: false };
        if (tNew.small > tOld.small) playTokenAnimation(sid, false);
        if (tNew.big && !tOld.big) playTokenAnimation(sid, true);
      });
    }
    prevOwnerships = { ...currentOwn };
    prevTokens = JSON.parse(JSON.stringify(currentTok));

    // Inicializace vizuálních poloh pro plynulý start
    state.players.forEach(p => {
      if (clientVisualPos[p.id] === undefined) clientVisualPos[p.id] = p.position;
    });

    const balanceDiffs = [];
    state.players.forEach(p => {
      if (prevBalances[p.id] !== undefined && prevBalances[p.id] !== p.balance) {
        balanceDiffs.push({ id: p.id, diff: p.balance - prevBalances[p.id] });
      }
      prevBalances[p.id] = p.balance;
    });

    updatePlayers(state);

    // Append balance animations
    balanceDiffs.forEach(({ id, diff }) => {
      const balEl = $(`pb-${id}`);
      if (balEl) {
        const diffEl = document.createElement('div');
        diffEl.className = `balance-diff ${diff > 0 ? 'pos' : 'neg'}`;
        diffEl.textContent = (diff > 0 ? '+' : '') + fmt(diff) + ' Kč';
        balEl.appendChild(diffEl);
        setTimeout(() => { if (diffEl.parentNode) diffEl.remove(); }, 2000);
      }
    });

    updateBoard(state);
    animatePawnsIfNeeded(state);
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
      $('cfg-bal-disp').classList.add('hidden');

      const c = state.config || { startBalance: 10000, startBonus: 4000, buyoutMultiplier: 0 };
      if (document.activeElement !== $('cfg-startBal')) $('cfg-startBal').value = c.startBalance;
      if (document.activeElement !== $('cfg-startBon')) $('cfg-startBon').value = c.startBonus;
      if (document.activeElement !== $('cfg-buyout')) $('cfg-buyout').value = c.buyoutMultiplier;
    } else {
      $('cfg-bal-disp').classList.remove('hidden');
      const c = state.config || { startBalance: 10000, startBonus: 4000, buyoutMultiplier: 0 };
      $('cfg-bal-disp').innerHTML = `Pravidla hostitele: <strong>Kapitál ${fmt(c.startBalance)} Kč</strong>, Průchod START: ${fmt(c.startBonus)} Kč, Odkup koní: ${c.buyoutMultiplier > 0 ? (c.buyoutMultiplier + 'x') : '<span style="color:var(--red)">Vypnuto</span>'}`;
    }
  }
}

// Bind config inputs
['cfg-startBal', 'cfg-startBon', 'cfg-buyout'].forEach(id => {
  const el = $(id);
  if (el) {
    el.addEventListener('change', () => {
      socket.emit('game:update_config', {
        startBalance: Number($('cfg-startBal').value),
        startBonus: Number($('cfg-startBon').value),
        buyoutMultiplier: Number($('cfg-buyout').value)
      });
    });
  }
});

/* ─── Intro Screen Items ────────────────────────────────────────────────── */
function renderRoomList(list) {
  if (!list.length) {
    dom.roomList.innerHTML = '<p class="dim">Žádné aktivní místnosti.</p>';
    return;
  }
  dom.roomList.innerHTML = list.map(r => `
    <div class="room-item" data-id="${r.id}" data-pw="${r.hasPassword}">
      <div class="room-main">
        <div class="room-name">${esc(r.name)}</div>
        <div class="room-meta">
          <span>👥 ${r.players}/6</span>
          <span class="room-status ${r.phase === 'lobby' ? 'status-lobby' : 'status-playing'}">${r.phase === 'lobby' ? 'Lobby' : 'Probíhá'}</span>
          ${r.hasPassword ? '<span>🔒 Heslo</span>' : ''}
        </div>
      </div>
      <div class="room-join-btn">Vstoupit →</div>
    </div>
  `).join('');

  document.querySelectorAll('.room-item').forEach(el => {
    el.onclick = () => {
      const roomId = el.dataset.id;
      const hasPw = el.dataset.pw === 'true';
      let password = '';
      if (hasPw) {
        password = prompt('Zadejte heslo k místnosti:');
        if (password === null) return;
      }
      socket.emit('room:join', { roomId, password });
    };
  });
}

$('show-create-room').onclick = () => {
  $('room-selection').classList.add('hidden');
  $('room-create-form').classList.remove('hidden');
};
$('cancel-create-btn').onclick = () => {
  $('room-create-form').classList.add('hidden');
  $('room-selection').classList.remove('hidden');
};
$('room-create-btn').onclick = () => {
  const name = $('new-room-name').value.trim();
  const password = $('new-room-pass').value;
  if (!name) return showToast('Zadejte název místnosti!', true);
  socket.emit('room:create', { name, password });
};

// Leave buttons
$('lobby-leave-btn').onclick = () => {
  if (confirm('Opravdu chcete opustit místnost?')) {
    socket.emit('game:leave');
    location.reload(); // Refresh is simplest way to reset local state
  }
};
$('game-leave-btn').onclick = () => {
  if (confirm('Opravdu chcete opustit hru? Pokud odejdete během zápasu, zbankrotujete.')) {
    socket.emit('game:leave');
    location.reload();
  }
};

// Initial room list request
socket.emit('room:list');
setInterval(() => { if (!dom.introView.classList.contains('hidden')) socket.emit('room:list'); }, 5000);


function buildColorPicker(colors, usedColors = []) {
  dom.colorPicker.innerHTML = '';
  // Clean selectedColor if it's now taken
  if (selectedColor && usedColors.includes(selectedColor)) {
    selectedColor = null;
  }

  colors.forEach(c => {
    if (usedColors.includes(c)) return; // Hide taken colors

    const btn = document.createElement('button');
    btn.className = 'color-btn';
    if (selectedColor === c) btn.classList.add('selected');
    btn.style.background = c;
    btn.title = c;
    btn.onclick = () => {
      document.querySelectorAll('.color-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      selectedColor = c;
    };
    dom.colorPicker.appendChild(btn);
  });
  // Select first available by default if none selected
  if (!selectedColor && dom.colorPicker.firstChild) {
    dom.colorPicker.firstChild.click();
  }
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
    el.style.gridRow = row;
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
    const ownOverlay = document.createElement('div');
    ownOverlay.id = `ov-${space.id}`;
    ownOverlay.className = 'own-overlay hidden';
    el.appendChild(ownOverlay);

    const ownBadge = document.createElement('div');
    ownBadge.id = `ob-${space.id}`;
    ownBadge.className = 'own-badge hidden';
    el.appendChild(ownBadge);

    const tokenDots = document.createElement('div');
    tokenDots.id = `td-${space.id}`;
    tokenDots.className = 'token-dots';
    el.appendChild(tokenDots);

    const pawns = document.createElement('div');
    pawns.id = `pw-${space.id}`;
    pawns.className = 'space-pawns';
    el.appendChild(pawns);

    // Tooltip
    el.addEventListener('mouseenter', ev => showTip(space, ev));
    el.addEventListener('mousemove', ev => moveTip(ev));
    el.addEventListener('mouseleave', () => dom.tooltip.classList.add('hidden'));

    dom.board.appendChild(el);
  });
}

function getGridPos(id) {
  if (id === 0) return [11, 11];
  if (id === 10) return [11, 1];
  if (id === 20) return [1, 1];
  if (id === 30) return [1, 11];
  if (id >= 1 && id <= 9) return [11, 11 - id];
  if (id >= 11 && id <= 19) return [11 - (id - 10), 1];
  if (id >= 21 && id <= 29) return [1, id - 19];
  if (id >= 31 && id <= 39) return [id - 29, 11];
}

function getSide(id) {
  if ([0, 10, 20, 30].includes(id)) return 'corner';
  if (id >= 1 && id <= 9) return 'bottom';
  if (id >= 11 && id <= 19) return 'left';
  if (id >= 21 && id <= 29) return 'top';
  if (id >= 31 && id <= 39) return 'right';
}

function cornerIcon(id) {
  return { 0: '🏁', 10: '🔒', 20: '🅿️', 30: '➡️' }[id] || '⬜';
}
function typeIcon(space) {
  return {
    finance: '💰', nahoda: '🎁', tax: '💸', go_to_jail: '🚔',
    free_parking: '🅿️', service: '👤', start: '🏁'
  }[space.type] || '';
}

/* ─── Board Update (per state) ──────────────────────────────────────────── */
function updateBoard(state) {
  // Reset highlights
  document.querySelectorAll('.space.current-turn').forEach(el => el.classList.remove('current-turn'));

  const currentPlayer = state.players.find(p => p.id === state.currentTurnId);

  // Highlight current player's space
  if (currentPlayer) {
    const spaceEl = document.querySelector(`.space[data-id="${currentPlayer.position}"]`);
    if (spaceEl) spaceEl.classList.add('current-turn');
  }

  // Ownership badges & overlays
  document.querySelectorAll('.own-badge, .own-overlay').forEach(el => el.classList.add('hidden'));
  Object.entries(state.ownerships || {}).forEach(([spaceId, playerId]) => {
    const ob = $(`ob-${spaceId}`);
    const ov = $(`ov-${spaceId}`);
    if (!ob || !ov) return;
    const owner = state.players.find(p => p.id === playerId);
    if (owner) {
      ob.style.background = owner.color;
      ob.classList.remove('hidden');
      ov.style.background = owner.color;
      ov.classList.remove('hidden');
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

function renderPawns(state) {
  document.querySelectorAll('.space-pawns').forEach(el => el.innerHTML = '');
  state.players.forEach(p => {
    if (p.bankrupt) return;
    const pos = clientVisualPos[p.id] !== undefined ? clientVisualPos[p.id] : p.position;
    const pawnsEl = $(`pw-${pos}`);
    if (!pawnsEl) return;
    const pawnSVG = (color) => `<svg viewBox="0 0 320 512" fill="${esc(color)}" stroke="rgba(255,255,255,0.7)" stroke-width="12" style="width:100%;height:100%;filter:drop-shadow(0 2px 2px rgba(0,0,0,0.8));"><path d="M208 48c0-26.5-21.5-48-48-48S112 21.5 112 48s21.5 48 48 48 48-21.5 48-48zm-16 128V128H128v48c-17.7 0-32 14.3-32 32v12.2c0 23.3 9.4 45.6 25.8 61.8L145 305c4 4 6.2 9.4 6.2 15v32h17.6 15.6V320c0-5.6 2.2-11 6.2-15l23.2-23.2c16.4-16.4 25.8-38.6 25.8-61.9V208c0-17.7-14.3-32-32-32zM32 400v48c0 17.7 14.3 32 32 32h192c17.7 0 32-14.3 32-32v-48c0-17.7-14.3-32-32-32H64c-17.7 0-32 14.3-32 32z"/></svg>`;

    const pawn = document.createElement('div');
    pawn.className = 'pawn' + (p.id === state.currentTurnId ? ' is-active' : '');
    pawn.title = p.name;
    pawn.innerHTML = pawnSVG(p.color);
    pawnsEl.appendChild(pawn);
  });
}

function animatePawnsIfNeeded(state) {
  let needsAnim = false;
  state.players.forEach(p => {
    if (clientVisualPos[p.id] !== p.position && !p.bankrupt) needsAnim = true;
  });

  if (needsAnim && !isAnimatingPawn) {
    isAnimatingPawn = true;
    const step = () => {
      let stillNeeds = false;
      state.players.forEach(p => {
        if (p.bankrupt) return;
        if (clientVisualPos[p.id] !== p.position) {
          const diff = (p.position - clientVisualPos[p.id] + 40) % 40;
          if (diff <= 12) {
            clientVisualPos[p.id] = (clientVisualPos[p.id] + 1) % 40;
          } else {
            clientVisualPos[p.id] = (clientVisualPos[p.id] - 1 + 40) % 40;
          }
          // Bounce effect
          const space = document.querySelector(`.space[data-id="${clientVisualPos[p.id]}"]`);
          if (space) {
            space.style.transform = 'translateY(-4px)';
            setTimeout(() => { if (space) space.style.transform = ''; }, 150);
          }
          if (clientVisualPos[p.id] !== p.position) stillNeeds = true;
        }
      });
      renderPawns(state);
      if (stillNeeds) setTimeout(step, 180);
      else {
        isAnimatingPawn = false;
        renderPawns(state);
      }
    };
    step();
  } else if (!isAnimatingPawn) {
    renderPawns(state);
  }
}

/* ─── Players list ──────────────────────────────────────────────────────── */
function updatePlayers(state) {
  identifyMe(state.players);
  dom.playersList.innerHTML = state.players.map(p => {
    const isMe = p.id === myId;
    const isTurn = p.id === state.currentTurnId;
    let badges = '';
    if (p.inJail) badges += '<span class="p-badge jail">🔒 Distanc</span>';
    if (p.bankrupt) badges += '<span class="p-badge bankrupt-badge">💀 Bankrot</span>';
    if (isTurn) badges += '<span class="p-badge">▶ Na tahu</span>';
    const pos = boardData ? (boardData[p.position]?.name || '?') : '?';

    let invHtml = '';
    if (boardData && p.properties && p.properties.length > 0) {
      const ownedSpaces = p.properties.map(id => boardData.find(s => s.id === id)).filter(Boolean);

      const groups = {};
      ownedSpaces.forEach(sp => {
        const g = sp.type === 'service' ? 'S' : (sp.groupColor || '#000');
        if (!groups[g]) groups[g] = [];
        groups[g].push(sp);
      });

      invHtml = '<div class="p-inventory">';
      Object.entries(groups).forEach(([gColor, spcList]) => {
        const totalInGroup = boardData.filter(s => s.type === 'horse' && s.groupColor === gColor).length;
        const isMonopoly = (spcList.length === totalInGroup && totalInGroup > 0) && spcList[0].type !== 'service';

        invHtml += `<div class="inv-group ${isMonopoly ? 'monopoly-glow' : ''}">`;

        spcList.forEach(sp => {
          if (sp.type === 'service') {
            const isTrainer = sp.name.toLowerCase().includes('trenér');
            const icon = isTrainer ? '👤' : '🚐';
            invHtml += `<div class="inv-service" data-sid="${sp.id}">${icon}</div>`;
          } else {
            const tok = (gameState && gameState.tokens) ? gameState.tokens[sp.id] : null;
            let inner = '';
            if (tok && tok.big) inner = '<span class="inv-crown">👑</span>';
            else if (tok && tok.small > 0) {
              inner = Array(tok.small).fill('<span class="inv-dot"></span>').join('');
            }
            invHtml += `<div class="inv-bar" data-sid="${sp.id}" style="background:${esc(sp.groupColor)}">${inner}</div>`;
          }
        });
        invHtml += '</div>';
      });
      invHtml += '</div>';
    }

    return `
      <div class="player-row ${isTurn ? 'is-turn' : ''} ${p.bankrupt ? 'bankrupt' : ''}">
        <div class="p-avatar" style="background:${esc(p.color)}">${esc(p.name[0]).toUpperCase()}</div>
        <div class="p-info">
          <div class="p-name">${esc(p.name)}${isMe ? ' <span style="color:var(--gold);font-size:10px">(ty)</span>' : ''}</div>
          <div class="p-pos">${esc(pos)} ${badges}</div>
          ${invHtml}
        </div>
        <div class="p-balance ${p.balance < 2000 ? 'low' : ''}" id="pb-${p.id}">${fmt(p.balance)} Kč</div>
      </div>
    `;
  }).join('');
}

/* ─── Board Center ──────────────────────────────────────────────────────── */
let prevDice = null;
function updateCenter(state) {
  dom.bcRound.textContent = `Kolo ${state.round}`;

  if (state.lastDice && state.lastDice.id !== prevDice?.id) {
    prevDice = state.lastDice;

    // 3D dice 
    const diceEl = $('dice-3d');
    if (diceEl) {
      diceEl.classList.add('rolling');
      diceEl.style.transition = 'none';
      setTimeout(() => {
        diceEl.classList.remove('rolling');

        let rotX = 0, rotY = 0;
        switch (state.lastDice.value) {
          case 1: rotX = 0; rotY = 0; break;
          case 6: rotX = 0; rotY = -180; break;
          case 3: rotX = 0; rotY = -90; break;
          case 4: rotX = 0; rotY = 90; break;
          case 5: rotX = -90; rotY = 0; break;
          case 2: rotX = 90; rotY = 0; break;
        }
        rotX += (Math.random() * 20 - 10);
        rotY += (Math.random() * 20 - 10);

        diceEl.style.transform = `rotateX(${rotX - 360}deg) rotateY(${rotY - 360}deg)`;
        void diceEl.offsetWidth; // hard reflow
        diceEl.style.transition = 'transform 0.6s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
        diceEl.style.transform = `rotateX(${rotX}deg) rotateY(${rotY}deg)`;
      }, 400); // roll duration
    }
  }

  const current = state.players.find(p => p.id === state.currentTurnId);
  if (current) {
    dom.bcTurn.innerHTML = `<span style="color:${esc(current.color)};font-weight:700">${esc(current.name)}</span>`;
  }
}

/* ─── Action Panel ──────────────────────────────────────────────────────── */
function updateActionPanel(state) {
  const pa = state.pendingAction;

  // Hide 3D Card logic if not card_ack
  const cardOverlay = $('card-3d-overlay');
  if (cardOverlay && (!pa || pa.type !== 'card_ack')) {
    cardOverlay.classList.add('hidden');
  }

  if (!pa) {
    dom.actionTitle.textContent = 'Akce';
    dom.actionContent.innerHTML = '<p class="dim" style="text-align:center;padding:20px 0">⏳ Zpracovávám...</p>';
    return;
  }

  const isTargeted = pa.targetId === myId;
  const targetPlayer = state.players.find(p => p.id === pa.targetId);
  const targetName = targetPlayer?.name || '?';
  const me = state.players.find(p => p.id === myId);

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

    case 'service_roll':
      dom.actionTitle.textContent = isTargeted ? 'Poplatek za služby' : 'Čeká se...';
      if (isTargeted) {
        dom.actionContent.innerHTML = `
          <div class="jail-display" style="border-color:var(--blue);padding:10px;margin-bottom:10px;border: 1px solid var(--blue);">
            🏠 <strong>Musíte hodit kostkou pro určení poplatku!</strong><br/>
            Pole: ${esc(boardData[pa.data.spaceId].name)}
          </div>
          <button id="roll-service-btn" class="btn btn-gold btn-lg">🎲 Hodit pro poplatek</button>
        `;
        $('roll-service-btn').onclick = () => socket.emit('game:roll');
      } else {
        dom.actionContent.innerHTML = waitHTML(targetPlayer, 'hází kostkou pro určení poplatku...');
      }
      break;

    // ── Buy offer ──
    case 'buy_offer': {
      const space = boardData[pa.data.spaceId];
      const rents = space.rents || [];
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
              <div class="buy-rest">Zůstatek po koupi: <strong style="color:${balAfter < 0 ? 'var(--red)' : 'var(--green)'}">${fmt(balAfter)} Kč</strong></div>
              <div class="action-buttons row" style="margin-top:6px">
                ${balAfter >= 0 ? `<button id="buy-yes" class="btn btn-green" style="flex:1">Koupit</button>` : ''}
                <button id="buy-no"  class="btn btn-outline" style="flex:1">Pas</button>
              </div>
            </div>
          </div>
        `;
        if ($('buy-yes')) $('buy-yes').onclick = () => socket.emit('game:respond', { decision: 'buy', spaceId: pa.data.spaceId });
        if ($('buy-no')) $('buy-no').onclick = () => socket.emit('game:respond', { decision: 'pass', spaceId: pa.data.spaceId });
      } else {
        dom.actionContent.innerHTML = waitHTML(targetPlayer, `zvažuje koupi <strong>${esc(space.name)}</strong>`);
      }
      break;
    }

    // ── Debt Manage ──
    case 'debt_manage': {
      dom.actionTitle.textContent = 'Dluh! Prodejte majetek';
      if (isTargeted) {
        const p = state.players.find(p => p.id === myId);
        const props = (p.properties || []).map(sid => {
          const sp = boardData[sid];
          let val = Math.floor(sp.price / 2);
          const tok = state.tokens[sid];
          if (tok) {
            if (tok.big) val += Math.floor(sp.bigTokenCost / 2) + Math.floor(sp.tokenCost / 2) * 4;
            else if (tok.small) val += Math.floor(sp.tokenCost / 2) * tok.small;
          }
          return `<div class="token-item">
                      <div class="tok-name" style="border-left:3px solid ${esc(sp.groupColor || '#5b8dee')};padding-left:6px">
                        ${esc(sp.name)} <span class="dim">(+ ${fmt(val)} Kč)</span>
                      </div>
                      <div class="tok-btns">
                        <button class="btn btn-xs btn-outline sell-btn" data-sid="${sid}">Prodat</button>
                      </div>
                    </div>`;
        }).join('');

        dom.actionContent.innerHTML = `
           <div class="jail-display" style="border-color:var(--red);padding:10px;margin-bottom:10px;border: 1px solid var(--red);">
             ⚠️ <strong style="color:var(--red)">Jste v mínusu: ${fmt(p.balance)} Kč!</strong><br/>
             Musíte prodat majetek nebo zkrachovat.
           </div>
           <div class="token-list" style="margin-top:10px">${props || '<p class="dim">Žádný majetek k prodeji.</p>'}</div>
           <button id="debt-bankrupt" class="btn btn-red" style="margin-top:10px;width:100%">Vyhlásit bankrot 💀</button>
         `;
        document.querySelectorAll('.sell-btn').forEach(b => {
          b.onclick = () => socket.emit('game:respond', { decision: 'sell_property', spaceId: +b.dataset.sid });
        });
        $('debt-bankrupt').onclick = () => socket.emit('game:respond', { decision: 'declare_bankrupt' });
      } else {
        dom.actionContent.innerHTML = waitHTML(targetPlayer, 'řeší své dluhy...');
      }
      break;
    }

    // ── Buyout Offer ──
    case 'buyout_offer': {
      const space = boardData[pa.data.spaceId];
      const cost = pa.data.buyoutCost;
      dom.actionTitle.textContent = 'Nepřátelský odkup';
      if (isTargeted) {
        dom.actionContent.innerHTML = `
           <div class="jail-display" style="border-color:var(--gold);padding:10px;margin-bottom:10px;border: 1px solid var(--gold);">
             Chcete nuceně odkoupit stáj <strong>${esc(space.name)}</strong>?<br/>
             Stojí to <strong style="color:var(--gold)">${fmt(cost)} Kč</strong>.
           </div>
           <div class="action-buttons row">
             <button id="buyout-yes" class="btn btn-gold" style="flex:1">Odkoupit</button>
             <button id="buyout-no"  class="btn btn-outline" style="flex:1">Ne, díky</button>
           </div>
         `;
        if ($('buyout-yes')) $('buyout-yes').onclick = () => socket.emit('game:respond', { decision: 'buy' });
        if ($('buyout-no')) $('buyout-no').onclick = () => socket.emit('game:respond', { decision: 'pass' });
      } else {
        dom.actionContent.innerHTML = waitHTML(targetPlayer, `zvažuje odkup cizí stáje...`);
      }
      break;
    }

    // ── Card ──
    case 'card_ack': {
      const { card, label } = pa.data;

      const cardEl = $('card-3d');
      if (cardOverlay && cardEl) {
        cardOverlay.classList.remove('hidden');
        $('card-3d-title').textContent = label;
        $('card-3d-text').textContent = card.text;
        $('card-3d-btn').classList.toggle('hidden', !isTargeted);

        // Flip animation
        cardEl.classList.remove('flipped');
        setTimeout(() => cardEl.classList.add('flipped'), 100);

        if (isTargeted) {
          $('card-3d-btn').onclick = () => {
            cardEl.classList.remove('flipped');
            setTimeout(() => {
              cardOverlay.classList.add('hidden');
              socket.emit('game:respond', { decision: 'ok' });
            }, 500);
          };
        }
      }

      dom.actionTitle.textContent = `Karta: ${label}`;
      dom.actionContent.innerHTML = `
        <div class="card-display" style="margin-top:10px">
          <div class="card-label">🃏 ${esc(label)}</div>
          <div class="card-text">${esc(card.text)}</div>
          ${isTargeted ? '<p class="dim" style="font-size:11px">Potvrďte na obrazovce karty.</p>' : '<p class="dim" style="font-size:11px">Čeká se na potvrzení hráče...</p>'}
        </div>
      `;
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
            <p class="jail-text">Jste v Distancu!<br/>Zbývá: <strong>${jt}</strong> ${jt === 1 ? 'kolo' : 'kola'}</p>
            <div class="action-buttons">
              <button id="jail-pay"  class="btn btn-gold">Zaplatit ${fmt(500)} Kč a hrát</button>
              <button id="jail-roll" class="btn btn-outline">🎲 Hodit (6 = volno)</button>
            </div>
          </div>
        `;
        $('jail-pay').onclick = () => socket.emit('game:respond', { decision: 'pay_fine' });
        $('jail-roll').onclick = () => socket.emit('game:respond', { decision: 'roll_jail' });
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
          const sp = boardData[sid];
          const tok = state.tokens[sid] || { small: 0, big: false };
          const canS = !tok.big && tok.small < 4 && (me?.balance || 0) >= sp.tokenCost;
          const canB = !tok.big && tok.small >= 4 && (me?.balance || 0) >= sp.bigTokenCost;
          return `
            <div class="token-item">
              <div class="tok-name" style="border-left:3px solid ${esc(sp.groupColor)};padding-left:6px">
                ${esc(sp.name)}
                <span style="color:var(--text-muted);font-weight:400"> — ${tok.small}× ${tok.big ? '🏆' : ''}</span>
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
            decision: 'add_token', spaceId: +b.dataset.sid, tokenType: b.dataset.t
          });
        });
        $('end-turn').onclick = () => socket.emit('game:respond', { decision: 'end_turn' });
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
          <div class="gameover-title">${w ? esc(w.name) + ' vyhrál(a)!' : 'Konec hry!'}</div>
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
      <p>Čeká se na <strong style="color:${esc(player?.color || '#fff')}">${esc(player?.name || '?')}</strong><br/><span class="dim">${msg}</span></p>
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
  const owner = ownerId ? gameState.players.find(p => p.id === ownerId) : null;
  const tok = gameState.tokens?.[space.id] || { small: 0, big: false };

  let html = `<div class="tip-name">${esc(space.name)}</div>`;

  if (space.type === 'horse') {
    html += `<div class="tip-group" style="color:${esc(space.groupColor)}">● Stáj ${esc(space.group || '')}</div>`;
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
  if (x + 230 > window.innerWidth) x = ev.clientX - 230;
  if (y + 180 > window.innerHeight) y = ev.clientY - 180;
  tip.style.left = x + 'px';
  tip.style.top = y + 'px';
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

/* ─── Particles ──────────────────────────────────────────────────────────── */
function generateParticles() {
  const container = $('particles-container');
  if (!container) return;
  setInterval(() => {
    if (document.hidden) return;
    const p = document.createElement('div');
    p.className = 'particle';
    const size = Math.random() * 4 + 2;
    p.style.width = size + 'px';
    p.style.height = size + 'px';
    p.style.left = (Math.random() * 100) + '%';
    p.style.top = (Math.random() * 100) + '%';
    container.appendChild(p);
    setTimeout(() => { if (p.parentNode) p.remove(); }, 3000);
  }, 250);
}

/* ─── Inventory Tooltips ─────────────────────────────────────────────────── */
dom.playersList.addEventListener('mouseover', ev => {
  const bar = ev.target.closest('.inv-bar, .inv-service');
  if (bar && boardData) {
    const sid = parseInt(bar.dataset.sid);
    const space = boardData.find(s => s.id === sid);
    if (space) showTip(space, ev);
  }
});
dom.playersList.addEventListener('mousemove', ev => {
  if (ev.target.closest('.inv-bar, .inv-service')) moveTip(ev);
});
dom.playersList.addEventListener('mouseout', ev => {
  if (ev.target.closest('.inv-bar, .inv-service')) dom.tooltip.classList.add('hidden');
});

/* ─── Visual Effects ─────────────────────────────────────────────────────── */
function spawnFloatingText(spaceId, text, color) {
  const space = document.querySelector(`.space[data-id="${spaceId}"]`);
  if (!space) return;
  const rect = space.getBoundingClientRect();

  const el = document.createElement('div');
  el.className = 'floating-text';
  el.style.left = (rect.left + rect.width / 2) + 'px';
  el.style.top = (rect.top + rect.height / 2) + 'px';
  el.style.color = color;
  el.innerHTML = text;
  document.body.appendChild(el);

  setTimeout(() => { if (el.parentNode) el.remove(); }, 1200);
}

function playBuyAnimation(spaceId, owner) {
  const color = owner.color || '#fff';
  spawnFloatingText(spaceId, 'VLASTNÍK!', color);

  const space = document.querySelector(`.space[data-id="${spaceId}"]`);
  if (space) {
    space.classList.add('flash-buy');
    space.style.boxShadow = `inset 0 0 40px ${esc(color)}`;
    setTimeout(() => {
      space.classList.remove('flash-buy');
      space.style.boxShadow = '';
    }, 1000);
  }
}

function playTokenAnimation(spaceId, isBig) {
  const text = isBig ? '👑 HLAVNÍ DOSTIH' : '➕ ŽETON';
  spawnFloatingText(spaceId, text, 'var(--gold)');
}
