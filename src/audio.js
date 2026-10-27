// Synthesized sound effects (Web Audio API): no asset files to load or license.
// Browsers only allow audio after a user gesture, so the context starts on the first click or key.

const LOW_HEALTH = 30;

export class SoundManager {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.volume = 0.7;
    this.muted = false;
    this._noise = null;
    this._nextBeat = 0;

    const unlock = () => {
      this._ensureContext();
      if (this.ctx?.state === 'suspended') this.ctx.resume();
    };
    window.addEventListener('pointerdown', unlock, { capture: true });
    window.addEventListener('keydown', unlock, { capture: true });
  }

  _ensureContext() {
    if (this.ctx) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.connect(this.ctx.destination);
    this._applyGain();

    // One second of white noise, reused for every noisy sound
    const buffer = this.ctx.createBuffer(1, this.ctx.sampleRate, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    this._noise = buffer;
  }

  _applyGain() {
    if (!this.master) return;
    // Scheduled setValueAtTime calls lag a step behind when changed rapidly (slider drags); set it directly
    this.master.gain.cancelScheduledValues(0);
    this.master.gain.value = this.muted ? 0 : this.volume;
  }

  setVolume(volume, muted) {
    this.volume = Math.min(1, Math.max(0, volume));
    this.muted = Boolean(muted);
    this._applyGain();
  }

  get _ready() {
    return this.ctx && this.ctx.state === 'running' && !this.muted && this.volume > 0;
  }

  // A single oscillator note with a fast attack and exponential decay, optionally gliding in pitch
  _tone(type, freq, start, duration, peak, endFreq = freq) {
    const t = this.ctx.currentTime + start;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (endFreq !== freq) osc.frequency.exponentialRampToValueAtTime(endFreq, t + duration);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(peak, t + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(gain).connect(this.master);
    osc.start(t);
    osc.stop(t + duration + 0.02);
  }

  // A filtered burst of noise (thuds, ticks, buzzes)
  _noiseBurst(filterType, frequency, start, duration, peak) {
    const t = this.ctx.currentTime + start;
    const src = this.ctx.createBufferSource();
    src.buffer = this._noise;
    const filter = this.ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.value = frequency;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(peak, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    src.connect(filter).connect(gain).connect(this.master);
    src.start(t, Math.random() * 0.5);
    src.stop(t + duration + 0.02);
  }

  // ── Lobby ──────────────────────────────────────────────────────────────────
  uiClick() {
    if (!this._ready) return;
    this._tone('triangle', 1100, 0, 0.05, 0.12, 750);
  }

  purchase() {
    if (!this._ready) return;
    this._tone('square', 988, 0, 0.09, 0.08);
    this._tone('square', 1319, 0.08, 0.22, 0.08);
  }

  cantAfford() {
    if (!this._ready) return;
    this._tone('sawtooth', 160, 0, 0.18, 0.08, 120);
  }

  questReward() {
    if (!this._ready) return;
    [523, 659, 784, 1047].forEach((freq, i) => this._tone('triangle', freq, i * 0.07, i === 3 ? 0.35 : 0.12, 0.14));
  }

  // ── Hit confirmation ───────────────────────────────────────────────────────
  /** Short confirmation when your spell lands, flavoured by the spell so each wand sounds different. */
  hitConfirm(spell = 'fire') {
    if (!this._ready) return;
    switch (spell) {
      case 'ice': // crystal chime
        this._tone('sine', 2093, 0, 0.16, 0.12);
        this._tone('sine', 3136, 0.015, 0.12, 0.07);
        break;
      case 'lightning': // electric zap
        this._tone('sawtooth', 1900, 0, 0.07, 0.07, 320);
        this._noiseBurst('highpass', 6000, 0, 0.05, 0.1);
        break;
      case 'air': // soft whoosh puff
        this._noiseBurst('bandpass', 1400, 0, 0.12, 0.22);
        this._tone('sine', 900, 0, 0.08, 0.06, 1400);
        break;
      case 'earth': // stony clack
        this._tone('square', 240, 0, 0.07, 0.1, 130);
        this._noiseBurst('lowpass', 900, 0, 0.06, 0.25);
        break;
      default: // fire: crackly pop
        this._tone('triangle', 650, 0, 0.06, 0.12, 1250);
        this._noiseBurst('bandpass', 2600, 0, 0.05, 0.18);
    }
  }

  kill() {
    if (!this._ready) return;
    this._tone('sine', 880, 0, 0.16, 0.22);
    this._tone('sine', 1320, 0.09, 0.32, 0.22);
    this._tone('triangle', 220, 0, 0.2, 0.12, 110);
  }

  /** Fanfare for multi-kills and streaks: a rising arpeggio that climbs higher with `level` (1–4). */
  streak(level = 1) {
    if (!this._ready) return;
    const notes = [523, 659, 784, 1047, 1319, 1568].slice(0, 2 + Math.min(4, Math.max(1, level)));
    notes.forEach((freq, i) => {
      const last = i === notes.length - 1;
      this._tone('square', freq, i * 0.065, last ? 0.42 : 0.1, 0.07);
      this._tone('triangle', freq * 2, i * 0.065, last ? 0.36 : 0.08, 0.05);
    });
    this._noiseBurst('highpass', 7000, notes.length * 0.065 - 0.065, 0.3, 0.05);
  }

  /** Shimmering chime when the ultimate meter fills. */
  ultReady() {
    if (!this._ready) return;
    [784, 988, 1175, 1568].forEach((freq, i) => this._tone('sine', freq, i * 0.05, 0.5, 0.09));
    this._noiseBurst('highpass', 8000, 0.15, 0.4, 0.04);
  }

  /** Deep boom with a bright crack on top, for casting an ultimate (or a meteor landing). */
  ultBlast() {
    if (!this._ready) return;
    this._tone('sine', 110, 0, 0.7, 0.5, 38);
    this._tone('sawtooth', 220, 0, 0.25, 0.08, 70);
    this._noiseBurst('lowpass', 1200, 0, 0.5, 0.4);
    this._noiseBurst('highpass', 5000, 0, 0.12, 0.12);
  }

  /** Low descending tone when you go down. */
  death() {
    if (!this._ready) return;
    this._tone('triangle', 392, 0, 0.3, 0.16, 196);
    this._tone('sine', 196, 0.18, 0.55, 0.2, 98);
  }

  // ── Taking damage ──────────────────────────────────────────────────────────
  hurt(damage = 15) {
    if (!this._ready) return;
    const weight = Math.min(1, Math.max(0.4, damage / 20));
    this._tone('sine', 150, 0, 0.18, 0.45 * weight, 55);
    this._noiseBurst('lowpass', 500, 0, 0.12, 0.35 * weight);
  }

  /** Call every frame; plays a heartbeat that speeds up as health drops below the low-health line. */
  updateHeartbeat(health, active) {
    if (!this._ready || !active || health <= 0 || health > LOW_HEALTH) {
      this._nextBeat = 0;
      return;
    }
    const now = this.ctx.currentTime;
    if (now < this._nextBeat) return;
    const urgency = 1 - health / LOW_HEALTH;
    this._tone('sine', 62, 0, 0.12, 0.5);
    this._tone('sine', 55, 0.17, 0.14, 0.38);
    this._nextBeat = now + 1.0 - urgency * 0.4;
  }
}
