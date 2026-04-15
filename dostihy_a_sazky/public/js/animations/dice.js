let prevDice = null;

const ROT_MAP = { 1: [0, 0], 2: [90, 0], 3: [0, -90], 4: [0, 90], 5: [-90, 0], 6: [0, -180] };

export function updateDice(lastDice) {
  if (!lastDice || lastDice.id === prevDice?.id) return;
  prevDice = lastDice;

  const diceEl = document.getElementById('dice-3d');
  if (!diceEl) return;

  diceEl.classList.add('rolling');
  diceEl.style.transition = 'none';

  setTimeout(() => {
    diceEl.classList.remove('rolling');
    const [rx, ry] = ROT_MAP[lastDice.value] ?? [0, 0];
    const fRx = rx + (Math.random() * 20 - 10);
    const fRy = ry + (Math.random() * 20 - 10);
    diceEl.style.transform = `rotateX(${fRx - 360}deg) rotateY(${fRy - 360}deg)`;
    void diceEl.offsetWidth;
    diceEl.style.transition = 'transform 0.6s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
    diceEl.style.transform = `rotateX(${fRx}deg) rotateY(${fRy}deg)`;
  }, 400);
}
