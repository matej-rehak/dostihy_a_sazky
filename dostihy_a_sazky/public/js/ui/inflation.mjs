// Ceny po inflaci — zrcadlo `inflate` ze src/constants.js.
// Server podle něj strhává platby, klient podle tohohle zobrazuje ceny;
// kdyby se rozešly, plán by ukazoval jinou cenu, než se zaplatí.
// Soulad hlídá tests/inflation.test.mjs. Čistý modul bez DOM.
//
// Inflace má dva zdroje, které se násobí: výseč Inflace na Ruletě
// (`inflation`, vždy 10 %) a automatickou inflaci každých N kol
// (`autoInflation`, sazba `config.inflationRate` v %).

export const INFLATION_RATE = 0.1;

export function inflationFactor(level, autoLevel = 0, autoRatePercent = 0) {
  return (1 + INFLATION_RATE) ** (level || 0) * (1 + (autoRatePercent || 0) / 100) ** (autoLevel || 0);
}

export function inflate(amount, level, autoLevel = 0, autoRatePercent = 0) {
  if (!level && !(autoLevel && autoRatePercent)) return amount;
  return Math.round(amount * inflationFactor(level, autoLevel, autoRatePercent));
}

/** Kolikrát je všechno dražší podle stavu hry (1 = bez inflace). */
export function stateInflationFactor(gameState) {
  return inflationFactor(gameState?.inflation, gameState?.autoInflation, gameState?.config?.inflationRate);
}

/** Platba po inflaci podle aktuálního stavu hry. */
export function priced(gameState, amount) {
  return inflate(amount, gameState?.inflation || 0, gameState?.autoInflation || 0, gameState?.config?.inflationRate || 0);
}

/** O kolik procent je od začátku hry všechno dražší (0 = bez inflace). */
export function inflationPercent(level, autoLevel = 0, autoRatePercent = 0) {
  return Math.round((inflationFactor(level, autoLevel, autoRatePercent) - 1) * 100);
}

/** Totéž přímo ze stavu hry. */
export function stateInflationPercent(gameState) {
  return inflationPercent(gameState?.inflation, gameState?.autoInflation, gameState?.config?.inflationRate);
}
