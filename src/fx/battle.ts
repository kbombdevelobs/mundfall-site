/**
 * Bombardment layer — the moon is under fire.
 *
 * Shells fall in from the dark, streak toward the lunar surface and burst
 * into dust, smoke and soot that ride the moon as it turns. It runs on its
 * own ambiently so the siege never stops; clicking calls a strike down
 * where you point. Deliberately low-key and desaturated — grit, not arcade.
 *
 * 2D canvas layered over the Three.js moon. Reads the moon's on-screen
 * circle each frame so impacts land on the real geometry.
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
interface Dust { x: number; y: number; age: number; max: number; r: number; }
interface Smoke { x: number; y: number; vx: number; vy: number; age: number; max: number; r: number; }
interface Spark { x: number; y: number; vx: number; vy: number; life: number; max: number; }
/** Soot stored in unit-circle space so it rides the moon's spin, then fades. */
interface Soot { ox: number; oy: number; age: number; max: number; r: number; }

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

export class Battle {
  private readonly ctx: CanvasRenderingContext2D;
  private shells: Shell[] = [];
  private flashes: Flash[] = [];
  private dust: Dust[] = [];
  private smoke: Smoke[] = [];
  private sparks: Spark[] = [];
  private soot: Soot[] = [];

  private px = -100;
  private py = -100;
  private pointerSeen = false;
  private lastTime = performance.now();
  private salvoTimer = 1.2;
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

  /** Pick a target point on the visible (lit) half of the disc. */
  private surfacePoint(biasX: number, biasY: number): { x: number; y: number } {
    const m = this.moon;
    // Random point inside the disc, nudged toward the bias direction.
    const a = Math.random() * Math.PI * 2;
    const rr = Math.sqrt(Math.random()) * m.r * 0.92;
    let x = m.x + Math.cos(a) * rr;
    let y = m.y + Math.sin(a) * rr;
    x = x * 0.7 + biasX * 0.3;
    y = y * 0.7 + biasY * 0.3;
    // Clamp back inside the disc.
    const dx = x - m.x, dy = y - m.y;
    const d = Math.hypot(dx, dy);
    if (d > m.r * 0.92) {
      x = m.x + (dx / d) * m.r * 0.92;
      y = m.y + (dy / d) * m.r * 0.92;
    }
    return { x, y };
  }

  /** Launch a shell from off-screen toward a surface point. */
  private dropShell(tx: number, ty: number): void {
    // Origin: above and to one side, off-screen, so it streaks down/in.
    const side = Math.random() < 0.5 ? -1 : 1;
    const ox = tx + side * (200 + Math.random() * 380);
    const oy = ty - (window.innerHeight * 0.6 + Math.random() * 260);
    let dx = tx - ox, dy = ty - oy;
    const d = Math.hypot(dx, dy) || 1;
    dx /= d; dy /= d;
    const speed = 1100 + Math.random() * 500;
    this.shells.push({ x: ox, y: oy, vx: dx * speed, vy: dy * speed, tx, ty, trail: [] });
  }

