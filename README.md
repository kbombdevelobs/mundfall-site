# Mundfall — Launch Site

> **The Mund Awaits.**

A dark, minimal, cinematic teaser for **Mundfall**. A cratered moon hangs in
the void under steady bombardment — shells fall in from the dark, burst into
dust and smoke, and leave scars that ride the surface as it turns. Click to
call a strike of your own; the body flares red and a slow blood-shadow eclipse
breathes across it. Grit, not arcade.

> Note on "fable": earlier notes referenced building this "with fable". That
> referred to the **Claude Fable 5 model** (a Fable subagent did an earlier
> ground-up pass), not a CLI tool — no `fable` binary is involved.

## Stack

- **Vite** — dev server + static build
- **Vanilla TypeScript** (strict) — no framework
- **Three.js** — moon, deep starfield, parallax
- **Tailwind CSS v3** — utility layer over bespoke CSS in `src/style.css`
- **Fonts** — `UnifrakturCook` (blackletter wordmark) + `Cinzel` (small caps)

Zero binary assets: the moon's colour, normal and bump maps are painted onto
canvases at load (seeded fBm terrain + maria + 220 craters with rims and
ejecta rays, `src/scene/textures.ts`), the film grain is an inline SVG noise,
the favicon is inline SVG, and all audio is synthesized with WebAudio.

## Feel

- **Cratered moon, no glow** — high-relief surface from a real normal map,
  hard raking light into a sharp terminator, crushed exposure for grit.
- **Atmospheric eclipse** — a slow blood-shadow breathes across the disc;
  impacts deepen it for a moment, like the body flinching under fire.
- **Bombardment** — ambient salvos never stop: shells streak in, flash, throw
  dust and drifting smoke, and leave charred scars that rotate with the moon.
- **Call a strike** — click anywhere to drop a cluster onto the surface.
- **Minimal reticle cursor**, pointer parallax, film grain, and a continuous
  synthesized low rumble with gritty impact booms (sound on by default).

## Layout

```
index.html              minimal shell — wordmark, tagline, three links
src/main.ts             entry — wires stage, bombardment, audio
src/scene/stage.ts      renderer, space lighting, parallax, moon screen-circle
src/scene/moon.ts       moon mesh, dark atmosphere, eclipse + hit flash
src/scene/textures.ts   procedural colour / normal / bump map generation
src/scene/starfield.ts  twinkling point-shader star shells (deep field)
src/fx/battle.ts        2D bombardment — shells, dust, smoke, soot, reticle
src/fx/audio.ts         WebAudio rumble bed + combat SFX
src/style.css           Tailwind + grain, vignette, type treatment
```

## Develop

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # tsc type-check + production build to /dist
npm run preview  # preview the production build
```

## Deploy

Static output in `dist/` — any static host (Vercel/Netlify, preset: Vite).

## TODO

- Replace the stand-in links in `index.html` (each marked with a `TODO`):
  - Steam → `https://store.steampowered.com/` (placeholder)
  - X/Twitter → `https://twitter.com/mundfall` (placeholder)
