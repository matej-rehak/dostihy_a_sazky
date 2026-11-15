// Přednačtení obrázků — karta Finance / Náhoda, Ruleta, portréty koní a ikony
// se jinak stahují až ve chvíli, kdy se mají ukázat. Přes pomalé připojení
// (mobil, tunel) to animace nestihne a místo obrázku je prázdno.
// Seznam posílá server (/api/images, src/imageManifest.js).

/** Odkazy drží stažené obrázky v paměti, aby je prohlížeč nezahodil. */
const loaded = [];

export async function preloadImages() {
  let list;
  try {
    const res = await fetch('/api/images');
    if (!res.ok) return;
    list = await res.json();
  } catch {
    return; // bez přednačtení hra běží dál, obrázky se jen stáhnou později
  }
  if (!Array.isArray(list)) return;

  // Až po vykreslení úvodní obrazovky — přednačtení nesmí zdržet start.
  const idle = window.requestIdleCallback ?? (cb => setTimeout(cb, 300));
  idle(() => {
    for (const src of list) {
      const img = new Image();
      img.decoding = 'async';
      img.src = src;
      loaded.push(img);
    }
  });
}
