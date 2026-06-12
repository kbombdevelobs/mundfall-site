/**
 * Stage: renderer, camera, lights, pointer parallax and the render loop.
 * Owns the Moon and Starfield and exposes hooks for outside listeners
 * (eclipse strength feeds the DOM + audio layers).
 */
import * as THREE from 'three';
import { Moon } from './moon';
import { Starfield } from './starfield';

export interface StageCallbacks {
  onEclipseStart: () => void;
  onEclipseStrength: (strength: number) => void;
}

export class Stage {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly keyLight: THREE.DirectionalLight;
  private readonly moon = new Moon();
  private readonly stars = new Starfield();
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2(0, 0);
  private readonly clock = new THREE.Clock();
  private pointerActive = false;

  constructor(
    canvas: HTMLCanvasElement,
    private readonly callbacks: StageCallbacks,
  ) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    this.renderer.setClearColor('#06060a');
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;

    this.camera = new THREE.PerspectiveCamera(38, 1, 0.1, 200);
    this.camera.position.set(0, 0, 8.6);

    // Cold key light from the upper left; faint blood fill from below.
    this.keyLight = new THREE.DirectionalLight('#f3eedf', 2.4);
    this.keyLight.position.set(-4, 2.5, 3);
    const fill = new THREE.DirectionalLight('#5a1a1e', 0.5);
    fill.position.set(3, -3, -2);
    const ambient = new THREE.AmbientLight('#1a1c2c', 0.6);

    this.moon.group.position.y = 0.55; // sits above the hero text
    this.scene.add(this.keyLight, fill, ambient, this.moon.group, this.stars.group);

    this.resize();
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('pointermove', (e) => this.onPointerMove(e));
    canvas.addEventListener('pointerdown', (e) => this.onPointerDown(e));

    this.renderer.setAnimationLoop(() => this.tick());
  }

  private resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  private setPointerFromEvent(e: PointerEvent): void {
    this.pointer.set(
      (e.clientX / window.innerWidth) * 2 - 1,
      -(e.clientY / window.innerHeight) * 2 + 1,
    );
  }

  private onPointerMove(e: PointerEvent): void {
    this.setPointerFromEvent(e);
    this.pointerActive = true;
  }

  private onPointerDown(e: PointerEvent): void {
    this.setPointerFromEvent(e);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    if (this.raycaster.intersectObject(this.moon.hitTarget).length > 0) {
      if (this.moon.triggerEclipse()) this.callbacks.onEclipseStart();
    }
  }

  private tick(): void {
    const dt = Math.min(this.clock.getDelta(), 0.1);
    const time = this.clock.elapsedTime;

    // Pointer parallax: the camera leans toward the cursor, stars lean away.
    const px = this.pointer.x;
    const py = this.pointer.y;
    this.camera.position.x = THREE.MathUtils.damp(this.camera.position.x, px * 0.55, 2, dt);
    this.camera.position.y = THREE.MathUtils.damp(this.camera.position.y, py * 0.35, 2, dt);
    this.camera.lookAt(0, 0.2, 0);
    this.stars.group.rotation.x = THREE.MathUtils.damp(this.stars.group.rotation.x, -py * 0.04, 1.5, dt);

    // Hover detection drives the spin-up.
    if (this.pointerActive) {
      this.raycaster.setFromCamera(this.pointer, this.camera);
      this.moon.setHovered(this.raycaster.intersectObject(this.moon.hitTarget).length > 0);
    }

    // Gentle bobbing, like something held on a chain.
    this.moon.group.position.y = 0.55 + Math.sin(time * 0.4) * 0.06;

    const strength = this.moon.update(dt, this.keyLight);
    this.callbacks.onEclipseStrength(strength);
    this.stars.update(time);
    this.renderer.render(this.scene, this.camera);
  }
}
