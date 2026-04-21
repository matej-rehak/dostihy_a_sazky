import { makeEl, fmt, safeColor, isSafeColor, showToast } from '../utils.js';
import { dom } from '../dom.js';
import { state } from '../state.js';
import { socket } from '../socket.js';

export function renderLobby(gameState, me) {
  dom.lobbyView.classList.remove('hidden');
  dom.gameView.classList.add('hidden');

  renderPlayerList(gameState.players);

  if (me) {
    dom.joinForm?.classList.add('hidden');
    dom.joinedWait?.classList.remove('hidden');
    renderHostControls(gameState, me);
    renderReadyButton(me);
  } else {
    dom.joinForm?.classList.remove('hidden');
    dom.joinedWait?.classList.add('hidden');
    dom.hostControls?.classList.add('hidden');
    if (state.allColors.length > 0) buildColorPicker(state.allColors, gameState.players.map(p => p.color));
  }
}

function renderPlayerList(players) {
  const lp = dom.lobbyPlayers;
  if (!lp) return;
  lp.innerHTML = '';
  if (!players.length) {
    lp.appendChild(makeEl('p', 'dim', 'Zatím nikdo...'));
    return;
  }
  players.forEach(p => {
    const row    = makeEl('div', 'lp-row');
    const avatar = makeEl('div', 'lp-avatar');
    avatar.style.background = safeColor(p.color);
    avatar.textContent = p.name[0].toUpperCase();
    row.appendChild(avatar);
    row.appendChild(makeEl('span', 'lp-name', p.name));
    if (p.isHost) row.appendChild(makeEl('span', 'lp-host', 'HOST'));
    if (p.ready)  row.appendChild(makeEl('span', 'lp-ready-text', 'PŘIPRAVEN'));
    row.appendChild(makeEl('div', `lp-ready-dot${p.ready ? ' is-ready' : ''}`));
    lp.appendChild(row);
  });
}

function renderHostControls(gameState, me) {
  if (!me.isHost) {
    dom.hostControls?.classList.add('hidden');
    const balDisp = document.getElementById('cfg-bal-disp');
    if (balDisp) {
      balDisp.classList.remove('hidden');
      const c = gameState.config || { startBalance: 30000, startBonus: 4000, buyoutMultiplier: 0 };
      balDisp.textContent = '';
      balDisp.appendChild(document.createTextNode('Pravidla hostitele: '));
      balDisp.appendChild(makeEl('strong', '', `Kapitál ${fmt(c.startBalance)} Kč`));
      balDisp.appendChild(document.createTextNode(
        `, Průchod START: ${fmt(c.startBonus)} Kč, Odkup koní: ${c.buyoutMultiplier > 0 ? c.buyoutMultiplier + 'x' : 'Vypnuto'}`
      ));
    }
    return;
  }

  dom.hostControls?.classList.remove('hidden');
  document.getElementById('cfg-bal-disp')?.classList.add('hidden');

  const c = gameState.config || { startBalance: 30000, startBonus: 4000, buyoutMultiplier: 0 };
  const cfgBal = document.getElementById('cfg-startBal');
  const cfgBon = document.getElementById('cfg-startBon');
  const cfgBuy = document.getElementById('cfg-buyout');
  if (cfgBal && document.activeElement !== cfgBal) cfgBal.value = c.startBalance;
  if (cfgBon && document.activeElement !== cfgBon) cfgBon.value = c.startBonus;
  if (cfgBuy && document.activeElement !== cfgBuy) cfgBuy.value = c.buyoutMultiplier;

  const allReady = gameState.players.every(p => p.ready);
  if (dom.startBtn) {
    dom.startBtn.disabled = gameState.players.length < 2 || !allReady;
    if      (gameState.players.length < 2) dom.startBtn.textContent = `▶ Spustit hru (min. 2 hráče — ${gameState.players.length}/2)`;
    else if (!allReady)                    dom.startBtn.textContent = `▶ Čeká se na připravenost všech...`;
    else                                   dom.startBtn.textContent = `▶ Spustit hru! (${gameState.players.length} hráčů připraveno)`;
  }
}

function renderReadyButton(me) {
  const btn = document.getElementById('toggle-ready-btn');
  if (!btn) return;
  btn.textContent = me.ready ? 'RUŠÍM PŘIPRAVENOST' : 'JSEM PŘIPRAVEN';
  btn.className   = me.ready ? 'btn btn-ready-waiting' : 'btn btn-ready-active';
}

// ─── Room list (intro screen) ──────────────────────────────────────────────────

