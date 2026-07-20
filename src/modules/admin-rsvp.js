/* =================================================================
   Panel → pestaña CONFIRMACIONES.
   Lee la colección "rsvp" (requiere la sesión anónima ya iniciada por
   el marco del panel) y pinta contadores + una tarjeta por respuesta.
   ================================================================= */

import { db } from '../firebase.js';
import { collection, doc, getDocs, orderBy, query, updateDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { createRsvpEditor } from './rsvp-editor.js';

const MENU_LABELS = { ninguno: 'Menú normal', vegetariano: 'Vegetariano', vegano: 'Vegano', otro: 'Otro' };
const MODE_LABELS = { bus: 'Bus', ave: 'AVE/Tren', coche: 'Coche', avion: 'Avión', otro: 'Otro', buscando: 'Aún no lo sé / busca transporte' };

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

/** Timestamp de Firestore → "24/10/2026 12:30" (o 'sin fecha' si falta). */
function formatDate(ts) {
  if (!ts || typeof ts.toDate !== 'function') return 'sin fecha';
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
    else if (t.ida.arrivalTime) partes.push(`llega ~${t.ida.arrivalTime}`);
    if (t.ida.canCarry === true) partes.push(t.ida.seats ? `${t.ida.seats} plazas libres` : 'tiene plazas libres');
    if (t.ida.departTime) partes.push(`sale ~${t.ida.departTime}`);
    lines.push(partes.join(' · '));
  }
  if (t.vuelta) {
    const partes = [`Vuelta: ${MODE_LABELS[t.vuelta.mode] || '—'}`];
    if (t.vuelta.day) partes.push(`el ${t.vuelta.day}`);
    if (t.vuelta.departTime) partes.push(`sale ~${t.vuelta.departTime}`);
    if (t.vuelta.canCarry === true) partes.push('puede llevar a alguien');
    lines.push(partes.join(' · '));
  }
  return lines;
}

/** Snapshot de los campos editables tal como están AHORA (para guardar
    el "original" la primera vez que se edita). Sin valores undefined. */
function editableSnapshot(d) {
  if (d.attending === false) return { filledBy: d.filledBy || '', attending: false };
  const snap = { filledBy: d.filledBy || '', attending: true, origin: d.origin || '', people: Array.isArray(d.people) ? d.people : [] };
  if (d.travel) snap.travel = d.travel;
  return snap;
}

/** Guarda una edición. La PRIMERA vez conserva el estado original en el
    campo `original` (no se sobrescribe en ediciones posteriores). Se
    reescribe el documento entero (setDoc) para no dejar campos obsoletos
    al cambiar, p. ej., de "asiste" a "no asiste". */
async function saveEdit(data, payload) {
  const original = data.original || editableSnapshot(data);
  const full = { ...payload, original, edited: true, editedAt: serverTimestamp() };
  if (data.createdAt) full.createdAt = data.createdAt;
  if (data.deleted === true) full.deleted = true;
  await setDoc(doc(db, 'rsvp', data.id), full);
}

/** Devuelve el documento a los valores guardados en `original`. */
async function restoreOriginal(data) {
  const orig = data.original;
  const full = { ...orig, original: orig, edited: false };
  if (data.createdAt) full.createdAt = data.createdAt;
  if (data.deleted === true) full.deleted = true;
  await setDoc(doc(db, 'rsvp', data.id), full);
}

/** Caja de solo lectura con el original enviado por el invitado. */
function originalBox(orig) {
  const box = el('div', 'res-original');
  box.appendChild(el('p', 'res-original__title', 'Original enviado por el invitado'));
  box.appendChild(el('p', 'res-original__who', orig.filledBy || '—'));
  if (orig.attending === false) {
    box.appendChild(el('p', 'res-person__meta', 'No asiste'));
    return box;
  }
  (orig.people || []).forEach((p) => {
    box.appendChild(el('p', 'res-person__name', p.name || '—'));
    box.appendChild(el('p', 'res-person__meta', personLine(p)));
  });
  travelLines(orig).forEach((line) => box.appendChild(el('p', 'res-card__travel', line)));
  return box;
}

