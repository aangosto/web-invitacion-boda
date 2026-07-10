/* =================================================================
   Punto de entrada de la página PRIVADA de resultados (resultados.html).
   Lógica en modules/resultados.js.
   ================================================================= */

import './style.css';

import { initResultados } from './modules/resultados.js';

function boot() {
  initResultados();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
