/* =================================================================
   MESAS DEL BANQUETE — página privada (mesas.html).

   Puerta compartida (panel-gate.js): si ya se entró en el panel, en
   /invitados o en /hoteles no vuelve a pedir la contraseña.

   Todo el flujo es POR TOQUE (nada de arrastrar, que en móvil se pelea
   con el scroll): se marcan personas con checkbox y se elige la mesa
   destino en un selector, o desde una mesa se eligen comensales.

   LEE la colección "invitados" (nunca escribe en ella) y guarda el
   reparto en la colección "mesas" (mesas-data.js).
   ================================================================= */

import { initGate } from './panel-gate.js';
import { fetchNucleos } from './invitados-data.js';
import {
  fetchMesas, updateMesa, createMesa, deleteMesa,
} from './mesas-data.js';

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

const LADO_LABEL = { novia: 'María', novio: 'Alberto', ambos: 'Ambos', '': '—' };
const ESTADO_CORTO = { confirmado: 'C', pendiente: 'P' };

/* =================================================================
   App (tras pasar la puerta)
   ================================================================= */
async function initApp(root) {
  root.innerHTML = `
    <button type="button" class="panel-salir" data-salir>Salir</button>
    <p class="adm-hint">Reparto del banquete: crea mesas con su capacidad y
      sienta a la gente por toque. Salen confirmados y pendientes (los
      «no asiste» quedan fuera).</p>

    <div id="mes-stats" class="res-stats"></div>
    <div id="mes-statdetail"></div>
    <div id="mes-avisos"></div>
    <p id="mes-feedback" class="form-feedback inv-feedback" role="status" aria-live="polite"></p>

    <h3 class="adm-subtitle">Mesas</h3>
    <div id="mes-list" class="inv-list"></div>
    <button type="button" id="mes-nueva" class="btn btn--ghost btn--block">+ Nueva mesa</button>

    <h3 class="adm-subtitle">Personas sin asignar</h3>
    <div class="inv-filtros">
      <input id="mes-busca" class="field__input" type="search"
             placeholder="Buscar por nombre…" autocomplete="off" />
      <div class="inv-filtros__row">
        <select id="mes-f-lado" class="field__input inv-select" aria-label="Filtrar por lado">
          <option value="">Lado: todos</option>
          <option value="novia">María (novia)</option>
          <option value="novio">Alberto (novio)</option>
          <option value="ambos">Solo «ambos»</option>
        </select>
        <select id="mes-f-etiqueta" class="field__input inv-select" aria-label="Filtrar por etiqueta">
          <option value="">Etiqueta: todas</option>
        </select>
        <select id="mes-f-nucleo" class="field__input inv-select" aria-label="Filtrar por núcleo">
          <option value="">Núcleo: todos</option>
        </select>
      </div>
    </div>
    <div id="mes-personas"></div>

    <!-- Barra de acción pegajosa (aparece al marcar personas) -->
    <div id="mes-accion" class="mes-accion" hidden></div>
    <!-- Selector de mesa destino (aparece al asignar) -->
    <div id="mes-chooser" class="mes-chooser" hidden></div>
  `;

  const statsEl = root.querySelector('#mes-stats');
  const statDetailEl = root.querySelector('#mes-statdetail');
  const avisosEl = root.querySelector('#mes-avisos');
  const feedback = root.querySelector('#mes-feedback');
  const listEl = root.querySelector('#mes-list');
  const nuevaBtn = root.querySelector('#mes-nueva');
  const personasEl = root.querySelector('#mes-personas');
  const accionEl = root.querySelector('#mes-accion');
  const chooserEl = root.querySelector('#mes-chooser');
  const buscaInput = root.querySelector('#mes-busca');
  const fLado = root.querySelector('#mes-f-lado');
  const fEtiqueta = root.querySelector('#mes-f-etiqueta');
  const fNucleo = root.querySelector('#mes-f-nucleo');

  let mesas = [];
  let nucleos = [];
  let editandoMesa = null;   // id de mesa en edición, 'nueva' o null
  let modoMesa = null;       // mesa a la que se están añadiendo comensales
  let statAbierta = false;   // desplegable de "sin asignar"
  const seleccion = new Set(); // keys de personas marcadas
  const filtros = { busca: '', lado: '', etiqueta: '', nucleo: '' };

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

  async function guardarMesa(mesa, cambios, okMsg) {
    setFeedback('Guardando…');
    try {
      await updateMesa(mesa.id, cambios);
      Object.assign(mesa, cambios);
      setFeedback(okMsg || 'Guardado ✓', 'is-ok');
      render();
    } catch (err) {
      console.error(err);
      setFeedback('No se ha podido guardar. Inténtalo de nuevo.', 'is-error');
      render();
    }
  }

  /* ---------- Personas asignables (LEE de invitados, nunca escribe) ----------
     Asignables = confirmados y pendientes. Cada una con una `key`
     estable '<nucleoId>|<nombre>' para cruzarla con los comensales. */
  function personasAsignables() {
    const lista = [];
    nucleos.forEach((n) => {
      n.personas.forEach((p) => {
        if (p.estado === 'no_asiste') return;
        lista.push({
          key: `${n.id}|${p.nombre}`,
          nombre: p.nombre,
          nino: p.nino,
          estado: p.estado,
          nucleoId: n.id,
          nucleoNombre: n.nombre,
          lado: n.lado,
          etiquetas: n.etiquetas,
        });
      });
    });
    return lista;
  }

  /** Mapa key → [mesas donde está sentada] (para libres y duplicados). */
  function mapaSentados() {
    const mapa = new Map();
    mesas.forEach((m) => {
      m.comensales.forEach((c) => {
        if (!mapa.has(c.key)) mapa.set(c.key, []);
        mapa.get(c.key).push(m);
      });
    });
    return mapa;
  }

  /* ---------- Editor de una mesa (crear / editar / borrar) ---------- */
  function creaEditorMesa(mesa) {
    const esNueva = !mesa;
    const box = el('div', 'adm-editor inv-editor');
    box.appendChild(el('h3', 'adm-editor__title', esNueva ? 'Nueva mesa' : `Editar: ${mesa.nombre}`));

    const fila = el('div', 'mes-editor__fila');
    const fNombre = el('label', 'field');
    fNombre.appendChild(el('span', 'field__label', 'Nombre / número'));
    const nombreInput = el('input', 'field__input');
    nombreInput.type = 'text';
    nombreInput.maxLength = 80;
    nombreInput.placeholder = 'Mesa 1, Amigos uni…';
    nombreInput.value = mesa ? mesa.nombre : '';
    fNombre.appendChild(nombreInput);
    fila.appendChild(fNombre);

    const fCap = el('label', 'field');
    fCap.appendChild(el('span', 'field__label', 'Capacidad (plazas)'));
    const capInput = el('input', 'field__input');
    capInput.type = 'number';
    capInput.min = '1';
    capInput.max = '100';
    capInput.inputMode = 'numeric';
    capInput.value = mesa ? mesa.capacidad : 8;
    fCap.appendChild(capInput);
    fila.appendChild(fCap);
    box.appendChild(fila);

    const acciones = el('div', 'adm-editor__actions');
    const cancelar = el('button', 'btn btn--ghost', 'Cancelar');
    cancelar.type = 'button';
    cancelar.addEventListener('click', () => { editandoMesa = null; render(); });
    const guardarBtn = el('button', 'btn btn--solid', 'Guardar');
    guardarBtn.type = 'button';
    guardarBtn.addEventListener('click', async () => {
      const nombre = nombreInput.value.trim();
      const capacidad = Number(capInput.value);
      if (!nombre) {
        setFeedback('La mesa necesita un nombre o número.', 'is-error');
        nombreInput.focus();
        return;
      }
      if (!Number.isFinite(capacidad) || capacidad < 1 || capacidad > 100) {
        setFeedback('La capacidad debe ser un número entre 1 y 100.', 'is-error');
        capInput.focus();
        return;
      }
      guardarBtn.disabled = true;
      setFeedback('Guardando…');
      try {
        if (esNueva) {
          const orden = mesas.reduce((m, x) => Math.max(m, x.orden), 0) + 1;
          const id = await createMesa({ nombre, capacidad, orden });
          mesas.push({ id, nombre, capacidad, comensales: [], orden });
        } else {
          await updateMesa(mesa.id, { nombre, capacidad });
          Object.assign(mesa, { nombre, capacidad });
        }
        editandoMesa = null;
        setFeedback('Guardado ✓', 'is-ok');
        render();
      } catch (err) {
        console.error(err);
        guardarBtn.disabled = false;
        setFeedback('No se ha podido guardar. Inténtalo de nuevo.', 'is-error');
      }
    });
    acciones.append(cancelar, guardarBtn);
    box.appendChild(acciones);

    if (!esNueva) {
      const borrar = el('button', 'adm-row__btn adm-row__btn--danger inv-editor__borrar', 'Borrar mesa');
      borrar.type = 'button';
      borrar.addEventListener('click', async () => {
        const n = mesa.comensales.length;
        const manuales = mesa.comensales.filter((c) => c.manual).length;
        let msg = `¿Borrar "${mesa.nombre}"?`;
        if (n) {
          msg += ` Sus ${n} comensal${n === 1 ? '' : 'es'} volverán a "sin asignar"`;
          if (manuales) msg += ` (menos ${manuales} añadido${manuales === 1 ? '' : 's'} a mano, que se perderán)`;
          msg += '.';
        }
        if (!window.confirm(msg)) return;
        setFeedback('Borrando…');
        try {
          await deleteMesa(mesa.id);
          mesas = mesas.filter((x) => x.id !== mesa.id);
          editandoMesa = null;
          setFeedback(`"${mesa.nombre}" borrada ✓`, 'is-ok');
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

  /* ---------- Tarjeta de una mesa ---------- */
  function renderMesa(mesa) {
    const card = el('article', 'inv-card mes-card');

    if (editandoMesa === mesa.id) {
      card.appendChild(creaEditorMesa(mesa));
      return card;
    }

    const ocupadas = mesa.comensales.length;
    const sobre = ocupadas > mesa.capacidad;

    const head = el('div', 'inv-card__head');
    const title = el('div', 'inv-card__title');
    title.appendChild(el('h3', 'inv-card__nombre', mesa.nombre));
    head.appendChild(title);
    const headRight = el('div', 'inv-card__headright');
    const chip = el('span', `mes-aforo${sobre ? ' is-sobre' : ''}`, `${ocupadas}/${mesa.capacidad}`);
    chip.title = sobre
      ? `Sobreaforo: ${ocupadas - mesa.capacidad} de más`
      : `${mesa.capacidad - ocupadas} plaza${mesa.capacidad - ocupadas === 1 ? '' : 's'} libre${mesa.capacidad - ocupadas === 1 ? '' : 's'}`;
    headRight.appendChild(chip);
    const editBtn = el('button', 'adm-row__btn inv-card__edit', 'Editar');
    editBtn.type = 'button';
    editBtn.addEventListener('click', () => { editandoMesa = mesa.id; render(); });
    headRight.appendChild(editBtn);
    head.appendChild(headRight);
    card.appendChild(head);

    if (sobre) {
      card.appendChild(el('p', 'mes-card__sobre',
        `⚠ Sobreaforo: ${ocupadas} comensales para ${mesa.capacidad} plazas`));
    }

    card.appendChild(renderComensales(mesa));
    card.appendChild(renderAccionesMesa(mesa));
    return card;
  }

  /* ---------- Selector de mesa destino (modal por toque) ---------- */
  function elegirMesa(titulo, excluirId) {
    return new Promise((resolve) => {
      chooserEl.innerHTML = '';
      chooserEl.hidden = false;
      function cierra() { chooserEl.hidden = true; chooserEl.innerHTML = ''; }

      const panel = el('div', 'mes-chooser__panel');
      panel.appendChild(el('p', 'mes-chooser__titulo', titulo));
      const candidatas = mesas.filter((m) => m.id !== excluirId);
      if (candidatas.length === 0) {
        panel.appendChild(el('p', 'adm-hint', 'No hay otra mesa: crea una primero.'));
      }
      candidatas.forEach((m) => {
        const libres = m.capacidad - m.comensales.length;
        const btn = el('button', 'mes-chooser__mesa');
        btn.type = 'button';
        btn.appendChild(el('span', 'mes-chooser__nombre', m.nombre));
        btn.appendChild(el('span', `mes-chooser__libres${libres <= 0 ? ' is-lleno' : ''}`,
          libres > 0 ? `${libres} libre${libres === 1 ? '' : 's'}`
            : libres === 0 ? 'llena' : `${-libres} de más`));
        btn.addEventListener('click', () => { cierra(); resolve(m); });
        panel.appendChild(btn);
      });
      const cancelar = el('button', 'btn btn--ghost btn--block', 'Cancelar');
      cancelar.type = 'button';
      cancelar.addEventListener('click', () => { cierra(); resolve(null); });
      panel.appendChild(cancelar);
      chooserEl.appendChild(panel);
      chooserEl.addEventListener('click', (e) => {
        if (e.target === chooserEl) { cierra(); resolve(null); }
      }, { once: true });
    });
  }

  /* ---------- Operaciones de asignación ---------- */

  /** Sienta personas en una mesa; si no caben avisa ANTES (sobreaforo
      permitido a propósito, nunca bloqueado). */
  async function asignar(personas, mesa) {
    if (!personas.length) return;
    const libres = mesa.capacidad - mesa.comensales.length;
    if (personas.length > libres) {
      const ok = window.confirm(
        `En "${mesa.nombre}" quedan ${Math.max(0, libres)} plaza${libres === 1 ? '' : 's'} `
        + `y vas a sentar a ${personas.length}. ¿Continuar con sobreaforo?`);
      if (!ok) return;
    }
    const nuevos = personas.map((p) => ({
      key: p.key, nombre: p.nombre, nucleo: p.nucleoNombre, lado: p.lado, manual: false,
    }));
    seleccion.clear();
    modoMesa = null;
    await guardarMesa(mesa, { comensales: [...mesa.comensales, ...nuevos] },
      `${personas.length} sentado${personas.length === 1 ? '' : 's'} en "${mesa.nombre}" ✓`);
  }

  /** Quita a un comensal de la mesa (vuelve a "sin asignar"; los
      añadidos a mano simplemente desaparecen). */
  function quitar(mesa, comensal) {
    guardarMesa(mesa, { comensales: mesa.comensales.filter((c) => c !== comensal) },
      `${comensal.nombre} fuera de "${mesa.nombre}" ✓`);
  }

  /** Mueve a un comensal a otra mesa (elegida por toque). Primero se
      añade al destino y luego se quita del origen: si algo falla a
      medias queda duplicado (y el aviso de duplicados lo señala),
      nunca se pierde nadie. */
  async function mover(mesa, comensal) {
    const destino = await elegirMesa(`Mover a ${comensal.nombre} a…`, mesa.id);
    if (!destino) return;
    const libres = destino.capacidad - destino.comensales.length;
    if (libres < 1) {
      const ok = window.confirm(`"${destino.nombre}" está llena (${destino.comensales.length}/${destino.capacidad}). ¿Continuar con sobreaforo?`);
      if (!ok) return;
    }
    setFeedback('Moviendo…');
    try {
      await updateMesa(destino.id, { comensales: [...destino.comensales, comensal] });
      destino.comensales = [...destino.comensales, comensal];
      await updateMesa(mesa.id, { comensales: mesa.comensales.filter((c) => c !== comensal) });
      mesa.comensales = mesa.comensales.filter((c) => c !== comensal);
      setFeedback(`${comensal.nombre} → "${destino.nombre}" ✓`, 'is-ok');
    } catch (err) {
      console.error(err);
      setFeedback('No se ha podido mover del todo: revisa los avisos.', 'is-error');
    }
    render();
  }

  /** Comensal escrito a mano (no está en la lista de invitados). */
  async function anadirManual(mesa) {
    const nombre = (window.prompt(`Comensal a mano para "${mesa.nombre}" (no está en la lista de invitados):`) || '').trim();
    if (!nombre) return;
    const libres = mesa.capacidad - mesa.comensales.length;
    if (libres < 1) {
      const ok = window.confirm(`"${mesa.nombre}" está llena (${mesa.comensales.length}/${mesa.capacidad}). ¿Continuar con sobreaforo?`);
      if (!ok) return;
    }
    const comensal = {
      key: `manual|${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      nombre, nucleo: '', lado: '', manual: true,
    };
    await guardarMesa(mesa, { comensales: [...mesa.comensales, comensal] },
      `${nombre} (a mano) en "${mesa.nombre}" ✓`);
  }

  /* ---------- Comensales de una mesa ---------- */
  function renderComensales(mesa) {
    const lista = el('div', 'mes-comensales');
    if (mesa.comensales.length === 0) {
      lista.appendChild(el('p', 'adm-hint', 'Mesa vacía.'));
      return lista;
    }
    const estados = mapaEstados();
    mesa.comensales.forEach((c) => {
      const row = el('div', 'mes-comensal');
      const info = el('div', 'mes-comensal__info');
      const nombre = el('p', 'mes-comensal__nombre');
      nombre.appendChild(chipEstado(c, estados));
      nombre.appendChild(document.createTextNode(c.nombre));
      info.appendChild(nombre);
      info.appendChild(el('p', 'mes-comensal__meta',
        c.manual ? 'añadido a mano' : `${c.nucleo} · ${LADO_LABEL[c.lado]}`));
      row.appendChild(info);

      const acciones = el('div', 'mes-comensal__acciones');
      const moverBtn = el('button', 'adm-row__btn mes-mini', '⇄');
      moverBtn.type = 'button';
      moverBtn.title = 'Mover a otra mesa';
      moverBtn.addEventListener('click', () => mover(mesa, c));
      const quitarBtn = el('button', 'adm-row__btn adm-row__btn--danger mes-mini', '✕');
      quitarBtn.type = 'button';
      quitarBtn.title = 'Quitar de la mesa (vuelve a "sin asignar")';
      quitarBtn.addEventListener('click', () => quitar(mesa, c));
      acciones.append(moverBtn, quitarBtn);
      row.appendChild(acciones);
      lista.appendChild(row);
    });
    return lista;
  }

  /** Chip de estado del comensal: C (confirmado), P (pendiente),
      ✗ (marcado no asiste tras sentarlo), ? (ya no está en invitados),
      ✍ (añadido a mano). */
  function chipEstado(comensal, estados) {
    if (comensal.manual) return el('span', 'mes-estado mes-estado--manual', '✍');
    const estado = estados.get(comensal.key);
    if (estado === 'confirmado') return el('span', 'mes-estado mes-estado--c', 'C');
    if (estado === 'pendiente') return el('span', 'mes-estado mes-estado--p', 'P');
    if (estado === 'no_asiste') return el('span', 'mes-estado mes-estado--no', '✗');
    return el('span', 'mes-estado mes-estado--falta', '?');
  }

  /** Mapa key → estado actual en la colección invitados (todas las
      personas, también las no_asiste, para detectar cambios). */
  function mapaEstados() {
    const mapa = new Map();
    nucleos.forEach((n) => {
      n.personas.forEach((p) => mapa.set(`${n.id}|${p.nombre}`, p.estado));
    });
    return mapa;
  }

  function renderAccionesMesa(mesa) {
    const row = el('div', 'mes-card__acciones');
    const addBtn = el('button', 'adm-row__btn', '+ Añadir comensales');
    addBtn.type = 'button';
    addBtn.addEventListener('click', () => {
      modoMesa = mesa.id;
      seleccion.clear();
      render();
      personasEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    const manualBtn = el('button', 'adm-row__btn', '+ A mano');
    manualBtn.type = 'button';
    manualBtn.title = 'Añadir un comensal que no está en la lista de invitados';
    manualBtn.addEventListener('click', () => anadirManual(mesa));
    row.append(addBtn, manualBtn);
    return row;
  }

  /* ---------- Lista de personas sin asignar (selección por toque) ---------- */
  function pasaFiltros(p) {
    if (filtros.lado === 'ambos') {
      if (p.lado !== 'ambos') return false;
    } else if (filtros.lado && p.lado !== filtros.lado && p.lado !== 'ambos') {
      return false;
    }
    if (filtros.etiqueta && !p.etiquetas.includes(filtros.etiqueta)) return false;
    if (filtros.nucleo && p.nucleoId !== filtros.nucleo) return false;
    if (filtros.busca && !norm(p.nombre).includes(norm(filtros.busca))) return false;
    return true;
  }

  function personasDisponibles() {
    const sentados = mapaSentados();
    return personasAsignables().filter((p) => !sentados.has(p.key));
  }

  function renderPersonas() {
    personasEl.innerHTML = '';
    const disponibles = personasDisponibles();
    const visibles = disponibles.filter(pasaFiltros);

    if (visibles.length === 0) {
      personasEl.appendChild(el('p', 'adm-hint',
        disponibles.length === 0
          ? 'No queda nadie sin asignar. 🎉'
          : 'Nadie coincide con los filtros.'));
      return;
    }

    nucleos.forEach((n) => {
      const grupo = visibles.filter((p) => p.nucleoId === n.id);
      if (!grupo.length) return;
      // Para "sentar el núcleo" cuentan TODOS sus disponibles, aunque la
      // búsqueda por nombre esté ocultando a alguno.
      const grupoCompleto = disponibles.filter((p) => p.nucleoId === n.id);

      const bloque = el('div', 'mes-nucleo');
      const head = el('div', 'mes-nucleo__head');

      const marcarLabel = el('label', 'mes-nucleo__marcar');
      const marcarTodos = document.createElement('input');
      marcarTodos.type = 'checkbox';
      marcarTodos.checked = grupo.every((p) => seleccion.has(p.key));
      marcarTodos.addEventListener('change', () => {
        grupo.forEach((p) => (marcarTodos.checked ? seleccion.add(p.key) : seleccion.delete(p.key)));
        renderPersonas();
        renderAccionBar();
      });
      marcarLabel.appendChild(marcarTodos);
      const titulo = el('span', 'mes-nucleo__nombre', n.nombre);
      titulo.appendChild(el('span', `adm-team adm-team--${n.lado}`, LADO_LABEL[n.lado]));
      marcarLabel.appendChild(titulo);
      head.appendChild(marcarLabel);

      const sentarBtn = el('button', 'adm-row__btn mes-nucleo__sentar',
        `Sentar núcleo (${grupoCompleto.length})`);
      sentarBtn.type = 'button';
      sentarBtn.addEventListener('click', async () => {
        const mesa = modoMesa
          ? mesas.find((m) => m.id === modoMesa)
          : await elegirMesa(`Sentar al núcleo "${n.nombre}" (${grupoCompleto.length}) en…`);
        if (mesa) await asignar(grupoCompleto, mesa);
      });
      head.appendChild(sentarBtn);
      bloque.appendChild(head);

      grupo.forEach((p) => {
        const row = el('label', 'mes-persona');
        const check = document.createElement('input');
        check.type = 'checkbox';
        check.checked = seleccion.has(p.key);
        check.addEventListener('change', () => {
          if (check.checked) seleccion.add(p.key);
          else seleccion.delete(p.key);
          renderAccionBar();
        });
        row.appendChild(check);
        const nombre = el('span', 'mes-persona__nombre', p.nombre + (p.nino ? ' (niño)' : ''));
        row.appendChild(nombre);
        row.appendChild(el('span',
          `mes-estado ${p.estado === 'confirmado' ? 'mes-estado--c' : 'mes-estado--p'}`,
          ESTADO_CORTO[p.estado]));
        bloque.appendChild(row);
      });

      personasEl.appendChild(bloque);
    });
  }

  /* ---------- Barra de acción pegajosa ---------- */
  function seleccionadas() {
    const disponibles = personasDisponibles();
    return disponibles.filter((p) => seleccion.has(p.key));
  }

  function renderAccionBar() {
    const sel = seleccionadas();
    const activa = sel.length > 0 || modoMesa;
    accionEl.hidden = !activa;
    root.classList.toggle('has-accion', Boolean(activa));
    accionEl.innerHTML = '';
    if (!activa) return;

    if (modoMesa) {
      const mesa = mesas.find((m) => m.id === modoMesa);
      if (!mesa) { modoMesa = null; renderAccionBar(); return; }
      accionEl.appendChild(el('span', 'mes-accion__texto', `Añadiendo a "${mesa.nombre}"`));
      const add = el('button', 'btn btn--solid mes-accion__btn', `Añadir (${sel.length})`);
      add.type = 'button';
      add.disabled = sel.length === 0;
      add.addEventListener('click', () => asignar(sel, mesa));
      const cancelar = el('button', 'btn btn--ghost mes-accion__btn', 'Cancelar');
      cancelar.type = 'button';
      cancelar.addEventListener('click', () => { modoMesa = null; seleccion.clear(); render(); });
      accionEl.append(add, cancelar);
    } else {
      const asignarBtn = el('button', 'btn btn--solid mes-accion__btn', `Asignar ${sel.length} a mesa…`);
      asignarBtn.type = 'button';
      asignarBtn.addEventListener('click', async () => {
        const mesa = await elegirMesa(`Sentar a ${sel.length} persona${sel.length === 1 ? '' : 's'} en…`);
        if (mesa) await asignar(sel, mesa);
      });
      const limpiar = el('button', 'btn btn--ghost mes-accion__btn', 'Quitar selección');
      limpiar.type = 'button';
      limpiar.addEventListener('click', () => { seleccion.clear(); renderPersonas(); renderAccionBar(); });
      accionEl.append(asignarBtn, limpiar);
    }
  }

  /* ---------- Contadores (con "sin asignar" desplegable) ---------- */
  function renderStats() {
    const asignables = personasAsignables();
    const sentados = mapaSentados();
    const sinAsignar = asignables.filter((p) => !sentados.has(p.key));
    const asignadas = asignables.length - sinAsignar.length;

    statsEl.innerHTML = '';
    const stats = [
      { label: 'a sentar', num: asignables.length },
      { label: 'asignadas', num: asignadas },
    ];
    stats.forEach((s) => {
      const card = el('div', 'res-stat');
      card.appendChild(el('span', 'res-stat__num', String(s.num)));
      card.appendChild(el('span', 'res-stat__label', s.label));
      statsEl.appendChild(card);
    });

    // "Sin asignar" desplegable: lo que más se mira al cuadrar mesas
    const btn = el('button', 'res-stat res-stat--btn');
    btn.type = 'button';
    btn.classList.toggle('is-open', statAbierta);
    btn.setAttribute('aria-expanded', String(statAbierta));
    btn.appendChild(el('span', 'res-stat__num', String(sinAsignar.length)));
    btn.appendChild(el('span', 'res-stat__label', 'sin asignar'));
    btn.appendChild(el('span', 'tot-exp__chev', '▾'));
    btn.addEventListener('click', () => {
      statAbierta = !statAbierta;
      renderStats();
    });
    statsEl.appendChild(btn);

    statDetailEl.innerHTML = '';
    if (statAbierta) {
      const lista = el('div', 'tot-detail tot-detail--scroll');
      if (sinAsignar.length === 0) {
        lista.appendChild(el('p', 'tot-person tot-person--empty', 'Nadie sin asignar. 🎉'));
      }
      sinAsignar.forEach((p) => {
        const line = el('p', 'tot-person');
        line.appendChild(el('span', null, p.nombre + (p.nino ? ' (niño)' : '')));
        line.appendChild(el('span', 'tot-person__by', ` — ${p.nucleoNombre} · ${LADO_LABEL[p.lado]}`));
        lista.appendChild(line);
      });
      statDetailEl.appendChild(lista);
    }
  }

  /* ---------- Avisos (sobreaforo, duplicados, no asiste, borrados) ---------- */
  function renderAvisos() {
    avisosEl.innerHTML = '';
    const avisos = [];
    const estados = mapaEstados();
    const sentados = mapaSentados();

    sentados.forEach((enMesas, key) => {
      if (enMesas.length > 1 && !key.startsWith('manual|')) {
        const c = enMesas[0].comensales.find((x) => x.key === key);
        avisos.push({
          nivel: 'error',
          texto: `${c ? c.nombre : key} está en ${enMesas.length} mesas: ${enMesas.map((m) => `"${m.nombre}"`).join(' y ')}.`,
        });
      }
    });

    mesas.forEach((m) => {
      m.comensales.forEach((c) => {
        if (c.manual) return;
        const estado = estados.get(c.key);
        if (estado === 'no_asiste') {
          avisos.push({
            nivel: 'error',
            texto: `${c.nombre} está en "${m.nombre}" pero ahora figura como NO ASISTE en invitados.`,
          });
        } else if (estado === undefined) {
          avisos.push({
            nivel: 'warn',
            texto: `${c.nombre} está en "${m.nombre}" pero ya no aparece en la lista de invitados (¿renombrado o borrado?).`,
          });
        }
      });
      if (m.comensales.length > m.capacidad) {
        avisos.push({
          nivel: 'warn',
          texto: `"${m.nombre}" tiene sobreaforo: ${m.comensales.length} comensales para ${m.capacidad} plazas.`,
        });
      }
    });

    avisos.forEach((a) => {
      avisosEl.appendChild(el('p', `mes-aviso mes-aviso--${a.nivel}`, `⚠ ${a.texto}`));
    });
  }

  /* ---------- Filtros (opciones) ---------- */
  function rellenaFiltros() {
    const etiquetas = [...new Set(nucleos.flatMap((n) => n.etiquetas))].sort((a, b) =>
      a.localeCompare(b, 'es'));
    etiquetas.forEach((t) => {
      const opt = document.createElement('option');
      opt.value = t;
      opt.textContent = t;
      fEtiqueta.appendChild(opt);
    });
    // Núcleos: nombre + lado y primera etiqueta, para distinguir los
    // nombres repetidos ("Pili" x2, "Ana" x2…)
    nucleos.forEach((n) => {
      const opt = document.createElement('option');
      opt.value = n.id;
      const extra = [LADO_LABEL[n.lado], n.etiquetas[0]].filter(Boolean).join(' · ');
      opt.textContent = extra ? `${n.nombre} (${extra})` : n.nombre;
      fNucleo.appendChild(opt);
    });
  }

  /* ---------- Render general ---------- */
  function render() {
    renderStats();
    renderAvisos();
    listEl.innerHTML = '';
    if (editandoMesa === 'nueva') listEl.appendChild(creaEditorMesa(null));
    if (mesas.length === 0 && editandoMesa !== 'nueva') {
      listEl.appendChild(el('p', 'adm-hint', 'Aún no hay mesas: crea la primera.'));
    }
    mesas.forEach((m) => listEl.appendChild(renderMesa(m)));
    renderPersonas();
    renderAccionBar();
  }

  /* ---------- Eventos ---------- */
  nuevaBtn.addEventListener('click', () => {
    editandoMesa = 'nueva';
    render();
    listEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  buscaInput.addEventListener('input', () => { filtros.busca = buscaInput.value.trim(); renderPersonas(); });
  fLado.addEventListener('change', () => { filtros.lado = fLado.value; renderPersonas(); });
  fEtiqueta.addEventListener('change', () => { filtros.etiqueta = fEtiqueta.value; renderPersonas(); });
  fNucleo.addEventListener('change', () => { filtros.nucleo = fNucleo.value; renderPersonas(); });

  /* ---------- Carga inicial ---------- */
  const [mesasCargadas, nucleosCargados] = await Promise.all([fetchMesas(), fetchNucleos()]);
  mesas = mesasCargadas;
  nucleos = nucleosCargados;
  rellenaFiltros();
  render();
}

/* =================================================================
   Puerta de acceso compartida con el resto de páginas de gestión
   ================================================================= */
export function initMesasPage() {
  const appRoot = document.getElementById('mes-app');
  if (!appRoot) return;

  initGate({
    async onEnter() {
      appRoot.hidden = false;
      await initApp(appRoot);
    },
  });
}
