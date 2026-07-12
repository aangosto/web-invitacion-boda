/* =================================================================
   Punto de entrada del PANEL PRIVADO de los novios (resultados.html).
   Marco de pestañas en modules/panel.js; cada pestaña es un módulo
   admin-*.js (confirmaciones, lugares…).
   ================================================================= */

import './style.css';

import { initPanel } from './modules/panel.js';

function boot() {
  initPanel();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
