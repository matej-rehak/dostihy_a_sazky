'use strict';

const SECTION = {
  action:  'action-section',
  players: 'players-section',
  log:     'log-section',
};

export function initMobileTabs() {
  document.querySelectorAll('.mobile-tab').forEach(btn => {
    btn.addEventListener('click', () => switchMobileTab(btn.dataset.tab));
  });
  switchMobileTab('action');
}

export function switchMobileTab(name) {
  if (!SECTION[name]) return;

  document.querySelectorAll('.mobile-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === name);
  });

  Object.entries(SECTION).forEach(([key, id]) => {
    document.getElementById(id)?.classList.toggle('tab-visible', key === name);
  });
}

// Voláno z main.js když přijde tah na aktuálního hráče
export function autoSwitchToAction() {
  if (window.innerWidth > 768) return;
  switchMobileTab('action');
}
