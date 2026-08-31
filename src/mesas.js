/* =================================================================
   Punto de entrada de la página PRIVADA de mesas (mesas.html).
   Toda la lógica vive en modules/mesas-page.js.
   ================================================================= */

import './style.css';

import { initMesasPage } from './modules/mesas-page.js';

function boot() {
  initMesasPage();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
