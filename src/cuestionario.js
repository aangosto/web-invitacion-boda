/* =================================================================
   Punto de entrada de la página de CONFIRMACIÓN (cuestionario.html).
   ================================================================= */

import './style.css';

import { initReveal } from './modules/reveal.js';
import { initRsvp } from './modules/rsvp.js';

function boot() {
  initRsvp();
  initReveal();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
