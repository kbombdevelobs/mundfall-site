/**
 * The Mundfall moon: cratered sphere, fresnel atmosphere shell,
 * dust-glow sprite, hover acceleration and the blood-eclipse rite.
 */
import * as THREE from 'three';
import { createMoonMaps, createGlowSprite } from './textures';

const BASE_SPIN = 0.06; // rad/s — slow, ritual rotation
const HOVER_SPIN = 0.34; // rad/s when the cursor rests on the moon
const ECLIPSE_SECONDS = 6;

const ATMOSPHERE_VERT = /* glsl */ `
  varying vec3 vNormal;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const ATMOSPHERE_FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uIntensity;
  varying vec3 vNormal;
  void main() {
    float rim = pow(0.66 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 2.4);
    gl_FragColor = vec4(uColor, 1.0) * rim * uIntensity;
  }
`;

export class Moon {
  readonly group: THREE.Group;

  private readonly sphere: THREE.Mesh<THREE.SphereGeometry, THREE.MeshStandardMaterial>;
  private readonly atmosphere: THREE.ShaderMaterial;
  private readonly glow: THREE.Sprite;
  private spinSpeed = BASE_SPIN;
  private hovered = false;
  private eclipseT = -1; // -1 = idle, otherwise seconds elapsed

  constructor() {
    this.group = new THREE.Group();

    const { colorMap, bumpMap } = createMoonMaps();
    const material = new THREE.MeshStandardMaterial({
      map: colorMap,
      bumpMap,
      bumpScale: 1.6,
      roughness: 0.96,
      metalness: 0.0,
    });
    this.sphere = new THREE.Mesh(new THREE.SphereGeometry(1.6, 96, 96), material);
    this.sphere.rotation.z = THREE.MathUtils.degToRad(-12); // tilted axis
    this.group.add(this.sphere);

    this.atmosphere = new THREE.ShaderMaterial({
      vertexShader: ATMOSPHERE_VERT,
      fragmentShader: ATMOSPHERE_FRAG,
      uniforms: {
        uColor: { value: new THREE.Color('#7c84a3') },
        uIntensity: { value: 0.55 },
      },
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
      transparent: true,
      depthWrite: false,
    });
    const shell = new THREE.Mesh(new THREE.SphereGeometry(1.6, 64, 64), this.atmosphere);
    shell.scale.setScalar(1.22);
    this.group.add(shell);

    this.glow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: createGlowSprite('rgba(180,186,214,0.30)', 'rgba(110,116,158,0.10)'),
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        opacity: 0.55,
      }),
    );
    this.glow.scale.setScalar(6.8);
    this.group.add(this.glow);
  }

  /** Pickable mesh for raycasting. */
  get hitTarget(): THREE.Object3D {
    return this.sphere;
  }

  setHovered(hovered: boolean): void {
    this.hovered = hovered;
  }

  get eclipsing(): boolean {
    return this.eclipseT >= 0;
  }

  /** Begin the blood eclipse. Returns false if one is already underway. */
  triggerEclipse(): boolean {
    if (this.eclipsing) return false;
    this.eclipseT = 0;
    return true;
  }

  /**
   * @param dt seconds since last frame
   * @param keyLight the scene's main light, tinted during an eclipse
   * @returns eclipse strength 0..1 for outside listeners
   */
  update(dt: number, keyLight: THREE.DirectionalLight): number {
    // Hover eases the spin up; releasing eases it back down.
    const target = this.hovered ? HOVER_SPIN : BASE_SPIN;
    this.spinSpeed = THREE.MathUtils.damp(this.spinSpeed, target, 2.5, dt);
    this.sphere.rotation.y += this.spinSpeed * dt;

    let strength = 0;
    if (this.eclipsing) {
      this.eclipseT += dt;
      const t = this.eclipseT / ECLIPSE_SECONDS;
      if (t >= 1) {
        this.eclipseT = -1;
      } else {
        // Bell curve: dark red swells in, holds, then withdraws.
        strength = Math.sin(Math.min(1, t) * Math.PI);
        strength = Math.pow(strength, 1.4);
      }
    }

    // Blend lighting + glow toward blood red by eclipse strength.
    const moonTint = new THREE.Color('#ffffff').lerp(new THREE.Color('#b13832'), strength * 0.85);
    this.sphere.material.color.copy(moonTint);
    keyLight.color.set('#f3eedf').lerp(new THREE.Color('#c4322a'), strength);
    keyLight.intensity = 2.4 - strength * 1.1;

    const atmoColor = this.atmosphere.uniforms.uColor.value as THREE.Color;
    atmoColor.set('#9aa4c8').lerp(new THREE.Color('#d6332e'), strength);
    this.atmosphere.uniforms.uIntensity.value = 0.55 + strength * 1.4;

    const glowMat = this.glow.material;
    glowMat.color.set('#ffffff').lerp(new THREE.Color('#e5383b'), strength);
    glowMat.opacity = 0.55 + strength * 0.4;

    return strength;
  }
}
