export const audioManager = {
  sfxVolume: 1,
  musicVolume: 0.5,
  sounds: {},
  musicAudio: null,

  init() {
    const storedSfx = localStorage.getItem('ds_sfx_volume');
    const storedMusic = localStorage.getItem('ds_music_volume');

    this.sfxVolume = storedSfx !== null ? this._clamp01(Number(storedSfx)) : 1;
    this.musicVolume = storedMusic !== null ? this._clamp01(Number(storedMusic)) : 0.5;

    this.audioContext = null;

    // Zapnout Web Audio API na první kliknutí
    const initSynth = () => {
      if (!this.audioContext) this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      document.removeEventListener('click', initSynth);
    };
    document.addEventListener('click', initSynth);

    this.updateVolumeUi();

    // Registrace zvuků.
    this.load('click', '/sounds/click.mp3');
    this.load('roll', '/sounds/roll.mp3');
    this.load('step', '/sounds/step.mp3');
    this.load('cash', '/sounds/cash.mp3');
    this.load('jail', '/sounds/jail.mp3');
    this.load('card', '/sounds/card.mp3');
    this.load('bell', '/sounds/bell.mp3');
    this.load('win', '/sounds/win.mp3');
    this.load('bankrupt', '/sounds/bankrupt.mp3');
    this.load('buzzer', '/sounds/buzzer.mp3');
    this.load('buy', '/sounds/buy.mp3');

    // Prémiové detaily
    this.load('join', '/sounds/join.mp3');
    this.load('leave', '/sounds/leave.mp3');
    this.load('trade_offer', '/sounds/trade_offer.mp3');
    this.load('trade_accept', '/sounds/trade_accept.mp3');
    this.load('trade_reject', '/sounds/trade_reject.mp3');
    this.load('start_bonus', '/sounds/start_bonus.mp3');
    this.load('pay_rent', '/sounds/pay_rent.mp3');
    this.load('upgrade_star', '/sounds/upgrade_star.mp3');
  },

  load(name, src) {
    const a = new Audio();
    a.src = src;
    a.preload = 'auto'; // Prohlížeč si to natáhne na pozadí do cache
    this.sounds[name] = a;
  },

  _playSynthStep(vol = 1.0) {
    if (!this.audioContext || this.sfxVolume <= 0) return;
    const ctx = this.audioContext;
    const time = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, time);
    osc.frequency.exponentialRampToValueAtTime(50, time + 0.05);

    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(0.3 * vol * this.sfxVolume, time + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.08);

    osc.start(time);
    osc.stop(time + 0.1);
  },

  play(name, volume = 1.0) {
    if (this.sfxVolume <= 0) return;

    if (name === 'step') {
      this._playSynthStep(volume);
      return;
    }

    const a = this.sounds[name];
    if (!a) return;

    // Klonování Node umožňuje přehrávat stejný zvuk vícekrát přes sebe
    const clone = a.cloneNode();
    clone.volume = this._clamp01(volume * this.sfxVolume);
    if (clone.volume <= 0) return;

    clone.play().catch(err => { });
  },

  _clamp01(v) {
    if (!Number.isFinite(v)) return 1;
    if (v < 0) return 0;
    if (v > 1) return 1;
    return v;
  },

  setSfxVolume(normalized) {
    this.sfxVolume = this._clamp01(normalized);
    localStorage.setItem('ds_sfx_volume', String(this.sfxVolume));
    this.updateVolumeUi();
    this.play('click', 0.5);
  },

  setMusicVolume(normalized) {
    this.musicVolume = this._clamp01(normalized);
    localStorage.setItem('ds_music_volume', String(this.musicVolume));
    this.updateVolumeUi();

    if (this.musicAudio) {
      this.musicAudio.volume = this.musicVolume;
    }
  },

  updateVolumeUi() {
    const sfxPct = Math.round(this.sfxVolume * 100);
    const musicPct = Math.round(this.musicVolume * 100);

    const sfxRange = document.getElementById('sfx-volume');
    const sfxLabel = document.getElementById('sfx-vol-val');
    if (sfxRange) sfxRange.value = String(sfxPct);
    if (sfxLabel) sfxLabel.textContent = `${sfxPct}%`;

    const musicRange = document.getElementById('music-volume');
    const musicLabel = document.getElementById('music-vol-val');
    if (musicRange) musicRange.value = String(musicPct);
    if (musicLabel) musicLabel.textContent = `${musicPct}%`;
  }
};

window.setSfxVolume = value => audioManager.setSfxVolume(Number(value) / 100);
window.setMusicVolume = value => audioManager.setMusicVolume(Number(value) / 100);

window.toggleSettingsModal = () => {
  const panel = document.getElementById('settings-overlay');
  if (panel) panel.classList.toggle('hidden');
};

window.toggleFullscreen = () => {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(err => {
      console.log(`Error attempting to enable fullscreen: ${err.message}`);
    });
  } else {
    document.exitFullscreen();
  }
};
