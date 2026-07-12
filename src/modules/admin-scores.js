/* =================================================================
   Panel → pestaña PUNTUACIONES.
   Modera el ranking del minijuego: lista la colección "scores"
   (nombre, equipo, puntos, fecha) ordenada por puntos desc, con
   filtro por equipo y borrado con confirmación. Al borrar, el ranking
   público (Top 3 de juego.html) queda actualizado al instante.
   ================================================================= */

import { db } from '../firebase.js';
import { collection, doc, getDocs, orderBy, query, updateDoc } from 'firebase/firestore';

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

export async function initScoresTab(container) {
  container.innerHTML = `
    <p class="adm-hint">Ranking del minijuego. Borrar una puntuación la quita
      también del Top 3 público al momento.</p>
    <div id="adm-scores-filter" class="chips" role="radiogroup" aria-label="Filtrar por equipo"></div>
    <div id="adm-scores-list" class="adm-list"></div>
    <p id="adm-scores-feedback" class="form-feedback" role="status" aria-live="polite"></p>
  `;

  const filterEl = container.querySelector('#adm-scores-filter');
  const listEl = container.querySelector('#adm-scores-list');
  const feedback = container.querySelector('#adm-scores-feedback');

  let scores = [];      // cache local de la colección
  let filter = 'todos'; // todos | novia | novio

  function setFeedback(msg, type) {
    feedback.textContent = msg || '';
    feedback.classList.remove('is-ok', 'is-error');
    if (type) feedback.classList.add(type);
  }

  /* ---- Filtro por equipo (chips) ---- */
  [
    { value: 'todos', label: 'Todos' },
    { value: 'novia', label: 'Team Novia' },
    { value: 'novio', label: 'Team Novio' },
  ].forEach((opt) => {
    const chip = el('button', 'chip', opt.label);
    chip.type = 'button';
    chip.dataset.value = opt.value;
    chip.setAttribute('aria-pressed', String(opt.value === filter));
    chip.addEventListener('click', () => {
      filter = opt.value;
      filterEl.querySelectorAll('.chip').forEach((c) =>
        c.setAttribute('aria-pressed', String(c.dataset.value === filter)));
      render();
    });
    filterEl.appendChild(chip);
  });

  /* ---- Lista ---- */
  function render() {
    listEl.textContent = '';
    const visible = scores.filter((s) => filter === 'todos' || s.team === filter);

    if (visible.length === 0) {
      listEl.appendChild(el('p', 'res-empty', 'No hay puntuaciones que mostrar.'));
      return;
    }

    visible.forEach((s) => {
      const row = el('div', 'adm-row');

      const info = el('div', 'adm-row__info');
      const title = el('p', 'adm-row__title');
      title.appendChild(document.createTextNode(`${s.points} pts — ${s.name} `));
      title.appendChild(el('span',
        s.team === 'novio' ? 'adm-team adm-team--novio' : 'adm-team adm-team--novia',
        s.team === 'novio' ? 'Novio' : 'Novia'));
      info.appendChild(title);
      info.appendChild(el('p', 'adm-row__meta', formatDate(s.createdAt)));
      row.appendChild(info);

      const actions = el('div', 'adm-row__actions');
      const del = el('button', 'adm-row__btn adm-row__btn--danger', 'Borrar');
      del.type = 'button';
      del.addEventListener('click', async () => {
        // Soft delete: la puntuación va a la papelera, recuperable
        if (!window.confirm(`${s.name} · ${s.points} pts se moverá a la papelera; podrás recuperarla desde la pestaña Papelera. ¿Continuar?`)) return;
        del.disabled = true;
        setFeedback('Moviendo a la papelera…');
        try {
          await updateDoc(doc(db, 'scores', s.id), { deleted: true });
          scores = scores.filter((x) => x.id !== s.id);
          setFeedback('Movida a la papelera ✓', 'is-ok');
          render();
        } catch (err) {
          console.error(err);
          del.disabled = false;
          setFeedback('No se ha podido borrar. Inténtalo de nuevo.', 'is-error');
        }
      });
      actions.appendChild(del);
      row.appendChild(actions);

      listEl.appendChild(row);
    });
  }

  /* ---- Carga inicial: por puntos desc, sin las de la papelera ---- */
  listEl.textContent = 'Cargando puntuaciones…';
  const snap = await getDocs(query(collection(db, 'scores'), orderBy('points', 'desc')));
  scores = snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((s) => s.deleted !== true);
  render();
}
