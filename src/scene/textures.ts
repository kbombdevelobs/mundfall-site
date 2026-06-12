/**
 * Procedural texture generation for the Mundfall moon.
 * Everything is painted onto canvases at runtime — the site ships with
 * zero binary image assets.
 *
 * Produces a colour map, a tangent-space normal map (the real relief), and
 * a light bump map. The surface layers fractal terrain, dark maria basins,
 * 220 craters with raised rims, and bright ejecta rays around the big ones.
 */
import * as THREE from 'three';

/** Deterministic PRNG so the moon looks the same on every visit. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 3D value-noise sampled on a cylinder so the texture tiles horizontally. */
function makeNoise3d(rand: () => number): (x: number, y: number, z: number) => number {
  const SIZE = 64;
  const grid = new Float32Array(SIZE * SIZE * SIZE);
  for (let i = 0; i < grid.length; i++) grid[i] = rand();

  const at = (x: number, y: number, z: number): number => {
    const xi = ((x % SIZE) + SIZE) % SIZE;
    const yi = ((y % SIZE) + SIZE) % SIZE;
    const zi = ((z % SIZE) + SIZE) % SIZE;
    return grid[xi + yi * SIZE + zi * SIZE * SIZE];
  };

  const smooth = (t: number): number => t * t * (3 - 2 * t);

  return (x, y, z) => {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const z0 = Math.floor(z);
    const fx = smooth(x - x0);
    const fy = smooth(y - y0);
    const fz = smooth(z - z0);
    let v = 0;
    for (let dz = 0; dz <= 1; dz++) {
      for (let dy = 0; dy <= 1; dy++) {
        for (let dx = 0; dx <= 1; dx++) {
          const w = (dx ? fx : 1 - fx) * (dy ? fy : 1 - fy) * (dz ? fz : 1 - fz);
          v += w * at(x0 + dx, y0 + dy, z0 + dz);
        }
      }
    }
    return v;
  };
}

export interface MoonMaps {
  colorMap: THREE.CanvasTexture;
  normalMap: THREE.CanvasTexture;
  bumpMap: THREE.CanvasTexture;
  /** Live working canvases, so impacts can stamp (and heal) real craters. */
  colorCtx: CanvasRenderingContext2D;
  bumpCtx: CanvasRenderingContext2D;
  /** Pristine snapshots, re-composited under the scars so craters can heal. */
  baseColor: HTMLCanvasElement;
  baseBump: HTMLCanvasElement;
  width: number;
  height: number;
}

