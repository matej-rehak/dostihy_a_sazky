/**
 * Custom replacement for window.confirm() that respects application design.
 * @param {string} message The message to display
 * @param {string} title The title of the dialog
 * @returns {Promise<boolean>} Resolves to true if confirmed, false otherwise
 */
export function confirmDialog(message, title = 'Potvrzení') {
  return new Promise((resolve) => {
    const overlay = document.getElementById('confirm-overlay');
    const titleEl = document.getElementById('confirm-title');
    const msgEl = document.getElementById('confirm-message');
    const yesBtn = document.getElementById('confirm-yes');
    const noBtn = document.getElementById('confirm-no');

    if (!overlay || !titleEl || !msgEl || !yesBtn || !noBtn) {
      console.warn('[client] Confirm modal elements missing, using native confirm');
      resolve(window.confirm(message));
      return;
    }

    titleEl.textContent = title;
    msgEl.textContent = message;
    overlay.classList.remove('hidden');

    const handleYes = () => {
      cleanup();
      resolve(true);
    };

    const handleNo = () => {
      cleanup();
      resolve(false);
    };

    const cleanup = () => {
      overlay.classList.add('hidden');
      yesBtn.removeEventListener('click', handleYes);
      noBtn.removeEventListener('click', handleNo);
    };

    yesBtn.addEventListener('click', handleYes);
    noBtn.addEventListener('click', handleNo);
  });
}
