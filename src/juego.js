/* =================================================================
   Punto de entrada de la página del JUEGO (juego.html).
   Inicializa el juego de cesta y el ranking en vivo.
   ================================================================= */

import './style.css';

import { initReveal } from './modules/reveal.js';
import { initMinigame } from './modules/minigame.js';
import { initRanking } from './modules/ranking.js';

function boot() {
  initMinigame();
  initRanking();
  initReveal();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
