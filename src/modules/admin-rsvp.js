/* =================================================================
   Panel → pestaña CONFIRMACIONES.
   Lee la colección "rsvp" (requiere la sesión anónima ya iniciada por
   el marco del panel) y pinta contadores + una tarjeta por respuesta.
   ================================================================= */

import { db } from '../firebase.js';
import { collection, doc, getDocs, orderBy, query, updateDoc } from 'firebase/firestore';

const MENU_LABELS = { ninguno: 'Menú normal', vegetariano: 'Vegetariano', vegano: 'Vegano', otro: 'Otro' };
const MODE_LABELS = { bus: 'Bus', ave: 'AVE', coche: 'Coche', otro: 'Otro' };

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

/** Líneas legibles con los datos de viaje de una confirmación. */
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

/** Init de la pestaña: descarga y pinta (re-llamable tras editar/borrar). */
export async function initRsvpTab(container) {
  container.textContent = 'Cargando confirmaciones…';

  const snap = await getDocs(query(collection(db, 'rsvp'), orderBy('createdAt', 'desc')));
  // Las confirmaciones en la papelera (deleted) no cuentan ni se listan
  const docs = snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((d) => d.deleted !== true);
  container.textContent = '';

  const feedback = el('p', 'form-feedback');
  feedback.setAttribute('role', 'status');
  feedback.setAttribute('aria-live', 'polite');
  function setFeedback(msg, type) {
    feedback.textContent = msg || '';
    feedback.classList.remove('is-ok', 'is-error');
    if (type) feedback.classList.add(type);
  }

  // --- Contadores: asistentes = suma de personas de los que SÍ vienen
  //     (docs antiguos sin `attending` cuentan como sí) ---
  let asistentes = 0;
  let noAsisten = 0;
  docs.forEach((data) => {
    if (data.attending === false) noAsisten += 1;
    else asistentes += (data.people || []).length;
  });

  const statsEl = el('div', 'res-stats');
  [
    { num: asistentes, label: 'asistentes' },
    { num: docs.length, label: 'respuestas' },
    { num: noAsisten, label: 'no asisten' },
  ].forEach((s) => {
    const box = el('div', 'res-stat');
    box.appendChild(el('span', 'res-stat__num', String(s.num)));
    box.appendChild(el('span', 'res-stat__label', s.label));
    statsEl.appendChild(box);
  });
  container.appendChild(statsEl);
  container.appendChild(feedback);

  // --- Una tarjeta por confirmación ---
  const listEl = el('div', 'res-list');
  if (docs.length === 0) {
    listEl.appendChild(el('p', 'res-empty', 'Aún no hay confirmaciones.'));
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

    // --- Acciones: borrar (soft delete → papelera) ---
    const actions = el('div', 'res-card__actions');
    const del = el('button', 'adm-row__btn adm-row__btn--danger', 'Borrar');
    del.type = 'button';
    del.addEventListener('click', async () => {
      if (!window.confirm(`La confirmación de "${data.filledBy || '—'}" se moverá a la papelera; podrás recuperarla desde la pestaña Papelera. ¿Continuar?`)) return;
      del.disabled = true;
      setFeedback('Moviendo a la papelera…');
      try {
        await updateDoc(doc(db, 'rsvp', data.id), { deleted: true });
        card.remove();
        setFeedback('Movida a la papelera ✓', 'is-ok');
      } catch (err) {
        console.error(err);
        del.disabled = false;
        setFeedback('No se ha podido borrar. Inténtalo de nuevo.', 'is-error');
      }
    });
    actions.appendChild(del);
    card.appendChild(actions);

    listEl.appendChild(card);
  });
  container.appendChild(listEl);
}
