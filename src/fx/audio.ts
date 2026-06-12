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

  constructor() {
    // Arm on the first gesture of any kind — then the bed fades in.
    const arm = () => {
      this.ensure();
      void this.ctx?.resume();
      if (this.wanted) this.fadeBed(0.13, 2.5);
      this.armed = true;
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
    this.fadeBed(this.wanted ? 0.13 : 0.0001, this.wanted ? 1.2 : 0.6);
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
}
