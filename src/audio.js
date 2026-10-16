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
  hitConfirm() {
    if (!this._ready) return;
    this._tone('square', 2200, 0, 0.04, 0.07, 1500);
    this._noiseBurst('highpass', 5000, 0, 0.03, 0.12);
  }

  kill() {
    if (!this._ready) return;
    this._tone('sine', 880, 0, 0.16, 0.22);
    this._tone('sine', 1320, 0.09, 0.32, 0.22);
    this._tone('triangle', 220, 0, 0.2, 0.12, 110);
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
