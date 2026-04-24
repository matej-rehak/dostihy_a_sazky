import { state }                                from './state.js';
import { dom }                                  from './dom.js';
import { socket }                               from './socket.js';
import { showToast }                            from './utils.js';
import { renderRoomList, renderLobby, buildColorPicker, initLobbyListeners } from './ui/lobby.js';
import { buildBoard, updateBoard }              from './ui/board.js';
import { updatePlayers }                        from './ui/players.js';
import { updateActionPanel }                    from './ui/actions.js';
import { updateLog, updateCenter }              from './ui/log.js';
import { initTooltipListeners }                 from './ui/tooltip.js';
import { animatePawnsIfNeeded }                 from './animations/pawns.js';
import { playBuyAnimation, playTokenAnimation } from './animations/cards.js';
import { generateParticles }                    from './animations/particles.js';
import { audioManager }                         from './audio.js';
import { initDebugPanel, showDebugBtnIfNeeded } from './ui/debug.js';

// ─── Load HTML partials ───────────────────────────────────────────────────────

async function loadPartials() {
  const root = document.getElementById('app-root');
  const names = ['overlays', 'intro', 'lobby', 'game'];
  const parts = await Promise.all(
    names.map(n => fetch(`/partials/${n}.html`).then(r => r.text()))
  );
  root.innerHTML = parts.join('\n');
}

// ─── Identita hráče ───────────────────────────────────────────────────────────
// Registrujeme před loadPartials — token přijde kdykoliv, DOM nepotřebujeme.

socket.on('game:token', ({ token, playerId }) => {
  localStorage.setItem('ds_jwt', token);
  localStorage.setItem('ds_player_id', playerId);
  state.myId = playerId;
});

function identifyMe(players) {
  if (state.myId) return;
  const storedId = localStorage.getItem('ds_player_id');
  if (storedId && players.find(p => p.id === storedId)) {
    state.myId = storedId;
  }
}

// ─── Reset lokálního stavu ────────────────────────────────────────────────────

function resetLocalState() {
  state.myId              = null;
  state.boardData         = null;
  state.gameState         = null;
  state.boardBuilt        = false;
  state.clientVisualPos   = {};
  state.isAnimatingPawn   = false;
  state.prevOwnerships    = {};
  state.prevTokens        = {};
  state.prevBalances      = {};
  state.allColors         = [];
  state.isStarterAnimating = false;
  state.prevDiceId        = null;
  state.prevTurnId        = null;
  state.prevLobbyCount    = 0;
  state.prevBankruptCount = 0;
  state.prevPaJSON        = null;

  if (state.particleIntervalId) { clearInterval(state.particleIntervalId); state.particleIntervalId = null; }
  if (dom.board) dom.board.innerHTML = '';

  dom.introView.classList.remove('hidden');
  dom.lobbyView.classList.add('hidden');
  dom.gameView.classList.add('hidden');

  // Správně odhlásit ze serveru — handleLeave odstraní hráče z místnosti
  // a server sám rozešle aktualizovaný room:list všem klientům.
  // socket.emit('room:list') ponecháváme jako zálohu pro případ, že hráč
  // nebyl v žádné místnosti (handleLeave pak room:list nevyšle).
  socket.emit('game:leave');
  socket.emit('room:list');
}
window.__resetLocalState = resetLocalState; // nutné pro actions.js tlačítko "Hrát znovu"

// ─── Zpracování stavu hry ─────────────────────────────────────────────────────