  private callStrike(x: number, y: number): void {
    this.px = x; this.py = y; this.pointerSeen = true;
    if (!this.moon.visible) return;
    // Aim a tight cluster around the cursor, pulled onto the disc.
    const m = this.moon;
    let dx = x - m.x, dy = y - m.y;
    const d = Math.hypot(dx, dy) || 1;
    const rr = Math.min(d, m.r * 0.9);
    const cx = m.x + (dx / d) * rr;
    const cy = m.y + (dy / d) * rr;
    const n = 2 + Math.floor(Math.random() * 2);
    for (let i = 0; i < n; i++) {
      this.dropShell(cx + (Math.random() - 0.5) * m.r * 0.3, cy + (Math.random() - 0.5) * m.r * 0.3);
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
    // Ambient salvos — sparse, irregular, cinematic. The siege never stops.
    this.salvoTimer -= dt;
    if (this.salvoTimer <= 0 && this.moon.visible) {
      const p = this.surfacePoint(this.moon.x, this.moon.y);
      this.dropShell(p.x, p.y);
      if (Math.random() < 0.35) {
        const q = this.surfacePoint(this.moon.x, this.moon.y);
        this.dropShell(q.x, q.y);
      }
      this.salvoTimer = 0.5 + Math.random() * 1.3;
    }

    this.stepShells(dt);
    this.stepTimed(this.flashes, dt);
    this.stepTimed(this.dust, dt);
    this.stepSmoke(dt);
    this.stepSparks(dt);
    this.stepTimed(this.soot, dt);
  }

  private stepShells(dt: number): void {
    for (let i = this.shells.length - 1; i >= 0; i--) {
      const s = this.shells[i];
      s.x += s.vx * dt; s.y += s.vy * dt;
      s.trail.push(s.x, s.y);
      if (s.trail.length > 14) s.trail.splice(0, s.trail.length - 14);
      if (Math.hypot(s.tx - s.x, s.ty - s.y) < 16 || (s.vy > 0 && s.y > s.ty)) {
        this.impact(s.tx, s.ty);
        this.shells.splice(i, 1);
      }
    }
  }

  private impact(x: number, y: number): void {
    const m = this.moon;
    const scale = m.visible ? m.r : 120;
    this.flashes.push({ x, y, age: 0, max: 0.16, r: scale * 0.12 });
    this.dust.push({ x, y, age: 0, max: 0.9, r: scale * 0.22 });
    for (let k = 0; k < 5; k++) {
      this.smoke.push({
        x, y, vx: (Math.random() - 0.5) * 26, vy: -10 - Math.random() * 22,
        age: 0, max: 1.6 + Math.random() * 1.4, r: scale * (0.08 + Math.random() * 0.08),
      });
    }
    for (let k = 0; k < 10; k++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 70 + Math.random() * 200;
      this.sparks.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 30, life: 0.3 + Math.random() * 0.4, max: 0.7 });
    }
    if (m.visible) {
      this.soot.push({ ox: (x - m.x) / m.r, oy: (y - m.y) / m.r, age: 0, max: 9, r: 0.1 + Math.random() * 0.05 });
      if (this.soot.length > 26) this.soot.shift();
    }
    this.audio.impact(clamp((x / window.innerWidth) * 2 - 1, -1, 1));
    this.onHit(x, y);
  }

  private stepTimed(arr: Array<{ age: number; max: number }>, dt: number): void {
    for (let i = arr.length - 1; i >= 0; i--) {
      arr[i].age += dt;
      if (arr[i].age >= arr[i].max) arr.splice(i, 1);
    }
  }

  private stepSmoke(dt: number): void {
    for (let i = this.smoke.length - 1; i >= 0; i--) {
      const s = this.smoke[i];
      s.age += dt;
      if (s.age >= s.max) { this.smoke.splice(i, 1); continue; }
      s.x += s.vx * dt; s.y += s.vy * dt; s.vx *= 1 - 0.5 * dt; s.vy *= 1 - 0.3 * dt;
    }
  }

  private stepSparks(dt: number): void {
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const s = this.sparks[i];
      s.life -= dt;
      if (s.life <= 0) { this.sparks.splice(i, 1); continue; }
      s.x += s.vx * dt; s.y += s.vy * dt; s.vy += 140 * dt; s.vx *= 1 - 0.7 * dt;
    }
  }

  // --- drawing ------------------------------------------------------------

  private draw(): void {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

    this.drawSoot(ctx);
    this.drawSmoke(ctx);

    ctx.globalCompositeOperation = 'lighter';
    this.drawDust(ctx);
    this.drawShells(ctx);
    this.drawSparks(ctx);
    this.drawFlashes(ctx);
    ctx.globalCompositeOperation = 'source-over';

    if (this.pointerSeen) this.drawReticle(ctx);
  }

  private drawSoot(ctx: CanvasRenderingContext2D): void {
    const m = this.moon;
    if (!m.visible) return;
    for (const s of this.soot) {
      const x = m.x + s.ox * m.r;
      const y = m.y + s.oy * m.r;
      const rr = s.r * m.r;
      const fade = 1 - s.age / s.max;
      // Charred crater centre.
      const g = ctx.createRadialGradient(x, y, 0, x, y, rr);
      g.addColorStop(0, `rgba(6,6,8,${0.6 * fade})`);
      g.addColorStop(0.65, `rgba(18,14,14,${0.32 * fade})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, rr, 0, Math.PI * 2);
      ctx.fill();
      // Faint blasted ejecta rim so the scar reads on the dark surface.
      ctx.strokeStyle = `rgba(196,188,176,${0.16 * fade})`;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(x, y, rr * 0.82, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  private drawSmoke(ctx: CanvasRenderingContext2D): void {
    for (const s of this.smoke) {
      const t = s.age / s.max;
      const r = s.r * (0.6 + t * 1.8);
      const a = (1 - t) * 0.22;
      const g = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, r);
      g.addColorStop(0, `rgba(60,58,56,${a})`);
      g.addColorStop(1, 'rgba(20,20,22,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawDust(ctx: CanvasRenderingContext2D): void {
    for (const d of this.dust) {
      const t = d.age / d.max;
      const r = d.r * (0.4 + t * 1.6);
      const a = (1 - t) * 0.5;
      const g = ctx.createRadialGradient(d.x, d.y, 0, d.x, d.y, r);
      g.addColorStop(0, `rgba(190,182,170,${a})`);
      g.addColorStop(0.5, `rgba(150,140,128,${a * 0.4})`);
      g.addColorStop(1, 'rgba(120,110,100,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(d.x, d.y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawShells(ctx: CanvasRenderingContext2D): void {
    ctx.lineCap = 'round';
    for (const s of this.shells) {
      ctx.strokeStyle = 'rgba(220,206,180,0.5)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      for (let i = 0; i < s.trail.length; i += 2) {
        const x = s.trail[i], y = s.trail[i + 1];
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.lineTo(s.x, s.y);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,238,206,0.9)';
      ctx.beginPath();
      ctx.arc(s.x, s.y, 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawSparks(ctx: CanvasRenderingContext2D): void {
    for (const s of this.sparks) {
      const t = s.life / s.max;
      ctx.fillStyle = `rgba(240,205,150,${t * 0.8})`;
      ctx.beginPath();
      ctx.arc(s.x, s.y, 1.2 * t + 0.3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawFlashes(ctx: CanvasRenderingContext2D): void {
    for (const f of this.flashes) {
      const t = f.age / f.max;
      const r = f.r * (0.5 + t * 1.2);
      const a = 1 - t;
      const g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, r);
      g.addColorStop(0, `rgba(255,250,235,${a})`);
      g.addColorStop(0.5, `rgba(255,210,150,${a * 0.5})`);
      g.addColorStop(1, 'rgba(200,120,60,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(f.x, f.y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /** Minimal cursor — a thin, quiet reticle. No labels, no chrome. */
  private drawReticle(ctx: CanvasRenderingContext2D): void {
    const x = this.px, y = this.py;
    ctx.strokeStyle = 'rgba(214,210,198,0.35)';
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
    ctx.fillStyle = 'rgba(214,210,198,0.5)';
    ctx.fillRect(x - 0.5, y - 0.5, 1, 1);
  }
}
