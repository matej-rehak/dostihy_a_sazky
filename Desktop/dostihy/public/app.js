'use strict';

// ─── Celý kód je zapouzdřen v IIFE → žádné globální proměnné nejsou
//     přístupné z DevTools / konzole (oprava: globální scope pollution)
(function () {

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
  let allColors = [];
  let isStarterAnimating = false;

  // Interval handles — aby šly zastavit a nevznikaly memory leaky
  let particleIntervalId = null;
  let roomListIntervalId = null;

  const DICE_FACES = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
  const fmt = n => Number(n).toLocaleString('cs-CZ');

  // ─── Bezpečná sanitizace (oprava: neúplná esc() — chyběly apostrofy a lomítka)
  const esc = s => String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');

  // ─── Validace CSS barev ze serveru (oprava: nekontrolované hodnoty do style=)
  const isSafeColor = v =>
    typeof v === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(v.trim());
  const safeColor = (v, fallback = '#888888') =>
    isSafeColor(v) ? v.trim() : fallback;

  /* ─── DOM refs ───────────────────────────────────────────────────────────── */
  // Wrapper s null-checkem (oprava: přímé volání .onclick na null způsobovalo TypeError)
  const getEl = id => {
    const el = document.getElementById(id);
    if (!el) console.warn(`[client] Element #${id} nenalezen`);
    return el;
  };

  const dom = {
    introView: getEl('intro-view'),
    roomList: getEl('room-list'),
    lobbyView: getEl('lobby-view'),
    gameView: getEl('game-view'),
    joinForm: getEl('join-form'),
    joinedWait: getEl('joined-wait'),
    nameInput: getEl('name-input'),
    colorPicker: getEl('color-picker'),
    joinBtn: getEl('join-btn'),
    lobbyPlayers: getEl('lobby-players'),
    hostControls: getEl('host-controls'),
    startBtn: getEl('start-btn'),
    board: getEl('board'),
    playersList: getEl('players-list'),
    actionTitle: getEl('action-title'),
    actionContent: getEl('action-content'),
    logList: getEl('log-list'),
    bcDice: getEl('bc-dice'),
    bcTurn: getEl('bc-turn'),
    bcRound: getEl('bc-round'),
    toast: getEl('toast'),
    tooltip: getEl('space-tip'),
  };

  /* ─── Pomocné DOM utility ────────────────────────────────────────────────── */

  // Bezpečná alternativa k innerHTML pro jednoduché textové uzly
  function setText(el, text) {
    if (!el) return;
    el.textContent = text;
  }

  // Vytvoří element a nastaví textContent — žádný innerHTML pro uživatelská data
  function makeEl(tag, cls, text) {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text !== undefined) el.textContent = text;
    return el;
  }

  /* ─── Socket ─────────────────────────────────────────────────────────────── */
  const socket = io();
  let myColor = null;
  let selectedColor = null;

  socket.on('room:list', list => renderRoomList(list));

  socket.on('room:created', ({ roomId, password }) => {
    socket.emit('room:join', { roomId, password });
    const createForm = getEl('room-create-form');
    if (createForm) createForm.classList.add('hidden');
  });

  socket.on('game:init', ({ roomId, board, colors, state }) => {
    boardData = board;
    allColors = colors;
    buildColorPicker(allColors, state.players.map(p => p.color));
    dom.introView.classList.add('hidden');
    processState(state);
    if (!state.players.find(p => p.id === socket.id)) {
      setTimeout(() => { if (dom.nameInput) dom.nameInput.focus(); }, 100);
    }
  });

  socket.on('game:state', state => processState(state));
  socket.on('game:error', ({ message }) => showToast(message, true));

  /* ─── Identita hráče ─────────────────────────────────────────────────────── */
  // (oprava: odstraněn fallback na jméno — hráči se stejným jménem si vyměnili identitu)
  function identifyMe(players) {
    if (myId) return;
    if (socket.id && players.find(p => p.id === socket.id)) {
      myId = socket.id;
    }
    // Fallback na jméno záměrně odstraněn — server by měl vrátit
    // playerId spolehlivě přes socket.id nebo dedikovanou událost.
  }

  /* ─── State processing ──────────────────────────────────────────────────── */
  function processState(state) {
    if (!state) {
      dom.introView.classList.remove('hidden');
      dom.lobbyView.classList.add('hidden');
      dom.gameView.classList.add('hidden');
      return;
    }
    gameState = state;
    identifyMe(state.players);

    const me = state.players.find(p => p.id === myId);

    if (state.phase === 'lobby') {
      renderLobby(state, me);
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
      // (oprava: JSON round-trip nahrazen strukturovaným klonem — bezpečnější a rychlejší)
      try {
        prevTokens = structuredClone(currentTok);
      } catch {
        prevTokens = JSON.parse(JSON.stringify(currentTok));
      }

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

      balanceDiffs.forEach(({ id, diff }) => {
        const balEl = getEl(`pb-${id}`);
        if (balEl) {
          const diffEl = makeEl('div', `balance-diff ${diff > 0 ? 'pos' : 'neg'}`);
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

    // Hráči — DOM API místo innerHTML (oprava: XSS přes jméno hráče)
    const lpContainer = dom.lobbyPlayers;
    if (lpContainer) {
      lpContainer.innerHTML = '';
      if (!state.players.length) {
        lpContainer.appendChild(makeEl('p', 'dim', 'Zatím nikdo...'));
      } else {
        state.players.forEach(p => {
          const row = makeEl('div', 'lp-row');

          const avatar = makeEl('div', 'lp-avatar');
          avatar.style.background = safeColor(p.color);
          avatar.textContent = p.name[0].toUpperCase();

          const name = makeEl('span', 'lp-name', p.name);
          row.appendChild(avatar);
          row.appendChild(name);

          if (p.isHost) row.appendChild(makeEl('span', 'lp-host', 'HOST'));
          if (p.ready) row.appendChild(makeEl('span', 'lp-ready-text', 'PŘIPRAVEN'));

          const dot = makeEl('div', `lp-ready-dot${p.ready ? ' is-ready' : ''}`);
          row.appendChild(dot);
          lpContainer.appendChild(row);
        });
      }
    }

    if (me) {
      if (dom.joinForm) dom.joinForm.classList.add('hidden');
      if (dom.joinedWait) dom.joinedWait.classList.remove('hidden');

      if (me.isHost) {
        if (dom.hostControls) dom.hostControls.classList.remove('hidden');
        const allReady = state.players.every(p => p.ready);
        if (dom.startBtn) {
          dom.startBtn.disabled = state.players.length < 2 || !allReady;
          if (state.players.length < 2) {
            dom.startBtn.textContent = `▶ Spustit hru (min. 2 hráče — ${state.players.length}/2)`;
          } else if (!allReady) {
            dom.startBtn.textContent = `▶ Čeká se na připravenost všech...`;
          } else {
            dom.startBtn.textContent = `▶ Spustit hru! (${state.players.length} hráčů připraveno)`;
          }
        }
        const balDisp = getEl('cfg-bal-disp');
        if (balDisp) balDisp.classList.add('hidden');

        const c = state.config || { startBalance: 30000, startBonus: 4000, buyoutMultiplier: 0 };
        const cfgBal = getEl('cfg-startBal');
        const cfgBon = getEl('cfg-startBon');
        const cfgBuy = getEl('cfg-buyout');
        if (cfgBal && document.activeElement !== cfgBal) cfgBal.value = c.startBalance;
        if (cfgBon && document.activeElement !== cfgBon) cfgBon.value = c.startBonus;
        if (cfgBuy && document.activeElement !== cfgBuy) cfgBuy.value = c.buyoutMultiplier;
      } else {
        const balDisp = getEl('cfg-bal-disp');
        if (balDisp) {
          balDisp.classList.remove('hidden');
          const c = state.config || { startBalance: 30000, startBonus: 4000, buyoutMultiplier: 0 };
          // DOM API pro obsah s daty (oprava: innerHTML s interpolovanými hodnotami)
          balDisp.textContent = '';
          balDisp.appendChild(document.createTextNode('Pravidla hostitele: '));
          const strong = makeEl('strong', '', `Kapitál ${fmt(c.startBalance)} Kč`);
          balDisp.appendChild(strong);
          const buyoutText = c.buyoutMultiplier > 0
            ? `${c.buyoutMultiplier}x`
            : 'Vypnuto';
          balDisp.appendChild(document.createTextNode(
            `, Průchod START: ${fmt(c.startBonus)} Kč, Odkup koní: ${buyoutText}`
          ));
        }
      }

      const readyBtn = getEl('toggle-ready-btn');
      if (readyBtn) {
        readyBtn.textContent = me.ready ? 'RUŠÍM PŘIPRAVENOST' : 'JSEM PŘIPRAVEN';
        readyBtn.className = me.ready ? 'btn btn-ready-waiting' : 'btn btn-ready-active';
      }
    }
  }

  // Bind config inputs
  ['cfg-startBal', 'cfg-startBon', 'cfg-buyout'].forEach(id => {
    const el = getEl(id);
    if (!el) return;
    el.addEventListener('change', () => {
      const bal = getEl('cfg-startBal');
      const bon = getEl('cfg-startBon');
      const buy = getEl('cfg-buyout');
      socket.emit('game:update_config', {
        startBalance: Number(bal?.value ?? 30000),
        startBonus: Number(bon?.value ?? 4000),
        buyoutMultiplier: Number(buy?.value ?? 0),
      });
    });
  });

  /* ─── Intro Screen ──────────────────────────────────────────────────────── */
  function renderRoomList(list) {
    if (!dom.roomList) return;
    dom.roomList.innerHTML = '';

    if (!list.length) {
      dom.roomList.appendChild(makeEl('p', 'dim', 'Žádné aktivní místnosti.'));
      return;
    }

    list.forEach(r => {
      const item = makeEl('div', 'room-item');

      const main = makeEl('div', 'room-main');
      main.appendChild(makeEl('div', 'room-name', r.name));

      const meta = makeEl('div', 'room-meta');
      meta.appendChild(makeEl('span', '', `👥 ${r.players}/6`));
      const statusCls = r.phase === 'lobby' ? 'status-lobby' : 'status-playing';
      meta.appendChild(makeEl('span', `room-status ${statusCls}`, r.phase === 'lobby' ? 'Lobby' : 'Probíhá'));
      if (r.hasPassword) meta.appendChild(makeEl('span', '', '🔒 Heslo'));
      main.appendChild(meta);

      item.appendChild(main);
      item.appendChild(makeEl('div', 'room-join-btn', 'Vstoupit →'));

      item.addEventListener('click', () => {
        let password = '';
        if (r.hasPassword) {
          // (poznámka: prompt() posílá heslo jako plaintext — ideálně nahradit
          //  vlastním modálním formulářem s masked inputem)
          password = prompt('Zadejte heslo k místnosti:');
          if (password === null) return;
        }
        socket.emit('room:join', { roomId: r.id, password });
      });

      dom.roomList.appendChild(item);
    });
  }

  // Tlačítka intro obrazovky — null-safe
  const showCreateRoom = getEl('show-create-room');
  const cancelCreateBtn = getEl('cancel-create-btn');
  const roomCreateBtn = getEl('room-create-btn');
  const roomSelection = getEl('room-selection');
  const roomCreateForm = getEl('room-create-form');

  if (showCreateRoom) showCreateRoom.addEventListener('click', () => { roomSelection?.classList.add('hidden'); roomCreateForm?.classList.remove('hidden'); });
  if (cancelCreateBtn) cancelCreateBtn.addEventListener('click', () => { roomCreateForm?.classList.add('hidden'); roomSelection?.classList.remove('hidden'); });
  if (roomCreateBtn) roomCreateBtn.addEventListener('click', () => {
    const name = getEl('new-room-name')?.value.trim();
    const password = getEl('new-room-pass')?.value ?? '';
    if (!name) { showToast('Zadejte název místnosti!', true); return; }
    socket.emit('room:create', { name, password });
  });

  // Leave buttons
  const lobbyLeaveBtn = getEl('lobby-leave-btn');
  const gameLeaveBtn = getEl('game-leave-btn');

  if (lobbyLeaveBtn) {
    lobbyLeaveBtn.addEventListener('click', () => {
      if (confirm('Opravdu chcete opustit místnost?')) {
        socket.emit('game:leave');
        resetLocalState();
      }
    });
  }
  if (gameLeaveBtn) {
    gameLeaveBtn.addEventListener('click', () => {
      if (confirm('Opravdu chcete opustit hru? Pokud odejdete během zápasu, zbankrotujete.')) {
        socket.emit('game:leave');
        resetLocalState();
      }
    });
  }

  // (oprava: location.reload() nahrazeno explicitním resetem stavu + přechodem na intro)
  function resetLocalState() {
    myId = null;
    boardData = null;
    gameState = null;
    boardBuilt = false;
    clientVisualPos = {};
    isAnimatingPawn = false;
    prevOwnerships = {};
    prevTokens = {};
    prevBalances = {};
    allColors = [];
    isStarterAnimating = false;

    if (particleIntervalId) { clearInterval(particleIntervalId); particleIntervalId = null; }
    if (dom.board) dom.board.innerHTML = '';

    dom.introView.classList.remove('hidden');
    dom.lobbyView.classList.add('hidden');
    dom.gameView.classList.add('hidden');

    socket.emit('room:list');
  }

  // Initial room list + polling (oprava: interval uložen do proměnné pro pozdější cleanup)
  socket.emit('room:list');
  roomListIntervalId = setInterval(() => {
    if (!dom.introView?.classList.contains('hidden')) socket.emit('room:list');
  }, 5000);

  /* ─── Color picker ───────────────────────────────────────────────────────── */
  function buildColorPicker(colors, usedColors = []) {
    if (!dom.colorPicker) return;
    dom.colorPicker.innerHTML = '';

    if (selectedColor && usedColors.includes(selectedColor)) {
      selectedColor = null;
    }

    colors.forEach(c => {
      if (usedColors.includes(c)) return;
      if (!isSafeColor(c)) return; // přeskočit nebezpečné hodnoty barev

      const btn = makeEl('button', 'color-btn');
      if (selectedColor === c) btn.classList.add('selected');
      btn.style.background = c;
      btn.title = c;
      btn.addEventListener('click', () => {
        document.querySelectorAll('.color-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        selectedColor = c;
      });
      dom.colorPicker.appendChild(btn);
    });

    if (!selectedColor && dom.colorPicker.firstChild) {
      dom.colorPicker.firstChild.click();
    }
  }

  /* ─── Starter animation ──────────────────────────────────────────────────── */
  function runStarterAnimation(winnerId, players) {
    const overlay = getEl('starter-overlay');
    const flicker = getEl('starter-flicker');
    const winnerEl = getEl('starter-winner');
    if (!overlay || !flicker || !winnerEl) return;

    overlay.classList.remove('hidden');
    winnerEl.classList.add('hidden');
    flicker.classList.remove('hidden');

    let count = 0;
    const max = 30;
    const interval = setInterval(() => {
      const p = players[Math.floor(Math.random() * players.length)];
      // DOM API — žádný innerHTML s daty hráče
      flicker.innerHTML = '';
      const item = makeEl('div', 'flicker-item');
      item.style.color = safeColor(p.color);
      item.textContent = p.name;
      flicker.appendChild(item);

      count++;
      if (count >= max) {
        clearInterval(interval);
        const winner = players.find(pl => pl.id === winnerId);
        flicker.classList.add('hidden');
        winnerEl.classList.remove('hidden');
        winnerEl.textContent = `🏁 ${winner?.name ?? '?'} ZAČÍNÁ!`;
        winnerEl.style.color = safeColor(winner?.color ?? '#fff');
        winnerEl.classList.add('winning-gold');
        setTimeout(() => overlay.classList.add('hidden'), 2000);
      }
    }, 100);
  }

  /* ─── Join ───────────────────────────────────────────────────────────────── */
  if (dom.joinBtn) {
    dom.joinBtn.addEventListener('click', () => {
      const name = dom.nameInput?.value.trim();
      if (!name) { showToast('Zadejte jméno!', true); return; }
      // (oprava: tlačítko deaktivováno ihned → prevence flood/double-click)
      dom.joinBtn.disabled = true;
      socket.emit('game:join', { name, color: selectedColor });
    });
  }

  if (dom.nameInput) {
    dom.nameInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') dom.joinBtn?.click();
    });
  }

  if (dom.startBtn) {
    dom.startBtn.addEventListener('click', () => {
      dom.startBtn.disabled = true; // prevence double-click
      socket.emit('game:start');
    });
  }

  const toggleReadyBtn = getEl('toggle-ready-btn');
  if (toggleReadyBtn) {
    toggleReadyBtn.addEventListener('click', () => {
      toggleReadyBtn.disabled = true;
      socket.emit('game:ready');
      // Re-enable po krátké prodlevě (server odpoví stavem)
      setTimeout(() => { if (toggleReadyBtn) toggleReadyBtn.disabled = false; }, 800);
    });
  }

  /* ─── Board Building ─────────────────────────────────────────────────────── */
  function buildBoard(board) {
    board.forEach(space => {
      const [row, col] = getGridPos(space.id);
      const side = getSide(space.id);

      const el = makeEl('div', `space space-${space.type} side-${side}`);
      el.dataset.id = String(space.id);
      el.style.gridRow = row;
      el.style.gridColumn = col;

      if (space.type === 'horse') {
        const stripe = makeEl('div', 'stripe');
        stripe.style.background = safeColor(space.groupColor);
        el.appendChild(stripe);
      } else if (space.type === 'service') {
        const stripe = makeEl('div', 'stripe');
        stripe.style.background = '#ffffffff';
        el.appendChild(stripe);
      }

      if (side === 'corner') {
        el.classList.add('space-corner');
        const icon = makeEl('div', 'corner-icon', cornerIcon(space.id));
        const name = makeEl('div', 'corner-name', space.name);
        el.appendChild(icon);
        el.appendChild(name);
        if (space.id === 10) {
          el.appendChild(makeEl('div', 'corner-sub', ''));
        }
      } else {
        const inner = makeEl('div', 'space-inner');
        const icon = typeIcon(space);
        if (icon) inner.appendChild(makeEl('div', 'space-icon', icon));
        inner.appendChild(makeEl('div', 'space-name', space.name));
        if (space.price) inner.appendChild(makeEl('div', 'space-price', `${fmt(space.price)} Kč`));
        el.appendChild(inner);
      }

      const ownOverlay = makeEl('div', 'own-overlay hidden');
      ownOverlay.id = `ov-${space.id}`;
      el.appendChild(ownOverlay);

      const ownBadge = makeEl('div', 'own-badge hidden');
      ownBadge.id = `ob-${space.id}`;
      el.appendChild(ownBadge);

      const tokenDots = makeEl('div', 'token-dots');
      tokenDots.id = `td-${space.id}`;
      el.appendChild(tokenDots);

      const pawns = makeEl('div', 'space-pawns');
      pawns.id = `pw-${space.id}`;
      el.appendChild(pawns);

      el.addEventListener('mouseenter', ev => showTip(space, ev));
      el.addEventListener('mousemove', ev => moveTip(ev));
      el.addEventListener('mouseleave', () => dom.tooltip?.classList.add('hidden'));

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
    return { 0: '🚩', 10: '✋', 20: '🅿️', 30: '🚫' }[id] ?? '⬜';
  }
  function typeIcon(space) {
    return {
      finance: '💱', nahoda: '❓', tax: '📉', go_to_jail: '🚔',
      free_parking: '🅿️', service: '👤', start: '🚩'
    }[space.type] ?? '';
  }

  /* ─── Board Update ───────────────────────────────────────────────────────── */
  function updateBoard(state) {
    document.querySelectorAll('.space.current-turn').forEach(el => el.classList.remove('current-turn'));

    const currentPlayer = state.players.find(p => p.id === state.currentTurnId);
    if (currentPlayer) {
      const spaceEl = dom.board?.querySelector(`.space[data-id="${currentPlayer.position}"]`);
      if (spaceEl) spaceEl.classList.add('current-turn');
    }

    document.querySelectorAll('.own-badge, .own-overlay').forEach(el => el.classList.add('hidden'));
    Object.entries(state.ownerships || {}).forEach(([spaceId, playerId]) => {
      const ob = getEl(`ob-${spaceId}`);
      const ov = getEl(`ov-${spaceId}`);
      if (!ob || !ov) return;
      const owner = state.players.find(p => p.id === playerId);
      if (owner) {
        const color = safeColor(owner.color);
        ob.style.background = color;
        ob.classList.remove('hidden');
        ov.style.background = color;
        ov.classList.remove('hidden');
      }
    });

    document.querySelectorAll('.token-dots').forEach(el => { el.innerHTML = ''; });
    Object.entries(state.tokens || {}).forEach(([spaceId, tok]) => {
      const el = getEl(`td-${spaceId}`);
      if (!el) return;
      if (tok.big) {
        el.appendChild(makeEl('div', 'dot-big'));
      } else {
        for (let i = 0; i < tok.small; i++) el.appendChild(makeEl('div', 'dot-small'));
      }
    });
  }

  /* ─── Pawns ──────────────────────────────────────────────────────────────── */
  function renderPawns(state) {
    document.querySelectorAll('.space-pawns').forEach(el => { el.innerHTML = ''; });

    state.players.forEach(p => {
      if (p.bankrupt) return;
      const pos = clientVisualPos[p.id] !== undefined ? clientVisualPos[p.id] : p.position;
      const pawnsEl = getEl(`pw-${pos}`);
      if (!pawnsEl) return;

      const color = safeColor(p.color, '#888888');
      // SVG vytvořen přes DOM API — žádný innerHTML s proměnnými
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', '0 0 100 150');
      svg.setAttribute('fill', color);
      svg.setAttribute('stroke', 'rgba(0,0,0,0.4)');
      svg.setAttribute('stroke-width', '4');
      svg.style.cssText = 'width:100%;height:100%';

      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('cx', '50'); circle.setAttribute('cy', '30'); circle.setAttribute('r', '25');

      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', 'M30 60 L70 60 L80 140 L20 140 Z');

      const ellipse = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
      ellipse.setAttribute('cx', '50'); ellipse.setAttribute('cy', '140');
      ellipse.setAttribute('rx', '35'); ellipse.setAttribute('ry', '10');

      svg.appendChild(circle);
      svg.appendChild(path);
      svg.appendChild(ellipse);

      const pawn = makeEl('div', `pawn${p.id === state.currentTurnId ? ' is-active' : ''}`);
      pawn.title = p.name;
      pawn.appendChild(svg);
      pawnsEl.appendChild(pawn);
    });
  }

  function animatePawnsIfNeeded(state) {
    const needsAnim = state.players.some(p => !p.bankrupt && clientVisualPos[p.id] !== p.position);

    if (needsAnim && !isAnimatingPawn) {
      isAnimatingPawn = true;
      const step = () => {
        let stillNeeds = false;
        state.players.forEach(p => {
          if (p.bankrupt) return;
          if (clientVisualPos[p.id] !== p.position) {
            if (p.moveDirection === -1) {
              clientVisualPos[p.id] = (clientVisualPos[p.id] - 1 + 40) % 40;
            } else {
              clientVisualPos[p.id] = (clientVisualPos[p.id] + 1) % 40;
            }
            const space = dom.board?.querySelector(`.space[data-id="${clientVisualPos[p.id]}"]`);
            if (space) {
              space.style.transform = 'translateY(-4px)';
              setTimeout(() => { if (space) space.style.transform = ''; }, 150);
            }
            if (clientVisualPos[p.id] !== p.position) stillNeeds = true;
          }
        });
        renderPawns(state);
        if (stillNeeds) setTimeout(step, 180);
        else { isAnimatingPawn = false; renderPawns(state); }
      };
      step();
    } else if (!isAnimatingPawn) {
      renderPawns(state);
    }
  }

  /* ─── Players list ──────────────────────────────────────────────────────── */
  function updatePlayers(state) {
    identifyMe(state.players);
    if (!dom.playersList) return;
    dom.playersList.innerHTML = '';

    state.players.forEach(p => {
      const isMe = p.id === myId;
      const isTurn = p.id === state.currentTurnId;

      const row = makeEl('div', `player-row${isTurn ? ' is-turn' : ''}${p.bankrupt ? ' bankrupt' : ''}`);

      const avatar = makeEl('div', 'p-avatar');
      avatar.style.background = safeColor(p.color);
      avatar.textContent = p.name[0].toUpperCase();
      row.appendChild(avatar);

      const info = makeEl('div', 'p-info');

      // Jméno — DOM API, žádný innerHTML
      const nameEl = makeEl('div', 'p-name', p.name);
      if (isMe) {
        const youBadge = makeEl('span', '', ' (ty)');
        youBadge.style.cssText = 'color:var(--gold);font-size:10px';
        nameEl.appendChild(youBadge);
      }
      info.appendChild(nameEl);

      // Pozice + badges
      const pos = boardData ? (boardData[p.position]?.name ?? '?') : '?';
      const posEl = makeEl('div', 'p-pos', pos + ' ');
      if (p.inJail) posEl.appendChild(makeEl('span', 'p-badge jail', '🔒 Distanc'));
      if (p.bankrupt) posEl.appendChild(makeEl('span', 'p-badge bankrupt-badge', '💀 Bankrot'));
      if (isTurn) posEl.appendChild(makeEl('span', 'p-badge', '▶ Na tahu'));
      info.appendChild(posEl);

      // Inventory
      if (boardData && p.properties?.length > 0) {
        const ownedSpaces = p.properties
          .map(id => boardData.find(s => s.id === id))
          .filter(Boolean);

        const groups = {};
        ownedSpaces.forEach(sp => {
          const g = sp.type === 'service' ? 'S' : (sp.groupColor || '#000');
          if (!groups[g]) groups[g] = [];
          groups[g].push(sp);
        });

        const invDiv = makeEl('div', 'p-inventory');
        Object.entries(groups).forEach(([gColor, spcList]) => {
          const totalInGroup = boardData.filter(s => s.type === 'horse' && s.groupColor === gColor).length;
          const isMonopoly = spcList.length === totalInGroup && totalInGroup > 0 && spcList[0].type !== 'service';

          const grpDiv = makeEl('div', `inv-group${isMonopoly ? ' monopoly-glow' : ''}`);

          spcList.forEach(sp => {
            if (sp.type === 'service') {
              const isTrainer = sp.name.toLowerCase().includes('trenér');
              const svc = makeEl('div', 'inv-service', isTrainer ? '👤' : '🚐');
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
        info.appendChild(invDiv);
      }

      row.appendChild(info);

      const balEl = makeEl('div', `p-balance${p.balance < 2000 ? ' low' : ''}`, `${fmt(p.balance)} Kč`);
      balEl.id = `pb-${p.id}`;
      row.appendChild(balEl);

      dom.playersList.appendChild(row);
    });
  }

  /* ─── Board Center ──────────────────────────────────────────────────────── */
  let prevDice = null;
  function updateCenter(state) {
    if (dom.bcRound) dom.bcRound.textContent = `Kolo ${state.round}`;

    if (state.lastDice && state.lastDice.id !== prevDice?.id) {
      prevDice = state.lastDice;
      const diceEl = getEl('dice-3d');
      if (diceEl) {
        diceEl.classList.add('rolling');
        diceEl.style.transition = 'none';
        setTimeout(() => {
          diceEl.classList.remove('rolling');
          const rotMap = { 1: [0, 0], 6: [0, -180], 3: [0, -90], 4: [0, 90], 5: [-90, 0], 2: [90, 0] };
          const [rx, ry] = rotMap[state.lastDice.value] ?? [0, 0];
          const fRx = rx + (Math.random() * 20 - 10);
          const fRy = ry + (Math.random() * 20 - 10);
          diceEl.style.transform = `rotateX(${fRx - 360}deg) rotateY(${fRy - 360}deg)`;
          void diceEl.offsetWidth;
          diceEl.style.transition = 'transform 0.6s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
          diceEl.style.transform = `rotateX(${fRx}deg) rotateY(${fRy}deg)`;
        }, 400);
      }
    }

    const current = state.players.find(p => p.id === state.currentTurnId);
    if (current && dom.bcTurn) {
      dom.bcTurn.textContent = '';
      const span = makeEl('span', '', current.name);
      span.style.cssText = `color:${safeColor(current.color)};font-weight:700`;
      dom.bcTurn.appendChild(span);
    }
  }

  /* ─── Emit helper s rate-limitingem ─────────────────────────────────────── */
  // (oprava: tlačítka deaktivována okamžitě po kliknutí — prevence flood útoku)
  function emitAction(eventName, data, btnId) {
    const btn = btnId ? getEl(btnId) : null;
    if (btn) btn.disabled = true;
    socket.emit(eventName, data);
  }

  /* ─── Action Panel ───────────────────────────────────────────────────────── */
  function updateActionPanel(state) {
    const pa = state.pendingAction;

    const cardOverlay = getEl('card-3d-overlay');
    if (cardOverlay && (!pa || pa.type !== 'card_ack')) {
      cardOverlay.classList.add('hidden');
    }

    if (!pa) {
      if (dom.actionTitle) dom.actionTitle.textContent = 'Akce';
      if (dom.actionContent) {
        dom.actionContent.innerHTML = '';
        const p = makeEl('p', 'dim');
        p.style.cssText = 'text-align:center;padding:20px 0';
        p.textContent = '⏳ Zpracovávám...';
        dom.actionContent.appendChild(p);
      }
      return;
    }

    const isTargeted = pa.targetId === myId;
    const targetPlayer = state.players.find(p => p.id === pa.targetId);
    const me = state.players.find(p => p.id === myId);

    // Starter overlay
    if (pa.type === 'selecting_starter') {
      if (!isStarterAnimating) {
        isStarterAnimating = true;
        runStarterAnimation(pa.data.starterId, state.players);
      }
    } else {
      isStarterAnimating = false;
      getEl('starter-overlay')?.classList.add('hidden');
    }

    if (!dom.actionTitle || !dom.actionContent) return;

    // ── Helper: tlačítko s emit akcí ──────────────────────────────────────
    const actionBtn = (label, cls, onClick) => {
      const btn = makeEl('button', `btn ${cls}`, label);
      btn.addEventListener('click', () => {
        btn.disabled = true;
        onClick();
      });
      return btn;
    };

    switch (pa.type) {

      case 'wait_roll':
        dom.actionTitle.textContent = isTargeted ? 'Váš tah' : 'Čeká se...';
        dom.actionContent.innerHTML = '';
        if (isTargeted) {
          dom.actionContent.appendChild(makeEl('p', 'action-desc', `Jste na řadě, ${targetPlayer?.name ?? ''}!`));
          dom.actionContent.appendChild(actionBtn('🎲 Hodit kostkou', 'btn-gold btn-lg', () => socket.emit('game:roll')));
        } else {
          dom.actionContent.appendChild(buildWaitEl(targetPlayer, 'čeká na hod kostkou...'));
        }
        break;

      case 'service_roll':
        dom.actionTitle.textContent = isTargeted ? 'Poplatek za služby' : 'Čeká se...';
        dom.actionContent.innerHTML = '';
        if (isTargeted) {
          const info = makeEl('div', 'jail-display');
          info.style.cssText = 'border-color:var(--blue);padding:10px;margin-bottom:10px;border:1px solid var(--blue)';
          const spaceName = boardData?.[pa.data.spaceId]?.name ?? '?';
          info.textContent = `🏠 Musíte hodit kostkou pro určení poplatku! Pole: ${spaceName}`;
          dom.actionContent.appendChild(info);
          dom.actionContent.appendChild(actionBtn('🎲 Hodit pro poplatek', 'btn-gold btn-lg', () => socket.emit('game:roll')));
        } else {
          dom.actionContent.appendChild(buildWaitEl(targetPlayer, 'hází kostkou pro určení poplatku...'));
        }
        break;

      case 'buy_offer': {
        const space = boardData[pa.data.spaceId];
        const rents = space.rents || [];
        dom.actionTitle.textContent = 'Nabídka koupě';
        dom.actionContent.innerHTML = '';

        if (isTargeted) {
          const balAfter = (me?.balance ?? 0) - space.price;
          const card = makeEl('div', 'buy-card');

          const strip = makeEl('div', 'buy-strip');
          strip.style.background = safeColor(space.groupColor ?? '#5b8dee', '#5b8dee');
          card.appendChild(strip);

          const body = makeEl('div', 'buy-body');
          body.appendChild(makeEl('div', 'buy-name', space.name));
          body.appendChild(makeEl('div', 'buy-price', `Cena: ${fmt(space.price)} Kč`));

          if (rents.length) {
            const table = makeEl('div', 'rent-table');
            [[0, 'Základní'], [1, '1 žeton'], [5, 'Velký dostih']].forEach(([i, lbl]) => {
              const rr = makeEl('div', 'rent-row');
              rr.appendChild(makeEl('span', '', lbl + ':'));
              rr.appendChild(makeEl('span', 'rent-val', `${fmt(rents[i])} Kč`));
              table.appendChild(rr);
            });
            body.appendChild(table);
          }

          const rest = makeEl('div', 'buy-rest');
          rest.appendChild(document.createTextNode('Zůstatek po koupi: '));
          const strong = makeEl('strong', '', `${fmt(balAfter)} Kč`);
          strong.style.color = balAfter < 0 ? 'var(--red)' : 'var(--green)';
          rest.appendChild(strong);
          body.appendChild(rest);

          const btns = makeEl('div', 'action-buttons row');
          btns.style.marginTop = '6px';
          if (balAfter >= 0) {
            btns.appendChild(actionBtn('Koupit', 'btn-green', () =>
              socket.emit('game:respond', { decision: 'buy', spaceId: pa.data.spaceId })
            ));
          }
          btns.appendChild(actionBtn('Nechci koupit', 'btn-outline', () =>
            socket.emit('game:respond', { decision: 'pass', spaceId: pa.data.spaceId })
          ));
          body.appendChild(btns);
          card.appendChild(body);
          dom.actionContent.appendChild(card);
        } else {
          dom.actionContent.appendChild(buildWaitEl(targetPlayer, `zvažuje koupi ${space.name}`));
        }
        break;
      }

      case 'debt_manage': {
        dom.actionTitle.textContent = 'Dluh! Prodejte majetek';
        dom.actionContent.innerHTML = '';

        if (isTargeted) {
          const p = state.players.find(pl => pl.id === myId);

          const warn = makeEl('div', 'jail-display');
          warn.style.cssText = 'border-color:var(--red);padding:10px;margin-bottom:10px;border:1px solid var(--red)';
          warn.textContent = `⚠️ Jste v mínusu: ${fmt(p.balance)} Kč! Musíte prodat majetek nebo zkrachovat.`;
          dom.actionContent.appendChild(warn);

          const list = makeEl('div', 'token-list');
          list.style.marginTop = '10px';

          if (p.properties?.length) {
            p.properties.forEach(sid => {
              const sp = boardData[sid];
              let val = Math.floor(sp.price / 2);
              const tok = state.tokens[sid];
              if (tok) {
                if (tok.big) val += Math.floor(sp.bigTokenCost / 2) + Math.floor(sp.tokenCost / 2) * 4;
                else if (tok.small) val += Math.floor(sp.tokenCost / 2) * tok.small;
              }

              const item = makeEl('div', 'token-item');
              const nameDiv = makeEl('div', 'tok-name', `${sp.name} (+ ${fmt(val)} Kč)`);
              nameDiv.style.cssText = `border-left:3px solid ${safeColor(sp.groupColor, '#5b8dee')};padding-left:6px`;

              const btnsDiv = makeEl('div', 'tok-btns');
              const sellBtn = actionBtn('Prodat', 'btn btn-xs btn-outline', () =>
                socket.emit('game:respond', { decision: 'sell_property', spaceId: sid })
              );
              btnsDiv.appendChild(sellBtn);

              item.appendChild(nameDiv);
              item.appendChild(btnsDiv);
              list.appendChild(item);
            });
          } else {
            list.appendChild(makeEl('p', 'dim', 'Žádný majetek k prodeji.'));
          }
          dom.actionContent.appendChild(list);

          const bankruptBtn = actionBtn('Vyhlásit bankrot 💀', 'btn-red', () =>
            socket.emit('game:respond', { decision: 'declare_bankrupt' })
          );
          bankruptBtn.style.cssText = 'margin-top:10px;width:100%';
          dom.actionContent.appendChild(bankruptBtn);
        } else {
          dom.actionContent.appendChild(buildWaitEl(targetPlayer, 'řeší své dluhy...'));
        }
        break;
      }

      case 'buyout_offer': {
        const space = boardData[pa.data.spaceId];
        const cost = pa.data.buyoutCost;
        dom.actionTitle.textContent = 'Nepřátelský odkup';
        dom.actionContent.innerHTML = '';

        if (isTargeted) {
          const info = makeEl('div', 'jail-display');
          info.style.cssText = 'border-color:var(--gold);padding:10px;margin-bottom:10px;border:1px solid var(--gold)';
          info.appendChild(document.createTextNode(`Chcete nuceně odkoupit stáj ${space.name}? Stojí to `));
          const priceSpan = makeEl('strong', '', `${fmt(cost)} Kč`);
          priceSpan.style.color = 'var(--gold)';
          info.appendChild(priceSpan);
          info.appendChild(document.createTextNode('.'));
          dom.actionContent.appendChild(info);

          const btns = makeEl('div', 'action-buttons row');
          btns.appendChild(actionBtn('Odkoupit', 'btn-gold', () => socket.emit('game:respond', { decision: 'buy' })));
          btns.appendChild(actionBtn('Ne, díky', 'btn-outline', () => socket.emit('game:respond', { decision: 'pass' })));
          dom.actionContent.appendChild(btns);
        } else {
          dom.actionContent.appendChild(buildWaitEl(targetPlayer, 'zvažuje odkup cizí stáje...'));
        }
        break;
      }

      case 'card_ack': {
        const { card, label } = pa.data;
        const isMe = pa.targetId === myId;
        const p = state.players.find(pl => pl.id === pa.targetId);

        dom.actionTitle.textContent = 'Tažená karta';
        dom.actionContent.innerHTML = '';

        const cardDiv = makeEl('div', 'card-display');
        cardDiv.appendChild(makeEl('div', 'card-header', label));

        if (card.amount) {
          const isPay = card.type === 'pay' || card.type === 'pay_to_all';
          const impactEl = makeEl('div', `card-impact ${isPay ? 'neg' : 'pos'}`);
          impactEl.textContent = (isPay ? '-' : '+') + fmt(card.amount) + ' Kč';
          cardDiv.appendChild(impactEl);
        }
        cardDiv.appendChild(makeEl('div', 'card-text', card.text));
        dom.actionContent.appendChild(cardDiv);

        if (isMe) {
          dom.actionContent.appendChild(
            actionBtn('Rozumím', 'btn-gold btn-lg', () => socket.emit('game:respond', { decision: 'ok' }))
          );
        } else {
          dom.actionContent.appendChild(buildWaitEl(p, 'čte kartu...'));
        }

        // 3D karta
        const cardEl = getEl('card-3d');
        const card3dBtn = getEl('card-3d-btn');
        const card3dTitle = getEl('card-3d-title');
        const card3dText = getEl('card-3d-text');
        if (cardOverlay && cardEl) {
          cardOverlay.classList.remove('hidden');
          if (card3dTitle) card3dTitle.textContent = label;
          if (card3dText) card3dText.textContent = card.text;
          if (card3dBtn) card3dBtn.classList.toggle('hidden', !isMe);
          if (!cardEl.classList.contains('flipped')) {
            setTimeout(() => cardEl.classList.add('flipped'), 100);
          }
          if (isMe && card3dBtn) {
            card3dBtn.onclick = () => {
              cardEl.classList.remove('flipped');
              setTimeout(() => {
                cardOverlay.classList.add('hidden');
                socket.emit('game:respond', { decision: 'ok' });
              }, 400);
            };
          }
        }
        break;
      }

      case 'jail_choice': {
        dom.actionTitle.textContent = 'Distanc 🔒';
        dom.actionContent.innerHTML = '';

        if (isTargeted) {
          const jt = targetPlayer?.jailTurns ?? 0;
          const jailDiv = makeEl('div', 'jail-display');

          jailDiv.appendChild(makeEl('div', 'jail-icon', '🔒'));
          const txt = makeEl('p', 'jail-text');
          txt.appendChild(document.createTextNode('Jste v Distancu!'));
          txt.appendChild(document.createElement('br'));
          txt.appendChild(document.createTextNode(`Zbývá: `));
          txt.appendChild(makeEl('strong', '', String(jt)));
          txt.appendChild(document.createTextNode(` ${jt === 1 ? 'kolo' : 'kola'}`));
          jailDiv.appendChild(txt);

          const actBtns = makeEl('div', 'action-buttons');
          actBtns.appendChild(actionBtn(`Zaplatit ${fmt(500)} Kč a hrát`, 'btn-gold', () => socket.emit('game:respond', { decision: 'pay_fine' })));
          actBtns.appendChild(actionBtn('🎲 Hodit (6 = volno)', 'btn-outline', () => socket.emit('game:respond', { decision: 'roll_jail' })));
          jailDiv.appendChild(actBtns);

          if (targetPlayer?.jailFreeCards > 0) {
            jailDiv.appendChild(
              actionBtn('🔓 Použít kartu "Zrušen distanc"', 'btn-gold', () =>
                socket.emit('game:respond', { decision: 'use_jail_card' })
              )
            );
          }
          dom.actionContent.appendChild(jailDiv);
        } else {
          dom.actionContent.appendChild(buildWaitEl(targetPlayer, 'je v Distancu...'));
        }
        break;
      }

      case 'token_manage': {
        dom.actionTitle.textContent = 'Přidat žetony';
        dom.actionContent.innerHTML = '';

        if (isTargeted) {
          const eligible = pa.data.eligible || [];
          dom.actionContent.appendChild(makeEl('p', 'token-intro', 'Přidat žetony dostihů ke svým stájím?'));

          const list = makeEl('div', 'token-list');
          if (eligible.length === 0) {
            list.appendChild(makeEl('p', 'dim', 'Nelze přidat žetony (nedostatek peněz nebo žetonů).'));
          } else {
            eligible.forEach(sid => {
              const sp = boardData[sid];
              const tok = state.tokens[sid] || { small: 0, big: false };
              const canS = !tok.big && tok.small < 4 && (me?.balance ?? 0) >= sp.tokenCost;
              const canB = !tok.big && tok.small >= 4 && (me?.balance ?? 0) >= sp.bigTokenCost;

              const item = makeEl('div', 'token-item');
              const nameDiv = makeEl('div', 'tok-name', `${sp.name} — ${tok.small}× ${tok.big ? '🏆' : ''}`);
              nameDiv.style.cssText = `border-left:3px solid ${safeColor(sp.groupColor)};padding-left:6px`;
              item.appendChild(nameDiv);

              const btnsDiv = makeEl('div', 'tok-btns');
              if (canS) btnsDiv.appendChild(actionBtn(`+Žeton (${fmt(sp.tokenCost)} Kč)`, 'btn btn-xs btn-outline', () =>
                socket.emit('game:respond', { decision: 'add_token', spaceId: sid, tokenType: 'small' })
              ));
              if (canB) btnsDiv.appendChild(actionBtn(`+Hlavní (${fmt(sp.bigTokenCost)} Kč)`, 'btn btn-xs btn-gold', () =>
                socket.emit('game:respond', { decision: 'add_token', spaceId: sid, tokenType: 'big' })
              ));
              item.appendChild(btnsDiv);
              list.appendChild(item);
            });
          }
          dom.actionContent.appendChild(list);

          const endBtn = actionBtn('Ukončit tah →', 'btn-gold', () =>
            socket.emit('game:respond', { decision: 'end_turn' })
          );
          endBtn.style.marginTop = '4px';
          dom.actionContent.appendChild(endBtn);
        } else {
          dom.actionContent.appendChild(buildWaitEl(targetPlayer, 'spravuje své stáje...'));
        }
        break;
      }

      case 'game_over': {
        const w = pa.winner;
        dom.actionTitle.textContent = '🏆 Konec hry';
        dom.actionContent.innerHTML = '';

        const goDiv = makeEl('div', 'gameover-display');
        goDiv.appendChild(makeEl('div', 'gameover-trophy', '🏆'));
        goDiv.appendChild(makeEl('div', 'gameover-title', w ? `${w.name} vyhrál(a)!` : 'Konec hry!'));
        if (w) goDiv.appendChild(makeEl('div', 'gameover-balance', `Výsledný zůstatek: ${fmt(w.balance)} Kč`));

        const replayBtn = makeEl('button', 'btn btn-gold btn-lg', 'Hrát znovu');
        replayBtn.addEventListener('click', () => resetLocalState());
        goDiv.appendChild(replayBtn);
        dom.actionContent.appendChild(goDiv);
        break;
      }

      default:
        dom.actionContent.innerHTML = '';
        dom.actionContent.appendChild(makeEl('p', 'dim', '...'));
    }
  }

  // Místo HTML stringu — čistý DOM element pro "čekání"
  function buildWaitEl(player, msg) {
    const wrap = makeEl('div', 'action-waiting');
    wrap.appendChild(makeEl('div', 'waiting-icon', '⏳'));

    const p = makeEl('p');
    p.appendChild(document.createTextNode('Čeká se na '));
    const nameSpan = makeEl('strong', '', player?.name ?? '?');
    nameSpan.style.color = safeColor(player?.color ?? '#fff');
    p.appendChild(nameSpan);
    p.appendChild(document.createElement('br'));
    p.appendChild(makeEl('span', 'dim', msg));
    wrap.appendChild(p);
    return wrap;
  }

  /* ─── Log ────────────────────────────────────────────────────────────────── */
  function updateLog(state) {
    if (!dom.logList) return;
    dom.logList.innerHTML = '';
    (state.log || []).forEach(msg => {
      const entry = makeEl('div', 'log-entry', msg);
      dom.logList.appendChild(entry);
    });
  }

  /* ─── Tooltip ────────────────────────────────────────────────────────────── */
  function showTip(space, ev) {
    if (!gameState || !dom.tooltip) return;
    const ownerId = gameState.ownerships?.[space.id];
    const owner = ownerId ? gameState.players.find(p => p.id === ownerId) : null;
    const tok = gameState.tokens?.[space.id] || { small: 0, big: false };

    // Tooltip je interní UI — data procházejí přes esc() pro jistotu
    let html = `<div class="tip-header" style="background:${safeColor(space.groupColor ?? '', 'var(--bg-card2)').replace('var(--bg-card2)', '')}">${esc(space.name)}</div>`;
    html += `<div class="tip-body">`;

    if (space.type === 'horse') {
      html += `<table class="tip-table">`;
      const rents = space.rents ?? [];
      const labels = ['Základní nájem', 'S 1 dostihy', 'S 2 dostihy', 'S 3 dostihy', 'S 4 dostihy', 'HLAVNÍ DOSTIH'];
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
      html += `<div class="tip-group" style="color:var(--green)">Průchod startem</div>
             <div style="font-size:13px;margin:10px 0">Získáváte od banky finanční injekci za dokončené kolo.</div>
             <div style="text-align:right;font-weight:800;color:var(--green)">+${fmt(4000)} Kč</div>`;
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
    moveTip(ev);
  }

  function moveTip(ev) {
    const tip = dom.tooltip;
    if (!tip) return;
    const tw = tip.offsetWidth || 240;
    const th = tip.offsetHeight || 200;
    let x = ev.clientX + 14;
    let y = ev.clientY + 14;
    if (x + tw > window.innerWidth) x = ev.clientX - tw - 10;
    if (y + th > window.innerHeight) y = ev.clientY - th - 10;
    tip.style.left = x + 'px';
    tip.style.top = y + 'px';
  }

  /* ─── Toast ──────────────────────────────────────────────────────────────── */
  let toastTimer;
  function showToast(msg, err = false) {
    const t = dom.toast;
    if (!t) return;
    t.textContent = msg;
    t.className = `toast${err ? ' err' : ''}`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.add('hidden'), 3500);
  }

  /* ─── Particles ──────────────────────────────────────────────────────────── */
  // (oprava: interval uložen do proměnné — lze zastavit při opuštění hry)
  function generateParticles() {
    const container = getEl('particles-container');
    if (!container) return;
    if (particleIntervalId) clearInterval(particleIntervalId);

    particleIntervalId = setInterval(() => {
      if (document.hidden) return;
      const p = makeEl('div', 'particle');
      const size = Math.random() * 4 + 2;
      p.style.cssText = `width:${size}px;height:${size}px;left:${Math.random() * 100}%;top:${Math.random() * 100}%`;
      container.appendChild(p);
      setTimeout(() => { if (p.parentNode) p.remove(); }, 3000);
    }, 250);
  }

  /* ─── Inventory Tooltips ─────────────────────────────────────────────────── */
  if (dom.playersList) {
    dom.playersList.addEventListener('mouseover', ev => {
      const bar = ev.target.closest('.inv-bar, .inv-service');
      if (bar && boardData) {
        const sid = parseInt(bar.dataset.sid, 10);
        const space = boardData.find(s => s.id === sid);
        if (space) showTip(space, ev);
      }
    });
    dom.playersList.addEventListener('mousemove', ev => {
      if (ev.target.closest('.inv-bar, .inv-service')) moveTip(ev);
    });
    dom.playersList.addEventListener('mouseout', ev => {
      if (ev.target.closest('.inv-bar, .inv-service')) dom.tooltip?.classList.add('hidden');
    });
  }

  /* ─── Visual Effects ─────────────────────────────────────────────────────── */
  function spawnFloatingText(spaceId, text, color) {
    const space = dom.board?.querySelector(`.space[data-id="${spaceId}"]`);
    if (!space) return;
    const rect = space.getBoundingClientRect();
    const el = makeEl('div', 'floating-text', text);
    el.style.cssText = `left:${rect.left + rect.width / 2}px;top:${rect.top + rect.height / 2}px;color:${safeColor(color, '#fff')}`;
    document.body.appendChild(el);
    setTimeout(() => { if (el.parentNode) el.remove(); }, 1200);
  }

  function playBuyAnimation(spaceId, owner) {
    const color = safeColor(owner.color, '#fff');
    spawnFloatingText(spaceId, 'VLASTNÍK!', color);
    const space = dom.board?.querySelector(`.space[data-id="${spaceId}"]`);
    if (space) {
      space.classList.add('flash-buy');
      space.style.boxShadow = `inset 0 0 40px ${color}`;
      setTimeout(() => { space.classList.remove('flash-buy'); space.style.boxShadow = ''; }, 1000);
    }
  }

  function playTokenAnimation(spaceId, isBig) {
    spawnFloatingText(spaceId, isBig ? '👑 HLAVNÍ DOSTIH' : '➕ ŽETON', 'var(--gold)');
  }

})(); // konec IIFE