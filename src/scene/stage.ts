/**
 * Stage: renderer, camera, deep-space lighting, pointer parallax and the
 * render loop. Owns the Moon and Starfield. Exposes the moon's on-screen
 * circle so the 2D battle layer can line gunfire and impacts up with the
 * real geometry, plus a hit hook so surface impacts flash the moon.
 */
import * as THREE from 'three';
import { Moon } from './moon';
import { Starfield } from './starfield';
import type { MoonScreen } from '../fx/battle';

export class Stage {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly moon = new Moon();
  private readonly stars = new Starfield();
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2(0, 0);
  private readonly clock = new THREE.Clock();
  private pointerActive = false;

  private readonly center = new THREE.Vector3();
  private readonly edge = new THREE.Vector3();
  private readonly right = new THREE.Vector3();
  private readonly baseY = 0.92;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    this.renderer.setClearColor('#030308');
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.88; // crush the lows for grit

    this.camera = new THREE.PerspectiveCamera(38, 1, 0.1, 200);
    this.camera.position.set(0, 0, 9.4);

    // Hard raking sunlight → sharp terminator falling into black. A whisper
    // of cold fill on the dark side; almost no ambient. Gritty, not glossy.
    const sun = new THREE.DirectionalLight('#fbf3e4', 2.7);
    sun.position.set(-5, 2.0, 2.5);
    const earthshine = new THREE.DirectionalLight('#27384f', 0.3);
    earthshine.position.set(4, -1.5, 1.5);
    const ambient = new THREE.AmbientLight('#070b14', 0.35);

    this.moon.group.position.y = this.baseY;
    this.scene.add(sun, earthshine, ambient, this.moon.group, this.stars.group);

    this.resize();
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('pointermove', (e) => this.onPointerMove(e));

    this.renderer.setAnimationLoop(() => this.tick());
  }

  /** Flash the moon when a player round lands. */
  registerHit(): void {
    this.moon.registerHit();
  }

  /** The moon's bounding circle in CSS pixels, for the battle overlay. */
  getMoonScreen(): MoonScreen {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.moon.getWorldCenter(this.center);
    this.right.setFromMatrixColumn(this.camera.matrixWorld, 0);
    this.edge.copy(this.center).addScaledVector(this.right, this.moon.radius);

    const c = this.center.clone().project(this.camera);
    const e = this.edge.clone().project(this.camera);
    const cx = (c.x * 0.5 + 0.5) * w;
    const cy = (1 - (c.y * 0.5 + 0.5)) * h;
    const ex = (e.x * 0.5 + 0.5) * w;
    const ey = (1 - (e.y * 0.5 + 0.5)) * h;
    const r = Math.hypot(ex - cx, ey - cy);
    return { x: cx, y: cy, r, visible: c.z < 1 };
  }

  private resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  private onPointerMove(e: PointerEvent): void {
    this.pointer.set(
      (e.clientX / window.innerWidth) * 2 - 1,
      -(e.clientY / window.innerHeight) * 2 + 1,
    );
    this.pointerActive = true;
  }

  private tick(): void {
    const dt = Math.min(this.clock.getDelta(), 0.1);
    const time = this.clock.elapsedTime;

    // Pointer parallax: camera leans toward the cursor, stars lean away.
    this.camera.position.x = THREE.MathUtils.damp(this.camera.position.x, this.pointer.x * 0.5, 2, dt);
    this.camera.position.y = THREE.MathUtils.damp(this.camera.position.y, this.pointer.y * 0.32, 2, dt);
    this.camera.lookAt(0, 0.15, 0);
    this.stars.group.rotation.x = THREE.MathUtils.damp(this.stars.group.rotation.x, -this.pointer.y * 0.04, 1.5, dt);
    this.stars.group.rotation.y = THREE.MathUtils.damp(this.stars.group.rotation.y, this.pointer.x * 0.04, 1.5, dt);

    if (this.pointerActive) {
      this.raycaster.setFromCamera(this.pointer, this.camera);
      this.moon.setHovered(this.raycaster.intersectObject(this.moon.hitTarget).length > 0);
    }

    // Slow drift, like a body in orbit.
    this.moon.group.position.y = this.baseY + Math.sin(time * 0.25) * 0.05;

    this.moon.update(dt);
    this.stars.update(time);
    this.renderer.render(this.scene, this.camera);
  }
}
