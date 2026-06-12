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
