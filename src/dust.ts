/**
 * A fading dust trail that follows the cursor. Pure 2D canvas — sits above the
 * WebGL moon, below the UI. Particles drift, dim, and die.
 */
interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  max: number
  size: number
}

export function initDustTrail(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext('2d')!
  const particles: Particle[] = []
  let dpr = Math.min(window.devicePixelRatio || 1, 2)

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = window.innerWidth * dpr
    canvas.height = window.innerHeight * dpr
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  }
  resize()
  window.addEventListener('resize', resize)

  function spawn(x: number, y: number) {
    const count = 3
    for (let i = 0; i < count; i++) {
      const max = 600 + Math.random() * 500
      particles.push({
        x,
        y,
        vx: (Math.random() - 0.5) * 0.4,
        vy: (Math.random() - 0.5) * 0.4 - 0.15,
        life: max,
        max,
        size: 1 + Math.random() * 2.4,
      })
    }
  }

  let lastX = 0
  let lastY = 0
  window.addEventListener('pointermove', (e) => {
    const dx = e.clientX - lastX
    const dy = e.clientY - lastY
    if (dx * dx + dy * dy > 6) {
      spawn(e.clientX, e.clientY)
      lastX = e.clientX
      lastY = e.clientY
    }
  })

  let prev = performance.now()
  function frame(now: number) {
    const dt = now - prev
    prev = now
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i]
      p.life -= dt
      if (p.life <= 0) {
        particles.splice(i, 1)
        continue
      }
      p.x += p.vx * dt * 0.06
      p.y += p.vy * dt * 0.06
      const t = p.life / p.max
      const alpha = t * 0.5
      ctx.beginPath()
      ctx.fillStyle = `rgba(${200 + Math.floor(40 * (1 - t))}, ${170}, ${150}, ${alpha})`
      ctx.arc(p.x, p.y, p.size * t, 0, Math.PI * 2)
      ctx.fill()
    }
    requestAnimationFrame(frame)
  }
  requestAnimationFrame(frame)
}
