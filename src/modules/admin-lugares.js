/* =================================================================
   Panel → pestaña LUGARES.
   CRUD de la colección "lugares" (los puntos de la ilustración
   interactiva de la portada). Capa de datos: lugares-data.js.

   El editor permite colocar el punto de forma VISUAL: al tocar sobre
   la miniatura de la acuarela, el marcador se pone ahí y se calculan
   x/y en % (también editables a mano, con previsualización en vivo).
   ================================================================= */

import {
  fetchLugares, saveLugar, deleteLugar, seedLugares,
} from './lugares-data.js';

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

export async function initLugaresTab(container) {
  /* ---------- Esqueleto de la pestaña ---------- */
  container.innerHTML = `
    <p class="adm-hint">Estos puntos son los de la sección
      «Nuestros lugares» de la portada. Los cambios se publican al instante.</p>
    <div id="adm-lugares-list" class="adm-list"></div>
    <button type="button" id="adm-add" class="btn btn--ghost btn--block">+ Añadir lugar</button>

    <!-- Editor de un lugar (se abre al añadir/editar) -->
    <div id="adm-editor" class="adm-editor" hidden>
      <h3 id="adm-editor-title" class="adm-editor__title"></h3>

      <p class="adm-hint">Toca sobre la imagen para colocar el punto:</p>
      <div id="adm-frame" class="places__frame adm-editor__frame">
        <picture>
          <source srcset="/acuarela.webp" type="image/webp" />
          <img src="/acuarela.jpeg" alt="" decoding="async" />
        </picture>
        <span id="adm-preview" class="place-marker is-active place-marker--preview" aria-hidden="true">
          <span class="place-marker__dot"></span>
        </span>
      </div>

      <div class="adm-xy">
        <label class="field">
          <span class="field__label">X (%)</span>
          <input id="adm-x" class="field__input" type="number" min="0" max="100" step="0.5" />
        </label>
        <label class="field">
          <span class="field__label">Y (%)</span>
          <input id="adm-y" class="field__input" type="number" min="0" max="100" step="0.5" />
        </label>
        <label class="field">
          <span class="field__label">Orden</span>
          <input id="adm-orden" class="field__input" type="number" min="0" max="999" step="1" />
        </label>
      </div>

      <label class="field">
        <span class="field__label">Título</span>
        <input id="adm-titulo" class="field__input" type="text" maxlength="80" placeholder="Nombre del lugar" />
      </label>
      <label class="field">
        <span class="field__label">Texto</span>
        <textarea id="adm-texto" class="field__input adm-editor__textarea" maxlength="1200"
          placeholder="Qué es este lugar y por qué es especial para vosotros"></textarea>
      </label>

      <div class="adm-editor__actions">
        <button type="button" id="adm-cancel" class="btn btn--ghost">Cancelar</button>
        <button type="button" id="adm-save" class="btn btn--solid">Guardar</button>
      </div>
    </div>

    <p id="adm-feedback" class="form-feedback" role="status" aria-live="polite"></p>
  `;

  const listEl = container.querySelector('#adm-lugares-list');
  const addBtn = container.querySelector('#adm-add');
  const editor = container.querySelector('#adm-editor');
  const editorTitle = container.querySelector('#adm-editor-title');
  const frame = container.querySelector('#adm-frame');
  const preview = container.querySelector('#adm-preview');
  const xInput = container.querySelector('#adm-x');
  const yInput = container.querySelector('#adm-y');
  const ordenInput = container.querySelector('#adm-orden');
  const tituloInput = container.querySelector('#adm-titulo');
  const textoInput = container.querySelector('#adm-texto');
  const saveBtn = container.querySelector('#adm-save');
  const cancelBtn = container.querySelector('#adm-cancel');
  const feedback = container.querySelector('#adm-feedback');

  let lugares = [];      // lista actual (cache local de la colección)
  let editingId = null;  // id en edición (null = lugar nuevo)

  function setFeedback(msg, type) {
    feedback.textContent = msg || '';
    feedback.classList.remove('is-ok', 'is-error');
    if (type) feedback.classList.add(type);
  }

  /* ---------- Previsualización del punto ---------- */
  function setPreview(x, y) {
    preview.style.left = `${x}%`;
    preview.style.top = `${y}%`;
  }

  // Tocar la miniatura coloca el punto ahí (x/y en % con 1 decimal)
  frame.addEventListener('click', (e) => {
    const r = frame.getBoundingClientRect();
    const x = Math.round(((e.clientX - r.left) / r.width) * 1000) / 10;
    const y = Math.round(((e.clientY - r.top) / r.height) * 1000) / 10;
    xInput.value = Math.min(100, Math.max(0, x));
    yInput.value = Math.min(100, Math.max(0, y));
    setPreview(xInput.value, yInput.value);
  });

  // Editar x/y a mano también mueve la previsualización
  [xInput, yInput].forEach((input) => {
    input.addEventListener('input', () => setPreview(xInput.value || 0, yInput.value || 0));
  });

  /* ---------- Editor ---------- */
  function openEditor(lugar) {
    editingId = lugar.id || null;
    editorTitle.textContent = editingId ? `Editar: ${lugar.titulo}` : 'Nuevo lugar';
    xInput.value = lugar.x;
    yInput.value = lugar.y;
    ordenInput.value = lugar.orden;
    tituloInput.value = lugar.titulo || '';
    textoInput.value = lugar.texto || '';
    setPreview(lugar.x, lugar.y);
    editor.hidden = false;
    setFeedback('');
    editor.scrollIntoView({ behavior: 'smooth', block: 'start' });
    tituloInput.focus();
  }

  function closeEditor() {
    editingId = null;
    editor.hidden = true;
  }

  addBtn.addEventListener('click', () => {
    const maxOrden = lugares.reduce((m, l) => Math.max(m, l.orden || 0), 0);
    openEditor({ id: null, x: 50, y: 50, orden: maxOrden + 1, titulo: '', texto: '' });
  });
  cancelBtn.addEventListener('click', closeEditor);

  saveBtn.addEventListener('click', async () => {
    if (!tituloInput.value.trim()) {
      setFeedback('El lugar necesita un título.', 'is-error');
      tituloInput.focus();
      return;
    }
    saveBtn.disabled = true;
    setFeedback('Guardando…');
    try {
      await saveLugar(editingId, {
        x: xInput.value, y: yInput.value,
        titulo: tituloInput.value, texto: textoInput.value,
        orden: ordenInput.value,
      });
      closeEditor();
      setFeedback('Guardado ✓', 'is-ok');
      await load();
    } catch (err) {
      console.error(err);
      setFeedback('No se ha podido guardar. Inténtalo de nuevo.', 'is-error');
    } finally {
      saveBtn.disabled = false;
    }
  });

  /* ---------- Lista ---------- */
  async function load() {
    listEl.textContent = 'Cargando lugares…';
    lugares = await fetchLugares();
    listEl.textContent = '';

    if (lugares.length === 0) {
      // Primera vez: ofrecer la siembra de ejemplos
      const empty = el('div', 'adm-empty');
      empty.appendChild(el('p', 'adm-hint', 'Aún no hay lugares.'));
      const seedBtn = el('button', 'btn btn--ghost btn--block', 'Sembrar 6 lugares de ejemplo');
      seedBtn.type = 'button';
      seedBtn.addEventListener('click', async () => {
        seedBtn.disabled = true;
        setFeedback('Sembrando…');
        try { await seedLugares(); setFeedback('Ejemplos creados ✓', 'is-ok'); await load(); }
        catch (err) { console.error(err); setFeedback('No se ha podido sembrar.', 'is-error'); seedBtn.disabled = false; }
      });
      empty.appendChild(seedBtn);
      listEl.appendChild(empty);
      return;
    }

    lugares.forEach((lugar) => {
      const row = el('div', 'adm-row');

      const info = el('div', 'adm-row__info');
      info.appendChild(el('p', 'adm-row__title', lugar.titulo));
      info.appendChild(el('p', 'adm-row__meta', `x ${lugar.x}% · y ${lugar.y}% · orden ${lugar.orden}`));
      row.appendChild(info);

      const actions = el('div', 'adm-row__actions');
      const edit = el('button', 'adm-row__btn', 'Editar');
      edit.type = 'button';
      edit.addEventListener('click', () => openEditor(lugar));
      const del = el('button', 'adm-row__btn adm-row__btn--danger', 'Borrar');
      del.type = 'button';
      del.addEventListener('click', async () => {
        if (!window.confirm(`¿Borrar "${lugar.titulo}"? Esta acción no se puede deshacer.`)) return;
        setFeedback('Borrando…');
        try { await deleteLugar(lugar.id); setFeedback('Borrado ✓', 'is-ok'); await load(); }
        catch (err) { console.error(err); setFeedback('No se ha podido borrar.', 'is-error'); }
      });
      actions.append(edit, del);
      row.appendChild(actions);

      listEl.appendChild(row);
    });
  }

  await load();
}
