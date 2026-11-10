// Procedural medieval soundtrack (WebAudio, no asset files).
// Music: D Dorian loop with a plucked lute, a breathy flute, a drone and a soft frame drum.

const BPM = 88;
const STEP = 60 / BPM / 2; // eighth note, in seconds
const LOOKAHEAD = 0.25;     // schedule this far ahead (s)
const TICK_MS = 80;

const D4 = 62;
const DORIAN = [0, 2, 3, 5, 7, 9, 10];

// Scale degree (0 = tonic, may be negative or > 6) → MIDI note, relative to `base`
function degreeToMidi(degree, base = D4) {
  const oct = Math.floor(degree / 7);
  return base + oct * 12 + DORIAN[((degree % 7) + 7) % 7];
}
const midiToHz = (m) => 440 * Math.pow(2, (m - 69) / 12);

// 8 bars: Dm | C | G | Dm | Dm | F | C | Dm   (root as scale degree)
const CHORD_ROOTS = [0, -1, 3, 0, 0, 2, -1, 0];
const ARP = [0, 2, 1, 2, 0, 2, 1, 2];
// Flute melody per bar, 8 eighth-note steps; degree 0 = D5, null = continue / rest
const MELODY = [
  [4, null, 2, null, 4, 5, 4, 2],
  [2, null, 0, null, 2, null, 1, 0],
  [1, null, 3, null, 5, null, 4, 3],
  [2, null, null, null, 0, null, null, null],
  [0, 2, 4, null, 7, null, 5, 4],
  [5, null, 4, null, 2, null, 4, null],
  [4, null, 2, null, 1, 2, 1, 0],
  [0, null, null, null, null, null, null, null],
];

export class MusicPlayer {
  constructor() {
    this.ctx = null;
    this.volume = 0.5;
    this._step = 0;
    this._nextTime = 0;
    this._timer = null;
  }

  // Called by SoundManager once the AudioContext exists; `output` is its master gain (so mute applies)
  start(ctx, output) {
    if (this.ctx) return;
    this.ctx = ctx;
    this.musicBus = ctx.createGain();
    this.musicBus.connect(output);

    // Cheap generated reverb gives the music a stone-hall feel
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this._makeImpulse(2.4, 2.6);
    this.reverbSend = ctx.createGain();
    this.reverbSend.gain.value = 0.35;
    this.reverbSend.connect(this.reverb);
    this.reverb.connect(this.musicBus);

    this._noise = this._makeNoise(1);
    this.setVolume(this.volume);

    this._startDrone();
    this._nextTime = ctx.currentTime + 0.2;
    this._timer = setInterval(() => this._schedule(), TICK_MS);
    this._schedule();
  }

  setVolume(volume) {
    this.volume = Math.min(1, Math.max(0, volume));
    if (!this.ctx) return;
    this.musicBus.gain.setTargetAtTime(this.volume * 0.6, this.ctx.currentTime, 0.05);
  }

