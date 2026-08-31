/* =================================================================
   Punto de entrada de la página PRIVADA del hotel (hoteles.html).
   Toda la lógica vive en modules/hoteles-page.js.
   ================================================================= */

import './style.css';

import { initHotelesPage } from './modules/hoteles-page.js';

function boot() {
  initHotelesPage();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
