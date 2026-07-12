/* =================================================================
   Panel → pestaña PAPELERA.
   Muestra lo "borrado" (soft delete, deleted: true) de las colecciones
   scores y lugares, con dos acciones por elemento:
     · Restaurar            → deleted: false (reaparece donde toque).
     · Borrar definitivamente → delete REAL, con doble confirmación.
   ================================================================= */

import { db } from '../firebase.js';
import { collection, doc, getDocs, updateDoc, deleteDoc } from 'firebase/firestore';
import { fetchLugaresPapelera, restoreLugar, deleteLugarForever } from './lugares-data.js';

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

/** Doble confirmación para el borrado permanente. */
function confirmForever(what) {
  return window.confirm(`Vas a borrar DEFINITIVAMENTE ${what}.\nEsto es permanente y no se puede deshacer. ¿Continuar?`)
    && window.confirm('Última confirmación: ¿borrar para siempre?');
}

export async function initPapeleraTab(container) {
  container.innerHTML = `
    <p class="adm-hint">Lo que borras desde las otras pestañas acaba aquí.
      Puedes restaurarlo o eliminarlo para siempre.</p>
    <h3 class="adm-subtitle">Lugares</h3>
    <div id="trash-lugares" class="adm-list"></div>
    <h3 class="adm-subtitle">Puntuaciones</h3>
    <div id="trash-scores" class="adm-list"></div>
    <p id="trash-feedback" class="form-feedback" role="status" aria-live="polite"></p>
  `;

  const lugaresEl = container.querySelector('#trash-lugares');
  const scoresEl = container.querySelector('#trash-scores');
  const feedback = container.querySelector('#trash-feedback');

  function setFeedback(msg, type) {
    feedback.textContent = msg || '';
    feedback.classList.remove('is-ok', 'is-error');
    if (type) feedback.classList.add(type);
  }

  /** Fila genérica de papelera con Restaurar / Borrar definitivamente. */
  function row({ title, meta, what, onRestore, onForever }) {
    const r = el('div', 'adm-row');
    const info = el('div', 'adm-row__info');
    info.appendChild(el('p', 'adm-row__title', title));
    if (meta) info.appendChild(el('p', 'adm-row__meta', meta));
    r.appendChild(info);

    const actions = el('div', 'adm-row__actions');
    const restore = el('button', 'adm-row__btn', 'Restaurar');
    restore.type = 'button';
    restore.addEventListener('click', async () => {
      restore.disabled = true;
      setFeedback('Restaurando…');
      try { await onRestore(); r.remove(); setFeedback('Restaurado ✓ (ya vuelve a estar visible)', 'is-ok'); }
      catch (err) { console.error(err); restore.disabled = false; setFeedback('No se ha podido restaurar.', 'is-error'); }
    });
    const forever = el('button', 'adm-row__btn adm-row__btn--danger', 'Borrar definitivamente');
    forever.type = 'button';
    forever.addEventListener('click', async () => {
      if (!confirmForever(what)) return;
      forever.disabled = true;
      setFeedback('Borrando definitivamente…');
      try { await onForever(); r.remove(); setFeedback('Borrado definitivo ✓', 'is-ok'); }
      catch (err) { console.error(err); forever.disabled = false; setFeedback('No se ha podido borrar.', 'is-error'); }
    });
    actions.append(restore, forever);
    r.appendChild(actions);
    return r;
  }

  /* ---- Lugares en la papelera ---- */
  const lugares = await fetchLugaresPapelera();
  if (lugares.length === 0) {
    lugaresEl.appendChild(el('p', 'res-empty', 'No hay lugares en la papelera.'));
  }
  lugares.forEach((lugar) => {
    lugaresEl.appendChild(row({
      title: lugar.titulo,
      meta: `x ${lugar.x}% · y ${lugar.y}% · orden ${lugar.orden}`,
      what: `el lugar "${lugar.titulo}"`,
      onRestore: () => restoreLugar(lugar.id),
      onForever: () => deleteLugarForever(lugar.id),
    }));
  });

  /* ---- Puntuaciones en la papelera ---- */
  const snap = await getDocs(collection(db, 'scores'));
  const scores = snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((s) => s.deleted === true)
    .sort((a, b) => b.points - a.points);
  if (scores.length === 0) {
    scoresEl.appendChild(el('p', 'res-empty', 'No hay puntuaciones en la papelera.'));
  }
  scores.forEach((s) => {
    scoresEl.appendChild(row({
      title: `${s.points} pts — ${s.name} (Team ${s.team === 'novio' ? 'Novio' : 'Novia'})`,
      meta: null,
      what: `la puntuación de ${s.name} (${s.points} pts)`,
      onRestore: () => updateDoc(doc(db, 'scores', s.id), { deleted: false }),
      onForever: () => deleteDoc(doc(db, 'scores', s.id)),
    }));
  });
}
