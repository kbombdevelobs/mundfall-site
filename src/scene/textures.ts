/**
 * Procedural texture generation for the Mundfall moon.
 * Everything is painted onto canvases at runtime — the site ships with
 * zero binary image assets.
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
          const w =
            (dx ? fx : 1 - fx) * (dy ? fy : 1 - fy) * (dz ? fz : 1 - fz);
          v += w * at(x0 + dx, y0 + dy, z0 + dz);
        }
      }
    }
    return v;
  };
}

interface MoonMaps {
  colorMap: THREE.CanvasTexture;
  bumpMap: THREE.CanvasTexture;
}

/**
 * Paints a cratered lunar surface (color + height) onto two canvases.
 * The base is fractal noise on a cylinder (seamless wrap), then craters
 * are stamped on top as darkened bowls with bright rims.
 */
export function createMoonMaps(seed = 0x5eed): MoonMaps {
  const W = 1024;
  const H = 512;
  const rand = mulberry32(seed);
  const noise = makeNoise3d(rand);

  // --- Height field from fBm noise, wrapped around a cylinder ---
  const height = new Float32Array(W * H);
  const TAU = Math.PI * 2;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const ang = (x / W) * TAU;
      const cx = Math.cos(ang) * 9;
      const cz = Math.sin(ang) * 9;
      const cy = (y / H) * 18;
      let v = 0;
      let amp = 0.5;
      let freq = 1;
      for (let o = 0; o < 4; o++) {
        v += amp * noise(cx * freq, cy * freq, cz * freq);
        amp *= 0.5;
        freq *= 2.1;
      }
      height[x + y * W] = v; // roughly 0..0.95
    }
  }

  // --- Stamp craters into the height field ---
  const craterCount = 150;
  for (let i = 0; i < craterCount; i++) {
    const cx = rand() * W;
    const cy = rand() * H;
    const r = 3 + Math.pow(rand(), 2.4) * 52;
    const depth = 0.16 + rand() * 0.26;
    const rim = depth * (0.18 + rand() * 0.22);
    const r2 = r * r;
    const x0 = Math.floor(cx - r - 2);
    const x1 = Math.ceil(cx + r + 2);
    const y0 = Math.max(0, Math.floor(cy - r - 2));
    const y1 = Math.min(H - 1, Math.ceil(cy + r + 2));
    for (let py = y0; py <= y1; py++) {
      for (let px = x0; px <= x1; px++) {
        const dx = px - cx;
        const dy = py - cy;
        const d2 = dx * dx + dy * dy;
        if (d2 > r2) continue;
        const d = Math.sqrt(d2) / r; // 0 center → 1 edge
        const wx = ((px % W) + W) % W; // horizontal wrap keeps the seam clean
        const idx = wx + py * W;
        // Bowl: cosine depression; Rim: narrow raised ring near the edge
        const bowl = -depth * (Math.cos(d * Math.PI) * 0.5 + 0.5);
        const ring = rim * Math.exp(-Math.pow((d - 0.9) / 0.16, 2));
        height[idx] += bowl + ring;
      }
    }
  }

  // --- Paint color + bump canvases from the height field ---
  const colorCanvas = document.createElement('canvas');
  colorCanvas.width = W;
  colorCanvas.height = H;
  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = W;
  bumpCanvas.height = H;

  const colorCtx = colorCanvas.getContext('2d')!;
  const bumpCtx = bumpCanvas.getContext('2d')!;
  const colorImg = colorCtx.createImageData(W, H);
  const bumpImg = bumpCtx.createImageData(W, H);

  for (let i = 0; i < W * H; i++) {
    const h = Math.min(1, Math.max(0, height[i] * 0.85 + 0.18));
    // Bone-grey lunar regolith with a faint cold-violet cast in the lows
    const r = Math.round(38 + h * 158);
    const g = Math.round(36 + h * 154);
    const b = Math.round(42 + h * 150);
    const p = i * 4;
    colorImg.data[p] = r;
    colorImg.data[p + 1] = g;
    colorImg.data[p + 2] = b;
    colorImg.data[p + 3] = 255;
    const bh = Math.round(h * 255);
    bumpImg.data[p] = bh;
    bumpImg.data[p + 1] = bh;
    bumpImg.data[p + 2] = bh;
    bumpImg.data[p + 3] = 255;
  }

  colorCtx.putImageData(colorImg, 0, 0);
  bumpCtx.putImageData(bumpImg, 0, 0);

  const colorMap = new THREE.CanvasTexture(colorCanvas);
  colorMap.colorSpace = THREE.SRGBColorSpace;
  colorMap.wrapS = THREE.RepeatWrapping;
  const bumpMap = new THREE.CanvasTexture(bumpCanvas);
  bumpMap.wrapS = THREE.RepeatWrapping;

  return { colorMap, bumpMap };
}

/** Soft radial gradient sprite used for the atmospheric dust halo. */
export function createGlowSprite(inner: string, outer: string): THREE.CanvasTexture {
  const S = 256;
  const canvas = document.createElement('canvas');
  canvas.width = S;
  canvas.height = S;
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
