/* =================================================================
   PANEL DE LOS NOVIOS — marco general (resultados.html).

   Acceso: contraseña (VITE_RESULTS_PASSWORD) → signInAnonymously() de
   Firebase Auth por debajo → se muestra el panel con pestañas.

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
   Nada más: la barra de pestañas, la carga perezosa (init solo la
   primera vez que se abre) y el estado activo son automáticos.
   ============================================================ */

import { app, isConfigured } from '../firebase.js';
import { getAuth, signInAnonymously } from 'firebase/auth';

import { initRsvpTab } from './admin-rsvp.js';
import { initLugaresTab } from './admin-lugares.js';
import { initScoresTab } from './admin-scores.js';

/** Registro de pestañas del panel (añade aquí las futuras). */
const TABS = [
  { id: 'rsvp', label: 'Confirmaciones', init: initRsvpTab },
  { id: 'lugares', label: 'Lugares', init: initLugaresTab },
  { id: 'scores', label: 'Puntuaciones', init: initScoresTab },
];

export function initPanel() {
  const gate = document.getElementById('results-gate');
  const panel = document.getElementById('panel');
  if (!gate || !panel) return;

  const tabsBar = document.getElementById('panel-tabs');
  const view = document.getElementById('panel-view');
  const feedback = document.getElementById('results-feedback');
  const passInput = gate.querySelector('input[name="password"]');
  const submitBtn = gate.querySelector('button[type="submit"]');

  function setFeedback(msg, type) {
    feedback.textContent = msg || '';
    feedback.classList.remove('is-ok', 'is-error');
    if (type) feedback.classList.add(type);
  }

  /* ---------- Pestañas (carga perezosa por pestaña) ---------- */
  const initialized = new Set(); // pestañas ya inicializadas

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

    // init solo la PRIMERA vez que se entra en la pestaña
    if (!initialized.has(id)) {
      initialized.add(id);
      try {
        await tab.init(document.getElementById(`pane-${id}`));
      } catch (err) {
        console.error(`[Panel] Error inicializando la pestaña "${id}":`, err);
        document.getElementById(`pane-${id}`).textContent =
          'No se ha podido cargar esta sección. Recarga e inténtalo de nuevo.';
      }
    }
  }

  /* ---------- Puerta de acceso ---------- */
  gate.addEventListener('submit', async (e) => {
    e.preventDefault();

    const expected = import.meta.env.VITE_RESULTS_PASSWORD;
    if (!expected) {
      setFeedback('Página sin configurar: falta VITE_RESULTS_PASSWORD en el .env.', 'is-error');
      return;
    }
    if (passInput.value !== expected) {
      setFeedback('Contraseña incorrecta.', 'is-error');
      passInput.select();
      return;
    }
    if (!isConfigured) {
      setFeedback('Firebase no está configurado (.env): no hay datos que mostrar.', 'is-error');
      return;
    }

    submitBtn.disabled = true;
    setFeedback('Entrando…');
    try {
      // Sesión anónima: es lo que exigen las reglas para leer rsvp
      // y escribir en lugares.
      await signInAnonymously(getAuth(app));
      gate.hidden = true;
      panel.hidden = false;
      setFeedback('');
      buildTabs();
      activate(TABS[0].id);
    } catch (err) {
      console.error(err);
      submitBtn.disabled = false;
      const authOff = err && (
        err.code === 'auth/operation-not-allowed'
        || err.code === 'auth/admin-restricted-operation'
        || err.code === 'auth/configuration-not-found'
      );
      setFeedback(authOff
        ? 'El inicio de sesión ANÓNIMO no está activado en Firebase (Authentication → Método de acceso → Anónimo).'
        : 'No se ha podido entrar. Inténtalo de nuevo.', 'is-error');
    }
  });
}
