/**
 * Mundfall launch page — entry point.
 * Wires the Three.js stage, the ash cursor trail, the synthesized
 * drone, and the DOM reactions to the blood eclipse together.
 */
import './style.css';
import { Stage } from './scene/stage';
import { AshTrail } from './fx/ash';
import { Drone } from './fx/drone';

function byId<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id}`);
  return el as T;
}

const sceneCanvas = byId<HTMLCanvasElement>('scene');
const ashCanvas = byId<HTMLCanvasElement>('ash');
const title = byId<HTMLHeadingElement>('title');
const whisper = byId<HTMLParagraphElement>('whisper');
const droneToggle = byId<HTMLButtonElement>('drone-toggle');

const ash = new AshTrail(ashCanvas);
const drone = new Drone();

let whisperTimer: number | undefined;

new Stage(sceneCanvas, {
  onEclipseStart: () => {
    // The moon bleeds: title turns ember, a German whisper surfaces.
    title.classList.add('title-eclipsed');
    whisper.style.opacity = '1';
    drone.surge();
    window.clearTimeout(whisperTimer);
    whisperTimer = window.setTimeout(() => {
      title.classList.remove('title-eclipsed');
      whisper.style.opacity = '0';
    }, 5200);
  },
  onEclipseStrength: (strength) => {
    ash.setEclipseStrength(strength);
  },
});

// The ash layer rides its own light rAF loop (cheap 2D pass).
let lastTime = performance.now();
function ashLoop(now: number): void {
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  ash.update(dt);
  requestAnimationFrame(ashLoop);
}
requestAnimationFrame(ashLoop);

droneToggle.addEventListener('click', () => {
  const on = drone.toggle();
  droneToggle.textContent = on ? 'Sound: On' : 'Sound: Off';
  droneToggle.setAttribute('aria-pressed', String(on));
});
