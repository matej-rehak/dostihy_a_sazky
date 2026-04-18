export const audioManager = {
  muted: false,
  sounds: {},

  init() {
    this.muted = localStorage.getItem('ds_muted') === 'true';
    this.audioContext = null;
    
    // Zapnout Web Audio API na první kliknutí
    const initSynth = () => {
      if (!this.audioContext) this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      document.removeEventListener('click', initSynth);
    };
    document.addEventListener('click', initSynth);

    this.updateIcon();

    // Registrace zvuků. Očekáváme fyzické MP3 soubory ve složce public/sounds/
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

    // Prémiové "Game Juice" detaily:
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
    if (!this.audioContext || this.muted) return;
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
    gain.gain.linearRampToValueAtTime(0.3 * vol, time + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.08);

    osc.start(time);
    osc.stop(time + 0.1);
  },

  play(name, volume = 1.0) {
    if (this.muted) return;
    
    if (name === 'step') {
      this._playSynthStep(volume);
      return;
    }

    const a = this.sounds[name];
    if (!a) return;

    // Klonování Node umožňuje přehrávat stejný zvuk vícekrát přes sebe (bez čekání na dokončení)
    const clone = a.cloneNode();
    clone.volume = volume;

    // Potlačení chybových hlášek, pokud .mp3 chybí na disku
    clone.play().catch(err => { });
  },

  toggleMute() {
    this.muted = !this.muted;
    localStorage.setItem('ds_muted', this.muted);
    this.updateIcon();
    if (!this.muted) {
      this.play('click');
    }
  },

  updateIcon() {
    const els = document.querySelectorAll('.audio-toggle-icon');
    els.forEach(el => {
      el.textContent = this.muted ? '🔇' : '🔊';
    });
  }
};

window.toggleGameAudio = () => audioManager.toggleMute();
