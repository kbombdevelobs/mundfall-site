/**
 * Mundfall launch page — entry point.
 * Wires the Three.js stage (moon, stars, parallax), the 2D battle layer
 * (lander cursor, moon AA flak, surface impacts) and the battle audio.
 */
import './style.css';
import { Stage } from './scene/stage';
import { Battle } from './fx/battle';
import { BattleAudio } from './fx/audio';

function byId<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id}`);
  return el as T;
}

const sceneCanvas = byId<HTMLCanvasElement>('scene');
const battleCanvas = byId<HTMLCanvasElement>('battle');
const soundToggle = byId<HTMLButtonElement>('sound-toggle');
const rally = byId<HTMLDivElement>('rally');

const audio = new BattleAudio();
const stage = new Stage(sceneCanvas);

new Battle(
  battleCanvas,
  () => stage.getMoonScreen(),
  audio,
  (x, y) => stage.handleImpact(x, y),
);

// Sound is on by default; the toggle quietly dims when the siege is muted.
soundToggle.addEventListener('click', () => {
  const on = audio.toggle();
  soundToggle.setAttribute('aria-pressed', String(on));
});

// Every strike stamps the rally cry over the red eclipse. Ignore clicks that
// land on the actual links/buttons.
let rallyTimer: number | undefined;
window.addEventListener('pointerdown', (e) => {
  const t = e.target as HTMLElement | null;
  if (t && typeof t.closest === 'function' && t.closest('a, button')) return;
  rally.classList.remove('is-firing');
  void rally.offsetWidth; // force reflow so the animation restarts
  rally.classList.add('is-firing');
  window.clearTimeout(rallyTimer);
  rallyTimer = window.setTimeout(() => rally.classList.remove('is-firing'), 1500);
});
