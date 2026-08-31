/* =================================================================
   PANEL DE LOS NOVIOS — marco general (resultados.html).

   Acceso: puerta compartida de las páginas de gestión (panel-gate.js):
   contraseña → signInAnonymously() → panel con pestañas. La sesión se
   comparte vía sessionStorage con invitados.html y futuras páginas.

   ============================================================
   🧩 CÓMO AÑADIR UNA PESTAÑA NUEVA EN EL FUTURO
   ============================================================
   1. Crea un módulo src/modules/admin-loquesea.js que exporte:
        export async function initLoQueSeaTab(container) { ... }
      Recibe el <div> contenedor de su pestaña y pinta dentro lo que
      quiera. El patrón habitual es: leer de Firestore al entrar,
      pintar, y guardar con las funciones de una capa de datos propia
      (mira lugares-data.js como plantilla: fetch/save/delete).
   2. Añádelo al array TABS de abajo: { id, label, init }.
   Nada más: la barra de pestañas y el estado activo son automáticos.
   El init se ejecuta CADA VEZ que se entra en la pestaña (así los
   cambios hechos en otra —p. ej. restaurar desde la Papelera— se ven
   recién cargados al volver).
   ============================================================ */

import { initGate } from './panel-gate.js';

import { initRsvpTab } from './admin-rsvp.js';
import { initTotalesTab } from './admin-totales.js';
import { initCronologiaTab } from './admin-cronologia.js';
import { initLugaresTab } from './admin-lugares.js';
import { initScoresTab } from './admin-scores.js';
import { initRegaloTab } from './admin-regalo.js';
import { initPapeleraTab } from './admin-papelera.js';
import { initAuditoriaTab } from './admin-auditoria.js';

/** Registro de pestañas del panel (añade aquí las futuras). */
const TABS = [
  { id: 'rsvp', label: 'Confirmaciones', init: initRsvpTab },
  { id: 'totales', label: 'Totales', init: initTotalesTab },
  { id: 'crono', label: 'Cronología', init: initCronologiaTab },
  { id: 'lugares', label: 'Lugares', init: initLugaresTab },
  { id: 'scores', label: 'Puntuaciones', init: initScoresTab },
  { id: 'regalo', label: 'Regalo', init: initRegaloTab },
  { id: 'auditoria', label: 'Auditoría', init: initAuditoriaTab },
  { id: 'papelera', label: 'Papelera', init: initPapeleraTab },
];

export function initPanel() {
  const gate = document.getElementById('results-gate');
  const panel = document.getElementById('panel');
  if (!gate || !panel) return;

  const tabsBar = document.getElementById('panel-tabs');
  const view = document.getElementById('panel-view');

  /* ---------- Pestañas (se recargan al entrar) ---------- */
  function buildTabs() {
    TABS.forEach((tab, i) => {
      // Botón de la pestaña
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'panel-tab';
      btn.textContent = tab.label;
      btn.dataset.tab = tab.id;
      btn.setAttribute('role', 'tab');
      btn.addEventListener('click', () => activate(tab.id));
      tabsBar.appendChild(btn);

      // Contenedor de su contenido
      const pane = document.createElement('div');
      pane.className = 'panel-pane';
      pane.id = `pane-${tab.id}`;
      pane.hidden = i !== 0;
      view.appendChild(pane);
    });
  }

  async function activate(id) {
    const tab = TABS.find((t) => t.id === id);
    if (!tab) return;

    tabsBar.querySelectorAll('.panel-tab').forEach((b) => {
      const active = b.dataset.tab === id;
      b.classList.toggle('is-active', active);
      b.setAttribute('aria-selected', String(active));
    });
    view.querySelectorAll('.panel-pane').forEach((p) => {
      p.hidden = p.id !== `pane-${id}`;
    });

    // Recargar la pestaña al entrar: así refleja lo hecho en las demás
    // (p. ej. algo movido a la Papelera o restaurado desde ella).
    try {
      await tab.init(document.getElementById(`pane-${id}`));
    } catch (err) {
      console.error(`[Panel] Error inicializando la pestaña "${id}":`, err);
      document.getElementById(`pane-${id}`).textContent =
        'No se ha podido cargar esta sección. Recarga e inténtalo de nuevo.';
    }
  }

  /* ---------- Puerta de acceso compartida (panel-gate.js) ---------- */
  initGate({
    onEnter() {
      panel.hidden = false;
      // Si un intento anterior falló a medias, no duplicar las pestañas
      if (!tabsBar.childElementCount) buildTabs();
      activate(TABS[0].id);
    },
  });
}
