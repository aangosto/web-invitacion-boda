/* =================================================================
   Punto de entrada de la PÁGINA PRINCIPAL (index.html).
   Orquesta la apertura y, al terminar, inicializa el resto.
   El RSVP y el juego viven en sus propias páginas
   (cuestionario.html / juego.html).
   ================================================================= */

import './style.css';

import { initOpening } from './modules/opening.js';
import { initCountdown } from './modules/countdown.js';
import { initNav } from './modules/nav.js';
import { initCalendar } from './modules/calendar.js';
import { initReveal } from './modules/reveal.js';
import { initParallax } from './modules/parallax.js';
import { initLugares } from './modules/lugares.js';
import { initRegalo } from './modules/regalo.js';
import { logAudit } from './modules/audit.js';

function boot() {
  logAudit('visita');
  initCountdown();
  initNav();
  initCalendar();
  initLugares();
  initRegalo();

  // La apertura controla cuándo se muestra el contenido.
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