  _makeNoise(seconds) {
    const len = Math.floor(this.ctx.sampleRate * seconds);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  _makeImpulse(seconds, decay) {
    const rate = this.ctx.sampleRate;
    const len = Math.floor(rate * seconds);
    const buf = this.ctx.createBuffer(2, len, rate);
    for (let c = 0; c < 2; c++) {
      const data = buf.getChannelData(c);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }

  _startDrone() {
    const t = this.ctx.currentTime;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 380;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.16, t + 4);
    filter.connect(gain);
    gain.connect(this.musicBus);
    gain.connect(this.reverbSend);
    // Open fifth (D2 + A2), two slightly detuned saws each for a bagpipe-ish drone
    for (const [midi, detune] of [[38, -6], [38, 7], [45, -5], [45, 6]]) {
      const osc = this.ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = midiToHz(midi);
      osc.detune.value = detune;
      osc.connect(filter);
      osc.start(t);
    }
  }

  _schedule() {
    if (!this.ctx) return;
    while (this._nextTime < this.ctx.currentTime + LOOKAHEAD) {
      this._playStep(this._step, this._nextTime);
      this._step = (this._step + 1) % (MELODY.length * 8);
      this._nextTime += STEP;
    }
  }

  _playStep(step, time) {
    const bar = Math.floor(step / 8);
    const s = step % 8;
    const root = CHORD_ROOTS[bar];

    // Lute arpeggio, with the bass note struck on the downbeat
    const chord = [root, root + 2, root + 4];
    this._lute(midiToHz(degreeToMidi(chord[ARP[s]])), time, s === 0 ? 0.2 : 0.11);
    if (s === 0) this._lute(midiToHz(degreeToMidi(root - 7)), time, 0.22);
    if (s === 4) this._lute(midiToHz(degreeToMidi(root - 7 + 4)), time, 0.14);

    // Frame drum on 1 and 3, a lighter tap on the pickup
    if (s === 0) this._drum(time, 0.5);
    else if (s === 4) this._drum(time, 0.32);
    else if (s === 6) this._drum(time, 0.14);

    // Flute: hold each note until the next one starts (max 4 steps)
    const note = MELODY[bar][s];
    if (note !== null) {
      let len = 1;
      while (len < 4 && s + len < 8 && MELODY[bar][s + len] === null) len++;
      this._flute(midiToHz(degreeToMidi(note, D4 + 12)), time, len * STEP);
    }
  }

  _lute(freq, time, vol) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = freq;
    const osc2 = ctx.createOscillator();
    osc2.type = 'square';
    osc2.frequency.value = freq * 2;
    const g2 = ctx.createGain();
    g2.gain.value = 0.15;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(3200, time);
    filter.frequency.exponentialRampToValueAtTime(500, time + 0.35);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(vol, time + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 1.1);

    osc.connect(filter);
    osc2.connect(g2).connect(filter);
    filter.connect(gain);
    gain.connect(this.musicBus);
    gain.connect(this.reverbSend);
    osc.start(time); osc2.start(time);
    osc.stop(time + 1.2); osc2.stop(time + 1.2);
  }

  _flute(freq, time, dur) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq;
    const overtone = ctx.createOscillator();
    overtone.type = 'triangle';
    overtone.frequency.value = freq * 2;
    const og = ctx.createGain();
    og.gain.value = 0.12;

    // Gentle vibrato that fades in after the attack
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 5.2;
    const lfoGain = ctx.createGain();
    lfoGain.gain.setValueAtTime(0, time);
    lfoGain.gain.linearRampToValueAtTime(freq * 0.006, time + 0.25);
    lfo.connect(lfoGain);
    lfoGain.connect(osc.frequency);
    lfoGain.connect(overtone.frequency);

    // A touch of breath noise
    const breath = ctx.createBufferSource();
    breath.buffer = this._noise;
    breath.loop = true;
    const bf = ctx.createBiquadFilter();
    bf.type = 'bandpass';
    bf.frequency.value = freq * 2;
    bf.Q.value = 2;
    const bg = ctx.createGain();
    bg.gain.value = 0.02;
    breath.connect(bf).connect(bg);

    const gain = ctx.createGain();
    const end = time + dur;
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(0.13, time + 0.06);
    gain.gain.setValueAtTime(0.1, Math.max(time + 0.07, end - 0.1));
    gain.gain.linearRampToValueAtTime(0.0001, end + 0.12);

    osc.connect(gain);
    overtone.connect(og).connect(gain);
    bg.connect(gain);
    gain.connect(this.musicBus);
    gain.connect(this.reverbSend);
    for (const n of [osc, overtone, lfo, breath]) { n.start(time); n.stop(end + 0.15); }
  }

  _drum(time, vol) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(130, time);
    osc.frequency.exponentialRampToValueAtTime(55, time + 0.18);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol * 0.55, time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.35);
    osc.connect(gain);
    gain.connect(this.musicBus);
    gain.connect(this.reverbSend);
    osc.start(time);
    osc.stop(time + 0.4);
  }
}
