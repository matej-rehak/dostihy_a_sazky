import { makeEl, safeColor, isSafeColor, showToast, uiIcon, setIconText } from '../utils.js';
import { dom } from '../dom.js';
import { state } from '../state.js';
import { socket } from '../socket.js';
import { confirmDialog, promptDialog } from './confirm.js';
import { renderSettingsForm, renderSettingsSummary } from './lobbySettings.js';

export function renderLobby(gameState, me) {
  dom.lobbyView.classList.remove('hidden');
  dom.gameView.classList.add('hidden');

  renderPlayerList(gameState.players, me);

  if (me) {
    dom.joinForm?.classList.add('hidden');
    dom.joinedWait?.classList.remove('hidden');
    renderHostControls(gameState, me);
    renderReadyButton(me);
    state.selectedColor = me.color;
    if (dom.lobbyNameInput && document.activeElement !== dom.lobbyNameInput) {
      dom.lobbyNameInput.value = me.name;
    }
  } else {
    dom.joinForm?.classList.remove('hidden');
    dom.joinedWait?.classList.add('hidden');
    dom.hostControls?.classList.add('hidden');
    document.getElementById('gs-summary-wrap')?.classList.add('hidden');
    dom.lobbyView.querySelector('.lobby-card')?.classList.remove('has-settings');
  }

  if (state.allColors.length > 0) {
    const usedColors = gameState.players
      .filter(p => p.id !== state.myId)
      .map(p => p.color);
    buildColorPicker(state.allColors, usedColors, !!me);
  }
}

function renderPlayerList(players, me) {
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
    if (p.isBot) avatar.appendChild(uiIcon('bot'));
    else avatar.textContent = p.name[0].toUpperCase();
    row.appendChild(avatar);
    row.appendChild(makeEl('span', 'lp-name', p.name));
    if (p.isHost) row.appendChild(makeEl('span', 'lp-host', 'HOST'));
    if (p.isBot)  row.appendChild(makeEl('span', 'lp-host', 'BOT'));
    if (p.ready)  row.appendChild(makeEl('span', 'lp-ready-text', 'PŘIPRAVEN'));
    row.appendChild(makeEl('div', `lp-ready-dot${p.ready ? ' is-ready' : ''}`));

    if (p.isBot && me?.isHost) {
      const remove = makeEl('button', 'btn btn-outline btn-xs');
      remove.appendChild(uiIcon('zavrit'));
      remove.title = `Odebrat ${p.name}`;
      remove.setAttribute('aria-label', `Odebrat ${p.name}`);
      remove.addEventListener('click', () => socket.emit('game:remove_bot', { botId: p.id }));
      row.appendChild(remove);
    }

    lp.appendChild(row);
  });
}

function renderHostControls(gameState, me) {
  const card = dom.lobbyView.querySelector('.lobby-card');
  const summaryWrap = document.getElementById('gs-summary-wrap');
  // Hostitel i ostatní mají široké lobby se dvěma sloupci: vlevo hráči,
  // vpravo nastavení (hostitel ho upravuje, ostatní ho jen čtou).
  if (card) card.classList.add('has-settings');
  if (!me.isHost) {
    dom.hostControls?.classList.add('hidden');
    summaryWrap?.classList.remove('hidden');
    renderSettingsSummary(document.getElementById('gs-summary'), state.gameSettings, gameState.config);
    return;
  }

  dom.hostControls?.classList.remove('hidden');
  summaryWrap?.classList.add('hidden');
  renderSettingsForm(document.getElementById('gs-form'), state.gameSettings, gameState.config);

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
    const count = makeEl('span');
    setIconText(count, 'hraci', `${r.players}/6`);
    meta.appendChild(count);
    meta.appendChild(makeEl('span', `room-status ${statusCls}`, r.phase === 'lobby' ? 'Lobby' : 'Probíhá'));
    if (r.hasPassword) {
      const pw = makeEl('span');
      setIconText(pw, 'zamek', 'Heslo');
      meta.appendChild(pw);
    }
    main.appendChild(meta);

    item.appendChild(main);
    item.appendChild(makeEl('div', 'room-join-btn', 'Vstoupit →'));
    item.addEventListener('click', async () => {
      let password = '';
      if (r.hasPassword) {
        password = await promptDialog(`Místnost „${r.name}" je chráněná heslem.`, {
          title: 'Heslo k místnosti',
          type: 'password',
          placeholder: 'Zadejte heslo...',
          confirmLabel: 'Vstoupit',
        });
        if (password === null) return;
      }
      socket.emit('room:join', { roomId: r.id, password });
    });
    dom.roomList.appendChild(item);
  });
}

