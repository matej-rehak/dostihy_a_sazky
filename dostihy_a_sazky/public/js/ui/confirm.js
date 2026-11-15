/**
 * Custom replacement for window.confirm() that respects application design.
 * @param {string} message The message to display
 * @param {string} title The title of the dialog
 * @returns {Promise<boolean>} Resolves to true if confirmed, false otherwise
 */
export function confirmDialog(message, title = 'Potvrzení') {
  return openDialog({ message, title }).then(result => result !== null);
}

/**
 * Náhrada za window.prompt() ve stejném modálu jako confirmDialog —
 * jen s políčkem pro text (např. heslo k místnosti).
 * @param {string} message Text nad políčkem
 * @param {object} [opts]
 * @param {string} [opts.title]        Nadpis okna
 * @param {string} [opts.type]         Typ políčka ('text' | 'password')
 * @param {string} [opts.placeholder]
 * @param {string} [opts.confirmLabel] Popisek potvrzovacího tlačítka
 * @returns {Promise<string|null>} Zadaný text, nebo null při zrušení
 */
export function promptDialog(message, opts = {}) {
  return openDialog({ message, title: opts.title ?? 'Zadejte hodnotu', input: opts, confirmLabel: opts.confirmLabel });
}

/** @returns {Promise<string|null>} text políčka (u potvrzení bez políčka '') nebo null */
function openDialog({ message, title, input, confirmLabel }) {
  return new Promise((resolve) => {
    const overlay = document.getElementById('confirm-overlay');
    const titleEl = document.getElementById('confirm-title');
    const msgEl = document.getElementById('confirm-message');
    const inputEl = document.getElementById('confirm-input');
    const yesBtn = document.getElementById('confirm-yes');
    const noBtn = document.getElementById('confirm-no');

    if (!overlay || !titleEl || !msgEl || !yesBtn || !noBtn || (input && !inputEl)) {
      console.warn('[client] Confirm modal elements missing, using native dialog');
      if (input) resolve(window.prompt(message));
      else resolve(window.confirm(message) ? '' : null);
      return;
    }

    const yesLabel = yesBtn.textContent;
    titleEl.textContent = title;
    msgEl.textContent = message;
    if (confirmLabel) yesBtn.textContent = confirmLabel;
    if (inputEl) {
      inputEl.classList.toggle('hidden', !input);
      inputEl.value = '';
      inputEl.type = input?.type ?? 'text';
      inputEl.placeholder = input?.placeholder ?? '';
    }
    overlay.classList.remove('hidden');
    if (input) inputEl.focus();

    const finish = (result) => {
      overlay.classList.add('hidden');
      yesBtn.textContent = yesLabel;
      if (inputEl) inputEl.value = '';
      yesBtn.removeEventListener('click', handleYes);
      noBtn.removeEventListener('click', handleNo);
      document.removeEventListener('keydown', handleKey, true);
      resolve(result);
    };

    const handleYes = () => finish(input ? inputEl.value : '');
    const handleNo = () => finish(null);
    // Enter potvrdí, Escape zruší — jako u nativního dialogu
    const handleKey = (e) => {
      if (e.key === 'Enter' && input && document.activeElement === inputEl) { e.preventDefault(); handleYes(); }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); handleNo(); }
    };

    yesBtn.addEventListener('click', handleYes);
    noBtn.addEventListener('click', handleNo);
    document.addEventListener('keydown', handleKey, true);
  });
}
