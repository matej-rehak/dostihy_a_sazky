// Lazy gettery — každý přístup na dom.X volá getElementById v tu chvíli,
// takže funguje i po dynamickém vložení HTML partials přes fetch().

const IDS = {
  introView:     'intro-view',
  roomList:      'room-list',
  lobbyView:     'lobby-view',
  gameView:      'game-view',
  joinForm:      'join-form',
  joinedWait:    'joined-wait',
  nameInput:     'name-input',
  colorPicker:   'color-picker',
  joinBtn:       'join-btn',
  lobbyPlayers:  'lobby-players',
  hostControls:  'host-controls',
  startBtn:      'start-btn',
  board:         'board',
  playersList:   'players-list',
  actionTitle:   'action-title',
  actionContent: 'action-content',
  logList:       'log-list',
  bcTurn:        'bc-turn',
  bcRound:       'bc-round',
  gameTimer:     'game-timer',
  timerValue:    'timer-value',
  toast:         'toast',
  tooltip:       'space-tip',
  debugBtn:      'debug-btn',
  debugPanel:    'debug-panel',
  debugBody:     'debug-body',
};

export const dom = {};

for (const [key, id] of Object.entries(IDS)) {
  Object.defineProperty(dom, key, {
    get: () => document.getElementById(id),
    enumerable: true,
  });
}
