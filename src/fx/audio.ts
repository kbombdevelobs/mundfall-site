/**
 * Battle audio — fully synthesized (WebAudio, zero audio assets).
 * A low space-rumble bed runs continuously; combat SFX (AA fire, flak
 * bursts, missile launches, surface impacts) are fired by the battle layer.
 *
 * Sound is ON by default. Browser autoplay policy keeps the AudioContext
 * suspended until the first user gesture, so we resume on first interaction.
 */

export class BattleAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private bed: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private wanted = true; // desired on/off state ("keep the sound on")
  private armed = false; // true once a gesture has resumed the context
  private lastSfx = 0;

  // Prussian march sequencer.
  private march: GainNode | null = null;
  private marchTimer: number | null = null;
  private marchStep = 0;
  private nextStepTime = 0;
  private static readonly EIGHTH = 60 / 112 / 2; // 112 bpm march, eighth note
  // 4-bar martial motif in D minor (Hz; 0 = rest), one entry per quarter.
  private static readonly MELODY = [
    440, 440, 587.33, 440, 349.23, 440, 587.33, 0,
    440, 466.16, 440, 392, 349.23, 329.63, 293.66, 0,
  ];

  constructor() {
    // Arm on the first gesture of any kind — then the bed fades in.
    const arm = () => {
      this.ensure();
      void this.ctx?.resume();
      this.armed = true;
      if (this.wanted) {
        this.fadeBed(0.1, 2.5);
        this.startMarch();
      }
      window.removeEventListener('pointerdown', arm);
      window.removeEventListener('pointermove', arm);
      window.removeEventListener('keydown', arm);
    };
    window.addEventListener('pointerdown', arm, { once: false });
    window.addEventListener('pointermove', arm, { once: false });
    window.addEventListener('keydown', arm, { once: false });
  }

  get isOn(): boolean {
    return this.wanted;
  }

  /** UI toggle. Returns the new desired state. */
  toggle(): boolean {
    this.wanted = !this.wanted;
    this.ensure();
    void this.ctx?.resume();
    this.fadeBed(this.wanted ? 0.1 : 0.0001, this.wanted ? 1.2 : 0.6);
    if (this.wanted) this.startMarch();
    else this.stopMarch();
    return this.wanted;
  }

  // --- Combat SFX ---------------------------------------------------------

  /** A flak gun on the moon barks — short bright "pew" + tick. */
  aaFire(pan = 0): void {
    const ctx = this.live();
    if (!ctx) return;
    const t = ctx.currentTime;
    const out = this.panned(ctx, pan, 0.05);
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(680 + Math.random() * 160, t);
    osc.frequency.exponentialRampToValueAtTime(240, t + 0.09);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.5, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.11);
    osc.connect(g).connect(out);
    osc.start(t);
    osc.stop(t + 0.13);
  }

  /** Flak shell detonates near the lander — filtered noise pop. */
  flak(pan = 0): void {
    const ctx = this.live();
    if (!ctx) return;
    const t = ctx.currentTime;
    const out = this.panned(ctx, pan, 0.06);
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 900 + Math.random() * 500;
    bp.Q.value = 0.8;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.5, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    src.connect(bp).connect(g).connect(out);
    src.start(t);
    src.stop(t + 0.2);
  }

  /** Player launches ordnance toward the moon — descending whoosh. */
  launch(): void {
    const ctx = this.live();
    if (!ctx) return;
    const t = ctx.currentTime;
    const out = this.panned(ctx, 0, 0.07);
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(420, t);
    osc.frequency.exponentialRampToValueAtTime(110, t + 0.26);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1400;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.6, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    osc.connect(lp).connect(g).connect(out);
    osc.start(t);
    osc.stop(t + 0.32);
  }

  /** Ordnance detonates on the lunar surface — low boom + debris. */
  impact(pan = 0): void {
    const ctx = this.live();
    if (!ctx) return;
    const t = ctx.currentTime;
    const out = this.panned(ctx, pan, 0.13);
    // Low thump
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(110, t);
    osc.frequency.exponentialRampToValueAtTime(38, t + 0.4);
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.9, t);
    og.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
    osc.connect(og).connect(out);
    osc.start(t);
    osc.stop(t + 0.55);
    // Debris noise
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(2200, t);
    lp.frequency.exponentialRampToValueAtTime(300, t + 0.35);
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.6, t);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
    src.connect(lp).connect(ng).connect(out);
    src.start(t);
    src.stop(t + 0.45);
  }

  // --- internals ----------------------------------------------------------

  /** Returns the context only if we should actually be making combat noise. */
  private live(): AudioContext | null {
    if (!this.wanted || !this.armed) return null;
    const ctx = this.ensure();
    if (ctx.state !== 'running') return null;
    // Soft global rate limit so dense combat doesn't turn into mush.
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

  private fadeBed(to: number, seconds: number): void {
    if (!this.ctx || !this.bed) return;
    const now = this.ctx.currentTime;
    this.bed.gain.cancelScheduledValues(now);
    this.bed.gain.setValueAtTime(Math.max(0.0001, this.bed.gain.value), now);
    this.bed.gain.linearRampToValueAtTime(Math.max(0.0001, to), now + seconds);
  }

  private ensure(): AudioContext {
    if (this.ctx) return this.ctx;
    const ctx = new AudioContext();
    this.ctx = ctx;

    // Reusable white-noise buffer (1s) for all percussive SFX.
    const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    this.noiseBuffer = buf;

    this.master = ctx.createGain();
    this.master.gain.value = 0.9;
    this.master.connect(ctx.destination);

    // Bus for the march, sat just under the SFX.
    this.march = ctx.createGain();
    this.march.gain.value = 0.0001;
    this.march.connect(this.master);

    // --- Continuous low space rumble bed ---
    this.bed = ctx.createGain();
    this.bed.gain.value = 0.0001;
    this.bed.connect(this.master);

    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 180;
    lp.Q.value = 1.4;
    lp.connect(this.bed);

    const drones: Array<[OscillatorType, number]> = [
      ['sine', 40],
      ['sine', 60.3],
      ['triangle', 80.5],
    ];
    for (const [type, freq] of drones) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.value = 0.3;
      o.connect(g).connect(lp);
      o.start();
    }

    // Filtered noise "solar wind" layered under the drones.
    const wind = ctx.createBufferSource();
    wind.buffer = buf;
    wind.loop = true;
    const wlp = ctx.createBiquadFilter();
    wlp.type = 'lowpass';
    wlp.frequency.value = 110;
    const wg = ctx.createGain();
    wg.gain.value = 0.18;
    wind.connect(wlp).connect(wg).connect(this.bed);
    wind.start();

    // Slow LFO breathes the bed filter open and closed.
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.05;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 70;
    lfo.connect(lfoGain).connect(lp.frequency);
    lfo.start();

    return ctx;
  }

  // --- Prussian march -----------------------------------------------------

  private startMarch(): void {
    const ctx = this.ensure();
    if (!this.march) return;
    const now = ctx.currentTime;
    this.march.gain.cancelScheduledValues(now);
    this.march.gain.setValueAtTime(Math.max(0.0001, this.march.gain.value), now);
    this.march.gain.linearRampToValueAtTime(0.5, now + 1.5);
    // Start the scheduler even if the context is still resuming — pumpMarch
    // waits for 'running' before it lays down any notes.
    if (this.marchTimer !== null) return;
    this.nextStepTime = now + 0.12;
    this.marchTimer = window.setInterval(() => this.pumpMarch(), 25);
  }

  private stopMarch(): void {
    if (this.march && this.ctx) {
      const now = this.ctx.currentTime;
      this.march.gain.cancelScheduledValues(now);
      this.march.gain.setValueAtTime(this.march.gain.value, now);
      this.march.gain.linearRampToValueAtTime(0.0001, now + 0.5);
    }
    if (this.marchTimer !== null) {
      window.clearInterval(this.marchTimer);
      this.marchTimer = null;
    }
  }

  /** Schedule march steps a little ahead of the audio clock. */
  private pumpMarch(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    if (ctx.state !== 'running') {
      // Hold the cursor at the clock until the context actually starts.
      this.nextStepTime = ctx.currentTime + 0.12;
      return;
    }
    while (this.nextStepTime < ctx.currentTime + 0.15) {
      this.scheduleStep(this.marchStep, this.nextStepTime);
      this.marchStep = (this.marchStep + 1) % 32; // 4 bars × 8 eighths
      this.nextStepTime += BattleAudio.EIGHTH;
    }
  }

  private scheduleStep(step: number, t: number): void {
    const beat = step % 8;
    if (beat === 0 || beat === 4) { this.kick(t); this.oom(t, beat === 0 ? 73.42 : 110.0); }
    if (beat === 2 || beat === 6) { this.snare(t); this.pah(t); }
    if (beat === 7) this.snare(t, 0.3); // pickup roll into the downbeat
    if (step % 2 === 0) {
      const freq = BattleAudio.MELODY[(step / 2) % 16];
      if (freq) this.brass(t, freq);
    }
  }

  private kick(t: number): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(46, t + 0.16);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.9, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    o.connect(g).connect(this.march!);
    o.start(t); o.stop(t + 0.22);
  }

  private snare(t: number, level = 0.5): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 1400;
    const g = ctx.createGain();
    g.gain.setValueAtTime(level, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.13);
    src.connect(hp).connect(g).connect(this.march!);
    src.start(t); src.stop(t + 0.15);
  }

  private oom(t: number, freq: number): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = freq;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 360;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.5, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    o.connect(lp).connect(g).connect(this.march!);
    o.start(t); o.stop(t + 0.22);
  }

  private pah(t: number): void {
    const ctx = this.ctx!;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1100;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.26, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    lp.connect(g).connect(this.march!);
    for (const f of [293.66, 349.23, 440]) { // D minor stab
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      o.connect(lp);
      o.start(t); o.stop(t + 0.18);
    }
  }

  private brass(t: number, freq: number): void {
    const ctx = this.ctx!;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(1500, t);
    lp.frequency.linearRampToValueAtTime(2400, t + 0.05);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.3, t + 0.03);
    g.gain.setValueAtTime(0.3, t + 0.22);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.42);
    lp.connect(g).connect(this.march!);
    for (const detune of [-7, 7]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = freq;
      o.detune.value = detune;
      o.connect(lp);
      o.start(t); o.stop(t + 0.44);
    }
  }
}
