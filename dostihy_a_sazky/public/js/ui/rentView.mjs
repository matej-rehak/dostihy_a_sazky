// Nájem koně, jak ho zobrazuje plán (2D i 3D). Musí dávat stejné číslo jako
// server — EconomyMixin._calcRent v src/mixins/economy.js — jinak by plán
// ukazoval jiný nájem, než se pak zaplatí. Hlídá to tests/rent-view.test.mjs.
// Čistý modul bez DOM, pracuje jen s board daty a stavem hry.

import { priced } from './inflation.mjs';

/** Násobek hodu u Přepravy a Stájí — zrcadlo SERVICE_RENT_* ze src/constants.js. */
export const SERVICE_DICE_RENT = { single: 200, pair: 500 };

/**
 * Aktuální nájem koně; null, když pole není kůň nebo ho nikdo nevlastní.
 * Žetony platí jen při celé stáji a když majitel není v Distancu ani pod
 * podezřením z dopingu. Nájem je po inflaci z Rulety, jako na serveru.
 */
export function horseRent(board, gameState, spaceId) {
  const rent = baseHorseRent(board, gameState, spaceId);
  return rent === null ? null : priced(gameState, rent);
}

function baseHorseRent(board, gameState, spaceId) {
  const { row } = horseRentRow(board, gameState, spaceId);
  return row === null ? null : board[spaceId].rents[row];
}

/**
 * Který řádek tabulky nájmů koně platí (0 = základní, 1–4 žetony, 5 = hlavní
 * dostih) a proč případně žetony nefungují: 'group' (majitel nemá celou
 * stáj), 'jail' (Distanc), 'doping'. row null = kůň není koupený.
 * Z toho vychází horseRent, takže tabulka i políčko ukazují stejné číslo.
 */
export function horseRentRow(board, gameState, spaceId) {
  const none = { row: null, idle: null };
  const space = board[spaceId];
  if (!space || space.type !== 'horse') return none;

  const ownerships = gameState.ownerships || {};
  const ownerId = ownerships[spaceId];
  if (!ownerId) return none;
  const owner = (gameState.players || []).find(p => p.id === ownerId);
  if (!owner) return none;

  const tok = (gameState.tokens || {})[spaceId] || { small: 0, big: false };
  if (!tok.big && !(tok.small > 0)) return { row: 0, idle: null };

  const fullGroup = board
    .filter(s => s.group === space.group)
    .every(s => ownerships[s.id] === ownerId);
  if (!fullGroup) return { row: 0, idle: 'group' };
  if (owner.inJail) return { row: 0, idle: 'jail' };
  if (owner.skipTurns > 0) return { row: 0, idle: 'doping' };

  return { row: tok.big ? 5 : tok.small, idle: null };
}

/**
 * Platný řádek tabulky nájmů služby: trenéři = počet trenérů majitele − 1,
 * Přeprava a Stáje 0 = jedna, 1 = obě. null = služba není koupená.
 */
export function serviceRentRow(board, gameState, spaceId) {
  const space = board[spaceId];
  if (!space || space.type !== 'service') return null;
  const ownerId = (gameState.ownerships || {})[spaceId];
  if (!ownerId) return null;
  const owned = board.filter(s => (gameState.ownerships || {})[s.id] === ownerId);
  if (space.serviceType === 'trener') {
    return owned.filter(s => s.serviceType === 'trener').length - 1;
  }
  const both = owned.some(s => s.serviceType === 'preprava') && owned.some(s => s.serviceType === 'staje');
  return both ? 1 : 0;
}

/**
 * Nájem koupené služby — zrcadlí větev `service` v EconomyMixin._calcRent.
 * Trenéři: 1 000 Kč × počet trenérů majitele. Přeprava a Stáje: násobek
 * hodu kostkou (200×, s oběma 500×), proto `perDice`. Po inflaci z Rulety.
 * null = pole není koupená služba.
 */
export function serviceRent(board, gameState, spaceId) {
  const space = board[spaceId];
  if (!space || space.type !== 'service') return null;
  const ownerId = (gameState.ownerships || {})[spaceId];
  if (!ownerId) return null;
  const owned = board.filter(s => (gameState.ownerships || {})[s.id] === ownerId);

  if (space.serviceType === 'trener') {
    const count = owned.filter(s => s.serviceType === 'trener').length;
    return { amount: priced(gameState, count * 1000), perDice: false };
  }
  const both = owned.some(s => s.serviceType === 'preprava') && owned.some(s => s.serviceType === 'staje');
  return { amount: priced(gameState, both ? SERVICE_DICE_RENT.pair : SERVICE_DICE_RENT.single), perDice: true };
}

/** Ukazuje políčko nájem (koupený kůň nebo služba), ne nákupní cenu? */
export function tileShowsRent(board, gameState, spaceId) {
  return horseRent(board, gameState, spaceId) !== null || serviceRent(board, gameState, spaceId) !== null;
}

/** Jednotka za částkou: „ Kč", u Přepravy a Stájí „× hod" (násobek kostky). */
export function tileSuffix(board, gameState, spaceId) {
  return serviceRent(board, gameState, spaceId)?.perDice ? '× hod' : ' Kč';
}

/**
 * Částka dole na políčku plánu (2D i 3D), po inflaci z Rulety:
 * koupený kůň → aktuální nájem, koupená služba → její nájem (u Přepravy
 * a Stájí násobek hodu, viz tileSuffix), jinak nákupní cena, u Veterinárního
 * vyšetření jeho poplatek. null = pole nic nestojí.
 */
export function tileAmount(board, gameState, spaceId) {
  const space = board[spaceId];
  if (!space) return null;
  const rent = horseRent(board, gameState, spaceId);
  if (rent !== null) return rent;
  const service = serviceRent(board, gameState, spaceId);
  if (service) return service.amount;
  const base = space.price || space.amount;
  return base ? priced(gameState, base) : null;
}
