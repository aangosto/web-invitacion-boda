/* =================================================================
   Punto de entrada de la página de CONFIRMACIÓN (cuestionario.html).
   El cuestionario es un asistente por pasos (wizard): ver modules/rsvp.js.
   ================================================================= */

import './style.css';

import { initRsvp } from './modules/rsvp.js';
import { logAudit } from './modules/audit.js';

function boot() {
  logAudit('visita');
  initRsvp();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
