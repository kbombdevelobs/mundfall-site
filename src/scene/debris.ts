/**
 * Rubble — real 3D rock shards blown off the moon.
 *
 * Spawned at the true 3D impact point and lit by the same hard sun as the
 * moon, so they read as actual chunks of the body tumbling off into space.
 * Faceted low-poly geometry, slow tumble, slow outward drift, fade-out near
 * end of life. Hard-capped: new shards only appear once old ones cycle out.
 */
import * as THREE from 'three';

interface Rock {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  spin: THREE.Vector3;
  base: number; // base scale, for fade-out
  life: number;
  max: number;
}

const MAX_ROCKS = 14;

export class Debris {
  readonly group = new THREE.Group();
  private readonly rocks: Rock[] = [];
  private readonly material: THREE.MeshStandardMaterial;
  private readonly geos: THREE.BufferGeometry[] = [];

  constructor() {
    this.material = new THREE.MeshStandardMaterial({
      color: '#7d7a72',
      roughness: 1,
      metalness: 0,
      flatShading: true,
      emissive: new THREE.Color('#0a0e16'),
      emissiveIntensity: 0.3,
    });
    for (let i = 0; i < 5; i++) this.geos.push(this.makeRock());
  }

  /** An irregular, faceted rock from a jittered low-poly icosahedron. */
  private makeRock(): THREE.BufferGeometry {
    const g = new THREE.IcosahedronGeometry(1, 0);
    const pos = g.attributes.position as THREE.BufferAttribute;
    const v = new THREE.Vector3();
    const seen = new Map<string, number>();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      // Share the jitter per unique vertex position so facets stay welded.
      const key = `${v.x.toFixed(3)},${v.y.toFixed(3)},${v.z.toFixed(3)}`;
      let f = seen.get(key);
      if (f === undefined) { f = 0.62 + Math.random() * 0.7; seen.set(key, f); }
      v.multiplyScalar(f);
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    g.computeVertexNormals();
    return g;
  }

  /** Throw a shard from a surface point, outward from the moon's centre. */
  spawn(point: THREE.Vector3, outward: THREE.Vector3): void {
    if (this.rocks.length >= MAX_ROCKS) return; // capped — wait for cycle-out

    const geo = this.geos[Math.floor(Math.random() * this.geos.length)];
    const mesh = new THREE.Mesh(geo, this.material);
    const base = 0.03 + Math.random() * 0.05; // small chunks
    mesh.scale.setScalar(base);
    mesh.position.copy(point);
    mesh.rotation.set(Math.random() * 6.28, Math.random() * 6.28, Math.random() * 6.28);

    const dir = outward.clone().normalize();
    const speed = 0.3 + Math.random() * 0.55;
    const vel = dir.multiplyScalar(speed);
    vel.x += (Math.random() - 0.5) * 0.3;
    vel.y += (Math.random() - 0.5) * 0.3;
    vel.z += (Math.random() - 0.5) * 0.3;

    const spin = new THREE.Vector3(
      (Math.random() - 0.5) * 2.4,
      (Math.random() - 0.5) * 2.4,
      (Math.random() - 0.5) * 2.4,
    );

    this.group.add(mesh);
    this.rocks.push({ mesh, vel, spin, base, life: 0, max: 5 + Math.random() * 4 });
  }

  update(dt: number): void {
    for (let i = this.rocks.length - 1; i >= 0; i--) {
      const r = this.rocks[i];
      r.life += dt;
      r.mesh.position.addScaledVector(r.vel, dt);
      r.mesh.rotation.x += r.spin.x * dt;
      r.mesh.rotation.y += r.spin.y * dt;
      r.mesh.rotation.z += r.spin.z * dt;

      const t = r.life / r.max;
      if (t > 0.75) r.mesh.scale.setScalar(r.base * Math.max(0, 1 - (t - 0.75) / 0.25));

      if (r.life >= r.max) {
        this.group.remove(r.mesh);
        this.rocks.splice(i, 1);
      }
    }
  }
}
