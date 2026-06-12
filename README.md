# Mundfall — Launch Site

> **The Mund Awaits.**

A dark, modern, interactive teaser page for **Mundfall**. The centerpiece is a
procedurally-textured 3D moon rotating slowly in the void, with blackletter
typography and stand-in social links.

## Stack

- **Vite** — dev server + build
- **Vanilla TypeScript** — no framework, single page
- **Three.js** — the rotating, cratered 3D moon, fresnel dust-glow, and starfield
- **Tailwind CSS** (v3) — utility layer alongside bespoke CSS in `src/style.css`
- **Fonts** — `UnifrakturCook` (blackletter title) + `Cinzel` (UI), via Google Fonts

> Note on "fable": the request was to scaffold this "using fable", but no `fable`
> CLI or tool resolved on this machine (`which fable` → not found). It was treated
> as a misspeak for the GitHub CLI (`gh`), which created and cloned this repo.
> The web stack above was chosen as a pragmatic default.

## What makes it interactive

- **Rotating 3D moon** — real `SphereGeometry` with a canvas-generated crater
  map + bump map, slow continuous spin, lit by a cold key light and a faint
  blood-red rim.
- **Hover acceleration** — move the cursor near the moon and its rotation speeds up.
- **Cursor dust trail** — a fading particle trail follows the pointer (`src/dust.ts`).
- **Parallax** — moon and starfield drift against mouse movement for depth.
- **Word-by-word reveal** — the title, tagline, and links fade in on load.

## Develop

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # type-check + production build to /dist
npm run preview  # preview the production build
```

## Deploy

Static output in `dist/` — drop it on Vercel or Netlify (framework preset: Vite).

## TODO

- Replace the stand-in social links in `index.html`:
  - X/Twitter → `https://twitter.com/mundfall` (placeholder)
  - Steam → `https://store.steampowered.com/` (placeholder — point at the real store page)
