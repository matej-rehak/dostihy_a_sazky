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

// ─── Identita hráče ───────────────────────────────────────────────────────────

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

// ─── Reconnect overlay ───────────────────────────────────────────────────────

const reconnectOverlay = document.getElementById('reconnect-overlay');

socket.on('disconnect', () => {
  if (reconnectOverlay) reconnectOverlay.classList.remove('hidden');
});

socket.on('connect', () => {
  if (reconnectOverlay) reconnectOverlay.classList.add('hidden');
});

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

  if (state.particleIntervalId) { clearInterval(state.particleIntervalId); state.particleIntervalId = null; }
  if (dom.board) dom.board.innerHTML = '';

  dom.introView.classList.remove('hidden');
  dom.lobbyView.classList.add('hidden');
  dom.gameView.classList.add('hidden');

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

  if (state.boardBuilt) {
    Object.keys(currentOwn).forEach(sid => {
      if (currentOwn[sid] !== state.prevOwnerships[sid]) {
        const owner = gameState.players.find(p => p.id === currentOwn[sid]);
        if (owner) playBuyAnimation(sid, owner);
      }
    });
    Object.keys(currentTok).forEach(sid => {
      const tNew = currentTok[sid];
      const tOld = state.prevTokens[sid] || { small: 0, big: false };
      if (tNew.small > tOld.small) playTokenAnimation(sid, false);
      if (tNew.big && !tOld.big)   playTokenAnimation(sid, true);
    });
  }

  state.prevOwnerships = { ...currentOwn };
  try   { state.prevTokens = structuredClone(currentTok); }
  catch { state.prevTokens = JSON.parse(JSON.stringify(currentTok)); }

  // Inicializace vizuálních pozic nových hráčů
  gameState.players.forEach(p => {
    if (state.clientVisualPos[p.id] === undefined) state.clientVisualPos[p.id] = p.position;
  });

  // Balance diff animace
  const balanceDiffs = [];
  gameState.players.forEach(p => {
    if (state.prevBalances[p.id] !== undefined && state.prevBalances[p.id] !== p.balance) {
      balanceDiffs.push({ id: p.id, diff: p.balance - state.prevBalances[p.id] });
    }
    state.prevBalances[p.id] = p.balance;
  });

  updatePlayers(gameState);

  balanceDiffs.forEach(({ id, diff }) => {
    const balEl = document.getElementById(`pb-${id}`);
    if (balEl) {
      const diffEl = document.createElement('div');
      diffEl.className = `balance-diff ${diff > 0 ? 'pos' : 'neg'}`;
      diffEl.textContent = (diff > 0 ? '+' : '') + Number(diff).toLocaleString('cs-CZ') + ' Kč';
      balEl.appendChild(diffEl);
      setTimeout(() => { if (diffEl.parentNode) diffEl.remove(); }, 2000);
    }
  });

  updateBoard(gameState);
  animatePawnsIfNeeded(gameState);
  updateActionPanel(gameState);
  updateLog(gameState);
  updateCenter(gameState);

  const pa = gameState.pendingAction;
  const canRoll = pa && (pa.type === 'wait_roll' || pa.type === 'service_roll') && pa.targetId === state.myId;
  document.getElementById('dice-3d')?.classList.toggle('dice-rollable', !!canRoll);
}

// ─── Socket events ────────────────────────────────────────────────────────────

socket.on('room:list', list => renderRoomList(list));

socket.on('room:created', ({ roomId, password }) => {
  socket.emit('room:join', { roomId, password });
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

// ─── Init ─────────────────────────────────────────────────────────────────────

initLobbyListeners(resetLocalState);

socket.emit('room:list');
