import * as THREE from 'three'

/**
 * Procedurally paints a cratered lunar surface onto a canvas so the site ships
 * with zero external image assets. Returns a colour map + a bump map derived
 * from the same crater field.
 */
function makeMoonTextures(size = 1024): { map: THREE.Texture; bump: THREE.Texture } {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!

  // Base regolith — cold grey with a faint sepia cast.
  const base = ctx.createLinearGradient(0, 0, 0, size)
  base.addColorStop(0, '#9a958c')
  base.addColorStop(0.5, '#827d74')
  base.addColorStop(1, '#6c685f')
  ctx.fillStyle = base
  ctx.fillRect(0, 0, size, size)

  // Mottled noise so the surface isn't flat.
  for (let i = 0; i < 26000; i++) {
    const x = Math.random() * size
    const y = Math.random() * size
    const r = Math.random() * 2.2
    const shade = 90 + Math.floor(Math.random() * 70)
    ctx.fillStyle = `rgba(${shade},${shade - 4},${shade - 10},0.06)`
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
  }

  // Dark maria — big basalt plains.
  for (let i = 0; i < 7; i++) {
    const x = Math.random() * size
    const y = Math.random() * size
    const r = size * (0.08 + Math.random() * 0.16)
    const g = ctx.createRadialGradient(x, y, 0, x, y, r)
    g.addColorStop(0, 'rgba(40,40,46,0.5)')
    g.addColorStop(1, 'rgba(40,40,46,0)')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
  }

  // Craters: dark rim shadow + bright raised lip.
  const craterCount = 220
  for (let i = 0; i < craterCount; i++) {
    const x = Math.random() * size
    const y = Math.random() * size
    const r = Math.random() * Math.random() * (size * 0.05) + 3

    const shadow = ctx.createRadialGradient(x, y, r * 0.2, x, y, r)
    shadow.addColorStop(0, 'rgba(20,18,16,0.55)')
    shadow.addColorStop(0.7, 'rgba(20,18,16,0.18)')
    shadow.addColorStop(1, 'rgba(20,18,16,0)')
    ctx.fillStyle = shadow
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()

    ctx.strokeStyle = 'rgba(220,214,200,0.22)'
    ctx.lineWidth = Math.max(1, r * 0.08)
    ctx.beginPath()
    ctx.arc(x - r * 0.06, y - r * 0.06, r * 0.92, 0, Math.PI * 2)
    ctx.stroke()
  }

  const map = new THREE.CanvasTexture(canvas)
  map.colorSpace = THREE.SRGBColorSpace
  map.anisotropy = 8

  // The same luminance doubles as a bump map for relief under raking light.
  const bump = new THREE.CanvasTexture(canvas)

  return { map, bump }
}

export interface Moon {
  group: THREE.Group
  update: (dt: number, spinBoost: number) => void
}

export function createMoon(): Moon {
  const group = new THREE.Group()
  const { map, bump } = makeMoonTextures()

  const geometry = new THREE.SphereGeometry(1, 96, 96)
  const material = new THREE.MeshStandardMaterial({
    map,
    bumpMap: bump,
    bumpScale: 0.035,
    roughness: 0.95,
    metalness: 0.0,
    color: new THREE.Color('#cfc8ba'),
  })
  const moon = new THREE.Mesh(geometry, material)
  group.add(moon)

  // Atmospheric dust glow — a back-lit fresnel shell.
  const glowGeo = new THREE.SphereGeometry(1.28, 64, 64)
  const glowMat = new THREE.ShaderMaterial({
    transparent: true,
    blending: THREE.AdditiveBlending,
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      uColor: { value: new THREE.Color('#5a4a55') },
    },
    vertexShader: /* glsl */ `
      varying vec3 vNormal;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 vNormal;
      uniform vec3 uColor;
      void main() {
        float intensity = pow(0.62 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 2.4);
        gl_FragColor = vec4(uColor, intensity);
      }
    `,
  })
  const glow = new THREE.Mesh(glowGeo, glowMat)
  group.add(glow)

  let spin = 0
  return {
    group,
    update: (dt, spinBoost) => {
      // Slow, continuous, alive — with a hover-driven acceleration.
      spin += dt * (0.06 + spinBoost * 0.5)
      moon.rotation.y = spin
      glow.rotation.y = spin * 0.4
    },
  }
}
