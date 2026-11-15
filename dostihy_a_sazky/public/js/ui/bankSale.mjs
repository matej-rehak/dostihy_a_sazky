// Výkupní ceny banky — zrcadlo EconomyMixin._sellProperty / TokensMixin._removeToken.
// Banka platí podíl ceny podle nastavení `bankSaleRatio` (zaokrouhleno dolů),
// inflace výkup nemění. Soulad se serverem hlídá tests/bank-sale-ratio.test.mjs.
// Čistý modul bez DOM.

/** Zrcadlo BANK_SALE_RATIOS / BANK_SALE_DEFAULT ze src/constants.js. */
export const BANK_SALE_RATIOS = { '1/2': [1, 2], '2/3': [2, 3], '3/4': [3, 4], '1': [1, 1] };
export const BANK_SALE_DEFAULT = '2/3';

/** Kolik banka zaplatí za věc s cenou `amount`. */
export function bankSaleValue(amount, ratioKey) {
  const [num, den] = BANK_SALE_RATIOS[ratioKey] || BANK_SALE_RATIOS[BANK_SALE_DEFAULT];
  return Math.floor(amount * num / den);
}

/** Kolik dá banka za jeden žeton (u hlavního dostihu za ten hlavní). */
export function tokenSellValue(space, tok, ratioKey) {
  if (!tok) return 0;
  if (tok.big) return bankSaleValue(space.bigTokenCost, ratioKey);
  if (tok.small > 0) return bankSaleValue(space.tokenCost, ratioKey);
  return 0;
}

/** Kolik dá banka za pole i se všemi žetony. */
export function propertySellValue(space, tok, ratioKey) {
  let value = bankSaleValue(space.price, ratioKey);
  if (tok?.big) value += bankSaleValue(space.bigTokenCost, ratioKey) + bankSaleValue(space.tokenCost, ratioKey) * 4;
  else if (tok?.small > 0) value += bankSaleValue(space.tokenCost, ratioKey) * tok.small;
  return value;
}

/** Popis poměru do textu („polovinu ceny", „plnou cenu"…). */
export function bankSaleLabel(ratioKey) {
  return {
    '1/2': 'polovinu ceny',
    '2/3': 'dvě třetiny ceny',
    '3/4': 'tři čtvrtiny ceny',
    '1': 'plnou cenu',
  }[ratioKey in BANK_SALE_RATIOS ? ratioKey : BANK_SALE_DEFAULT];
}
