// Vykreslovací smyčka 3D plánu, kterou jde pozastavit. Ve 2D je 3D plátno jen
// skryté — bez zastavení by scéna dál běžela 60× za sekundu a pálila GPU.
// Čistý modul bez DOM; raf/caf jde podstrčit v testech (tests/render-loop.test.mjs).

/**
 * @param frame  vykreslí jeden snímek
 * @returns {{ start(): void, stop(): void, readonly running: boolean }}
 */
export function createRenderLoop(
  frame,
  raf = cb => requestAnimationFrame(cb),
  caf = id => cancelAnimationFrame(id),
) {
  let id = null;

  const tick = () => {
    id = raf(tick);
    frame();
  };

  return {
    start() {
      if (id !== null) return;
      tick();
    },
    stop() {
      if (id === null) return;
      caf(id);
      id = null;
    },
    get running() { return id !== null; },
  };
}
