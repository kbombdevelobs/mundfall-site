/**
 * Bombardment layer — the moon is under fire, and the fire follows you.
 *
 * Shells rain in from the dark toward wherever the cursor rests, burst with a
 * hard flash and kick up slow-rising dust. The lasting craters are burned into
 * the moon's own surface (see Moon.stampScar) so they ride the spin — this
 * layer only draws the transient violence: incoming rounds, flash, dust, sparks.
 *
 * Deliberately desaturated and weighty — artillery, not arcade.
 */
import type { BattleAudio } from './audio';

export interface MoonScreen {
  x: number;
  y: number;
  r: number;
  visible: boolean;
}

interface Shell { x: number; y: number; vx: number; vy: number; tx: number; ty: number; trail: number[]; }
interface Flash { x: number; y: number; age: number; max: number; r: number; }
interface Dust { x: number; y: number; vx: number; vy: number; age: number; max: number; r: number; }
interface Spark { x: number; y: number; vx: number; vy: number; life: number; max: number; }

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

export class Battle {
  private readonly ctx: CanvasRenderingContext2D;
  private shells: Shell[] = [];
  private flashes: Flash[] = [];
  private dust: Dust[] = [];
  private sparks: Spark[] = [];

  private px = -200;
  private py = -200;
  private pointerSeen = false;
  private lastTime = performance.now();
  private fireTimer = 0.4;
  private moon: MoonScreen = { x: 0, y: 0, r: 1, visible: false };

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly getMoon: () => MoonScreen,
    private readonly audio: BattleAudio,
    private readonly onHit: (x: number, y: number) => void,
  ) {
    this.ctx = canvas.getContext('2d')!;
    this.resize();
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('pointermove', (e) => {
      this.px = e.clientX;
      this.py = e.clientY;
      this.pointerSeen = true;
    });
    window.addEventListener('pointerdown', (e) => this.callStrike(e.clientX, e.clientY));
    requestAnimationFrame((t) => this.loop(t));
  }

  private resize(): void {
    const dpr = Math.min(window.devicePixelRatio, 2);
    this.canvas.width = window.innerWidth * dpr;
    this.canvas.height = window.innerHeight * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /** A random point on the lunar disc — the roaming siege. */
  private randomSurfacePoint(): { x: number; y: number } {
    const m = this.moon;
    const a = Math.random() * Math.PI * 2;
    const rr = Math.sqrt(Math.random()) * m.r * 0.86;
    return { x: m.x + Math.cos(a) * rr, y: m.y + Math.sin(a) * rr };
  }

  /**
   * Where the barrage is aimed. When the cursor is over the moon, fire
   * concentrates there. Off the moon (or before the visitor takes the
   * controls) it scatters across the surface — no converging lines.
   */
  private aimPoint(): { x: number; y: number } {
    const m = this.moon;
    if (!this.pointerSeen) return this.randomSurfacePoint();
    const d = Math.hypot(this.px - m.x, this.py - m.y);
    if (d > m.r * 0.92) return this.randomSurfacePoint();
    return { x: this.px, y: this.py };
  }

  /** Lob a shell in from off-screen above, toward a surface point. */
  private dropShell(tx: number, ty: number): void {
    // Rounds rain from high above with a consistent lean — a battery overhead,
    // not random fireworks. A little horizontal scatter keeps it alive.
    const ox = tx + (Math.random() - 0.5) * 120 - 60;
    const oy = ty - (window.innerHeight * 0.7 + Math.random() * 220);
    let dx = tx - ox;
    let dy = ty - oy;
    const d = Math.hypot(dx, dy) || 1;
    const speed = 1500 + Math.random() * 500;
    this.shells.push({ x: ox, y: oy, vx: (dx / d) * speed, vy: (dy / d) * speed, tx, ty, trail: [] });
  }

  /** Click: concentrate a heavier cluster on the cursor. */
  private callStrike(x: number, y: number): void {
    this.px = x; this.py = y; this.pointerSeen = true;
    if (!this.moon.visible) return;
    const aim = this.aimPoint();
    const spread = this.moon.r * 0.22;
    const n = 4 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      this.dropShell(aim.x + (Math.random() - 0.5) * spread, aim.y + (Math.random() - 0.5) * spread);
    }
  }

  private loop(now: number): void {
    const dt = Math.min((now - this.lastTime) / 1000, 0.05);
    this.lastTime = now;
    this.moon = this.getMoon();
    this.step(dt);
    this.draw();
    requestAnimationFrame((t) => this.loop(t));
  }

  private step(dt: number): void {
    // Continuous fire toward the cursor — steady, weighty, never stops.
    this.fireTimer -= dt;
    if (this.fireTimer <= 0 && this.moon.visible) {
      const aim = this.aimPoint();
      const jitter = this.moon.r * 0.12;
      this.dropShell(aim.x + (Math.random() - 0.5) * jitter, aim.y + (Math.random() - 0.5) * jitter);
      this.fireTimer = 0.22 + Math.random() * 0.22;
    }

    this.stepShells(dt);
    this.stepTimed(this.flashes, dt);
    this.stepDust(dt);
    this.stepSparks(dt);
  }

  private stepShells(dt: number): void {
    for (let i = this.shells.length - 1; i >= 0; i--) {
      const s = this.shells[i];
      s.x += s.vx * dt; s.y += s.vy * dt;
      s.trail.push(s.x, s.y);
      if (s.trail.length > 10) s.trail.splice(0, s.trail.length - 10);
      if (Math.hypot(s.tx - s.x, s.ty - s.y) < 18 || (s.vy > 0 && s.y > s.ty)) {
        this.impact(s.tx, s.ty);
        this.shells.splice(i, 1);
      }
    }
  }

  private impact(x: number, y: number): void {
    const scale = this.moon.visible ? this.moon.r : 120;
    // Hard, brief flash.
    this.flashes.push({ x, y, age: 0, max: 0.11, r: scale * 0.07 });
    // Slow-rising dust column — the lingering, cinematic part.
    for (let k = 0; k < 6; k++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.2;
      const sp = 18 + Math.random() * 46;
      this.dust.push({
        x: x + (Math.random() - 0.5) * scale * 0.1,
        y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        age: 0, max: 1.6 + Math.random() * 1.6, r: scale * (0.05 + Math.random() * 0.06),
      });
    }
    // A few dim ejecta sparks.
    for (let k = 0; k < 6; k++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 50 + Math.random() * 150;
      this.sparks.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 30, life: 0.25 + Math.random() * 0.3, max: 0.55 });
    }
    // (Rubble is spawned as real 3D rock in the scene via onHit → Stage.)
    this.audio.impact(clamp((x / window.innerWidth) * 2 - 1, -1, 1));
    this.onHit(x, y); // burns the lasting crater into the moon's surface
  }

  private stepTimed(arr: Array<{ age: number; max: number }>, dt: number): void {
    for (let i = arr.length - 1; i >= 0; i--) {
      arr[i].age += dt;
      if (arr[i].age >= arr[i].max) arr.splice(i, 1);
    }
  }

  private stepDust(dt: number): void {
    for (let i = this.dust.length - 1; i >= 0; i--) {
      const d = this.dust[i];
      d.age += dt;
      if (d.age >= d.max) { this.dust.splice(i, 1); continue; }
      d.x += d.vx * dt; d.y += d.vy * dt; d.vx *= 1 - 0.5 * dt; d.vy *= 1 - 0.4 * dt;
    }
  }

  private stepSparks(dt: number): void {
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const s = this.sparks[i];
      s.life -= dt;
      if (s.life <= 0) { this.sparks.splice(i, 1); continue; }
      s.x += s.vx * dt; s.y += s.vy * dt; s.vy += 150 * dt; s.vx *= 1 - 0.7 * dt;
    }
  }

  // --- drawing ------------------------------------------------------------

  private draw(): void {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

    // Dust is smoke — soft, opaque-ish, drawn straight.
    this.drawDust(ctx);

    ctx.globalCompositeOperation = 'lighter';
    this.drawShells(ctx);
    this.drawSparks(ctx);
    this.drawFlashes(ctx);
    ctx.globalCompositeOperation = 'source-over';

    if (this.pointerSeen) this.drawReticle(ctx);
  }

  private drawDust(ctx: CanvasRenderingContext2D): void {
    for (const d of this.dust) {
      const t = d.age / d.max;
      const r = d.r * (0.5 + t * 2.0);
      const a = (1 - t) * (1 - t) * 0.3;
      const g = ctx.createRadialGradient(d.x, d.y, 0, d.x, d.y, r);
      g.addColorStop(0, `rgba(86,82,78,${a})`);
      g.addColorStop(1, 'rgba(30,28,28,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(d.x, d.y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawShells(ctx: CanvasRenderingContext2D): void {
    ctx.lineCap = 'round';
    for (const s of this.shells) {
      // Dim, fast streak — barely warm, no glowing bullet.
      ctx.strokeStyle = 'rgba(208,198,178,0.32)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i < s.trail.length; i += 2) {
        const x = s.trail[i], y = s.trail[i + 1];
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.lineTo(s.x, s.y);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,244,222,0.55)';
      ctx.beginPath();
      ctx.arc(s.x, s.y, 1.1, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawSparks(ctx: CanvasRenderingContext2D): void {
    for (const s of this.sparks) {
      const t = s.life / s.max;
      ctx.fillStyle = `rgba(226,202,162,${t * 0.7})`;
      ctx.beginPath();
      ctx.arc(s.x, s.y, 1.0 * t + 0.3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawFlashes(ctx: CanvasRenderingContext2D): void {
    for (const f of this.flashes) {
      const t = f.age / f.max;
      const r = f.r * (0.6 + t * 0.9);
      const a = 1 - t;
      const g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, r);
      g.addColorStop(0, `rgba(255,250,238,${a})`);
      g.addColorStop(0.5, `rgba(240,214,170,${a * 0.45})`);
      g.addColorStop(1, 'rgba(200,150,90,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(f.x, f.y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /** Minimal cursor — a thin, quiet reticle marking where fire concentrates. */
  private drawReticle(ctx: CanvasRenderingContext2D): void {
    const x = this.px, y = this.py;
    ctx.strokeStyle = 'rgba(214,210,198,0.4)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(x, y, 9, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    for (const [dx, dy] of [[-14, 0], [14, 0], [0, -14], [0, 14]] as const) {
      const ux = Math.sign(dx), uy = Math.sign(dy);
      ctx.moveTo(x + ux * 4, y + uy * 4);
      ctx.lineTo(x + dx, y + dy);
    }
    ctx.stroke();
    ctx.fillStyle = 'rgba(214,210,198,0.55)';
    ctx.fillRect(x - 0.5, y - 0.5, 1, 1);
  }
}
