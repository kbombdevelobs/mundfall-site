/**
 * Twinkling starfield surrounding the moon. Two parallax shells of
 * points with per-star phase, animated in a small custom shader.
 */
import * as THREE from 'three';

const STAR_VERT = /* glsl */ `
  attribute float aPhase;
  attribute float aSize;
  uniform float uTime;
  varying float vTwinkle;
  void main() {
    vTwinkle = 0.55 + 0.45 * sin(uTime * 1.4 + aPhase);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * (60.0 / -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`;

const STAR_FRAG = /* glsl */ `
  uniform vec3 uColor;
  varying float vTwinkle;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    float alpha = smoothstep(0.5, 0.0, d) * vTwinkle;
    gl_FragColor = vec4(uColor, alpha);
  }
`;

function makeShell(count: number, minR: number, maxR: number, color: string, rand: () => number): THREE.Points {
  const positions = new Float32Array(count * 3);
  const phases = new Float32Array(count);
  const sizes = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    // Uniform point on a sphere shell
    const u = rand() * 2 - 1;
    const theta = rand() * Math.PI * 2;
    const r = minR + rand() * (maxR - minR);
    const s = Math.sqrt(1 - u * u);
    positions[i * 3] = r * s * Math.cos(theta);
    positions[i * 3 + 1] = r * u;
    positions[i * 3 + 2] = r * s * Math.sin(theta);
    phases[i] = rand() * Math.PI * 2;
    sizes[i] = 0.5 + rand() * 1.6;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
  geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));

  const material = new THREE.ShaderMaterial({
    vertexShader: STAR_VERT,
    fragmentShader: STAR_FRAG,
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: new THREE.Color(color) },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  return new THREE.Points(geometry, material);
}

export class Starfield {
  readonly group: THREE.Group;
  private readonly shells: THREE.Points[];

  constructor() {
    let seed = 1337;
    const rand = (): number => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };
    this.group = new THREE.Group();
    this.shells = [
      makeShell(900, 30, 55, '#cdd3e8', rand),
      makeShell(500, 55, 90, '#8a93b8', rand),
    ];
    for (const shell of this.shells) this.group.add(shell);
  }

  update(time: number): void {
    // Imperceptible drift — the sky is alive, barely.
    this.group.rotation.y = time * 0.004;
    for (const shell of this.shells) {
      (shell.material as THREE.ShaderMaterial).uniforms.uTime.value = time;
    }
  }
}
