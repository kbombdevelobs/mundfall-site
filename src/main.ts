import * as THREE from 'three'
import './style.css'
import { createMoon } from './moon'
import { initDustTrail } from './dust'

// ---------------------------------------------------------------------------
// Scene
// ---------------------------------------------------------------------------
const canvas = document.getElementById('scene') as HTMLCanvasElement
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
renderer.setSize(window.innerWidth, window.innerHeight)

const scene = new THREE.Scene()
const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100)
camera.position.set(0, 0, 4.2)

// Starfield ----------------------------------------------------------------
function makeStars(count: number): THREE.Points {
  const positions = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) {
    const r = 18 + Math.random() * 30
    const theta = Math.random() * Math.PI * 2
    const phi = Math.acos(2 * Math.random() - 1)
    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta)
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta)
    positions[i * 3 + 2] = r * Math.cos(phi)
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  const mat = new THREE.PointsMaterial({
    color: 0xbfc4d0,
    size: 0.06,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.7,
  })
  return new THREE.Points(geo, mat)
}
const stars = makeStars(1400)
scene.add(stars)

// Lighting — cold key, faint warm rim -------------------------------------
scene.add(new THREE.AmbientLight(0x1a1d28, 1.2))
const key = new THREE.DirectionalLight(0xcdd6e6, 2.6)
key.position.set(-3, 1.5, 2.5)
scene.add(key)
const rim = new THREE.DirectionalLight(0x7a1f2b, 0.8)
rim.position.set(3, -1, -2)
scene.add(rim)

// Moon ---------------------------------------------------------------------
const moon = createMoon()
moon.group.scale.setScalar(1.35)
scene.add(moon.group)

// ---------------------------------------------------------------------------
// Interaction: parallax + hover spin boost
// ---------------------------------------------------------------------------
const pointer = { x: 0, y: 0 }
const target = { x: 0, y: 0 }
let spinBoost = 0
let spinBoostTarget = 0

window.addEventListener('pointermove', (e) => {
  target.x = (e.clientX / window.innerWidth - 0.5) * 2
  target.y = (e.clientY / window.innerHeight - 0.5) * 2
})

// Accelerate the moon while the cursor hovers near its centre.
window.addEventListener('pointermove', (e) => {
  const cx = window.innerWidth / 2
  const cy = window.innerHeight * 0.42
  const d = Math.hypot(e.clientX - cx, e.clientY - cy)
  spinBoostTarget = d < Math.min(window.innerWidth, window.innerHeight) * 0.28 ? 1 : 0
})

// ---------------------------------------------------------------------------
// Render loop
// ---------------------------------------------------------------------------
let prev = performance.now()
function animate(now: number) {
  const dt = Math.min((now - prev) / 1000, 0.05)
  prev = now

  pointer.x += (target.x - pointer.x) * 0.04
  pointer.y += (target.y - pointer.y) * 0.04
  spinBoost += (spinBoostTarget - spinBoost) * 0.05

  moon.update(dt, spinBoost)
  moon.group.rotation.x = pointer.y * 0.18
  moon.group.position.x = pointer.x * 0.25
  moon.group.position.y = -pointer.y * 0.12 + 0.15

  stars.rotation.y += dt * 0.01
  stars.rotation.x = pointer.y * 0.05

  camera.lookAt(0, 0, 0)
  renderer.render(scene, camera)
  requestAnimationFrame(animate)
}
requestAnimationFrame(animate)

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(window.innerWidth, window.innerHeight)
})

// ---------------------------------------------------------------------------
// Dust trail + UI reveal
// ---------------------------------------------------------------------------
initDustTrail(document.getElementById('dust') as HTMLCanvasElement)

const yearEl = document.getElementById('year')
if (yearEl) yearEl.textContent = String(new Date().getFullYear())

// Staggered reveal of the hero copy on load.
const reveals = Array.from(document.querySelectorAll<HTMLElement>('[data-reveal]'))
reveals.forEach((el, i) => {
  window.setTimeout(() => el.classList.add('is-in'), 350 + i * 320)
})
