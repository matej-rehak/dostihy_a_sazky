// Sdílený mutable stav aplikace — importován všemi moduly
export const state = {
  myId:              null,
  boardData:         null,
  gameState:         null,
  boardBuilt:        false,
  clientVisualPos:   {},
  isAnimatingPawn:   false,
  prevOwnerships:    {},
  prevTokens:        {},
  prevBalances:      {},
  allColors:         [],
  isStarterAnimating: false,
  lastInsufficientFundsKey: null,
  selectedColor:     null,
  particleIntervalId: null,
  roomListIntervalId: null,
  devMode:           false,
};