function processState(gameState) {
  if (!gameState) {
    dom.introView.classList.remove('hidden');
    dom.lobbyView.classList.add('hidden');
    dom.gameView.classList.add('hidden');
    return;
  }
  state.gameState = gameState;
  window.__gameState = gameState;
  identifyMe(gameState.players);

  const me = gameState.players.find(p => p.id === state.myId);

  if (gameState.phase === 'lobby') {
    // Tracking join / leave
    const currentCount = gameState.players.length;
    if (state.prevLobbyCount !== undefined) {
      if (currentCount > state.prevLobbyCount) audioManager.play('join');
      else if (currentCount < state.prevLobbyCount) audioManager.play('leave');
    }
    state.prevLobbyCount = currentCount;

    renderLobby(gameState, me);
    if (!me && state.allColors.length > 0) {
      buildColorPicker(state.allColors, gameState.players.map(p => p.color));
    }
    return;
  }

  // ── Herní fáze ──────────────────────────────────────────────────────────────
  dom.lobbyView.classList.add('hidden');
  dom.gameView.classList.remove('hidden');

  if (!state.boardBuilt && state.boardData) {
    buildBoard(state.boardData);
    generateParticles();
    initTooltipListeners(dom.playersList);
    state.boardBuilt = true;

    const diceEl = document.getElementById('dice-3d');
    if (diceEl) {
      diceEl.addEventListener('click', () => {
        const pa = state.gameState?.pendingAction;
        if (pa && (pa.type === 'wait_roll' || pa.type === 'service_roll') && pa.targetId === state.myId) {
          socket.emit('game:roll');
        }
      });
    }
  }

  // Detect změny vlastnictví a žetonů → spustit animace
  const currentOwn = gameState.ownerships || {};
  const currentTok = gameState.tokens     || {};
  let expectAssetPurchase = false; // Tlumič pro pay_rent

  if (state.boardBuilt) {
    Object.keys(currentOwn).forEach(sid => {
      if (currentOwn[sid] !== state.prevOwnerships[sid]) {
        const owner = gameState.players.find(p => p.id === currentOwn[sid]);
        if (owner) {
          playBuyAnimation(sid, owner);
          if (owner.id === state.myId) {
            audioManager.play('buy'); // Slavnostní zvuk pro pořízení prvotního koně
            expectAssetPurchase = true;
          }
        }
      }
    });
    Object.keys(currentTok).forEach(sid => {
      const tNew = currentTok[sid];
      const tOld = state.prevTokens[sid] || { small: 0, big: false };
      const isMyToken = gameState.ownerships[sid] === state.myId;

      if (tNew.small > tOld.small) {
        audioManager.play('buy'); // Malý dostih obj
        playTokenAnimation(sid, false);
        if (isMyToken) expectAssetPurchase = true;
      }
      if (tNew.big && !tOld.big) {
        audioManager.play('upgrade_star'); // Velký dostih obj! Fanfára
        playTokenAnimation(sid, true);
        if (isMyToken) expectAssetPurchase = true;
      }
    });
  }

  state.prevOwnerships = { ...currentOwn };
  try   { state.prevTokens = structuredClone(currentTok); }
  catch { state.prevTokens = JSON.parse(JSON.stringify(currentTok)); }

  // Inicializace vizuálních pozic nových hráčů
  gameState.players.forEach(p => {
    if (state.clientVisualPos[p.id] === undefined) state.clientVisualPos[p.id] = p.position;
  });

  // Balance diff animace a zvuky
  const balanceDiffs = [];
  gameState.players.forEach(p => {
    if (state.prevBalances[p.id] !== undefined && state.prevBalances[p.id] !== p.balance) {
      balanceDiffs.push({ id: p.id, diff: p.balance - state.prevBalances[p.id] });
    }
    state.prevBalances[p.id] = p.balance;
  });

  updatePlayers(gameState);

  balanceDiffs.forEach(({ id, diff }) => {
    // Peníze pro MĚ 
    if (id === state.myId) {
       if (diff === 4000) audioManager.play('start_bonus');
       else if (diff > 0) audioManager.play('cash');
       else if (diff < 0 && !expectAssetPurchase) audioManager.play('pay_rent');
    }

    const balEl = document.getElementById(`pb-${id}`);
    if (balEl) {
      const diffEl = document.createElement('div');
      diffEl.className = `balance-diff ${diff > 0 ? 'pos' : 'neg'}`;
      diffEl.textContent = (diff > 0 ? '+' : '') + Number(diff).toLocaleString('cs-CZ') + ' Kč';
      balEl.appendChild(diffEl);
      setTimeout(() => { if (diffEl.parentNode) diffEl.remove(); }, 2000);
    }
  });

  // Trackování tahu a zvukových notifikací turnu
  if (state.prevTurnId !== gameState.currentTurnId) {
    if (gameState.currentTurnId === state.myId && gameState.phase === 'playing') {
      audioManager.play('bell');
    }
    state.prevTurnId = gameState.currentTurnId;
  }

  const pa = gameState.pendingAction;

  // Trackování změny akcí (pro jednorázové zvuky jako trade_offer nebo game_over)
  const currentPaJSON = JSON.stringify(pa || null);
  if (state.prevPaJSON !== currentPaJSON) {
    if (pa && pa.type === 'trade_offer' && pa.targetId === state.myId) {
      audioManager.play('trade_offer');
    } else if (pa && pa.type === 'game_over') {
      audioManager.play('win');
    } else if (pa && pa.type === 'card_ack') {
      audioManager.play('card');
    }
    state.prevPaJSON = currentPaJSON;
  }

  // Zvuk hodu kostkou
  if (gameState.lastDice && state.prevDiceId !== gameState.lastDice.id) {
    audioManager.play('roll');
    state.prevDiceId = gameState.lastDice.id;
  }

  // Trackování bankrotů
  const bankrupts = gameState.players.filter(p => p.bankrupt).length;
  if (state.prevBankruptCount !== undefined && bankrupts > state.prevBankruptCount) {
    audioManager.play('bankrupt');
  }
  state.prevBankruptCount = bankrupts;

  updateBoard(gameState);
  animatePawnsIfNeeded(gameState);
  updateActionPanel(gameState);
  updateLog(gameState);
  updateCenter(gameState);

  const canRoll = pa && (pa.type === 'wait_roll' || pa.type === 'service_roll') && pa.targetId === state.myId;
  document.getElementById('dice-3d')?.classList.toggle('dice-rollable', !!canRoll);

  showDebugBtnIfNeeded(gameState);
}

// ─── Init ─────────────────────────────────────────────────────────────────────

(async () => {
  audioManager.init();
  await loadPartials();
  initDebugPanel();

  // Reconnect overlay (DOM teď existuje)
  socket.on('disconnect', () => {
    document.getElementById('reconnect-overlay')?.classList.remove('hidden');
  });
  socket.on('connect', () => {
    document.getElementById('reconnect-overlay')?.classList.add('hidden');
  });

  // Socket events
  socket.on('room:list', list => renderRoomList(list));

  socket.on('room:created', () => {
    document.getElementById('room-create-form')?.classList.add('hidden');
  });

  socket.on('game:init', ({ roomId, board, colors, state: gameState }) => {
    state.boardData = board;
    window.__boardData = board;
    state.allColors = colors;
    buildColorPicker(colors, gameState.players.map(p => p.color));
    dom.introView.classList.add('hidden');
    processState(gameState);
    const myPlayerId = localStorage.getItem('ds_player_id');
    if (!gameState.players.find(p => p.id === myPlayerId)) {
      setTimeout(() => { dom.nameInput?.focus(); }, 100);
    }
  });

  socket.on('game:state', gameState => processState(gameState));
  socket.on('game:error', ({ message }) => showToast(message, true));

  initLobbyListeners(resetLocalState);
  socket.emit('room:list');
})();