export function renderRoomList(list) {
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

    const meta      = makeEl('div', 'room-meta');
    const statusCls = r.phase === 'lobby' ? 'status-lobby' : 'status-playing';
    meta.appendChild(makeEl('span', '', `👥 ${r.players}/6`));
    meta.appendChild(makeEl('span', `room-status ${statusCls}`, r.phase === 'lobby' ? 'Lobby' : 'Probíhá'));
    if (r.hasPassword) meta.appendChild(makeEl('span', '', '🔒 Heslo'));
    main.appendChild(meta);

    item.appendChild(main);
    item.appendChild(makeEl('div', 'room-join-btn', 'Vstoupit →'));
    item.addEventListener('click', () => {
      let password = '';
      if (r.hasPassword) {
        password = prompt('Zadejte heslo k místnosti:');
        if (password === null) return;
      }
      socket.emit('room:join', { roomId: r.id, password });
    });
    dom.roomList.appendChild(item);
  });
}

// ─── Color picker ─────────────────────────────────────────────────────────────

export function buildColorPicker(colors, usedColors = []) {
  if (!dom.colorPicker) return;
  dom.colorPicker.innerHTML = '';
  if (state.selectedColor && usedColors.includes(state.selectedColor)) state.selectedColor = null;

  colors.forEach(c => {
    if (usedColors.includes(c) || !isSafeColor(c)) return;
    const btn = makeEl('button', 'color-btn');
    if (state.selectedColor === c) btn.classList.add('selected');
    btn.style.background = c;
    btn.title = c;
    btn.addEventListener('click', () => {
      document.querySelectorAll('.color-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      state.selectedColor = c;
    });
    dom.colorPicker.appendChild(btn);
  });

  if (!state.selectedColor && dom.colorPicker.firstChild) {
    dom.colorPicker.firstChild.click();
  }
}

// ─── Event listenery lobby/intro ──────────────────────────────────────────────

export function initLobbyListeners(onLeave) {
  // Config inputs (host)
  ['cfg-startBal', 'cfg-startBon', 'cfg-buyout'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', () => {
      socket.emit('game:update_config', {
        startBalance:      Number(document.getElementById('cfg-startBal')?.value ?? 30000),
        startBonus:        Number(document.getElementById('cfg-startBon')?.value ?? 4000),
        buyoutMultiplier:  Number(document.getElementById('cfg-buyout')?.value   ?? 0),
      });
    });
  });

  // Intro — tvorba místnosti
  const roomSelection  = document.getElementById('room-selection');
  const roomCreateForm = document.getElementById('room-create-form');
  document.getElementById('show-create-room')?.addEventListener('click', () => {
    roomSelection?.classList.add('hidden');
    roomCreateForm?.classList.remove('hidden');
  });
  document.getElementById('cancel-create-btn')?.addEventListener('click', () => {
    roomCreateForm?.classList.add('hidden');
    roomSelection?.classList.remove('hidden');
  });
  document.getElementById('room-create-btn')?.addEventListener('click', () => {
    const playerName = document.getElementById('new-room-player-name')?.value.trim();
    const name     = document.getElementById('new-room-name')?.value.trim();
    const password = document.getElementById('new-room-pass')?.value ?? '';
    if (!playerName) { showToast('Zadejte svoje jméno!', true); return; }
    if (!name) { showToast('Zadejte název místnosti!', true); return; }
    socket.emit('room:create', { name, password, playerName, color: state.selectedColor });
  });

  // Join
  dom.joinBtn?.addEventListener('click', () => {
    const name = dom.nameInput?.value.trim();
    if (!name) { showToast('Zadejte jméno!', true); return; }
    dom.joinBtn.disabled = true;
    socket.emit('game:join', { name, color: state.selectedColor });
  });
  dom.nameInput?.addEventListener('keydown', e => { if (e.key === 'Enter') dom.joinBtn?.click(); });

  // Start + ready
  dom.startBtn?.addEventListener('click', () => { dom.startBtn.disabled = true; socket.emit('game:start'); });
  document.getElementById('toggle-ready-btn')?.addEventListener('click', function () {
    this.disabled = true;
    socket.emit('game:ready');
    setTimeout(() => { this.disabled = false; }, 800);
  });

  // Leave buttons
  document.getElementById('lobby-leave-btn')?.addEventListener('click', () => {
    if (confirm('Opravdu chcete opustit místnost?')) onLeave();
  });
  document.getElementById('game-leave-btn')?.addEventListener('click', () => {
    if (confirm('Opravdu chcete opustit hru? Pokud odejdete během zápasu, zbankrotujete.')) {
      onLeave();
    }
  });
}
