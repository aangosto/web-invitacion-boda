/* =================================================================
   Punto de entrada.
   Orquesta la apertura y, al terminar, inicializa el resto.
   ================================================================= */

import './style.css';

import { initOpening } from './modules/opening.js';
import { initCountdown } from './modules/countdown.js';
import { initNav } from './modules/nav.js';
import { initRsvp } from './modules/rsvp.js';
import { initMinigame } from './modules/minigame.js';
import { initCalendar } from './modules/calendar.js';
import { initReveal } from './modules/reveal.js';
import { initParallax } from './modules/parallax.js';

function boot() {
  // Módulos que no dependen de que el contenido sea visible
  initCountdown();
  initNav();
  initRsvp();
  initMinigame();
  initCalendar();

  // La apertura controla cuándo se muestra el contenido.
  // initReveal/initParallax se lanzan al terminar para medir bien el layout.
  initOpening({
    onFinish: () => {
      initReveal();
      initParallax();
    },
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
