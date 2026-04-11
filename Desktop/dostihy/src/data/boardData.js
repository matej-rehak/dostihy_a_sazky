'use strict';

// ─── Board: 40 políček (jako Monopoly) ───────────────────────────────────────
// rents: [base, 1 malý, 2 malé, 3 malé, 4 malé, 1 velký]
// base rent doubles when owner has entire stáj and no tokens

const BOARD = [
  { id: 0,  name: 'START',            type: 'start' },
  { id: 1,  name: 'Fantome',          type: 'horse',   group: 'oranzova',     groupColor: '#f97316', groupSize: 2, price: 1200, rents: [60, 180, 500, 1400, 1700, 2000], tokenCost: 1000, bigTokenCost: 5000 },
  { id: 2,  name: 'Finance',          type: 'finance' },
  { id: 3,  name: 'Gavora',           type: 'horse',   group: 'oranzova',     groupColor: '#f97316', groupSize: 2, price: 1400, rents: [80, 220, 600, 1800, 2000, 2400], tokenCost: 1000, bigTokenCost: 5000 },
  { id: 4,  name: 'Daň dostihu',      type: 'tax',     amount: 500 },
  { id: 5,  name: 'Trenér',           type: 'service', serviceType: 'trener',  price: 2000 },
  { id: 6,  name: 'Lady Anne',        type: 'horse',   group: 'hneda',        groupColor: '#92400e', groupSize: 3, price: 1600, rents: [80, 240, 700, 2000, 2200, 2600],  tokenCost: 1000, bigTokenCost: 5000 },
  { id: 7,  name: 'Náhoda',           type: 'nahoda' },
  { id: 8,  name: 'Pasek',            type: 'horse',   group: 'hneda',        groupColor: '#92400e', groupSize: 3, price: 1800, rents: [100, 300, 900, 2500, 2800, 3000], tokenCost: 1000, bigTokenCost: 5000 },
  { id: 9,  name: 'Koran',            type: 'horse',   group: 'hneda',        groupColor: '#92400e', groupSize: 3, price: 1800, rents: [100, 300, 900, 2500, 2800, 3000], tokenCost: 1000, bigTokenCost: 5000 },
  { id: 10, name: 'Distanc',          type: 'jail' },
  { id: 11, name: 'Neklan',           type: 'horse',   group: 'modra',        groupColor: '#3b82f6', groupSize: 3, price: 2000, rents: [100, 300, 900, 2500, 3000, 3500], tokenCost: 1000, bigTokenCost: 5000 },
  { id: 12, name: 'Portland',         type: 'horse',   group: 'modra',        groupColor: '#3b82f6', groupSize: 3, price: 2000, rents: [100, 300, 900, 2500, 3000, 3500], tokenCost: 1000, bigTokenCost: 5000 },
  { id: 13, name: 'Finance',          type: 'finance' },
  { id: 14, name: 'Japan',            type: 'horse',   group: 'modra',        groupColor: '#3b82f6', groupSize: 3, price: 2200, rents: [120, 360, 1000, 3000, 3500, 4000], tokenCost: 1000, bigTokenCost: 5000 },
  { id: 15, name: 'Trenér',           type: 'service', serviceType: 'trener',  price: 2000 },
  { id: 16, name: 'Kostrava',         type: 'horse',   group: 'sv_zelena',    groupColor: '#84cc16', groupSize: 3, price: 2400, rents: [130, 390, 1100, 3200, 3800, 4500], tokenCost: 1000, bigTokenCost: 5000 },
  { id: 17, name: 'Náhoda',           type: 'nahoda' },
  { id: 18, name: 'Lukava',           type: 'horse',   group: 'sv_zelena',    groupColor: '#84cc16', groupSize: 3, price: 2400, rents: [130, 390, 1100, 3200, 3800, 4500], tokenCost: 1000, bigTokenCost: 5000 },
  { id: 19, name: 'Melák',            type: 'horse',   group: 'sv_zelena',    groupColor: '#84cc16', groupSize: 3, price: 2600, rents: [150, 450, 1250, 3500, 4000, 5000], tokenCost: 1000, bigTokenCost: 5000 },
  { id: 20, name: 'Volno',            type: 'free_parking' },
  { id: 21, name: 'Grifel',           type: 'horse',   group: 'ruzova',       groupColor: '#ec4899', groupSize: 3, price: 2800, rents: [150, 450, 1250, 3500, 4200, 5500], tokenCost: 1000, bigTokenCost: 5000 },
  { id: 22, name: 'Finance',          type: 'finance' },
  { id: 23, name: 'Mohyla',           type: 'horse',   group: 'ruzova',       groupColor: '#ec4899', groupSize: 3, price: 2800, rents: [150, 450, 1250, 3500, 4200, 5500], tokenCost: 1000, bigTokenCost: 5000 },
  { id: 24, name: 'Metál',            type: 'horse',   group: 'ruzova',       groupColor: '#ec4899', groupSize: 3, price: 3000, rents: [180, 540, 1500, 4000, 4800, 6000], tokenCost: 1000, bigTokenCost: 5000 },
  { id: 25, name: 'Trenér',           type: 'service', serviceType: 'trener',  price: 2000 },
  { id: 26, name: 'Tara',             type: 'horse',   group: 'zluta',        groupColor: '#eab308', groupSize: 3, price: 3200, rents: [180, 540, 1500, 4000, 4800, 6000], tokenCost: 1000, bigTokenCost: 5000 },
  { id: 27, name: 'Náhoda',           type: 'nahoda' },
  { id: 28, name: 'Furioso',          type: 'horse',   group: 'zluta',        groupColor: '#eab308', groupSize: 3, price: 3200, rents: [180, 540, 1500, 4000, 4800, 6000], tokenCost: 1000, bigTokenCost: 5000 },
  { id: 29, name: 'Genius',           type: 'horse',   group: 'zluta',        groupColor: '#eab308', groupSize: 3, price: 3400, rents: [200, 600, 1700, 4500, 5500, 7000], tokenCost: 1000, bigTokenCost: 5000 },
  { id: 30, name: 'Jdi do Distancu',  type: 'go_to_jail' },
  { id: 31, name: 'Shagga',           type: 'horse',   group: 'tm_zelena',    groupColor: '#16a34a', groupSize: 3, price: 3600, rents: [200, 600, 1800, 5000, 6000, 7500], tokenCost: 1000, bigTokenCost: 5000 },
  { id: 32, name: 'Přeprava',         type: 'service', serviceType: 'preprava', price: 1500 },
  { id: 33, name: 'Dahoman',          type: 'horse',   group: 'tm_zelena',    groupColor: '#16a34a', groupSize: 3, price: 3600, rents: [200, 600, 1800, 5000, 6000, 7500], tokenCost: 1000, bigTokenCost: 5000 },
  { id: 34, name: 'Stáje',            type: 'service', serviceType: 'staje',   price: 1500 },
  { id: 35, name: 'Gira',             type: 'horse',   group: 'tm_zelena',    groupColor: '#16a34a', groupSize: 3, price: 3800, rents: [220, 660, 2000, 5500, 6500, 8000], tokenCost: 1000, bigTokenCost: 5000 },
  { id: 36, name: 'Trenér',           type: 'service', serviceType: 'trener',  price: 2000 },
  { id: 37, name: 'Finance',          type: 'finance' },
  { id: 38, name: 'Narcius',          type: 'horse',   group: 'fialova',      groupColor: '#a855f7', groupSize: 2, price: 4000, rents: [250, 750, 2250, 6000, 7000, 9000],  tokenCost: 1000, bigTokenCost: 5000 },
  { id: 39, name: 'Napoli',           type: 'horse',   group: 'fialova',      groupColor: '#a855f7', groupSize: 2, price: 4200, rents: [300, 900, 2700, 7000, 8500, 10000], tokenCost: 1000, bigTokenCost: 5000 },
];

module.exports = BOARD;
