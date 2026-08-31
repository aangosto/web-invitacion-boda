/* =================================================================
   Punto de entrada de la página PRIVADA de invitados (invitados.html).
   Toda la lógica vive en modules/invitados-page.js.
   ================================================================= */

import './style.css';

import { initInvitadosPage } from './modules/invitados-page.js';

function boot() {
  initInvitadosPage();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
