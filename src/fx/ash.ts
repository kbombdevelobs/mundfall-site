/**
 * Cursor ash trail: a lightweight 2D-canvas particle layer.
 * Pale ash motes shed from the cursor and drift upward like embers
 * over a fire that burned out long ago. During an eclipse they turn red.
 */

interface Mote {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number; // seconds remaining
  maxLife: number;
  size: number;
  ember: boolean; // rare blood-red spark
}

const MAX_MOTES = 220;

export class AshTrail {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly motes: Mote[] = [];
  private lastX = -1;
  private lastY = -1;
  private eclipseStrength = 0;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
    this.resize();
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('pointermove', (e) => this.onPointerMove(e));
  }

  setEclipseStrength(strength: number): void {
    this.eclipseStrength = strength;
  }

  private resize(): void {
    const dpr = Math.min(window.devicePixelRatio, 2);
    this.canvas.width = window.innerWidth * dpr;
    this.canvas.height = window.innerHeight * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  private onPointerMove(e: PointerEvent): void {
    const dx = e.clientX - this.lastX;
    const dy = e.clientY - this.lastY;
    const moved = this.lastX < 0 ? 1 : Math.hypot(dx, dy);
    this.lastX = e.clientX;
    this.lastY = e.clientY;
    if (moved < 2) return;

    const spawn = Math.min(3, Math.ceil(moved / 14));
    for (let i = 0; i < spawn; i++) {
      if (this.motes.length >= MAX_MOTES) this.motes.shift();
      const life = 0.8 + Math.random() * 1.4;
      this.motes.push({
        x: e.clientX + (Math.random() - 0.5) * 6,
        y: e.clientY + (Math.random() - 0.5) * 6,
        vx: (Math.random() - 0.5) * 22,
        vy: -14 - Math.random() * 26, // drift upward
        life,
        maxLife: life,
        size: 0.6 + Math.random() * 1.7,
        ember: Math.random() < 0.12 + this.eclipseStrength * 0.5,
      });
    }
  }

  update(dt: number): void {
    const { ctx } = this;
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

    for (let i = this.motes.length - 1; i >= 0; i--) {
      const m = this.motes[i];
      m.life -= dt;
      if (m.life <= 0) {
        this.motes.splice(i, 1);
        continue;
      }
      m.x += m.vx * dt;
      m.y += m.vy * dt;
      m.vx *= 1 - 0.6 * dt; // air drag
      m.vy -= 6 * dt; // buoyancy

      const t = m.life / m.maxLife;
      const alpha = t * t * 0.7;
      ctx.beginPath();
      ctx.arc(m.x, m.y, m.size * (0.5 + t * 0.5), 0, Math.PI * 2);
      ctx.fillStyle = m.ember
        ? `rgba(229, 56, 59, ${alpha})`
        : `rgba(214, 209, 192, ${alpha * 0.8})`;
      ctx.fill();
    }
  }
}
