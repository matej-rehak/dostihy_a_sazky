import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Klientské skripty se v testech většinou nespouštějí (potřebují DOM), takže
// syntaktická chyba — třeba dvakrát deklarované `const` v main.js — by prošla
// a v prohlížeči by se nenačetla celá hra. `node --check` ji odhalí bez spuštění.

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

function jsFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return jsFiles(p);
    return /\.(m?js)$/.test(e.name) ? [p] : [];
  });
}

test('všechny skripty v public/js jdou zparsovat jako ES moduly', () => {
  const files = jsFiles(path.join(root, 'public/js'));
  assert.ok(files.length > 20);
  for (const f of files) {
    try {
      execFileSync(process.execPath, ['--experimental-default-type=module', '--no-warnings', '--check', f], { stdio: 'pipe' });
    } catch (err) {
      assert.fail(`${path.relative(root, f)}: ${String(err.stderr).split('\n').slice(0, 5).join('\n')}`);
    }
  }
});
