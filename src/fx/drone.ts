/**
 * Ritual drone: an entirely synthesized ambient hum (WebAudio, zero
 * audio assets). Two detuned low oscillators under a slow-breathing
 * lowpass filter. Off by default; the visitor opts in.
 */

export class Drone {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private lfo: OscillatorNode | null = null;
  private active = false;

  get isActive(): boolean {
    return this.active;
  }

  /** Toggles the drone; returns the new state. */
  toggle(): boolean {
    this.active ? this.stop() : this.start();
    return this.active;
  }

  private start(): void {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.build(this.ctx);
    }
    void this.ctx.resume();
    const now = this.ctx.currentTime;
    this.master!.gain.cancelScheduledValues(now);
    this.master!.gain.setValueAtTime(this.master!.gain.value, now);
    this.master!.gain.linearRampToValueAtTime(0.14, now + 2.5);
    this.active = true;
  }

  private stop(): void {
    if (!this.ctx || !this.master) return;
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(this.master.gain.value, now);
    this.master.gain.linearRampToValueAtTime(0.0001, now + 1.2);
    this.active = false;
  }

  /** A brief swell during the eclipse — the mountain inhales. */
  surge(): void {
    if (!this.ctx || !this.master || !this.active) return;
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(this.master.gain.value, now);
    this.master.gain.linearRampToValueAtTime(0.26, now + 1.5);
    this.master.gain.linearRampToValueAtTime(0.14, now + 6);
  }

  private build(ctx: AudioContext): void {
    this.master = ctx.createGain();
    this.master.gain.value = 0.0001;
    this.master.connect(ctx.destination);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 220;
    filter.Q.value = 2;
    filter.connect(this.master);

    // Root drone (A1) plus a slightly detuned fifth — uneasy, not pretty.
    const voices: Array<[OscillatorType, number, number]> = [
      ['sine', 55, 0],
      ['triangle', 55.4, -0.5],
      ['sine', 82.4, 1.2],
    ];
    for (const [type, freq, detune] of voices) {
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.value = freq;
      osc.detune.value = detune;
      const g = ctx.createGain();
      g.gain.value = 0.33;
      osc.connect(g);
      g.connect(filter);
      osc.start();
    }

    // Slow LFO breathes the filter open and closed (~14 s cycle).
    this.lfo = ctx.createOscillator();
    this.lfo.frequency.value = 0.07;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 90;
    this.lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);
    this.lfo.start();
  }
}
