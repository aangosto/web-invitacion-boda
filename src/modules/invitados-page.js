/* =================================================================
   GESTIÓN DE INVITADOS — página privada (invitados.html).

   Misma protección que el panel /resultados: contraseña
   (VITE_RESULTS_PASSWORD) → signInAnonymously() → se muestra la app.

   Vista: contadores arriba, filtros (lado / etiqueta / estado +
   buscador) y la lista agrupada POR NÚCLEO. Cada persona tiene su
   selector de estado (control interno de los novios, independiente
   de las confirmaciones que llegan por la web) y cada núcleo un
   selector para marcar a todos de golpe.

   Los núcleos con nombre repetido ("Pili" x2, "Ana" x2…) se
   distinguen por su lado y sus etiquetas, siempre visibles.
   Capa de datos: invitados-data.js.
   ================================================================= */

import { app, isConfigured } from '../firebase.js';
import { getAuth, signInAnonymously } from 'firebase/auth';
import {
  ESTADOS, ESTADO_LABEL, fetchNucleos, updateNucleo,
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

const LADO_LABEL = { novia: 'María', novio: 'Alberto' };

/* =================================================================
   App (tras pasar la puerta)
   ================================================================= */
async function initApp(root) {
  root.innerHTML = `
    <p class="adm-hint">Control interno de la lista de invitados: estados,
      etiquetas y regalos. Independiente de las confirmaciones que llegan
      por la web.</p>

    <div id="inv-stats" class="res-stats res-stats--four"></div>

    <div class="inv-filtros">
      <input id="inv-busca" class="field__input" type="search"
             placeholder="Buscar por nombre…" autocomplete="off" />
      <div class="inv-filtros__row">
        <select id="inv-f-lado" class="field__input inv-select" aria-label="Filtrar por lado">
          <option value="">Lado: todos</option>
          <option value="novia">María (novia)</option>
          <option value="novio">Alberto (novio)</option>
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
    <div id="inv-list" class="inv-list">Cargando invitados…</div>
  `;

  const statsEl = root.querySelector('#inv-stats');
  const listEl = root.querySelector('#inv-list');
  const feedback = root.querySelector('#inv-feedback');
  const buscaInput = root.querySelector('#inv-busca');
  const fLado = root.querySelector('#inv-f-lado');
  const fEtiqueta = root.querySelector('#inv-f-etiqueta');
  const fEstado = root.querySelector('#inv-f-estado');

  let nucleos = [];
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
    if (filtros.lado && n.lado !== filtros.lado) return false;
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
     así siempre se ve el desglose completo de lo filtrado). */
  function renderStats() {
    const visibles = nucleos.filter((n) => {
      const estadoGuardado = filtros.estado;
      filtros.estado = '';
      const ok = nucleoVisible(n);
      filtros.estado = estadoGuardado;
      return ok;
    });
    const personas = visibles.flatMap((n) => n.personas);
    const cuenta = (e) => personas.filter((p) => p.estado === e).length;

    statsEl.innerHTML = '';
    const stats = [
      [personas.length, 'Invitados'],
      [cuenta('confirmado'), 'Confirmados'],
      [cuenta('pendiente'), 'Pendientes'],
      [cuenta('no_asiste'), 'No asisten'],
    ];
    stats.forEach(([num, label]) => {
      const card = el('div', 'res-stat');
      card.appendChild(el('span', 'res-stat__num', String(num)));
      card.appendChild(el('span', 'res-stat__label', label));
      statsEl.appendChild(card);
    });
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

  /* ---------- Tarjeta de un núcleo ---------- */
  function renderNucleo(n) {
    const card = el('article', 'inv-card');

    // Cabecera: nombre + lado + nº de personas
    const head = el('div', 'inv-card__head');
    const title = el('div', 'inv-card__title');
    title.appendChild(el('h3', 'inv-card__nombre', n.nombre));
    const lado = el('span', `adm-team adm-team--${n.lado}`, LADO_LABEL[n.lado]);
    title.appendChild(lado);
    head.appendChild(title);
    head.appendChild(el('span', 'inv-card__n', `${n.personas.length} pers.`));
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
      row.appendChild(creaSelectEstado(p.estado, (nuevo) => {
        const personas = n.personas.map((q, j) => (j === i ? { ...q, estado: nuevo } : q));
        guardar(n, { personas }, `${p.nombre}: ${ESTADO_LABEL[nuevo]} ✓`);
      }));
      lista.appendChild(row);
    });
    card.appendChild(lista);

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
    const visibles = nucleos.filter(nucleoVisible);
    if (visibles.length === 0) {
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

  /* ---------- Carga inicial ---------- */
  nucleos = await fetchNucleos();
  rellenaEtiquetas();
  render();
}

/* =================================================================
   Puerta de acceso (idéntica a la del panel /resultados)
   ================================================================= */
export function initInvitadosPage() {
  const gate = document.getElementById('results-gate');
  const appRoot = document.getElementById('inv-app');
  if (!gate || !appRoot) return;

  const feedback = document.getElementById('results-feedback');
  const passInput = gate.querySelector('input[name="password"]');
  const submitBtn = gate.querySelector('button[type="submit"]');

  function setFeedback(msg, type) {
    feedback.textContent = msg || '';
    feedback.classList.remove('is-ok', 'is-error');
    if (type) feedback.classList.add(type);
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
    setFeedback('Entrando…');
    try {
      // Sesión anónima: las reglas exigen auth para leer/escribir invitados
      await signInAnonymously(getAuth(app));
      gate.hidden = true;
      appRoot.hidden = false;
      setFeedback('');
      await initApp(appRoot);
    } catch (err) {
      console.error(err);
      submitBtn.disabled = false;
      const authOff = err && (
        err.code === 'auth/operation-not-allowed'
        || err.code === 'auth/admin-restricted-operation'
        || err.code === 'auth/configuration-not-found'
      );
      setFeedback(authOff
        ? 'El inicio de sesión ANÓNIMO no está activado en Firebase (Authentication → Método de acceso → Anónimo).'
        : 'No se ha podido entrar. Inténtalo de nuevo.', 'is-error');
    }
  });
}
