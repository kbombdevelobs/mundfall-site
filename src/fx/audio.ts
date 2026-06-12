/**
 * Space-age audio — fully synthesized (WebAudio, zero audio assets).
 *
 * A deep, evolving synth bed: a wide detuned pad through a slow-sweeping
 * filter and a spacious feedback delay, a pulsing sub "thrum", and an airy
 * shimmer, all drifting through a slow chord progression. No rhythm, no
 * march — just cinematic space. Gritty impact booms ride on top.
 *
 * Sound is ON by default; the autoplay gate keeps the context suspended until
 * the first gesture, then the bed swells in.
 */

const midiFreq = (m: number): number => 440 * Math.pow(2, (m - 69) / 12);

// Slow, open progression (MIDI roots): D2 · F2 · C2 · G2.
const ROOTS = [38, 41, 36, 43];
// Pad voice offsets above the root (root, fifth, octave, +12th, two octaves).
const PAD_OFFSETS = [0, 7, 12, 19, 24];

export class BattleAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private music: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private wanted = true;
  private armed = false;
  private lastSfx = 0;

  // Evolving voices, retuned on each chord change.
  private padOscs: Array<{ osc: OscillatorNode; off: number }> = [];
  private thrumOsc: OscillatorNode | null = null;
  private shimmerOsc: OscillatorNode | null = null;
  private chordTimer: number | null = null;
  private chordIndex = 0;

  constructor() {
    const arm = () => {
      this.ensure();
      void this.ctx?.resume();
      this.armed = true;
      if (this.wanted) this.startMusic();
      window.removeEventListener('pointerdown', arm);
      window.removeEventListener('pointermove', arm);
      window.removeEventListener('keydown', arm);
    };
    window.addEventListener('pointerdown', arm);
    window.addEventListener('pointermove', arm);
    window.addEventListener('keydown', arm);
  }

  get isOn(): boolean {
    return this.wanted;
  }

  toggle(): boolean {
    this.wanted = !this.wanted;
    this.ensure();
    void this.ctx?.resume();
    if (this.wanted) this.startMusic();
    else this.stopMusic();
    return this.wanted;
  }

  // --- Combat SFX ---------------------------------------------------------

  /** Ordnance detonates on the surface — low gritty boom + debris. */
  impact(pan = 0): void {
    const ctx = this.live();
    if (!ctx) return;
    const t = ctx.currentTime;
    const out = this.panned(ctx, pan, 0.12);
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(108, t);
    osc.frequency.exponentialRampToValueAtTime(36, t + 0.42);
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.9, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    osc.connect(og).connect(out);
    osc.start(t); osc.stop(t + 0.55);

    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(2200, t);
    lp.frequency.exponentialRampToValueAtTime(280, t + 0.35);
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.6, t);
    ng.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
    src.connect(lp).connect(ng).connect(out);
    src.start(t); src.stop(t + 0.45);
  }

  // --- internals ----------------------------------------------------------

  private live(): AudioContext | null {
    if (!this.wanted || !this.armed) return null;
    const ctx = this.ensure();
    if (ctx.state !== 'running') return null;
    const now = ctx.currentTime;
    if (now - this.lastSfx < 0.012) return null;
    this.lastSfx = now;
    return ctx;
  }

  private panned(ctx: AudioContext, pan: number, gain: number): AudioNode {
    const p = ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    const g = ctx.createGain();
    g.gain.value = gain;
    p.connect(g).connect(this.master!);
    return p;
  }

  private startMusic(): void {
    const ctx = this.ensure();
    if (!this.music) return;
    const now = ctx.currentTime;
    this.music.gain.cancelScheduledValues(now);
    this.music.gain.setValueAtTime(Math.max(0.0001, this.music.gain.value), now);
    this.music.gain.linearRampToValueAtTime(0.22, now + 4);
    if (this.chordTimer === null) {
      this.chordTimer = window.setInterval(() => this.nextChord(), 11000);
    }
  }

  private stopMusic(): void {
    if (this.music && this.ctx) {
      const now = this.ctx.currentTime;
      this.music.gain.cancelScheduledValues(now);
      this.music.gain.setValueAtTime(this.music.gain.value, now);
      this.music.gain.linearRampToValueAtTime(0.0001, now + 1.5);
    }
    if (this.chordTimer !== null) {
      window.clearInterval(this.chordTimer);
      this.chordTimer = null;
    }
  }

  /** Glide every voice to the next chord over a few seconds. */
  private nextChord(): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    this.chordIndex = (this.chordIndex + 1) % ROOTS.length;
    const root = ROOTS[this.chordIndex];
    const t = ctx.currentTime;
    for (const v of this.padOscs) {
      v.osc.frequency.linearRampToValueAtTime(midiFreq(root + v.off), t + 4);
    }
    this.thrumOsc?.frequency.linearRampToValueAtTime(midiFreq(root - 12), t + 4);
    this.shimmerOsc?.frequency.linearRampToValueAtTime(midiFreq(root + 24), t + 4);
  }

  private ensure(): AudioContext {
    if (this.ctx) return this.ctx;
    const ctx = new AudioContext();
    this.ctx = ctx;

    const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    this.noiseBuffer = buf;

    this.master = ctx.createGain();
    this.master.gain.value = 0.9;
    this.master.connect(ctx.destination);

    this.music = ctx.createGain();
    this.music.gain.value = 0.0001;
    this.music.connect(this.master);

    // Spacious feedback delay for width.
    const delay = ctx.createDelay(1.0);
    delay.delayTime.value = 0.42;
    const fb = ctx.createGain();
    fb.gain.value = 0.34;
    delay.connect(fb).connect(delay);
    delay.connect(this.music);

    // Pad: detuned saws through a slowly-sweeping lowpass.
    const padFilter = ctx.createBiquadFilter();
    padFilter.type = 'lowpass';
    padFilter.frequency.value = 520;
    padFilter.Q.value = 0.6;
    padFilter.connect(this.music);
    padFilter.connect(delay);

    const filtLfo = ctx.createOscillator();
    filtLfo.frequency.value = 0.04;
    const filtDepth = ctx.createGain();
    filtDepth.gain.value = 380;
    filtLfo.connect(filtDepth).connect(padFilter.frequency);
    filtLfo.start();

    const root = ROOTS[this.chordIndex];
    for (const off of PAD_OFFSETS) {
      for (const detune of [-6, 6]) {
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.value = midiFreq(root + off);
        osc.detune.value = detune;
        const g = ctx.createGain();
        g.gain.value = off >= 24 ? 0.04 : 0.08;
        osc.connect(g).connect(padFilter);
        osc.start();
        this.padOscs.push({ osc, off });
      }
    }

    // Sub thrum: a low sine pulsing under an amplitude LFO.
    this.thrumOsc = ctx.createOscillator();
    this.thrumOsc.type = 'sine';
    this.thrumOsc.frequency.value = midiFreq(root - 12);
    const thrumAmp = ctx.createGain();
    thrumAmp.gain.value = 0.2;
    this.thrumOsc.connect(thrumAmp).connect(this.music);
    const tremLfo = ctx.createOscillator();
    tremLfo.frequency.value = 0.7;
    const tremDepth = ctx.createGain();
    tremDepth.gain.value = 0.13;
    tremLfo.connect(tremDepth).connect(thrumAmp.gain);
    this.thrumOsc.start();
    tremLfo.start();

    // Airy shimmer: a quiet high triangle with a slow detune drift.
    this.shimmerOsc = ctx.createOscillator();
    this.shimmerOsc.type = 'triangle';
    this.shimmerOsc.frequency.value = midiFreq(root + 24);
    const shimGain = ctx.createGain();
    shimGain.gain.value = 0.035;
    this.shimmerOsc.connect(shimGain).connect(this.music);
    const driftLfo = ctx.createOscillator();
    driftLfo.frequency.value = 0.06;
    const driftDepth = ctx.createGain();
    driftDepth.gain.value = 12;
    driftLfo.connect(driftDepth).connect(this.shimmerOsc.detune);
    this.shimmerOsc.start();
    driftLfo.start();

    // Faint solar-wind hiss for texture.
    const wind = ctx.createBufferSource();
    wind.buffer = buf;
    wind.loop = true;
    const wlp = ctx.createBiquadFilter();
    wlp.type = 'bandpass';
    wlp.frequency.value = 600;
    wlp.Q.value = 0.4;
    const wg = ctx.createGain();
    wg.gain.value = 0.05;
    wind.connect(wlp).connect(wg).connect(this.music);
    wind.start();

    return ctx;
  }
}
