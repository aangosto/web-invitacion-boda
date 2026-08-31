/* =================================================================
   PUERTA DE ACCESO COMPARTIDA de las páginas de gestión
   (resultados.html, invitados.html y las futuras: hoteles, mesas…).

   Contraseña (VITE_RESULTS_PASSWORD) → signInAnonymously() de Firebase
   Auth → onEnter(). Al pasar la contraseña una vez se guarda en
   sessionStorage: el resto de páginas de gestión la reconocen y entran
   directas, sin volver a pedirla. Caduca al cerrar el navegador
   (sessionStorage, nunca localStorage) y el botón "Salir" (cualquier
   elemento con [data-salir]) la borra y recarga.

   Se guarda la contraseña introducida y se COMPRUEBA contra la esperada
   en cada carga: si algún día cambia la contraseña, las sesiones viejas
   dejan de valer solas. (No expone nada nuevo: la esperada ya viaja en
   el bundle, este candado es disuasorio; la seguridad real de los datos
   la ponen las reglas de Firestore, que aquí NO se relajan — la sesión
   anónima de Firebase se crea igual que siempre.)

   Uso desde cada página:
     initGate({ onEnter: async () => { ...pintar la página... } });
   El HTML debe tener #results-gate (form con input password) y
   #results-feedback. onEnter es responsable de mostrar su contenido.
   ================================================================= */

import { app, isConfigured } from '../firebase.js';
import { getAuth, signInAnonymously, signOut } from 'firebase/auth';

const KEY = 'panel-sesion';

function leerSesion() {
  try { return sessionStorage.getItem(KEY); } catch { return null; }
}
function guardarSesion(valor) {
  try { sessionStorage.setItem(KEY, valor); } catch { /* modo privado extremo: sin sesión compartida */ }
}
function borrarSesion() {
  try { sessionStorage.removeItem(KEY); } catch { /* nada */ }
}

/** Salir: borra la sesión compartida y vuelve a la puerta. */
function salir() {
  borrarSesion();
  signOut(getAuth(app)).catch(() => {}).finally(() => window.location.reload());
}

export function initGate({ onEnter }) {
  const gate = document.getElementById('results-gate');
  const feedback = document.getElementById('results-feedback');
  if (!gate || !feedback) return;

  const passInput = gate.querySelector('input[name="password"]');
  const submitBtn = gate.querySelector('button[type="submit"]');
  const expected = import.meta.env.VITE_RESULTS_PASSWORD;

  function setFeedback(msg, type) {
    feedback.textContent = msg || '';
    feedback.classList.remove('is-ok', 'is-error');
    if (type) feedback.classList.add(type);
  }

  /** Autentica en Firebase y entra. Devuelve si lo consiguió. */
  async function entrar() {
    submitBtn.disabled = true;
    setFeedback('Entrando…');
    try {
      // Sesión anónima de Firebase: lo que exigen las reglas. Se hace
      // SIEMPRE, también entrando con la sesión compartida.
      await signInAnonymously(getAuth(app));
      gate.hidden = true;
      setFeedback('');
      await onEnter();
      // Botones "Salir" de la página (existen ya tras onEnter)
      document.querySelectorAll('[data-salir]').forEach((btn) => {
        btn.addEventListener('click', salir);
      });
      return true;
    } catch (err) {
      console.error(err);
      gate.hidden = false;
      submitBtn.disabled = false;
      const authOff = err && (
        err.code === 'auth/operation-not-allowed'
        || err.code === 'auth/admin-restricted-operation'
        || err.code === 'auth/configuration-not-found'
      );
      setFeedback(authOff
        ? 'El inicio de sesión ANÓNIMO no está activado en Firebase (Authentication → Método de acceso → Anónimo).'
        : 'No se ha podido entrar. Inténtalo de nuevo.', 'is-error');
      return false;
    }
  }

  gate.addEventListener('submit', async (e) => {
    e.preventDefault();

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

    guardarSesion(passInput.value);
    await entrar();
  });

  // Sesión compartida: si ya pasó la contraseña en otra página de
  // gestión (este mismo navegador, sin cerrarlo), entra directamente.
  if (expected && isConfigured && leerSesion() === expected) {
    gate.hidden = true;
    entrar();
  }
}
