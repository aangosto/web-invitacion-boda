/* =================================================================
   GESTIÓN DEL HOTEL — página privada (hoteles.html).

   Puerta compartida (panel-gate.js): si ya se entró en el panel o en
   /invitados no vuelve a pedir la contraseña.

   Vista: contadores (habitaciones y dinero), filtros (tipo / estado
   de pago / fechas + buscador por ocupante sin tildes) y la lista
   agrupada por TIPO y por FECHAS, como el listado del hotel. Cada
   habitación: pagado sí/no, importe cobrado (por si pagan a medias),
   y edición completa (ocupantes, fechas, tipo —recalculando importe
   por tarifa—, cuna, notas, borrar). Capa de datos:
   habitaciones-data.js; tarifa: habitaciones-precios.js.
   ================================================================= */

import { initGate } from './panel-gate.js';
import {
  fetchHabitaciones, updateHabitacion, createHabitacion, deleteHabitacion,
} from './habitaciones-data.js';
import {
  TIPOS, TIPO_LABEL, calcNoches, calcImporte,
} from './habitaciones-precios.js';

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

function fmtEuros(n) {
  return Number(n).toLocaleString('es-ES', { maximumFractionDigits: 2 });
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** '2026-10-23' → '23 oct' (o el ISO si no parsea). */
function fmtDia(iso) {
  const [, m, d] = String(iso).split('-').map(Number);
  return m && d ? `${d} ${MESES[m - 1]}` : String(iso);
}

function fmtRango(entrada, salida) {
  return `${fmtDia(entrada)} → ${fmtDia(salida)}`;
}

/* =================================================================
   App (tras pasar la puerta)
   ================================================================= */
async function initApp(root) {
  root.innerHTML = `
    <button type="button" class="panel-salir" data-salir>Salir</button>
    <p class="adm-hint">Bloqueo del Hotel Exe Boston (reserva 0034652508).
      Cada invitado paga su habitación: marca aquí quién ha pagado y cuánto.</p>

    <div id="hot-stats" class="res-stats res-stats--four"></div>
    <div id="hot-money" class="inv-money"></div>

    <div class="inv-filtros">
      <input id="hot-busca" class="field__input" type="search"
             placeholder="Buscar por ocupante…" autocomplete="off" />
      <div class="inv-filtros__row inv-filtros__row--hotel">
        <select id="hot-f-tipo" class="field__input inv-select" aria-label="Filtrar por tipo">
          <option value="">Tipo: todos</option>
          <option value="individual">Individual</option>
          <option value="doble">Doble</option>
          <option value="supletoria">Doble + supletoria</option>
        </select>
        <select id="hot-f-estado" class="field__input inv-select" aria-label="Filtrar por estado de pago">
          <option value="">Pago: todas</option>
          <option value="pagada">Pagadas</option>
          <option value="no_pagada">Sin pagar</option>
          <option value="sin_asignar">Sin asignar</option>
        </select>
        <select id="hot-f-fechas" class="field__input inv-select" aria-label="Filtrar por fechas">
          <option value="">Fechas: todas</option>
        </select>
      </div>
    </div>

    <p id="hot-feedback" class="form-feedback inv-feedback" role="status" aria-live="polite"></p>
    <button type="button" id="hot-nueva" class="btn btn--ghost btn--block">+ Nueva habitación</button>
    <div id="hot-list" class="inv-list">Cargando habitaciones…</div>
  `;

  const statsEl = root.querySelector('#hot-stats');
  const moneyEl = root.querySelector('#hot-money');
  const listEl = root.querySelector('#hot-list');
  const feedback = root.querySelector('#hot-feedback');
  const buscaInput = root.querySelector('#hot-busca');
  const fTipo = root.querySelector('#hot-f-tipo');
  const fEstado = root.querySelector('#hot-f-estado');
  const fFechas = root.querySelector('#hot-f-fechas');
  const nuevaBtn = root.querySelector('#hot-nueva');

  let habitaciones = [];
  let editando = null; // id en edición, o 'nueva', o null
  const filtros = { busca: '', tipo: '', estado: '', fechas: '' };

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

  async function guardar(hab, cambios, okMsg) {
    setFeedback('Guardando…');
    try {
      await updateHabitacion(hab.id, cambios);
      Object.assign(hab, cambios);
      setFeedback(okMsg || 'Guardado ✓', 'is-ok');
      render();
    } catch (err) {
      console.error(err);
      setFeedback('No se ha podido guardar. Inténtalo de nuevo.', 'is-error');
      render();
    }
  }

  /* ---------- Filtros ---------- */
  function pasaFiltrosBase(h) {
    if (filtros.tipo && h.tipo !== filtros.tipo) return false;
    if (filtros.fechas && `${h.entrada}|${h.salida}` !== filtros.fechas) return false;
    if (filtros.busca) {
      const b = norm(filtros.busca);
      if (!h.ocupantes.some((o) => norm(o).includes(b))) return false;
    }
    return true;
  }

  function pasaEstado(h) {
    if (filtros.estado === 'pagada') return h.pagado;
    if (filtros.estado === 'no_pagada') return !h.pagado;
    if (filtros.estado === 'sin_asignar') return h.ocupantes.length === 0;
    return true;
  }

  function habitacionVisible(h) {
    return pasaFiltrosBase(h) && pasaEstado(h);
  }

  function rellenaFechas() {
    const previa = fFechas.value;
    const rangos = [...new Set(habitaciones.map((h) => `${h.entrada}|${h.salida}`))].sort();
    fFechas.length = 1; // conserva "Fechas: todas"
    rangos.forEach((r) => {
      const [e, s] = r.split('|');
      const opt = document.createElement('option');
      opt.value = r;
      opt.textContent = fmtRango(e, s);
      fFechas.appendChild(opt);
    });
    fFechas.value = rangos.includes(previa) ? previa : '';
  }

  /* ---------- Contadores ----------
     Cuentan las habitaciones que pasan tipo/fechas/búsqueda (el filtro
     de estado no altera los números: siempre se ve el cuadro completo
     de lo filtrado). `cobrado` efectivo: lo apuntado; si no hay nada
     apuntado pero está marcada pagada, cuenta su importe entero. */
  function cobradoEfectivo(h) {
    if (h.cobrado != null) return h.cobrado;
    return h.pagado ? h.importe : 0;
  }

  function renderStats() {
    const visibles = habitaciones.filter(pasaFiltrosBase);
    const pagadas = visibles.filter((h) => h.pagado).length;
    const sinAsignar = visibles.filter((h) => h.ocupantes.length === 0).length;

    statsEl.innerHTML = '';
    [
      [visibles.length, 'Habitaciones'],
      [pagadas, 'Pagadas'],
      [visibles.length - pagadas, 'Sin pagar'],
      [sinAsignar, 'Sin asignar'],
    ].forEach(([num, label]) => {
      const card = el('div', 'res-stat');
      card.appendChild(el('span', 'res-stat__num', String(num)));
      card.appendChild(el('span', 'res-stat__label', label));
      statsEl.appendChild(card);
    });

    const facturado = visibles.reduce((s, h) => s + h.importe, 0);
    const cobrado = visibles.reduce((s, h) => s + cobradoEfectivo(h), 0);
    moneyEl.innerHTML = '';
    moneyEl.classList.add('has-total');
    const fila = (clase, label, valor) => {
      const row = el('div', `inv-money__row ${clase}`);
      row.appendChild(el('span', 'inv-money__label', label));
      row.appendChild(el('span', 'inv-money__val', valor));
      moneyEl.appendChild(row);
    };
    fila('', 'Total facturado', `${fmtEuros(facturado)} €`);
    fila('inv-money__row--real', 'Cobrado', `${fmtEuros(cobrado)} €`);
    fila('inv-money__row--total', 'Pendiente de cobro', `${fmtEuros(facturado - cobrado)} €`);
  }

  /* ---------- Control de importe cobrado (mismo patrón que los
     regalos de /invitados: botón → campo; vacío = quitar apunte) ---------- */
  function creaCobradoControl(h) {
    const wrap = el('span', 'inv-regalo');

    function pinta() {
      wrap.innerHTML = '';
      const btn = el('button',
        `inv-regalo__btn${h.cobrado != null ? ' has-valor' : ''}`,
        h.cobrado != null ? `cobrado ${fmtEuros(h.cobrado)} €` : '€ cobrado');
      btn.type = 'button';
      btn.title = 'Apuntar el importe realmente cobrado (pagos a medias o distintos del calculado)';
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
      if (h.cobrado != null) input.value = h.cobrado;

      const ok = el('button', 'adm-row__btn inv-regalo__ok', 'Guardar');
      ok.type = 'button';
      ok.addEventListener('click', () => {
        const v = input.value.trim();
        const num = v === '' ? null : Number(v.replace(',', '.'));
        if (num != null && (!Number.isFinite(num) || num < 0)) {
          input.focus();
          return;
        }
        guardar(h, { cobrado: num },
          num == null ? 'Cobro quitado ✓' : `Cobrados ${fmtEuros(num)} € ✓`);
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

  /* ---------- Editor de una habitación (crear o editar) ---------- */
  function creaEditor(h) {
    const esNueva = !h;
    const datos = h || {
      tipo: filtros.tipo || 'doble',
      entrada: '2026-10-23',
      salida: '2026-10-25',
      ocupantes: [],
      cuna: false,
      notas: '',
    };

    const box = el('div', 'adm-editor inv-editor');
    box.appendChild(el('h3', 'adm-editor__title',
      esNueva ? 'Nueva habitación' : `Editar: ${datos.ocupantes[0] || 'pendiente de asignar'}`));

    // Tipo + fechas
    const fila = el('div', 'hot-editor__fila');
    const fTipoEd = el('label', 'field');
    fTipoEd.appendChild(el('span', 'field__label', 'Tipo'));
    const tipoSel = el('select', 'field__input inv-select');
    TIPOS.forEach((t) => {
      const opt = document.createElement('option');
      opt.value = t;
      opt.textContent = TIPO_LABEL[t];
      tipoSel.appendChild(opt);
    });
    tipoSel.value = datos.tipo;
    fTipoEd.appendChild(tipoSel);
    fila.appendChild(fTipoEd);

    const fEntrada = el('label', 'field');
    fEntrada.appendChild(el('span', 'field__label', 'Entrada'));
    const entradaInput = el('input', 'field__input');
    entradaInput.type = 'date';
    entradaInput.value = datos.entrada;
    fEntrada.appendChild(entradaInput);
    fila.appendChild(fEntrada);

    const fSalida = el('label', 'field');
    fSalida.appendChild(el('span', 'field__label', 'Salida'));
    const salidaInput = el('input', 'field__input');
    salidaInput.type = 'date';
    salidaInput.value = datos.salida;
    fSalida.appendChild(salidaInput);
    fila.appendChild(fSalida);
    box.appendChild(fila);

    // Importe calculado en vivo (tarifa)
    const importePreview = el('p', 'hot-editor__importe');
    function actualizaImporte() {
      const noches = calcNoches(entradaInput.value, salidaInput.value);
      const importe = calcImporte(tipoSel.value, entradaInput.value, salidaInput.value);
      importePreview.textContent = noches > 0
        ? `${noches} noche${noches === 1 ? '' : 's'} · importe por tarifa: ${fmtEuros(importe)} €`
        : 'Fechas no válidas (la salida debe ser posterior a la entrada).';
    }
    [tipoSel, entradaInput, salidaInput].forEach((c) => c.addEventListener('input', actualizaImporte));
    actualizaImporte();
    box.appendChild(importePreview);

    // Cuna
    const cunaLabel = el('label', 'inv-editor__nino hot-editor__cuna');
    const cunaCheck = document.createElement('input');
    cunaCheck.type = 'checkbox';
    cunaCheck.checked = datos.cuna === true;
    cunaLabel.appendChild(cunaCheck);
    cunaLabel.appendChild(document.createTextNode('con cuna (bebé)'));
    box.appendChild(cunaLabel);

    // Ocupantes
    box.appendChild(el('span', 'field__label', 'Ocupantes (vacío = pendiente de asignar)'));
    const ocupantesBox = el('div', 'inv-editor__personas');
    box.appendChild(ocupantesBox);
    const filas = [];

    function addFilaOcupante(nombre) {
      const row = el('div', 'inv-editor__persona');
      const input = el('input', 'field__input');
      input.type = 'text';
      input.maxLength = 120;
      input.placeholder = 'Nombre completo';
      input.value = nombre || '';
      const quitar = el('button', 'adm-row__btn adm-row__btn--danger inv-editor__quitar', '✕');
      quitar.type = 'button';
      quitar.title = 'Quitar ocupante';
      quitar.addEventListener('click', () => {
        const idx = filas.findIndex((f) => f.row === row);
        if (idx >= 0) filas.splice(idx, 1);
        row.remove();
      });
      row.append(input, quitar);
      ocupantesBox.appendChild(row);
      filas.push({ input, row });
      return input;
    }
    datos.ocupantes.forEach((o) => addFilaOcupante(o));

    const addBtn = el('button', 'btn btn--ghost btn--block', '+ Añadir ocupante');
    addBtn.type = 'button';
    addBtn.addEventListener('click', () => addFilaOcupante('').focus());
    box.appendChild(addBtn);

    // Notas
    const fNotas = el('label', 'field');
    fNotas.appendChild(el('span', 'field__label', 'Notas'));
    const notasInput = el('input', 'field__input');
    notasInput.type = 'text';
    notasInput.maxLength = 1000;
    notasInput.placeholder = 'Lo que haga falta recordar de esta habitación';
    notasInput.value = datos.notas || '';
    fNotas.appendChild(notasInput);
    box.appendChild(fNotas);

    // Acciones
    const acciones = el('div', 'adm-editor__actions');
    const cancelar = el('button', 'btn btn--ghost', 'Cancelar');
    cancelar.type = 'button';
    cancelar.addEventListener('click', () => { editando = null; render(); });
    const guardarBtn = el('button', 'btn btn--solid', 'Guardar');
    guardarBtn.type = 'button';
    guardarBtn.addEventListener('click', async () => {
      const entrada = entradaInput.value;
      const salida = salidaInput.value;
      const noches = calcNoches(entrada, salida);
      if (!entrada || !salida || noches < 1) {
        setFeedback('Revisa las fechas: la salida debe ser posterior a la entrada.', 'is-error');
        return;
      }
      const ocupantes = filas.map((f) => f.input.value.trim()).filter(Boolean);
      const cambios = {
        tipo: tipoSel.value,
        entrada,
        salida,
        noches,
        importe: calcImporte(tipoSel.value, entrada, salida),
        ocupantes,
        cuna: cunaCheck.checked,
        notas: notasInput.value.trim(),
      };

      guardarBtn.disabled = true;
      setFeedback('Guardando…');
      try {
        if (esNueva) {
          const orden = habitaciones.reduce((m, x) => Math.max(m, x.orden), 0) + 1;
          const id = await createHabitacion({ ...cambios, orden });
          habitaciones.push({ id, ...cambios, pagado: false, cobrado: null, orden });
        } else {
          await updateHabitacion(h.id, cambios);
          Object.assign(h, cambios);
        }
        editando = null;
        setFeedback('Guardado ✓', 'is-ok');
        rellenaFechas();
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
      const borrar = el('button', 'adm-row__btn adm-row__btn--danger inv-editor__borrar',
        'Borrar habitación definitivamente');
      borrar.type = 'button';
      borrar.addEventListener('click', async () => {
        const quien = h.ocupantes.length ? h.ocupantes.join(' / ') : 'pendiente de asignar';
        if (!window.confirm(`¿Borrar la habitación de "${quien}" (${fmtEuros(h.importe)} €)? Esta acción NO se puede deshacer.`)) return;
        if (!window.confirm('¿Seguro del todo? Se borrará definitivamente del bloqueo.')) return;
        setFeedback('Borrando…');
        try {
          await deleteHabitacion(h.id);
          habitaciones = habitaciones.filter((x) => x.id !== h.id);
          editando = null;
          setFeedback('Habitación borrada ✓', 'is-ok');
          rellenaFechas();
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

  /* ---------- Tarjeta de una habitación ---------- */
  function renderHabitacion(h) {
    const card = el('article', 'inv-card hot-card');

    if (editando === h.id) {
      card.appendChild(creaEditor(h));
      return card;
    }

    // Cabecera: ocupantes (o pendiente) + importe
    const head = el('div', 'inv-card__head');
    const title = el('div', 'inv-card__title hot-card__title');
    if (h.ocupantes.length) {
      title.appendChild(el('h3', 'hot-card__ocupantes', h.ocupantes.join(' · ')));
    } else {
      title.appendChild(el('span', 'hot-card__pendiente', 'Pendiente de asignar'));
    }
    head.appendChild(title);
    head.appendChild(el('span', 'hot-card__importe', `${fmtEuros(h.importe)} €`));
    card.appendChild(head);

    // Meta: tipo, noches, fechas, cuna, notas
    const metaBits = [
      TIPO_LABEL[h.tipo],
      `${h.noches} noche${h.noches === 1 ? '' : 's'}`,
      fmtRango(h.entrada, h.salida),
    ];
    if (h.cuna) metaBits.push('👶 con cuna');
    card.appendChild(el('p', 'hot-card__meta', metaBits.join(' · ')));
    if (h.notas) card.appendChild(el('p', 'hot-card__notas', h.notas));

    // Aviso de cobro parcial (apuntado menos de lo facturado)
    if (h.cobrado != null && h.cobrado < h.importe) {
      card.appendChild(el('p', 'hot-card__parcial',
        `Cobro parcial: faltan ${fmtEuros(h.importe - h.cobrado)} €`));
    }

    // Acciones: pagado, cobrado, editar
    const acciones = el('div', 'hot-card__acciones');
    const pagoBtn = el('button',
      `hot-pago${h.pagado ? ' is-pagada' : ''}`,
      h.pagado ? '✓ Pagada' : 'Sin pagar');
    pagoBtn.type = 'button';
    pagoBtn.title = 'Cambiar el estado de pago';
    pagoBtn.addEventListener('click', () => {
      guardar(h, { pagado: !h.pagado },
        h.pagado ? 'Marcada SIN pagar ✓' : 'Marcada como pagada ✓');
    });
    acciones.appendChild(pagoBtn);
    acciones.appendChild(creaCobradoControl(h));
    const editBtn = el('button', 'adm-row__btn inv-card__edit', 'Editar');
    editBtn.type = 'button';
    editBtn.addEventListener('click', () => { editando = h.id; render(); });
    acciones.appendChild(editBtn);
    card.appendChild(acciones);

    return card;
  }

  /* ---------- Render general (agrupado por tipo y fechas) ---------- */
  function render() {
    renderStats();
    listEl.innerHTML = '';

    if (editando === 'nueva') {
      listEl.appendChild(creaEditor(null));
    }

    const visibles = habitaciones.filter(habitacionVisible);
    if (visibles.length === 0 && editando !== 'nueva') {
      listEl.appendChild(el('p', 'adm-hint', 'Ninguna habitación coincide con los filtros.'));
      return;
    }

    TIPOS.forEach((tipo) => {
      const deTipo = visibles.filter((h) => h.tipo === tipo);
      if (!deTipo.length) return;
      const seccion = el('section', 'hot-grupo');
      seccion.appendChild(el('h3', 'adm-subtitle', `${TIPO_LABEL[tipo]} (${deTipo.length})`));

      const rangos = [...new Set(deTipo.map((h) => `${h.entrada}|${h.salida}`))].sort();
      rangos.forEach((r) => {
        const [e, s] = r.split('|');
        const deRango = deTipo.filter((h) => `${h.entrada}|${h.salida}` === r);
        seccion.appendChild(el('h4', 'hot-grupo__fechas',
          `${fmtRango(e, s)} · ${deRango.length} hab.`));
        deRango.forEach((h) => seccion.appendChild(renderHabitacion(h)));
      });
      listEl.appendChild(seccion);
    });
  }

  /* ---------- Eventos ---------- */
  buscaInput.addEventListener('input', () => { filtros.busca = buscaInput.value.trim(); render(); });
  fTipo.addEventListener('change', () => { filtros.tipo = fTipo.value; render(); });
  fEstado.addEventListener('change', () => { filtros.estado = fEstado.value; render(); });
  fFechas.addEventListener('change', () => { filtros.fechas = fFechas.value; render(); });
  nuevaBtn.addEventListener('click', () => {
    editando = 'nueva';
    render();
    listEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  /* ---------- Carga inicial ---------- */
  habitaciones = await fetchHabitaciones();
  rellenaFechas();
  render();
}

/* =================================================================
   Puerta de acceso compartida con el resto de páginas de gestión
   ================================================================= */
export function initHotelesPage() {
  const appRoot = document.getElementById('hot-app');
  if (!appRoot) return;

  initGate({
    async onEnter() {
      appRoot.hidden = false;
      await initApp(appRoot);
    },
  });
}
