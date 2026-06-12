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
  private flash = 0; // small per-impact ember
  private eclipse = 0; // full blood eclipse, triggered on a strike
  private time = 0;

  // Live surface canvases + textures, so impacts can burn real craters in.
  private readonly colorCtx: CanvasRenderingContext2D;
  private readonly bumpCtx: CanvasRenderingContext2D;
  private readonly colorMap: THREE.CanvasTexture;
  private readonly bumpMap: THREE.CanvasTexture;
  private readonly baseColor: HTMLCanvasElement;
  private readonly baseBump: HTMLCanvasElement;
  private readonly texW: number;
  private readonly texH: number;

  // Scars heal slowly: each holds full for HOLD seconds then fades over HEAL.
  private readonly scars: Array<{ x: number; y: number; r: number; age: number }> = [];
  private recompTimer = 0;
  private static readonly HOLD = 7;
  private static readonly HEAL = 55;

  constructor() {
    this.group = new THREE.Group();

    const { colorMap, normalMap, bumpMap, colorCtx, bumpCtx, baseColor, baseBump, width, height } = createMoonMaps();
    this.colorCtx = colorCtx;
    this.bumpCtx = bumpCtx;
    this.colorMap = colorMap;
    this.bumpMap = bumpMap;
    this.baseColor = baseColor;
    this.baseBump = baseBump;
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
    this.flash = Math.min(1, this.flash + 0.4);
  }

  /** A strike: drown the whole moon — lit face and dark limb — in blood red. */
  triggerEclipse(): void {
    this.eclipse = 1;
  }

  /**
   * Record a crater at the given UV. It's composited into the moon's own
   * texture (so it rides the spin and slips around the limb), then heals away
   * very slowly. The actual painting happens in recomposite().
   */
  stampScar(u: number, v: number): void {
    this.scars.push({ x: u * this.texW, y: (1 - v) * this.texH, r: 6 + Math.random() * 8, age: 0 });
    if (this.scars.length > 260) this.scars.shift();
    this.recompTimer = 0; // force a repaint on the next update
  }

  /** Draw one scar (colour + bump) at opacity `a`, handling the seam wrap. */
  private paintScar(x: number, y: number, r: number, a: number): void {
    const draw = (cx: number): void => {
      const cg = this.colorCtx.createRadialGradient(cx, y, 0, cx, y, r);
      cg.addColorStop(0, `rgba(14,13,15,${0.92 * a})`);
      cg.addColorStop(0.62, `rgba(34,30,30,${0.8 * a})`);
      cg.addColorStop(0.8, `rgba(120,112,102,${0.5 * a})`); // ejecta rim
      cg.addColorStop(1, 'rgba(150,142,132,0)');
      this.colorCtx.fillStyle = cg;
      this.colorCtx.beginPath();
      this.colorCtx.arc(cx, y, r, 0, Math.PI * 2);
      this.colorCtx.fill();

      const bg = this.bumpCtx.createRadialGradient(cx, y, 0, cx, y, r);
      bg.addColorStop(0, `rgba(0,0,0,${0.85 * a})`);
      bg.addColorStop(0.7, `rgba(0,0,0,${0.4 * a})`);
      bg.addColorStop(0.82, `rgba(255,255,255,${0.45 * a})`);
      bg.addColorStop(1, 'rgba(255,255,255,0)');
      this.bumpCtx.fillStyle = bg;
      this.bumpCtx.beginPath();
      this.bumpCtx.arc(cx, y, r, 0, Math.PI * 2);
      this.bumpCtx.fill();
    };
    draw(x);
    if (x < r) draw(x + this.texW);
    else if (x > this.texW - r) draw(x - this.texW);
  }

  /** Re-lay the pristine surface, then composite every (fading) scar on top. */
  private recomposite(): void {
    this.colorCtx.drawImage(this.baseColor, 0, 0);
    this.bumpCtx.drawImage(this.baseBump, 0, 0);
    for (const s of this.scars) {
      const t = s.age - Moon.HOLD;
      const a = t <= 0 ? 1 : Math.max(0, 1 - t / Moon.HEAL);
      this.paintScar(s.x, s.y, s.r, a);
    }
    this.colorMap.needsUpdate = true;
    this.bumpMap.needsUpdate = true;
  }

  update(dt: number): void {
    this.time += dt;
    const target = this.hovered ? HOVER_SPIN : BASE_SPIN;
    this.spinSpeed = THREE.MathUtils.damp(this.spinSpeed, target, 2.5, dt);
    this.sphere.rotation.y += this.spinSpeed * dt;
    this.flash = Math.max(0, this.flash - dt * 0.9);
    this.eclipse = Math.max(0, this.eclipse - dt * 0.3); // ~3.3s full eclipse

    // Age + heal scars; re-composite the surface a few times a second.
    if (this.scars.length > 0) {
      for (let i = this.scars.length - 1; i >= 0; i--) {
        this.scars[i].age += dt;
        if (this.scars[i].age >= Moon.HOLD + Moon.HEAL) this.scars.splice(i, 1);
      }
      this.recompTimer -= dt;
      if (this.recompTimer <= 0) {
        this.recomposite();
        this.recompTimer = 0.12;
      }
    }

    // Slow ambient blood-shadow that recurs roughly every ~70s, mostly low.
    const ambient = Math.pow(Math.max(0, Math.sin(this.time * 0.045)), 3) * 0.4;
    const ecl = this.eclipse;
    const red = Math.min(1, Math.max(ambient, this.flash, ecl));

    const atmoColor = this.atmosphere.uniforms.uColor.value as THREE.Color;
    atmoColor.set('#2a3344').lerp(new THREE.Color('#5a0c06'), red);
    this.atmosphere.uniforms.uIntensity.value = 0.32 + red * 1.5;

    // Lit face bleeds deep red; a strike pushes it all the way over.
    const base = new THREE.Color('#aeb0b4').multiplyScalar(1 - ambient * 0.35);
    const surfaceRed = Math.max(this.flash * 0.4, ecl * 0.9);
    this.sphere.material.color.copy(base).lerp(new THREE.Color('#5e1410'), surfaceRed);

    // High red emissive on eclipse makes the WHOLE disc glow — even the dark
    // limb — so a strike truly bathes the entire moon in blood red.
    const emRed = Math.max(ambient * 0.4, this.flash * 0.5, ecl);
    (this.sphere.material.emissive as THREE.Color).set('#0a0e16').lerp(new THREE.Color('#7a1006'), emRed);
    this.sphere.material.emissiveIntensity = 0.35 + this.flash * 0.4 + ecl * 1.9;
  }
}