// ─── Color picker ─────────────────────────────────────────────────────────────

export function buildColorPicker(colors, usedColors = [], isJoined = false, container = null) {
  const el = container || dom.colorPicker;
  if (!el) return;
  el.innerHTML = '';
  if (state.selectedColor && usedColors.includes(state.selectedColor)) state.selectedColor = null;

  colors.forEach(c => {
    if (usedColors.includes(c) || !isSafeColor(c)) return;
    const btn = makeEl('button', 'color-btn');
    if (state.selectedColor === c) btn.classList.add('selected');
    btn.style.background = c;
    btn.title = c;
    btn.addEventListener('click', () => {
      el.querySelectorAll('.color-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      state.selectedColor = c;
      if (isJoined) {
        socket.emit('game:change_color', { color: c });
      }
    });
    el.appendChild(btn);
  });

  if (!state.selectedColor && el.firstChild && !isJoined) {
    el.firstChild.click();
  }
}

// ─── Event listenery lobby/intro ──────────────────────────────────────────────

/**
 * Vrátí intro do výchozí podoby: seznam místností viditelný, formulář
 * pro vytvoření schovaný.
 *
 * Bez tohohle zůstaly po vytvoření místnosti schované obě části — formulář
 * schoval handler `room:created` a seznam předtím tlačítko „Vytvořit".
 * Nikdo si toho nevšiml, protože `game:init` vzápětí schoval celé intro.
 * Při návratu ze hry se ale intro odkrylo prázdné a nešlo založit novou hru.
 */
export function showIntroSelection() {
  document.getElementById('room-create-form')?.classList.add('hidden');
  document.getElementById('room-selection')?.classList.remove('hidden');
}

export function initLobbyListeners(onLeave) {
  // Intro — tvorba místnosti
  const roomSelection  = document.getElementById('room-selection');
  const roomCreateForm = document.getElementById('room-create-form');
  document.getElementById('show-create-room')?.addEventListener('click', () => {
    roomSelection?.classList.add('hidden');
    roomCreateForm?.classList.remove('hidden');
    if (state.allColors.length > 0) {
      buildColorPicker(state.allColors, [], false, dom.newRoomColorPicker);
    }
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
  
  // Lobby — změna jména
  dom.updateNameBtn?.addEventListener('click', () => {
    const name = dom.lobbyNameInput?.value.trim();
    if (!name) { showToast('Jméno nesmí být prázdné!', true); return; }
    socket.emit('game:change_name', { name });
    showToast('Jméno uloženo.');
  });
  dom.lobbyNameInput?.addEventListener('keydown', e => { if (e.key === 'Enter') dom.updateNameBtn?.click(); });

  // Start + ready
  dom.startBtn?.addEventListener('click', () => { dom.startBtn.disabled = true; socket.emit('game:start'); });
  dom.addBotBtn?.addEventListener('click', () => socket.emit('game:add_bot'));
  document.getElementById('toggle-ready-btn')?.addEventListener('click', function () {
    this.disabled = true;
    socket.emit('game:ready');
    setTimeout(() => { this.disabled = false; }, 800);
  });

  // Leave buttons
  document.getElementById('lobby-leave-btn')?.addEventListener('click', async () => {
    if (await confirmDialog('Opravdu chcete opustit místnost?')) onLeave();
  });
  document.getElementById('game-leave-btn')?.addEventListener('click', async () => {
    if (await confirmDialog('Opravdu chcete opustit hru? Pokud odejdete během zápasu, zbankrotujete.')) {
      onLeave();
    }
  });
}