/** Pantalla de edición (ocupa la pestaña); al terminar, recarga la lista. */
function renderEditor(container, data) {
  container.innerHTML = '';
  const wrap = el('div', 'adm-editor');
  wrap.appendChild(el('h3', 'adm-editor__title', `Editar: ${data.filledBy || '—'}`));

  const editor = createRsvpEditor(data);
  wrap.appendChild(editor.element);

  const fb = el('p', 'form-feedback');
  fb.setAttribute('role', 'status');
  fb.setAttribute('aria-live', 'polite');

  const actions = el('div', 'adm-editor__actions');
  const cancel = el('button', 'btn btn--ghost', 'Cancelar');
  cancel.type = 'button';
  cancel.addEventListener('click', () => initRsvpTab(container));
  const save = el('button', 'btn btn--solid', 'Guardar');
  save.type = 'button';
  save.addEventListener('click', async () => {
    const error = editor.validate();
    if (error) { fb.textContent = error; fb.className = 'form-feedback is-error'; return; }
    save.disabled = true;
    fb.textContent = 'Guardando…'; fb.className = 'form-feedback';
    try {
      await saveEdit(data, editor.read());
      await initRsvpTab(container);
    } catch (err) {
      console.error(err);
      save.disabled = false;
      fb.textContent = 'No se ha podido guardar. Inténtalo de nuevo.'; fb.className = 'form-feedback is-error';
    }
  });
  actions.append(cancel, save);

  // Restaurar original: solo si ya hay un original guardado
  if (data.original) {
    const restore = el('button', 'btn btn--ghost btn--block', 'Restaurar original');
    restore.type = 'button';
    restore.addEventListener('click', async () => {
      if (!window.confirm('Se descartarán los cambios y volverá a lo que envió el invitado. ¿Continuar?')) return;
      restore.disabled = true;
      fb.textContent = 'Restaurando…'; fb.className = 'form-feedback';
      try { await restoreOriginal(data); await initRsvpTab(container); }
      catch (err) { console.error(err); restore.disabled = false; fb.textContent = 'No se ha podido restaurar.'; fb.className = 'form-feedback is-error'; }
    });
    wrap.append(actions, fb, restore);
  } else {
    wrap.append(actions, fb);
  }

  container.appendChild(wrap);
  wrap.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
    // Marca "Editada" si el registro se modificó respecto al original
    if (data.edited === true) {
      const chip = el('span', 'res-badge res-badge--edited', '✎ Editada');
      if (data.editedAt) chip.title = `Editada el ${formatDate(data.editedAt)}`;
      head.appendChild(chip);
    }
    head.appendChild(el('span',
      data.attending === false ? 'res-badge res-badge--no' : 'res-badge',
      data.attending === false ? 'No asiste' : 'Asiste'));
    card.appendChild(head);
    const when = formatDate(data.createdAt);
    card.appendChild(el('p', 'res-card__date',
      when === 'sin fecha' ? 'Sin fecha de envío' : `Rellenado el ${when}`));

    if (data.attending !== false) {
      (data.people || []).forEach((p) => {
        const person = el('div', 'res-person');
        person.appendChild(el('p', 'res-person__name', p.name || '—'));
        person.appendChild(el('p', 'res-person__meta', personLine(p)));
        card.appendChild(person);
      });
      travelLines(data).forEach((line) => card.appendChild(el('p', 'res-card__travel', line)));
    }

    // --- Acciones: editar · ver original · borrar (soft) ---
    const actions = el('div', 'res-card__actions');

    const edit = el('button', 'adm-row__btn', 'Editar');
    edit.type = 'button';
    edit.addEventListener('click', () => renderEditor(container, data));
    actions.appendChild(edit);

    // "Ver original": solo si hay snapshot guardado (registro ya editado)
    if (data.original) {
      const seeOrig = el('button', 'adm-row__btn', 'Ver original');
      seeOrig.type = 'button';
      let box = null;
      seeOrig.addEventListener('click', () => {
        if (box) { box.remove(); box = null; seeOrig.textContent = 'Ver original'; return; }
        box = originalBox(data.original);
        card.insertBefore(box, actions);
        seeOrig.textContent = 'Ocultar original';
      });
      actions.appendChild(seeOrig);
    }

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
