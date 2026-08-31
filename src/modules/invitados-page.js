/* =================================================================
   GESTIÓN DE INVITADOS — página privada (invitados.html).

   Misma protección que el panel /resultados: puerta compartida
   (panel-gate.js) — contraseña → signInAnonymously() → se muestra la
   app; si ya se entró en otra página de gestión, pasa directa.

   Vista: contadores arriba, filtros (lado / etiqueta / estado +
   buscador) y la lista agrupada POR NÚCLEO. Cada persona tiene su
   selector de estado (control interno de los novios, independiente
   de las confirmaciones que llegan por la web) y cada núcleo un
   selector para marcar a todos de golpe.

   Los núcleos con nombre repetido ("Pili" x2, "Ana" x2…) se
   distinguen por su lado y sus etiquetas, siempre visibles.
   Capa de datos: invitados-data.js.
   ================================================================= */

import { initGate } from './panel-gate.js';
import {
  ESTADOS, ESTADO_LABEL, fetchNucleos, updateNucleo, createNucleo, deleteNucleo,
} from './invitados-data.js';

/* ---------- Utilidades ---------- */
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

/** minúsculas y sin tildes, para buscar "jose" y encontrar "José" */
function norm(s) {
  return String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

const LADO_LABEL = { novia: 'María', novio: 'Alberto', ambos: 'Ambos' };

function fmtEuros(n) {
  return Number(n).toLocaleString('es-ES', { maximumFractionDigits: 2 });
}

/* =================================================================
   App (tras pasar la puerta)
   ================================================================= */
async function initApp(root) {
  root.innerHTML = `
    <button type="button" class="panel-salir" data-salir>Salir</button>
    <p class="adm-hint">Control interno de la lista de invitados: estados,
      etiquetas y regalos. Independiente de las confirmaciones que llegan
      por la web.</p>

    <div id="inv-stats" class="res-stats res-stats--four"></div>
    <div id="inv-statdetail"></div>
    <div id="inv-money" class="inv-money"></div>

    <div class="inv-filtros">
      <input id="inv-busca" class="field__input" type="search"
             placeholder="Buscar por nombre…" autocomplete="off" />
      <div class="inv-filtros__row">
        <select id="inv-f-lado" class="field__input inv-select" aria-label="Filtrar por lado">
          <option value="">Lado: todos</option>
          <option value="novia">María (novia)</option>
          <option value="novio">Alberto (novio)</option>
          <option value="ambos">Solo «ambos»</option>
        </select>
        <select id="inv-f-etiqueta" class="field__input inv-select" aria-label="Filtrar por etiqueta">
          <option value="">Etiqueta: todas</option>
        </select>
        <select id="inv-f-estado" class="field__input inv-select" aria-label="Filtrar por estado">
          <option value="">Estado: todos</option>
          <option value="confirmado">Confirmados</option>
          <option value="pendiente">Pendientes</option>
          <option value="no_asiste">No asisten</option>
        </select>
      </div>
    </div>

    <p id="inv-feedback" class="form-feedback inv-feedback" role="status" aria-live="polite"></p>
    <button type="button" id="inv-nuevo" class="btn btn--ghost btn--block">+ Nuevo núcleo</button>
    <div id="inv-list" class="inv-list">Cargando invitados…</div>
  `;

  const statsEl = root.querySelector('#inv-stats');
  const statDetailEl = root.querySelector('#inv-statdetail');
  const moneyEl = root.querySelector('#inv-money');
  const listEl = root.querySelector('#inv-list');
  const feedback = root.querySelector('#inv-feedback');
  const buscaInput = root.querySelector('#inv-busca');
  const fLado = root.querySelector('#inv-f-lado');
  const fEtiqueta = root.querySelector('#inv-f-etiqueta');
  const fEstado = root.querySelector('#inv-f-estado');

  const nuevoBtn = root.querySelector('#inv-nuevo');

  let nucleos = [];
  let editando = null; // id del núcleo en edición, o 'nuevo', o null
  let statAbierta = -1; // índice del contador desplegado (-1 = ninguno)
  const filtros = { lado: '', etiqueta: '', estado: '', busca: '' };

  let feedbackTimer = null;
  function setFeedback(msg, type) {
    feedback.textContent = msg || '';
    feedback.classList.remove('is-ok', 'is-error');
    if (type) feedback.classList.add(type);
    clearTimeout(feedbackTimer);
    if (type === 'is-ok') {
      feedbackTimer = setTimeout(() => { feedback.textContent = ''; }, 2500);
    }
  }

  /** Guarda cambios de un núcleo con feedback y recarga de contadores. */
  async function guardar(nucleo, cambios, okMsg) {
    setFeedback('Guardando…');
    try {
      await updateNucleo(nucleo.id, cambios);
      Object.assign(nucleo, cambios);
      setFeedback(okMsg || 'Guardado ✓', 'is-ok');
      render();
    } catch (err) {
      console.error(err);
      setFeedback('No se ha podido guardar. Inténtalo de nuevo.', 'is-error');
      render(); // repinta con los datos reales (descarta el cambio local)
    }
  }

  /* ---------- Filtros ---------- */
  function nucleoVisible(n) {
    // Lado: los núcleos "ambos" son de los dos, así que salen también al
    // filtrar por María o por Alberto; el filtro «ambos» los muestra solos.
    if (filtros.lado === 'ambos') {
      if (n.lado !== 'ambos') return false;
    } else if (filtros.lado && n.lado !== filtros.lado && n.lado !== 'ambos') {
      return false;
    }
    if (filtros.etiqueta && !n.etiquetas.includes(filtros.etiqueta)) return false;
    if (filtros.estado && !n.personas.some((p) => p.estado === filtros.estado)) return false;
    if (filtros.busca) {
      const b = norm(filtros.busca);
      const hit = norm(n.nombre).includes(b)
        || n.personas.some((p) => norm(p.nombre).includes(b));
      if (!hit) return false;
    }
    return true;
  }

  function rellenaEtiquetas() {
    const previa = fEtiqueta.value;
    const todas = [...new Set(nucleos.flatMap((n) => n.etiquetas))].sort((a, b) =>
      a.localeCompare(b, 'es'));
    fEtiqueta.length = 1; // conserva "Etiqueta: todas"
    todas.forEach((t) => {
      const opt = document.createElement('option');
      opt.value = t;
      opt.textContent = t;
      fEtiqueta.appendChild(opt);
    });
    fEtiqueta.value = todas.includes(previa) ? previa : '';
  }

  /* ---------- Contadores ----------
     Cuentan PERSONAS de los núcleos que pasan los filtros de lado /
     etiqueta / búsqueda (el filtro de estado no altera los números:
     así siempre se ve el desglose completo de lo filtrado).
     Son DESPLEGABLES (acordeón, como en la pestaña Totales del panel):
     al tocar uno se listan sus personas con núcleo y lado; al volver a
     tocar se cierra. Respetan los filtros activos. */
  function renderStats() {
    const visibles = nucleos.filter((n) => {
      const estadoGuardado = filtros.estado;
      filtros.estado = '';
      const ok = nucleoVisible(n);
      filtros.estado = estadoGuardado;
      return ok;
    });
    // Cada persona con su núcleo, para poder ubicarla en el desplegable
    const personas = visibles.flatMap((n) => n.personas.map((p) => ({ p, n })));
    const grupo = (e) => personas.filter(({ p }) => p.estado === e);
    const stats = [
      { label: 'Invitados', members: personas },
      { label: 'Confirmados', members: grupo('confirmado') },
      { label: 'Pendientes', members: grupo('pendiente') },
      { label: 'No asisten', members: grupo('no_asiste') },
    ];

    function pintaDetalle() {
      statDetailEl.innerHTML = '';
      if (statAbierta === -1) return;
      const lista = el('div', 'tot-detail tot-detail--scroll');
      const members = stats[statAbierta].members;
      if (members.length === 0) {
        lista.appendChild(el('p', 'tot-person tot-person--empty', 'Nadie con los filtros actuales.'));
      }
      members.forEach(({ p, n }) => {
        const line = el('p', 'tot-person');
        line.appendChild(el('span', null, p.nombre + (p.nino ? ' (niño)' : '')));
        line.appendChild(el('span', 'tot-person__by', ` — ${n.nombre} · ${LADO_LABEL[n.lado]}`));
        lista.appendChild(line);
      });
      statDetailEl.appendChild(lista);
    }

    statsEl.innerHTML = '';
    stats.forEach((s, i) => {
      const card = el('button', 'res-stat res-stat--btn');
      card.type = 'button';
      card.classList.toggle('is-open', statAbierta === i);
      card.setAttribute('aria-expanded', String(statAbierta === i));
      card.appendChild(el('span', 'res-stat__num', String(s.members.length)));
      card.appendChild(el('span', 'res-stat__label', s.label));
      card.appendChild(el('span', 'tot-exp__chev', '▾'));
      card.addEventListener('click', () => {
        statAbierta = statAbierta === i ? -1 : i;
        statsEl.querySelectorAll('.res-stat--btn').forEach((b, j) => {
          b.classList.toggle('is-open', j === statAbierta);
          b.setAttribute('aria-expanded', String(j === statAbierta));
        });
        pintaDetalle();
      });
      statsEl.appendChild(card);
    });
    pintaDetalle();

    // Totales de regalos (núcleos + personas de lo filtrado), SEPARADOS:
    // el dinero es el único dato real; el valor de lo material es una
    // estimación propia, así que nunca se mezclan en un solo número.
    let dinero = 0;
    let dineroN = 0;
    let material = 0;
    let materialN = 0;
    let materialSinValor = 0;
    function suma(regalo, regaloMaterial) {
      if (regalo != null) { dinero += regalo; dineroN += 1; }
      if (regaloMaterial != null) {
        materialN += 1;
        if (regaloMaterial.valor != null) material += regaloMaterial.valor;
        else materialSinValor += 1;
      }
    }
    visibles.forEach((n) => {
      suma(n.regalo, n.regaloMaterial);
      n.personas.forEach((p) => suma(p.regalo, p.regaloMaterial));
    });

    const apunte = (x) => `${x} apunte${x === 1 ? '' : 's'}`;
    moneyEl.innerHTML = '';
    moneyEl.classList.toggle('has-total', dineroN + materialN > 0);
    if (dineroN + materialN === 0) {
      moneyEl.textContent = 'Regalos: nada apuntado todavía';
    } else {
      const fila = (clase, label, valor) => {
        const row = el('div', `inv-money__row ${clase}`);
        row.appendChild(el('span', 'inv-money__label', label));
        row.appendChild(el('span', 'inv-money__val', valor));
        moneyEl.appendChild(row);
      };
      fila('inv-money__row--real', `Dinero (${apunte(dineroN)})`,
        `${fmtEuros(dinero)} €`);
      fila('inv-money__row--est',
        `Material, valor estimado (${apunte(materialN)}${materialSinValor ? `, ${materialSinValor} sin valorar` : ''})`,
        `~${fmtEuros(material)} €`);
      fila('inv-money__row--total', 'Total aproximado (dinero + estimación)',
        `≈ ${fmtEuros(dinero + material)} €`);
    }
  }

  /* ---------- Control de dinero regalado (núcleo o persona) ----------
     Botón que muestra el importe apuntado (o el estado "sin apuntar");
     al tocarlo se convierte en un campo para escribir la cantidad.
     Guardar con el campo VACÍO quita el apunte (vuelve a "sin apuntar",
     distinto de 0 €). */
  function creaRegaloControl(actual, etiquetaVacia, onSave) {
    const wrap = el('span', 'inv-regalo');

    function pinta() {
      wrap.innerHTML = '';
      const btn = el('button',
        `inv-regalo__btn${actual != null ? ' has-valor' : ''}`,
        actual != null ? `${fmtEuros(actual)} €` : etiquetaVacia);
      btn.type = 'button';
      btn.title = 'Apuntar dinero regalado';
      btn.addEventListener('click', edita);
      wrap.appendChild(btn);
    }

    function edita() {
      wrap.innerHTML = '';
      const input = el('input', 'field__input inv-regalo__input');
      input.type = 'number';
      input.min = '0';
      input.step = '0.01';
      input.inputMode = 'decimal';
      input.placeholder = '€ (vacío = quitar)';
      if (actual != null) input.value = actual;

      const ok = el('button', 'adm-row__btn inv-regalo__ok', 'Guardar');
      ok.type = 'button';
      ok.addEventListener('click', () => {
        const v = input.value.trim();
        const num = v === '' ? null : Number(v.replace(',', '.'));
        if (num != null && (!Number.isFinite(num) || num < 0)) {
          input.focus();
          return;
        }
        onSave(num);
      });
      const cancelar = el('button', 'adm-row__btn inv-regalo__cancel', '✕');
      cancelar.type = 'button';
      cancelar.addEventListener('click', pinta);
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); ok.click(); }
      });

      wrap.append(input, ok, cancelar);
      input.focus();
    }

    pinta();
    return wrap;
  }

  /* ---------- Control de regalo MATERIAL (núcleo o persona) ----------
     Igual que el de dinero pero con dos partes: descripción (qué es) y
     valor ESTIMADO en € (opcional). Guardar con la descripción VACÍA
     quita el apunte. Coexiste con el dinero: no son excluyentes. */
  function creaMaterialControl(actual, etiquetaVacia, onSave) {
    const wrap = el('span', 'inv-regalo inv-material');

    function pinta() {
      wrap.classList.remove('is-editing');
      wrap.innerHTML = '';
      let texto = etiquetaVacia;
      if (actual) {
        texto = `🎁 ${actual.descripcion}`;
        if (actual.valor != null) texto += ` · ~${fmtEuros(actual.valor)} €`;
      }
      const btn = el('button',
        `inv-regalo__btn inv-material__btn${actual ? ' has-valor' : ''}`, texto);
      btn.type = 'button';
      btn.title = 'Apuntar regalo material (vajilla, electrodoméstico…)';
      btn.addEventListener('click', edita);
      wrap.appendChild(btn);
    }

    function edita() {
      wrap.innerHTML = '';
      wrap.classList.add('is-editing');

      const desc = el('input', 'field__input inv-material__desc');
      desc.type = 'text';
      desc.maxLength = 300;
      desc.placeholder = 'Qué es (vacío = quitar)';
      if (actual) desc.value = actual.descripcion;

      const valor = el('input', 'field__input inv-regalo__input');
      valor.type = 'number';
      valor.min = '0';
      valor.step = '0.01';
      valor.inputMode = 'decimal';
      valor.placeholder = 'Valor est. €';
      if (actual && actual.valor != null) valor.value = actual.valor;

      const ok = el('button', 'adm-row__btn inv-regalo__ok', 'Guardar');
      ok.type = 'button';
      ok.addEventListener('click', () => {
        const d = desc.value.trim();
        const v = valor.value.trim();
        const num = v === '' ? null : Number(v.replace(',', '.'));
        if (num != null && (!Number.isFinite(num) || num < 0)) {
          valor.focus();
          return;
        }
        onSave(d ? { descripcion: d, valor: num } : null);
      });
      const cancelar = el('button', 'adm-row__btn inv-regalo__cancel', '✕');
      cancelar.type = 'button';
      cancelar.addEventListener('click', pinta);
      [desc, valor].forEach((input) => input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); ok.click(); }
      }));

      wrap.append(desc, valor, ok, cancelar);
      desc.focus();
    }

    pinta();
    return wrap;
  }

  /* ---------- Selector de estado (persona o núcleo entero) ---------- */
  function creaSelectEstado(valor, onChange, conVacio) {
    const sel = document.createElement('select');
    sel.className = 'inv-estado';
    if (conVacio) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = 'Marcar todos…';
      sel.appendChild(opt);
    }
    ESTADOS.forEach((e) => {
      const opt = document.createElement('option');
      opt.value = e;
      opt.textContent = ESTADO_LABEL[e];
      sel.appendChild(opt);
    });
    sel.value = valor || '';
    sel.dataset.estado = sel.value;
    sel.addEventListener('change', () => {
      sel.dataset.estado = sel.value;
      onChange(sel.value);
    });
    return sel;
  }

  /* ---------- Editor de un núcleo (crear o editar) ----------
     Permite corregir nombre, lado y etiquetas, y añadir / quitar /
     renombrar personas. Las personas que se conservan mantienen su
     estado y su regalo; las nuevas nacen "pendiente" y sin regalo. */
  function creaEditor(n) {
    const esNuevo = !n;
    const datos = n || { nombre: '', lado: filtros.lado || 'novia', etiquetas: [], personas: [] };

    const box = el('div', 'adm-editor inv-editor');
    box.appendChild(el('h3', 'adm-editor__title',
      esNuevo ? 'Nuevo núcleo' : `Editar: ${datos.nombre}`));

    // Nombre del núcleo
    const fNombre = el('label', 'field');
    fNombre.appendChild(el('span', 'field__label', 'Nombre del núcleo'));
    const nombreInput = el('input', 'field__input');
    nombreInput.type = 'text';
    nombreInput.maxLength = 120;
    nombreInput.value = datos.nombre;
    fNombre.appendChild(nombreInput);
    box.appendChild(fNombre);

    // Lado + etiquetas
    const fila = el('div', 'inv-editor__fila');
    const fLadoEd = el('label', 'field');
    fLadoEd.appendChild(el('span', 'field__label', 'Lado'));
    const ladoSel = el('select', 'field__input inv-select');
    [['novia', 'María (novia)'], ['novio', 'Alberto (novio)'], ['ambos', 'Ambos (común)']].forEach(([v, t]) => {
      const opt = document.createElement('option');
      opt.value = v; opt.textContent = t;
      ladoSel.appendChild(opt);
    });
    ladoSel.value = datos.lado;
    fLadoEd.appendChild(ladoSel);
    fila.appendChild(fLadoEd);

    const fTags = el('label', 'field');
    fTags.appendChild(el('span', 'field__label', 'Etiquetas (separadas por comas)'));
    const tagsInput = el('input', 'field__input');
    tagsInput.type = 'text';
    tagsInput.placeholder = 'Familia novia, Cole…';
    tagsInput.value = datos.etiquetas.join(', ');
    fTags.appendChild(tagsInput);
    fila.appendChild(fTags);
    box.appendChild(fila);

    // Personas del núcleo
    box.appendChild(el('span', 'field__label', 'Personas'));
    const personasBox = el('div', 'inv-editor__personas');
    box.appendChild(personasBox);
    const filas = []; // { original, nombreInput, ninoCheck, row }

    function addFilaPersona(p) {
      const row = el('div', 'inv-editor__persona');
      const input = el('input', 'field__input');
      input.type = 'text';
      input.maxLength = 120;
      input.placeholder = 'Nombre';
      input.value = p ? p.nombre : '';

      const ninoLabel = el('label', 'inv-editor__nino');
      const check = document.createElement('input');
      check.type = 'checkbox';
      check.checked = p ? p.nino : false;
      ninoLabel.appendChild(check);
      ninoLabel.appendChild(document.createTextNode('niño'));

      const quitar = el('button', 'adm-row__btn adm-row__btn--danger inv-editor__quitar', '✕');
      quitar.type = 'button';
      quitar.title = 'Quitar persona';
      quitar.addEventListener('click', () => {
        const idx = filas.findIndex((f) => f.row === row);
        if (idx >= 0) filas.splice(idx, 1);
        row.remove();
      });

      row.append(input, ninoLabel, quitar);
      personasBox.appendChild(row);
      filas.push({ original: p || null, nombreInput: input, ninoCheck: check, row });
      return input;
    }
    datos.personas.forEach((p) => addFilaPersona(p));

    const addPersonaBtn = el('button', 'btn btn--ghost btn--block', '+ Añadir persona');
    addPersonaBtn.type = 'button';
    addPersonaBtn.addEventListener('click', () => addFilaPersona(null).focus());
    box.appendChild(addPersonaBtn);

    // Acciones: guardar / cancelar / borrar núcleo
    const acciones = el('div', 'adm-editor__actions');
    const cancelar = el('button', 'btn btn--ghost', 'Cancelar');
    cancelar.type = 'button';
    cancelar.addEventListener('click', () => { editando = null; render(); });
    const guardarBtn = el('button', 'btn btn--solid', 'Guardar');
    guardarBtn.type = 'button';
    guardarBtn.addEventListener('click', async () => {
      const nombre = nombreInput.value.trim();
      if (!nombre) {
        setFeedback('El núcleo necesita un nombre.', 'is-error');
        nombreInput.focus();
        return;
      }
      const personas = filas
        .map((f) => ({
          ...(f.original || { estado: 'pendiente', regalo: null, regaloMaterial: null }),
          nombre: f.nombreInput.value.trim(),
          nino: f.ninoCheck.checked,
        }))
        .filter((p) => p.nombre);
      const etiquetas = tagsInput.value.split(',').map((t) => t.trim()).filter(Boolean);

      guardarBtn.disabled = true;
      setFeedback('Guardando…');
      try {
        if (esNuevo) {
          const orden = nucleos.reduce((m, x) => Math.max(m, x.orden), 0) + 1;
          const id = await createNucleo({ nombre, lado: ladoSel.value, etiquetas, personas, orden });
          nucleos.push({ id, nombre, lado: ladoSel.value, etiquetas, personas, regalo: null, orden });
        } else {
          await updateNucleo(n.id, { nombre, lado: ladoSel.value, etiquetas, personas });
          Object.assign(n, { nombre, lado: ladoSel.value, etiquetas, personas });
        }
        editando = null;
        setFeedback('Guardado ✓', 'is-ok');
        rellenaEtiquetas();
        render();
      } catch (err) {
        console.error(err);
        guardarBtn.disabled = false;
        setFeedback('No se ha podido guardar. Inténtalo de nuevo.', 'is-error');
      }
    });
    acciones.append(cancelar, guardarBtn);
    box.appendChild(acciones);

    if (!esNuevo) {
      const borrar = el('button', 'adm-row__btn adm-row__btn--danger inv-editor__borrar',
        'Borrar núcleo definitivamente');
      borrar.type = 'button';
      borrar.addEventListener('click', async () => {
        const cuantas = n.personas.length;
        if (!window.confirm(`¿Borrar el núcleo "${n.nombre}" (${cuantas} persona${cuantas === 1 ? '' : 's'})? Esta acción NO se puede deshacer.`)) return;
        if (!window.confirm('¿Seguro del todo? Se borrará definitivamente de la lista de invitados.')) return;
        setFeedback('Borrando…');
        try {
          await deleteNucleo(n.id);
          nucleos = nucleos.filter((x) => x.id !== n.id);
          editando = null;
          setFeedback(`"${n.nombre}" borrado ✓`, 'is-ok');
          rellenaEtiquetas();
          render();
        } catch (err) {
          console.error(err);
          setFeedback('No se ha podido borrar. Inténtalo de nuevo.', 'is-error');
        }
      });
      box.appendChild(borrar);
    }

    return box;
  }

  /* ---------- Tarjeta de un núcleo ---------- */
  function renderNucleo(n) {
    const card = el('article', 'inv-card');

    // En edición, la tarjeta se convierte en el editor
    if (editando === n.id) {
      card.appendChild(creaEditor(n));
      return card;
    }

    // Cabecera: nombre + lado + nº de personas + editar
    const head = el('div', 'inv-card__head');
    const title = el('div', 'inv-card__title');
    title.appendChild(el('h3', 'inv-card__nombre', n.nombre));
    const lado = el('span', `adm-team adm-team--${n.lado}`, LADO_LABEL[n.lado]);
    title.appendChild(lado);
    head.appendChild(title);
    const headRight = el('div', 'inv-card__headright');
    headRight.appendChild(el('span', 'inv-card__n', `${n.personas.length} pers.`));
    const editBtn = el('button', 'adm-row__btn inv-card__edit', 'Editar');
    editBtn.type = 'button';
    editBtn.addEventListener('click', () => { editando = n.id; render(); });
    headRight.appendChild(editBtn);
    head.appendChild(headRight);
    card.appendChild(head);

    // Etiquetas (clave para distinguir los núcleos con el mismo nombre)
    const tags = el('div', 'inv-card__tags');
    n.etiquetas.forEach((t) => tags.appendChild(el('span', 'inv-tag', t)));
    card.appendChild(tags);

    // Personas
    const lista = el('div', 'inv-personas');
    n.personas.forEach((p, i) => {
      const row = el('div', 'inv-persona');
      const nombre = el('span', 'inv-persona__nombre', p.nombre);
      if (p.nino) nombre.appendChild(el('span', 'inv-nino', 'niño'));
      row.appendChild(nombre);
      // Regalos individuales (dinero y/o material) + estado
      const controles = el('span', 'inv-persona__controles');
      controles.appendChild(creaRegaloControl(p.regalo, '€', (num) => {
        const personas = n.personas.map((q, j) => (j === i ? { ...q, regalo: num } : q));
        guardar(n, { personas },
          num == null ? `${p.nombre}: dinero quitado ✓` : `${p.nombre}: ${fmtEuros(num)} € ✓`);
      }));
      controles.appendChild(creaMaterialControl(p.regaloMaterial, '🎁', (mat) => {
        const personas = n.personas.map((q, j) => (j === i ? { ...q, regaloMaterial: mat } : q));
        guardar(n, { personas },
          mat == null ? `${p.nombre}: regalo material quitado ✓` : `${p.nombre}: 🎁 ${mat.descripcion} ✓`);
      }));
      controles.appendChild(creaSelectEstado(p.estado, (nuevo) => {
        const personas = n.personas.map((q, j) => (j === i ? { ...q, estado: nuevo } : q));
        guardar(n, { personas }, `${p.nombre}: ${ESTADO_LABEL[nuevo]} ✓`);
      }));
      row.appendChild(controles);
      lista.appendChild(row);
    });
    card.appendChild(lista);

    // Regalos del núcleo (conjunto): dinero y material, no excluyentes;
    // lo individual va por persona
    const regaloRow = el('div', 'inv-regalo-row');
    regaloRow.appendChild(el('span', 'inv-bulk__label', 'Dinero del núcleo:'));
    regaloRow.appendChild(creaRegaloControl(n.regalo, 'sin apuntar', (num) => {
      guardar(n, { regalo: num },
        num == null ? `${n.nombre}: dinero quitado ✓` : `${n.nombre}: ${fmtEuros(num)} € ✓`);
    }));
    card.appendChild(regaloRow);

    const materialRow = el('div', 'inv-regalo-row');
    materialRow.appendChild(el('span', 'inv-bulk__label', 'Regalo material:'));
    materialRow.appendChild(creaMaterialControl(n.regaloMaterial, 'sin apuntar', (mat) => {
      guardar(n, { regaloMaterial: mat },
        mat == null ? `${n.nombre}: regalo material quitado ✓` : `${n.nombre}: 🎁 ${mat.descripcion} ✓`);
    }));
    card.appendChild(materialRow);

    // Marcar todo el núcleo de golpe
    if (n.personas.length > 1) {
      const bulk = el('div', 'inv-bulk');
      bulk.appendChild(el('span', 'inv-bulk__label', 'Todo el núcleo:'));
      bulk.appendChild(creaSelectEstado('', (nuevo) => {
        if (!nuevo) return;
        const personas = n.personas.map((q) => ({ ...q, estado: nuevo }));
        guardar(n, { personas }, `${n.nombre}: todos ${ESTADO_LABEL[nuevo]} ✓`);
      }, true));
      card.appendChild(bulk);
    }

    return card;
  }

  /* ---------- Render general ---------- */
  function render() {
    renderStats();
    listEl.innerHTML = '';

    // Alta de un núcleo nuevo: el editor se muestra arriba de la lista
    if (editando === 'nuevo') {
      listEl.appendChild(creaEditor(null));
    }

    const visibles = nucleos.filter(nucleoVisible);
    if (visibles.length === 0 && editando !== 'nuevo') {
      listEl.appendChild(el('p', 'adm-hint', 'Ningún núcleo coincide con los filtros.'));
      return;
    }
    listEl.appendChild(el('p', 'inv-list__resumen',
      `${visibles.length} núcleo${visibles.length === 1 ? '' : 's'}`));
    visibles.forEach((n) => listEl.appendChild(renderNucleo(n)));
  }

  /* ---------- Eventos de los filtros ---------- */
  buscaInput.addEventListener('input', () => { filtros.busca = buscaInput.value.trim(); render(); });
  fLado.addEventListener('change', () => { filtros.lado = fLado.value; render(); });
  fEtiqueta.addEventListener('change', () => { filtros.etiqueta = fEtiqueta.value; render(); });
  fEstado.addEventListener('change', () => { filtros.estado = fEstado.value; render(); });
  nuevoBtn.addEventListener('click', () => {
    editando = 'nuevo';
    render();
    listEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  /* ---------- Carga inicial ---------- */
  nucleos = await fetchNucleos();
  rellenaEtiquetas();
  render();
}

/* =================================================================
   Puerta de acceso compartida con el resto de páginas de gestión
   ================================================================= */
export function initInvitadosPage() {
  const appRoot = document.getElementById('inv-app');
  if (!appRoot) return;

  initGate({
    async onEnter() {
      appRoot.hidden = false;
      await initApp(appRoot);
    },
  });
}
