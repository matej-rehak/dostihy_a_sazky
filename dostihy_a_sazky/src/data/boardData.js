'use strict';

/**
 * Board: 40 spaces authentic Dostihy a sázky
 * groups: orange, brown, lightBlue, green, red, yellow, darkGreen, darkBlue
 */

const BOARD = [
  { id: 0, name: 'START', type: 'start' },
  { id: 1, name: 'Fantome', type: 'horse', group: 'oranzova', groupColor: '#f97316', groupSize: 2, price: 1200, rents: [40, 200, 600, 1800, 3200, 5000], tokenCost: 1000, bigTokenCost: 1000 },
  { id: 2, name: 'Finance', type: 'finance' },
  { id: 3, name: 'Gavora', type: 'horse', group: 'oranzova', groupColor: '#f97316', groupSize: 2, price: 1200, rents: [40, 200, 600, 1800, 3200, 5000], tokenCost: 1000, bigTokenCost: 1000 },
  { id: 4, name: 'Veterinární vyšetření', type: 'tax', amount: 500 },
  { id: 5, name: '1. trenér', type: 'service', serviceType: 'trener', price: 4000 },
  { id: 6, name: 'Lady Anne', type: 'horse', group: 'hneda', groupColor: '#92400e', groupSize: 3, price: 2000, rents: [120, 600, 1800, 5400, 8000, 11000], tokenCost: 1000, bigTokenCost: 1000 },
  { id: 7, name: 'Náhoda', type: 'nahoda' },
  { id: 8, name: 'Pasek', type: 'horse', group: 'hneda', groupColor: '#92400e', groupSize: 3, price: 2000, rents: [120, 600, 1800, 5400, 8000, 11000], tokenCost: 1000, bigTokenCost: 1000 },
  { id: 9, name: 'Koran', type: 'horse', group: 'hneda', groupColor: '#92400e', groupSize: 3, price: 2400, rents: [160, 800, 2000, 6000, 9000, 12000], tokenCost: 1000, bigTokenCost: 1000 },
  { id: 10, name: 'Distanc', type: 'jail' },
  { id: 11, name: 'Neklan', type: 'horse', group: 'sv_modra', groupColor: '#3b82f6', groupSize: 3, price: 2800, rents: [200, 1000, 3000, 9000, 12500, 15000], tokenCost: 2000, bigTokenCost: 2000 },
  { id: 12, name: 'Přeprava', type: 'service', serviceType: 'preprava', price: 3000 },
  { id: 13, name: 'Portlancl', type: 'horse', group: 'sv_modra', groupColor: '#3b82f6', groupSize: 3, price: 2800, rents: [200, 1000, 3000, 9000, 12500, 15000], tokenCost: 2000, bigTokenCost: 2000 },
  { id: 14, name: 'Japan', type: 'horse', group: 'sv_modra', groupColor: '#3b82f6', groupSize: 3, price: 2800, rents: [240, 1200, 3600, 10000, 14000, 18000], tokenCost: 2000, bigTokenCost: 2000 },
  { id: 15, name: '2. trenér', type: 'service', serviceType: 'trener', price: 4000 },
  { id: 16, name: 'Kostrava', type: 'horse', group: 'zelena', groupColor: '#22c55e', groupSize: 3, price: 3600, rents: [280, 1400, 4000, 11000, 15000, 19000], tokenCost: 2000, bigTokenCost: 2000 },
  { id: 17, name: 'Finance', type: 'finance' },
  { id: 18, name: 'Lukava', type: 'horse', group: 'zelena', groupColor: '#22c55e', groupSize: 3, price: 3600, rents: [280, 1400, 4000, 11000, 15000, 19000], tokenCost: 2000, bigTokenCost: 2000 },
  { id: 19, name: 'Melák', type: 'horse', group: 'zelena', groupColor: '#22c55e', groupSize: 3, price: 4000, rents: [320, 1600, 4400, 12000, 16000, 20000], tokenCost: 2000, bigTokenCost: 2000 },
  { id: 20, name: 'Parkoviště', type: 'free_parking' },
  { id: 21, name: 'Grifel', type: 'horse', group: 'cervena', groupColor: '#ef4444', groupSize: 3, price: 4400, rents: [360, 1800, 5000, 14000, 17000, 21000], tokenCost: 3000, bigTokenCost: 3000 },
  { id: 22, name: 'Náhoda', type: 'nahoda' },
  { id: 23, name: 'Mohyla', type: 'horse', group: 'cervena', groupColor: '#ef4444', groupSize: 3, price: 4400, rents: [360, 1800, 5000, 14000, 17000, 21000], tokenCost: 3000, bigTokenCost: 3000 },
  { id: 24, name: 'Metál', type: 'horse', group: 'cervena', groupColor: '#ef4444', groupSize: 3, price: 4800, rents: [400, 2000, 6000, 15000, 18000, 22000], tokenCost: 3000, bigTokenCost: 3000 },
  { id: 25, name: '3. trenér', type: 'service', serviceType: 'trener', price: 4000 },
  { id: 26, name: 'Tara', type: 'horse', group: 'zluta', groupColor: '#eab308', groupSize: 3, price: 5200, rents: [440, 2200, 6600, 16000, 19500, 23000], tokenCost: 3000, bigTokenCost: 3000 },
  { id: 27, name: 'Furioso', type: 'horse', group: 'zluta', groupColor: '#eab308', groupSize: 3, price: 5200, rents: [440, 2200, 6600, 16000, 19500, 23000], tokenCost: 3000, bigTokenCost: 3000 },
  { id: 28, name: 'Stáje', type: 'service', serviceType: 'staje', price: 3000 },
  { id: 29, name: 'Genius', type: 'horse', group: 'zluta', groupColor: '#eab308', groupSize: 3, price: 5600, rents: [580, 2400, 7200, 17000, 20500, 24000], tokenCost: 3000, bigTokenCost: 3000 },
  { id: 30, name: 'Podezření z dopingu', type: 'skip_turn', turns: 1 },
  { id: 31, name: 'Shagga', type: 'horse', group: 'tm_zelena', groupColor: '#195530ff', groupSize: 3, price: 6000, rents: [500, 2600, 7800, 18000, 22000, 25500], tokenCost: 4000, bigTokenCost: 4000 },
  { id: 32, name: 'Dahoman', type: 'horse', group: 'tm_zelena', groupColor: '#195530ff', groupSize: 3, price: 6000, rents: [500, 2600, 7800, 18000, 22000, 25500], tokenCost: 4000, bigTokenCost: 4000 },
  { id: 33, name: 'Finance', type: 'finance' },
  { id: 34, name: 'Gira', type: 'horse', group: 'tm_zelena', groupColor: '#195530ff', groupSize: 3, price: 6400, rents: [560, 3000, 9000, 20000, 24000, 28000], tokenCost: 4000, bigTokenCost: 4000 },
  { id: 35, name: '4. trenér', type: 'service', serviceType: 'trener', price: 4000 },
  { id: 36, name: 'Náhoda', type: 'nahoda' },
  { id: 37, name: 'Narcius', type: 'horse', group: 'tm_modra', groupColor: '#1d4ed8', groupSize: 2, price: 7000, rents: [700, 3500, 10000, 22000, 26000, 30000], tokenCost: 4000, bigTokenCost: 4000 },
  { id: 38, name: 'Veterinární vyšetření', type: 'tax', amount: 1000 },
  { id: 39, name: 'Napoli', type: 'horse', group: 'tm_modra', groupColor: '#1d4ed8', groupSize: 2, price: 8000, rents: [1000, 4000, 12000, 28000, 34000, 40000], tokenCost: 4000, bigTokenCost: 4000 },
];

module.exports = BOARD;
