/* =================================================================
   RESULTADOS — página privada para los novios (resultados.html).

   Flujo de acceso:
     1. El visitante introduce la contraseña (VITE_RESULTS_PASSWORD).
     2. Si es correcta, se hace signInAnonymously() de Firebase Auth por
        debajo (sin pantalla de login visible).
     3. Con la sesión anónima, las reglas de Firestore permiten LEER la
        colección "rsvp" (allow read: if request.auth != null) y se
        pintan todas las confirmaciones, ordenadas por fecha.

   Nota honesta de seguridad: la contraseña va incrustada en el bundle
   (todo VITE_* es público) y cualquiera podría autenticarse anónimamente
   por su cuenta; esto DISUADE al curioso, no detiene a un atacante. Para
   los datos de una boda es un equilibrio razonable.
   ================================================================= */

import { app, db, isConfigured } from '../firebase.js';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { collection, getDocs, orderBy, query } from 'firebase/firestore';

const MENU_LABELS = { ninguno: 'Menú normal', vegetariano: 'Vegetariano', vegano: 'Vegano', otro: 'Otro' };
const MODE_LABELS = { bus: 'Bus', ave: 'AVE', coche: 'Coche', otro: 'Otro' };

/* ---- Ayudantes ---- */

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

/** Timestamp de Firestore → "24/10/2026 12:30" (o '—' si falta). */
function formatDate(ts) {
  if (!ts || typeof ts.toDate !== 'function') return '—';
  const d = ts.toDate();
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()} ${hh}:${mi}`;
}

/** Línea legible con los datos de una persona. */
function personLine(p) {
  const partes = [];
  partes.push(MENU_LABELS[p.menu] || p.menu || '—');
  if (p.menu === 'otro' && p.menuOther) partes.push(`(${p.menuOther})`);
  if (p.allergies) partes.push(`Alergias: ${p.allergies}`);
  partes.push(`Bus ida ${p.busIda ? 'sí' : 'no'} · vuelta ${p.busVuelta ? 'sí' : 'no'}`);
  if (p.needsShoes) partes.push(`Zapatos talla ${p.shoeSize || '¿?'}`);
  return partes.join(' · ');
}

/** Línea legible con los datos de viaje de una confirmación. */
function travelLines(data) {
  const lines = [];
  if (data.origin === 'zaragoza') {
    lines.push('De Zaragoza (sin ayuda de viaje)');
    return lines;
  }
  const t = data.travel || {};
  if (t.ida) {
    const partes = [`Ida: ${MODE_LABELS[t.ida.mode] || '—'}`];
    if (t.ida.from) partes.push(`desde ${t.ida.from}`);
    if (t.ida.arrivalDay) partes.push(`llega ${t.ida.arrivalDay}${t.ida.arrivalTime ? ` ${t.ida.arrivalTime}` : ''}`);
    if (t.ida.canCarry === true) partes.push('tiene plazas libres');
    lines.push(partes.join(' · '));
  }
  if (t.vuelta) {
    const partes = [`Vuelta: ${MODE_LABELS[t.vuelta.mode] || '—'}`];
    if (t.vuelta.day) partes.push(`el ${t.vuelta.day}`);
    if (t.vuelta.canCarry === true) partes.push('puede llevar a alguien');
    lines.push(partes.join(' · '));
  }
  return lines;
}

export function initResultados() {
  const gate = document.getElementById('results-gate');
  if (!gate) return;

  const feedback = document.getElementById('results-feedback');
  const results = document.getElementById('results');
  const statsEl = document.getElementById('results-stats');
  const listEl = document.getElementById('results-list');
  const passInput = gate.querySelector('input[name="password"]');
  const submitBtn = gate.querySelector('button[type="submit"]');

  function setFeedback(msg, type) {
    feedback.textContent = msg || '';
    feedback.classList.remove('is-ok', 'is-error');
    if (type) feedback.classList.add(type);
  }

  /* ---- Pinta las confirmaciones ya descargadas ---- */
  function render(docs) {
    // Estadísticas: asistentes = suma de personas de los que SÍ vienen
    // (docs antiguos sin `attending` cuentan como sí).
    let asistentes = 0;
    let noAsisten = 0;
    docs.forEach((data) => {
      if (data.attending === false) noAsisten += 1;
      else asistentes += (data.people || []).length;
    });

    statsEl.innerHTML = '';
    const stats = [
      { num: asistentes, label: 'asistentes' },
      { num: docs.length, label: 'respuestas' },
      { num: noAsisten, label: 'no asisten' },
    ];
    stats.forEach((s) => {
      const box = el('div', 'res-stat');
      box.appendChild(el('span', 'res-stat__num', String(s.num)));
      box.appendChild(el('span', 'res-stat__label', s.label));
      statsEl.appendChild(box);
    });

    listEl.innerHTML = '';
    if (docs.length === 0) {
      listEl.appendChild(el('p', 'res-empty', 'Aún no hay confirmaciones.'));
      return;
    }

    docs.forEach((data) => {
      const card = el('article', 'res-card');

      const head = el('header', 'res-card__head');
      head.appendChild(el('span', 'res-card__who', data.filledBy || '—'));
      head.appendChild(el('span',
        data.attending === false ? 'res-badge res-badge--no' : 'res-badge',
        data.attending === false ? 'No asiste' : 'Asiste'));
      card.appendChild(head);
      card.appendChild(el('p', 'res-card__date', formatDate(data.createdAt)));

      if (data.attending !== false) {
        (data.people || []).forEach((p) => {
          const person = el('div', 'res-person');
          person.appendChild(el('p', 'res-person__name', p.name || '—'));
          person.appendChild(el('p', 'res-person__meta', personLine(p)));
          card.appendChild(person);
        });
        travelLines(data).forEach((line) => card.appendChild(el('p', 'res-card__travel', line)));
      }

      listEl.appendChild(card);
    });
  }

  /* ---- Autenticación anónima + descarga de "rsvp" ---- */
  async function loadResults() {
    await signInAnonymously(getAuth(app));
    const snap = await getDocs(query(collection(db, 'rsvp'), orderBy('createdAt', 'desc')));
    return snap.docs.map((d) => d.data());
  }

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
    setFeedback('Cargando confirmaciones…');
    try {
      const docs = await loadResults();
      gate.hidden = true;
      results.hidden = false;
      render(docs);
    } catch (err) {
      console.error(err);
      submitBtn.disabled = false;
      // configuration-not-found: el servicio Auth no está inicializado en
      // el proyecto; admin-restricted-operation / operation-not-allowed:
      // el proveedor anónimo está desactivado. La solución es la misma.
      const authOff = err && (
        err.code === 'auth/operation-not-allowed'
        || err.code === 'auth/admin-restricted-operation'
        || err.code === 'auth/configuration-not-found'
      );
      if (authOff) {
        setFeedback('El inicio de sesión ANÓNIMO no está activado en Firebase (Authentication → Método de acceso → Anónimo).', 'is-error');
      } else if (err && err.code === 'permission-denied') {
        setFeedback('Firestore deniega la lectura: falta republicar firestore.rules.', 'is-error');
      } else {
        setFeedback('No se han podido cargar las confirmaciones. Inténtalo de nuevo.', 'is-error');
      }
    }
  });
}
