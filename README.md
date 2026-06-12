# Mundfall — Launch Site

> **The Mund Awaits.**

A single-page, cinematic teaser for **Mundfall**. A cratered 3D moon turns
slowly in the void above blackletter type; click it and it bleeds. This is a
ground-up rebuild — the original scaffold was thrown away and reimplemented
fresh.

> Note on "fable": earlier notes referenced building this "with fable". That
> referred to the **Claude Fable 5 model** (a Fable subagent doing the
> implementation work), not a CLI tool — no `fable` binary is involved anywhere
> in the stack.

## Stack

- **Vite** — dev server + static build
- **Vanilla TypeScript** (strict) — no framework
- **Three.js** — moon, atmosphere shell, twinkling starfield
- **Tailwind CSS v3** — utility layer over bespoke CSS in `src/style.css`
- **Fonts** — `UnifrakturMaguntia` (blackletter title) + `Cinzel` (ritual UI), via Google Fonts

Zero binary assets: the moon's crater map and bump map are painted onto
canvases at runtime (seeded fBm noise on a cylinder + stamped crater bowls,
`src/scene/textures.ts`), the glow sprite is a gradient canvas, the favicon is
an inline SVG, and the ambient drone is synthesized with WebAudio.

## Interactive layer

- **Rotating 3D moon** — real `SphereGeometry` with procedural color + bump
  maps, fresnel atmosphere shell, additive dust halo, slow ritual spin.
- **Hover acceleration** — rest the cursor on the moon and the spin eases up,
  then eases back down when you leave.
- **Blood eclipse on click** — click the moon: lighting, atmosphere, and halo
  swell to dark red over ~6 s, the title turns ember, and a German whisper
  surfaces, then everything withdraws.
- **Pointer parallax** — the camera leans toward the cursor while the
  starfield leans away, giving the scene depth.
- **Cursor ash trail** — pale ash motes (with occasional red embers) shed from
  the pointer and drift upward; during an eclipse most of them burn red.
- **Synthesized drone** — an opt-in low ritual hum (two detuned oscillators
  under a slow-breathing lowpass). It surges when an eclipse begins.
- **Staggered reveal** — title, tagline, and links rise out of blur on load;
  the title breathes a faint candle-glow forever after.

## Layout

```
index.html              page shell, hero copy, social links
src/main.ts             entry point — wires stage, ash, drone, DOM reactions
src/scene/stage.ts      renderer, camera, lights, parallax, render loop
src/scene/moon.ts       moon mesh, atmosphere shader, eclipse state machine
src/scene/textures.ts   procedural crater/bump/glow canvas generation
src/scene/starfield.ts  twinkling point-shader star shells
src/fx/ash.ts           2D-canvas cursor ash particles
src/fx/drone.ts         WebAudio ambient drone
src/style.css           Tailwind + bespoke keyframes/vignette
```

## Develop

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # tsc type-check + production build to /dist
npm run preview  # preview the production build
```

## Deploy

Static output in `dist/` — drop it on any static host (Vercel/Netlify,
framework preset: Vite).

## TODO

- Replace the stand-in social links in `index.html` (each marked with a
  `TODO` comment):
  - X/Twitter → `https://twitter.com/mundfall` (placeholder)
  - Steam → `https://store.steampowered.com/` (placeholder — point at the real store page)