export function createMoonMaps(seed = 0x5eed): MoonMaps {
  const W = 1280;
  const H = 640;
  const rand = mulberry32(seed);
  const noise = makeNoise3d(rand);
  const TAU = Math.PI * 2;

  const sample = (x: number, freq0: number, oct: number, y: number): number => {
    const ang = (x / W) * TAU;
    const cx = Math.cos(ang) * 9;
    const cz = Math.sin(ang) * 9;
    const cy = (y / H) * 18;
    let v = 0, amp = 0.5, freq = freq0;
    for (let o = 0; o < oct; o++) {
      v += amp * noise(cx * freq, cy * freq, cz * freq);
      amp *= 0.5;
      freq *= 2.1;
    }
    return v;
  };

  // --- Height field: fractal terrain ---
  const height = new Float32Array(W * H);
  // --- Maria mask: large smooth dark basalt plains (low frequency) ---
  const maria = new Float32Array(W * H);
  // --- Brightness streaks (ejecta rays), added at the end ---
  const bright = new Float32Array(W * H);

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = x + y * W;
      height[i] = sample(x, 1, 4, y); // 0..~0.95
      const mv = sample(x, 0.25, 2, y + 1000);
      maria[i] = THREE.MathUtils.smoothstep(mv, 0.62, 0.78); // 0..1 basin strength
    }
  }

  // Flatten + lower the maria so they read as smooth dark seas.
  for (let i = 0; i < W * H; i++) {
    height[i] = height[i] * (1 - maria[i] * 0.7) - maria[i] * 0.12;
  }

  // --- Stamp craters into the height field ---
  const stampCrater = (cx: number, cy: number, r: number, withRays: boolean): void => {
    const depth = 0.16 + rand() * 0.26;
    const rim = depth * (0.3 + rand() * 0.35);
    const r2 = r * r;
    const x0 = Math.floor(cx - r - 2);
    const x1 = Math.ceil(cx + r + 2);
    const y0 = Math.max(0, Math.floor(cy - r - 2));
    const y1 = Math.min(H - 1, Math.ceil(cy + r + 2));
    for (let py = y0; py <= y1; py++) {
      for (let px = x0; px <= x1; px++) {
        const dx = px - cx, dy = py - cy;
        const d2 = dx * dx + dy * dy;
        if (d2 > r2) continue;
        const d = Math.sqrt(d2) / r;
        const wx = ((px % W) + W) % W;
        const idx = wx + py * W;
        const bowl = -depth * (Math.cos(d * Math.PI) * 0.5 + 0.5);
        const ring = rim * Math.exp(-Math.pow((d - 0.88) / 0.13, 2));
        height[idx] += bowl + ring;
        bright[idx] += ring * 0.6; // fresh rims are bright
      }
    }
    // Bright ejecta rays radiating from young impacts (Tycho-style).
    if (withRays) {
      const rayCount = 7 + Math.floor(rand() * 6);
      for (let k = 0; k < rayCount; k++) {
        const ang = rand() * TAU;
        const len = r * (3 + rand() * 5);
        const ca = Math.cos(ang), sa = Math.sin(ang);
        for (let s = r; s < len; s += 1.5) {
          const fall = 1 - s / len;
          const jitter = (rand() - 0.5) * s * 0.12;
          const px = Math.round(cx + ca * s - sa * jitter);
          const py = Math.round(cy + sa * s + ca * jitter);
          if (py < 0 || py >= H) continue;
          const wx = ((px % W) + W) % W;
          bright[wx + py * W] += 0.5 * fall * fall;
        }
      }
    }
  };

  const big = 4;
  for (let i = 0; i < big; i++) {
    stampCrater(rand() * W, 60 + rand() * (H - 120), 38 + rand() * 30, true);
  }
  for (let i = 0; i < 216; i++) {
    stampCrater(rand() * W, rand() * H, 3 + Math.pow(rand(), 2.4) * 40, false);
  }

  // --- Paint colour + bump canvases ---
  const colorCanvas = document.createElement('canvas');
  colorCanvas.width = W; colorCanvas.height = H;
  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = W; bumpCanvas.height = H;
  const colorCtx = colorCanvas.getContext('2d')!;
  const bumpCtx = bumpCanvas.getContext('2d')!;
  const colorImg = colorCtx.createImageData(W, H);
  const bumpImg = bumpCtx.createImageData(W, H);

  for (let i = 0; i < W * H; i++) {
    const h = clamp01(height[i] * 0.9 + 0.2);
    const b = clamp01(bright[i]);
    const sea = maria[i];
    // Warm bone highlands, cool slate maria, with a faint blue cast in shadow.
    let r = 60 + h * 168;
    let g = 58 + h * 162;
    let bl = 64 + h * 150;
    // Maria pull toward a cold basalt grey.
    r = r * (1 - sea * 0.5) + 46 * sea;
    g = g * (1 - sea * 0.5) + 50 * sea;
    bl = bl * (1 - sea * 0.5) + 62 * sea;
    // Bright rays / rims.
    r = Math.min(255, r + b * 90);
    g = Math.min(255, g + b * 88);
    bl = Math.min(255, bl + b * 84);

    const p = i * 4;
    colorImg.data[p] = r;
    colorImg.data[p + 1] = g;
    colorImg.data[p + 2] = bl;
    colorImg.data[p + 3] = 255;
    const bh = Math.round(clamp01(height[i] * 0.9 + 0.2) * 255);
    bumpImg.data[p] = bh; bumpImg.data[p + 1] = bh; bumpImg.data[p + 2] = bh; bumpImg.data[p + 3] = 255;
  }

  colorCtx.putImageData(colorImg, 0, 0);
  bumpCtx.putImageData(bumpImg, 0, 0);

  // --- Derive a tangent-space normal map from the height field ---
  const normalCanvas = document.createElement('canvas');
  normalCanvas.width = W; normalCanvas.height = H;
  const normalCtx = normalCanvas.getContext('2d')!;
  const normalImg = normalCtx.createImageData(W, H);
  const STRENGTH = 2.6;
  const at = (x: number, y: number): number => {
    const xi = ((x % W) + W) % W;
    const yi = clamp(y, 0, H - 1);
    return height[xi + yi * W];
  };
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const dzdx = (at(x - 1, y) - at(x + 1, y)) * STRENGTH;
      const dzdy = (at(x, y - 1) - at(x, y + 1)) * STRENGTH;
      let nx = dzdx, ny = dzdy, nz = 1;
      const inv = 1 / Math.sqrt(nx * nx + ny * ny + nz * nz);
      nx *= inv; ny *= inv; nz *= inv;
      const p = (x + y * W) * 4;
      normalImg.data[p] = Math.round((nx * 0.5 + 0.5) * 255);
      normalImg.data[p + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      normalImg.data[p + 2] = Math.round((nz * 0.5 + 0.5) * 255);
      normalImg.data[p + 3] = 255;
    }
  }
  normalCtx.putImageData(normalImg, 0, 0);

  const colorMap = new THREE.CanvasTexture(colorCanvas);
  colorMap.colorSpace = THREE.SRGBColorSpace;
  colorMap.wrapS = THREE.RepeatWrapping;
  colorMap.anisotropy = 8;
  const normalMap = new THREE.CanvasTexture(normalCanvas);
  normalMap.wrapS = THREE.RepeatWrapping;
  const bumpMap = new THREE.CanvasTexture(bumpCanvas);
  bumpMap.wrapS = THREE.RepeatWrapping;

  // Pristine snapshots of the freshly-painted surface, so the scar layer can
  // be re-composited over them each tick and slowly fade (heal) away.
  const baseColor = document.createElement('canvas');
  baseColor.width = W; baseColor.height = H;
  baseColor.getContext('2d')!.drawImage(colorCanvas, 0, 0);
  const baseBump = document.createElement('canvas');
  baseBump.width = W; baseBump.height = H;
  baseBump.getContext('2d')!.drawImage(bumpCanvas, 0, 0);

  return { colorMap, normalMap, bumpMap, colorCtx, bumpCtx, baseColor, baseBump, width: W, height: H };
}

/** Soft radial gradient sprite used for the atmospheric dust halo. */
export function createGlowSprite(inner: string, outer: string): THREE.CanvasTexture {
  const S = 256;
  const canvas = document.createElement('canvas');
  canvas.width = S; canvas.height = S;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  grad.addColorStop(0, inner);
  grad.addColorStop(0.4, outer);
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, S, S);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));
const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
