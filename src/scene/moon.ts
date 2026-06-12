/**
 * The Mundfall moon — a cold, cratered body under bombardment.
 *
 * High-relief surface, hard one-sided light with a sharp terminator falling
 * into black. No glow, no halo — just a thin dark atmospheric edge. A slow
 * blood-shadow eclipse breathes across it; incoming impacts deepen that red
 * for a moment, like the body flinching under fire.
 */
import * as THREE from 'three';
import { createMoonMaps } from './textures';

const BASE_SPIN = 0.04;
const HOVER_SPIN = 0.11;

const ATMOSPHERE_VERT = /* glsl */ `
  varying vec3 vNormal;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// A thin dark rim that only separates the disc from the void — never glows.
const ATMOSPHERE_FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uIntensity;
  varying vec3 vNormal;
  void main() {
    float rim = pow(0.74 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 3.2);
    gl_FragColor = vec4(uColor, 1.0) * rim * uIntensity;
  }
`;

const RADIUS = 1.6;

export class Moon {
  readonly group: THREE.Group;

  private readonly sphere: THREE.Mesh<THREE.SphereGeometry, THREE.MeshStandardMaterial>;
  private readonly atmosphere: THREE.ShaderMaterial;
  private spinSpeed = BASE_SPIN;
  private hovered = false;
  private flash = 0; // transient red from an impact
  private time = 0;

  // Live surface canvases + textures, so impacts can burn real craters in.
  private readonly colorCtx: CanvasRenderingContext2D;
  private readonly bumpCtx: CanvasRenderingContext2D;
  private readonly colorMap: THREE.CanvasTexture;
  private readonly bumpMap: THREE.CanvasTexture;
  private readonly texW: number;
  private readonly texH: number;

  constructor() {
    this.group = new THREE.Group();

    const { colorMap, normalMap, bumpMap, colorCtx, bumpCtx, width, height } = createMoonMaps();
    this.colorCtx = colorCtx;
    this.bumpCtx = bumpCtx;
    this.colorMap = colorMap;
    this.bumpMap = bumpMap;
    this.texW = width;
    this.texH = height;
    const material = new THREE.MeshStandardMaterial({
      map: colorMap,
      normalMap,
      normalScale: new THREE.Vector2(1.25, 1.25),
      bumpMap,
      bumpScale: 0.5,
      roughness: 0.98,
      metalness: 0.0,
      color: new THREE.Color('#aeb0b4'),
      emissive: new THREE.Color('#0a0e16'), // barest earthshine, not a glow
      emissiveIntensity: 0.35,
    });
    this.sphere = new THREE.Mesh(new THREE.SphereGeometry(RADIUS, 160, 160), material);
    this.sphere.rotation.z = THREE.MathUtils.degToRad(-8);
    this.group.add(this.sphere);

    this.atmosphere = new THREE.ShaderMaterial({
      vertexShader: ATMOSPHERE_VERT,
      fragmentShader: ATMOSPHERE_FRAG,
      uniforms: {
        uColor: { value: new THREE.Color('#2a3344') },
        uIntensity: { value: 0.32 },
      },
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
      transparent: true,
      depthWrite: false,
    });
    const shell = new THREE.Mesh(new THREE.SphereGeometry(RADIUS, 64, 64), this.atmosphere);
    shell.scale.setScalar(1.04);
    this.group.add(shell);
  }

  get hitTarget(): THREE.Object3D {
    return this.sphere;
  }

  get radius(): number {
    return RADIUS;
  }

  getWorldCenter(target: THREE.Vector3): THREE.Vector3 {
    return this.sphere.getWorldPosition(target);
  }

  setHovered(hovered: boolean): void {
    this.hovered = hovered;
  }

  /** A round lands — the body flinches red, briefly. */
  registerHit(): void {
    this.flash = Math.min(1, this.flash + 0.5);
  }

  /**
   * Burn a real crater into the surface at the given UV. Because it's painted
   * into the moon's own texture, it rotates with the body and slips around the
   * limb — it sticks to the moon, not the screen.
   */
  stampScar(u: number, v: number): void {
    const W = this.texW;
    const H = this.texH;
    const x = u * W;
    const y = (1 - v) * H;
    const r = 6 + Math.random() * 8;

    const paint = (cx: number): void => {
      // Colour: scorched bowl with a slightly brighter blasted rim.
      const cg = this.colorCtx.createRadialGradient(cx, y, 0, cx, y, r);
      cg.addColorStop(0, 'rgba(14,13,15,0.92)');
      cg.addColorStop(0.62, 'rgba(34,30,30,0.8)');
      cg.addColorStop(0.8, 'rgba(120,112,102,0.5)'); // ejecta rim
      cg.addColorStop(1, 'rgba(150,142,132,0)');
      this.colorCtx.fillStyle = cg;
      this.colorCtx.beginPath();
      this.colorCtx.arc(cx, y, r, 0, Math.PI * 2);
      this.colorCtx.fill();

      // Bump: deepen the bowl (dark = low) with a faint raised rim (light).
      const bg = this.bumpCtx.createRadialGradient(cx, y, 0, cx, y, r);
      bg.addColorStop(0, 'rgba(0,0,0,0.85)');
      bg.addColorStop(0.7, 'rgba(0,0,0,0.4)');
      bg.addColorStop(0.82, 'rgba(255,255,255,0.45)');
      bg.addColorStop(1, 'rgba(255,255,255,0)');
      this.bumpCtx.fillStyle = bg;
      this.bumpCtx.beginPath();
      this.bumpCtx.arc(cx, y, r, 0, Math.PI * 2);
      this.bumpCtx.fill();
    };

    paint(x);
    // The colour map wraps horizontally — stamp the mirror near the seam.
    if (x < r) paint(x + W);
    else if (x > W - r) paint(x - W);

    this.colorMap.needsUpdate = true;
    this.bumpMap.needsUpdate = true;
  }

  update(dt: number): void {
    this.time += dt;
    const target = this.hovered ? HOVER_SPIN : BASE_SPIN;
    this.spinSpeed = THREE.MathUtils.damp(this.spinSpeed, target, 2.5, dt);
    this.sphere.rotation.y += this.spinSpeed * dt;
    this.flash = Math.max(0, this.flash - dt * 0.9);

    // Slow ambient blood-shadow eclipse — recurs roughly every ~70s, mostly
    // low. Combined with any impact flash, this is the only red in the scene.
    const e = Math.pow(Math.max(0, Math.sin(this.time * 0.045)), 3) * 0.45;
    const red = Math.min(1, e + this.flash);

    const atmoColor = this.atmosphere.uniforms.uColor.value as THREE.Color;
    atmoColor.set('#2a3344').lerp(new THREE.Color('#3a0c08'), red);
    this.atmosphere.uniforms.uIntensity.value = 0.32 + red * 0.7;

    // The eclipse dims the lit face; impacts push a faint ember into it —
    // restrained, so craters stay legible even under a sustained barrage.
    const base = new THREE.Color('#aeb0b4').multiplyScalar(1 - e * 0.4);
    this.sphere.material.color.copy(base).lerp(new THREE.Color('#6a2418'), this.flash * 0.3);
    (this.sphere.material.emissive as THREE.Color).set('#0a0e16').lerp(new THREE.Color('#220804'), red);
    this.sphere.material.emissiveIntensity = 0.35 + this.flash * 0.35;
  }
}
