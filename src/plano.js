/* =================================================================
   Punto de entrada de la página PRIVADA del plano del salón
   (plano.html). Toda la lógica vive en modules/plano-page.js.
   ================================================================= */

import './style.css';

import { initPlanoPage } from './modules/plano-page.js';

function boot() {
  initPlanoPage();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
