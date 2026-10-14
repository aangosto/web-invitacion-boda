/* =================================================================
   PLANO DEL SALÓN — página privada (plano.html).

   Puerta compartida (panel-gate.js): si ya se entró en el panel,
   invitados, hotel o mesas, no vuelve a pedir la contraseña.

   Usa la MISMA colección "mesas" que mesas.html y solo escribe los
   campos del plano (forma, posición, rotación, icono, orden de
   asientos, capacidad y presidencial) — plano-data.js. Esta página NO
   sienta a nadie: el reparto sigue en mesas.html; aquí solo se coloca
   cada mesa y se ORDENA a quien ya está sentado.

   Táctil (mobile-first):
   · Fuera del modo edición el plano no se mueve: el dedo hace scroll
     de la página con normalidad y un toque abre la mesa.
   · "Editar posición" pasa el plano a PANTALLA COMPLETA con
     touch-action:none + preventDefault en touchmove: arrastrar una mesa
     nunca se pelea con el scroll. Un dedo sobre una mesa = moverla;
     sobre el suelo = desplazar el plano; dos dedos = zoom.
   · Reordenar comensales es por toque (subir/bajar o tocar dos para
     intercambiarlos): nada de drag and drop.
   ================================================================= */

import { initGate } from './panel-gate.js';
import {
  fetchPlano, savePlano, fetchMesasPlano, updateMesaPlano, setPresidencial,
  guardaPosiciones, crearCopia, fetchCopias, borraCopia,
} from './plano-data.js';
import { iconoMesa } from './mesas-iconos.js';
import { initExportFinca } from './export-finca.js';
import {
  FORMAS, FORMA_LABEL, SILLA_R, numPuestos, tamanoMesa, puestosLocales,
  semiCaja, limitaDentro, imanta, cm, normAng, haciaMesa, cercania, rumbo,
  ordenPuestos, colocacionInicial, distribuir,
  FINCA_ZONA_CLARA, FINCA_SALIDAS, SALIDA_ANCHO, NUMERO_MAX, numerosRepetidos, colocarFinca,
} from './plano-geom.js';

const SVGNS = 'http://www.w3.org/2000/svg';
const CAPACIDADES_RAPIDAS = [6, 8, 10, 13];
/** Ampliación del dibujo dentro del medallón (recorta el blanco del borde). */
const ZOOM_DIBUJO = 1.3;
/** "Mira hacia" de la presidencial → rotación (la mesa mira a +y local). */
const MIRA = [
  { label: '↑', titulo: 'Mira hacia arriba', rot: 180 },
  { label: '→', titulo: 'Mira hacia la derecha', rot: -90 },
  { label: '↓', titulo: 'Mira hacia abajo', rot: 0 },
  { label: '←', titulo: 'Mira hacia la izquierda', rot: 90 },
];

/* ---------- Utilidades DOM ---------- */
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}
function sv(tag, attrs, text) {
  const node = document.createElementNS(SVGNS, tag);
  if (attrs) Object.entries(attrs).forEach(([k, v]) => node.setAttribute(k, String(v)));
  if (text != null) node.textContent = text;
  return node;
}
function btn(className, text, onClick, title) {
  const b = el('button', className, text);
  b.type = 'button';
  if (title) { b.title = title; b.setAttribute('aria-label', title); }
  if (onClick) b.addEventListener('click', onClick);
  return b;
}
const fmtM = (v) => `${v.toLocaleString('es-ES', { maximumFractionDigits: 1 })} m`;
const plural = (n, s, p) => `${n} ${n === 1 ? s : p}`;
const corto = (s, max = 13) => (s.length > max ? `${s.slice(0, max - 1)}…` : s);
/** "7 · Limón"; la presidencial va sin número y una mesa sin él, "s/n". */
const rotulo = (m, max) => (m.presidencial ? corto(m.nombre, max)
  : `${m.numero != null ? m.numero : 's/n'} · ${corto(m.nombre, max)}`);

/* =================================================================
   App (tras pasar la puerta)
   ================================================================= */
async function initApp(root) {
  root.innerHTML = `
    <button type="button" class="panel-salir" data-salir>Salir</button>
    <p class="adm-hint">Plano del salón con las mesas del banquete. Toca una
      mesa para ver y ordenar a sus comensales. Para sentar a gente en
      otra mesa usa <a href="./mesas.html">Mesas del banquete</a>.</p>

    <div id="pla-stats" class="res-stats"></div>
    <div id="pla-avisos"></div>

    <div class="pla-toolbar">
      <button type="button" id="pla-editar" class="btn btn--solid pla-toolbar__editar">Editar posición</button>
      <div class="pla-zoom" role="group" aria-label="Zoom del plano">
        <button type="button" class="pla-ico" data-zoom="out" aria-label="Alejar">−</button>
        <button type="button" class="pla-ico" data-zoom="in" aria-label="Acercar">+</button>
        <button type="button" class="pla-ico" data-zoom="fit" aria-label="Ver el salón entero">⤢</button>
      </div>
    </div>
    <div class="pla-dist">
      <button type="button" id="pla-distribuir" class="btn btn--ghost pla-dist__btn">✦ Distribuir mesas</button>
      <button type="button" id="pla-finca" class="btn btn--ghost pla-dist__btn">⌂ Colocar como el plano de la finca</button>
      <button type="button" id="pla-deshacer-dist" class="btn btn--ghost pla-dist__btn" hidden>↶ Deshacer distribución</button>
    </div>
    <div class="pla-estado" data-estado></div>

    <div id="pla-stage" class="pla-stage">
      <div class="pla-edithead">
        <div class="pla-estado pla-estado--edit" data-estado></div>
        <button type="button" class="btn btn--solid pla-listo" data-listo>Listo</button>
      </div>
      <svg id="pla-svg" class="pla-svg" preserveAspectRatio="xMidYMid meet"
           role="img" aria-label="Plano del salón"></svg>
      <div class="pla-editbar">
        <p class="pla-editbar__sel" id="pla-sel">Toca una mesa para seleccionarla.</p>
        <div class="pla-editbar__row">
          <button type="button" class="pla-ico pla-ico--txt" id="pla-undo">↶ Deshacer</button>
          <button type="button" class="pla-ico" id="pla-rotl" aria-label="Girar 15° a la izquierda">⟲</button>
          <button type="button" class="pla-ico" id="pla-rotr" aria-label="Girar 15° a la derecha">⟳</button>
          <button type="button" class="pla-ico" data-zoom="out" aria-label="Alejar">−</button>
          <button type="button" class="pla-ico" data-zoom="in" aria-label="Acercar">+</button>
          <button type="button" class="pla-ico" data-zoom="fit" aria-label="Ver el salón entero">⤢</button>
          <label class="pla-iman"><input type="checkbox" id="pla-iman" /> Imán</label>
        </div>
      </div>
    </div>
    <p class="adm-hint pla-leyenda">Un dedo sobre una mesa la mueve; sobre el
      suelo desplaza el plano; dos dedos hacen zoom. El círculo pequeño junto
      a la mesa seleccionada la gira.</p>

    <div id="pla-excel" class="exf"></div>

    <details class="pla-salon">
      <summary>Medidas del salón</summary>
      <div class="pla-salon__campos">
        <label class="field"><span class="field__label">Ancho (m)</span>
          <input class="field__input" id="pla-ancho" type="number" min="4" max="200" step="0.5" inputmode="decimal" /></label>
        <label class="field"><span class="field__label">Largo (m)</span>
          <input class="field__input" id="pla-largo" type="number" min="4" max="200" step="0.5" inputmode="decimal" /></label>
        <label class="field"><span class="field__label">Rejilla</span>
          <select class="field__input" id="pla-rejilla">
            <option value="0.25">25 cm</option><option value="0.5">50 cm</option><option value="1">1 m</option>
          </select></label>
      </div>
      <p class="adm-hint">Por defecto 24 × 18 m: la proporción del plano de la finca (1,34 : 1)
        hasta tener las medidas reales.</p>
      <button type="button" id="pla-salon-ok" class="btn btn--ghost btn--block">Guardar medidas</button>
    </details>

    <div id="pla-detalle" class="mes-chooser pla-detalle" hidden></div>
  `;

  const $ = (s) => root.querySelector(s);
  const statsEl = $('#pla-stats');
  const avisosEl = $('#pla-avisos');
  const stage = $('#pla-stage');
  const svg = $('#pla-svg');
  const editarBtn = $('#pla-editar');
  const selEl = $('#pla-sel');
  const undoBtn = $('#pla-undo');
  const imanInput = $('#pla-iman');
  const detalleEl = $('#pla-detalle');
  initExportFinca($('#pla-excel'));

  let plano;
  let mesas = [];
  let editando = false;
  let selId = null;
  let detalleId = null;
  let marcado = null;            // índice de puesto marcado para intercambiar
  const undo = [];
  const cam = { x: 0, y: 0, w: 20, h: 20 };
  const guardado = { pendientes: 0, errores: new Set(), ultimo: null };
  let detalleMsg = '';

  const porId = (id) => mesas.find((m) => m.id === id);
  const presidencial = () => mesas.find((m) => m.presidencial) || null;

  /* ---------- Guardado (posiciones y campos del plano) ---------- */
  async function guardarMesa(mesa, cambios) {
    guardado.pendientes += 1;
    renderEstado();
    try {
      await updateMesaPlano(mesa.id, cambios);
      // Última posición GUARDADA (es la que copia "Distribuir mesas")
      ['x', 'y', 'rot', 'forma'].forEach((k) => { if (k in cambios) mesa.orig[k] = cambios[k]; });
      guardado.errores.delete(mesa.id);
      guardado.ultimo = new Date();
      return true;
    } catch (err) {
      console.error(err);
      guardado.errores.add(mesa.id);
      return false;
    } finally {
      guardado.pendientes -= 1;
      renderEstado();
    }
  }

  /** Posición + forma + icono (lo que define a la mesa en el plano). */
  function guardarPos(mesa) {
    mesa.provisional = false;
    return guardarMesa(mesa, {
      x: cm(mesa.x), y: cm(mesa.y), rot: normAng(mesa.rot), forma: mesa.forma,
      icono: iconoMesa(mesa).clave,
    });
  }

  function renderEstado() {
    const provisionales = mesas.filter((m) => m.provisional);
    root.querySelectorAll('[data-estado]').forEach((box) => {
      box.innerHTML = '';
      box.classList.remove('is-ok', 'is-warn', 'is-busy');
      if (guardado.pendientes > 0) {
        box.classList.add('is-busy');
        box.textContent = 'Guardando…';
      } else if (guardado.errores.size) {
        box.classList.add('is-warn');
        box.appendChild(el('span', null, `⚠ ${plural(guardado.errores.size, 'mesa', 'mesas')} sin guardar`));
        box.appendChild(btn('pla-estado__btn', 'Reintentar', () => {
          [...guardado.errores].forEach((id) => { const m = porId(id); if (m) guardarPos(m); });
        }));
      } else if (provisionales.length) {
        box.classList.add('is-warn');
        const hora = guardado.ultimo ? `✓ Guardado ${guardado.ultimo.toLocaleTimeString('es-ES')} · ` : '';
        box.appendChild(el('span', null,
          `${hora}${plural(provisionales.length, 'mesa', 'mesas')} aún en posición provisional (sin guardar)`));
        box.appendChild(btn('pla-estado__btn', 'Guardar colocación', () => {
          provisionales.forEach((m) => guardarPos(m));
        }));
      } else {
        box.classList.add('is-ok');
        box.textContent = guardado.ultimo
          ? `✓ Posiciones guardadas · ${guardado.ultimo.toLocaleTimeString('es-ES')}`
          : '✓ Todas las posiciones están guardadas';
      }
    });
  }

  /* ---------- Cámara (viewBox en metros) ---------- */
  function aspecto() {
    const r = svg.getBoundingClientRect();
    return r.width > 0 && r.height > 0 ? r.height / r.width : 1;
  }
  function aplicaCam() {
    cam.h = cam.w * aspecto();
    svg.setAttribute('viewBox', `${cam.x} ${cam.y} ${cam.w} ${cam.h}`);
  }
  /** Fuera de edición el lienzo toma la proporción del salón (con su
      margen), así se ve entero y centrado sin huecos ni deformarlo. */
  function ajustaEscenario() {
    svg.style.aspectRatio = `${plano.ancho + 3.2} / ${plano.largo + 3.2}`;
  }
  function encuadra() {
    const margen = 1.6;
    const a = aspecto();
    cam.w = Math.max(plano.ancho + 2 * margen, (plano.largo + 2 * margen) / a);
    cam.h = cam.w * a;
    cam.x = plano.ancho / 2 - cam.w / 2;
    cam.y = plano.largo / 2 - cam.h / 2;
    aplicaCam();
    renderPlano();
  }
  function zoom(factor, cx, cy) {
    const maxW = Math.max(plano.ancho, plano.largo) * 3;
    const w = Math.min(maxW, Math.max(3, cam.w * factor));
    const px = cx ?? cam.x + cam.w / 2;
    const py = cy ?? cam.y + cam.h / 2;
    const k = w / cam.w;
    cam.x = px - (px - cam.x) * k;
    cam.y = py - (py - cam.y) * k;
    cam.w = w;
    aplicaCam();
    renderPlano(); // tirador de giro y nivel de detalle de las etiquetas
  }
  function aPlano(clientX, clientY) {
    const r = svg.getBoundingClientRect();
    return {
      x: cam.x + ((clientX - r.left) * cam.w) / r.width,
      y: cam.y + ((clientY - r.top) * cam.h) / r.height,
    };
  }
  /** Metros que ocupa N píxeles de pantalla con el zoom actual. */
  function px(n) {
    const r = svg.getBoundingClientRect();
    return r.width ? (n * cam.w) / r.width : n / 20;
  }

  /* ---------- Dibujo del plano ---------- */
  /**
   * Dibujo de la mesa en un medallón circular: recorte redondo algo
   * ampliado (fuera el blanco de los bordes y la firma; la mancha de
   * acuarela hace de fondo) con un aro fino. Sin dibujo, o si la imagen
   * no carga, la inicial en el estilo de la web.
   */
  function medallon(mesa, cx, cy, d) {
    const ic = iconoMesa(mesa);
    const g = sv('g', { class: 'pla-medallon' });
    const inicial = () => {
      g.innerHTML = '';
      g.appendChild(sv('circle', { cx, cy, r: d / 2, class: 'pla-inicial' }));
      g.appendChild(sv('text', { x: cx, y: cy, class: 'pla-inicial__txt', 'font-size': d * 0.62 }, ic.inicial));
    };
    if (!ic.url) { inicial(); return g; }
    const clipId = `med-${mesa.id}`;
    const clip = sv('clipPath', { id: clipId });
    clip.appendChild(sv('circle', { cx, cy, r: d / 2 }));
    g.appendChild(clip);
    g.appendChild(sv('circle', { cx, cy, r: d / 2, class: 'pla-medallon__fondo' }));
    const z = d * ZOOM_DIBUJO;
    const img = sv('image', {
      href: ic.url, x: cx - z / 2, y: cy - z / 2, width: z, height: z,
      'clip-path': `url(#${clipId})`, preserveAspectRatio: 'xMidYMid slice',
    });
    img.addEventListener('error', inicial, { once: true });
    g.appendChild(img);
    g.appendChild(sv('circle', { cx, cy, r: d / 2, class: 'pla-medallon__aro' }));
    return g;
  }

  function dibujaMesa(mesa) {
    const n = numPuestos(mesa);
    const { w, h } = tamanoMesa(mesa.forma, n);
    const ocupadas = mesa.comensales.length;
    const sobre = ocupadas > mesa.capacidad;
    const g = sv('g', {
      class: `pla-mesa${mesa.presidencial ? ' is-pres' : ''}${mesa.id === selId && editando ? ' is-sel' : ''}${mesa.provisional ? ' is-prov' : ''}`,
      'data-mesa': mesa.id,
      transform: `translate(${mesa.x} ${mesa.y})`,
    });
    const giro = sv('g', { transform: `rotate(${mesa.rot})`, 'data-giro': '' });

    // Sillas (ocupadas según el orden de puestos)
    const slots = ordenPuestos(mesa);
    puestosLocales(mesa.forma, n).forEach((p, i) => {
      const exceso = i >= mesa.capacidad;
      giro.appendChild(sv('circle', {
        cx: p.x, cy: p.y, r: SILLA_R,
        class: `pla-silla${slots[i] ? ' is-ocupada' : ''}${exceso ? ' is-exceso' : ''}`,
      }));
    });
    // Tablero
    if (mesa.forma === 'redonda') {
      giro.appendChild(sv('circle', { cx: 0, cy: 0, r: w / 2, class: 'pla-tablero' }));
    } else {
      giro.appendChild(sv('rect', {
        x: -w / 2, y: -h / 2, width: w, height: h, rx: 0.06, class: 'pla-tablero',
      }));
    }
    // Presidencial: cabecera (espalda a la pared) y flecha "mira hacia"
    if (mesa.presidencial) {
      const { hy } = semiCaja('redonda', n, 0);
      const yc = mesa.forma === 'redonda' ? -hy : -(h / 2 + 0.52);
      giro.appendChild(sv('line', { x1: -w / 2, y1: yc - 0.08, x2: w / 2, y2: yc - 0.08, class: 'pla-pared-pres' }));
      const yf = (mesa.forma === 'redonda' ? w / 2 : h / 2) + 0.62;
      giro.appendChild(sv('path', { d: `M -0.22 ${yf} L 0.22 ${yf} L 0 ${yf + 0.32} Z`, class: 'pla-mira' }));
    }
    // Tirador de giro (solo la seleccionada, en edición)
    if (editando && mesa.id === selId) {
      const { hx, hy } = semiCaja(mesa.forma, n, 0);
      const yr = -(Math.max(hx, hy) + px(26));
      giro.appendChild(sv('line', { x1: 0, y1: -(mesa.forma === 'redonda' ? w / 2 : h / 2), x2: 0, y2: yr, class: 'pla-rotar__linea' }));
      giro.appendChild(sv('circle', { cx: 0, cy: yr, r: px(22), class: 'pla-rotar', 'data-rotar': '' }));
      giro.appendChild(sv('text', { x: 0, y: yr, class: 'pla-rotar__txt', 'font-size': px(20) }, '⟳'));
    }
    g.appendChild(giro);

    // Etiquetas (sin rotar, siempre legibles). Nivel de detalle según el
    // zoom: si el dibujo se ve lo bastante grande va centrado sobre el
    // nombre; si no se leería, manda el NOMBRE (a tamaño legible en
    // pantalla) y el dibujo queda como acento pequeño en el borde.
    const lado = Math.min(w, h);
    const fNombre = Math.max(0.3, px(11));
    const fOcupa = Math.max(0.26, px(10));
    const altoTexto = (fNombre + fOcupa) * 1.15;
    const dMed = Math.min(1.25, lado * 0.62, lado * 0.92 - altoTexto);
    const ocupa = `${ocupadas}/${mesa.capacidad}${sobre ? ' ⚠' : ''}`;
    const claseOcupa = `pla-ocupa${sobre ? ' is-sobre' : ''}`;
    const repe = repetidos.has(mesa.numero) && !mesa.presidencial;
    const claseNombre = `pla-nombre${!mesa.presidencial && mesa.numero == null ? ' is-sinnum' : ''}${repe ? ' is-repe' : ''}`;
    if (dMed >= px(34)) {
      const top = -(dMed + 0.06 + altoTexto) / 2;
      g.appendChild(medallon(mesa, 0, top + dMed / 2, dMed));
      const yN = top + dMed + 0.06 + fNombre * 0.6;
      g.appendChild(sv('text', { x: 0, y: yN, class: claseNombre, 'font-size': fNombre }, rotulo(mesa, 16)));
      g.appendChild(sv('text', {
        x: 0, y: yN + fNombre * 0.55 + fOcupa * 0.6, class: claseOcupa, 'font-size': fOcupa,
      }, ocupa));
    } else {
      // Pila centrada: acento pequeño, nombre corto y ocupación
      const dA = px(18);
      const top = -(dA + px(2) + altoTexto) / 2;
      g.appendChild(medallon(mesa, 0, top + dA / 2, dA));
      const yN = top + dA + px(2) + fNombre * 0.6;
      g.appendChild(sv('text', { x: 0, y: yN, class: claseNombre, 'font-size': fNombre }, rotulo(mesa, 11)));
      g.appendChild(sv('text', {
        x: 0, y: yN + fNombre * 0.55 + fOcupa * 0.6, class: claseOcupa, 'font-size': fOcupa,
      }, ocupa));
    }
    return g;
  }

  let repetidos = new Map();
  function renderPlano() {
    repetidos = numerosRepetidos(mesas);
    svg.innerHTML = '';
    const { ancho, largo } = plano;
    // Suelo, rejilla y paredes (la cota del ancho va abajo: arriba está
    // la presidencial pegada a la pared)
    svg.appendChild(sv('rect', { x: 0, y: 0, width: ancho, height: largo, class: 'pla-suelo', 'data-suelo': '' }));
    // Como el plano de la finca: zona más clara a la izquierda de una
    // línea discontinua vertical
    const xZona = ancho * FINCA_ZONA_CLARA;
    svg.appendChild(sv('rect', { x: 0, y: 0, width: xZona, height: largo, class: 'pla-suelo-claro' }));
    const rej = sv('g', { class: 'pla-rejilla' });
    for (let x = 1; x < ancho; x += 1) rej.appendChild(sv('line', { x1: x, y1: 0, x2: x, y2: largo }));
    for (let y = 1; y < largo; y += 1) rej.appendChild(sv('line', { x1: 0, y1: y, x2: ancho, y2: y }));
    svg.appendChild(rej);
    svg.appendChild(sv('line', { x1: xZona, y1: 0, x2: xZona, y2: largo, class: 'pla-linea-zona' }));
    svg.appendChild(sv('rect', { x: 0, y: 0, width: ancho, height: largo, class: 'pla-paredes' }));
    // Salidas: hueco en la pared, flecha hacia fuera y rótulo
    FINCA_SALIDAS.forEach((sa) => {
      const izq = sa.pared === 'izquierda';
      const xp = izq ? 0 : ancho;
      const yc = sa.y * largo;
      const y1 = yc - SALIDA_ANCHO / 2;
      const y2 = yc + SALIDA_ANCHO / 2;
      const s = izq ? -1 : 1;  // hacia fuera
      const g = sv('g', { class: 'pla-salida' });
      g.appendChild(sv('line', { x1: xp, y1, x2: xp, y2, class: 'pla-salida__hueco' }));
      g.appendChild(sv('line', { x1: xp - 0.2, y1, x2: xp + 0.2, y2: y1, class: 'pla-salida__jamba' }));
      g.appendChild(sv('line', { x1: xp - 0.2, y1: y2, x2: xp + 0.2, y2, class: 'pla-salida__jamba' }));
      g.appendChild(sv('path', {
        d: `M ${xp + s * 0.2} ${yc} L ${xp + s * 0.75} ${yc} M ${xp + s * 0.55} ${yc - 0.2} L ${xp + s * 0.8} ${yc} L ${xp + s * 0.55} ${yc + 0.2}`,
        class: 'pla-salida__flecha',
      }));
      const xt = xp + s * 1.15;
      g.appendChild(sv('text', {
        x: xt, y: yc, class: 'pla-salida__txt', 'font-size': 0.4,
        transform: `rotate(${izq ? -90 : 90} ${xt} ${yc})`,
      }, 'SALIDA'));
      svg.appendChild(g);
    });
    svg.appendChild(sv('text', { x: ancho / 2, y: largo + 0.6, class: 'pla-cota', 'font-size': 0.42 }, fmtM(ancho)));
    // Cota del largo arriba a la derecha (en mitad de las paredes laterales van las salidas)
    svg.appendChild(sv('text', {
      x: ancho + 0.55, y: largo * 0.22, class: 'pla-cota', 'font-size': 0.42,
      transform: `rotate(90 ${ancho + 0.55} ${largo * 0.22})`,
    }, fmtM(largo)));
    // Mesas (la seleccionada encima)
    mesas.filter((m) => m.id !== selId).forEach((m) => svg.appendChild(dibujaMesa(m)));
    const sel = porId(selId);
    if (sel) svg.appendChild(dibujaMesa(sel));
  }

  /** Durante el arrastre solo se mueven/giran los grupos (no se redibuja). */
  function mueveGrupo(mesa) {
    const g = svg.querySelector(`[data-mesa="${mesa.id}"]`);
    if (!g) return;
    g.setAttribute('transform', `translate(${mesa.x} ${mesa.y})`);
    g.querySelector('[data-giro]').setAttribute('transform', `rotate(${mesa.rot})`);
  }

  /* ---------- Modo edición ---------- */
  function bloqueaTouch(e) {
    if (editando && stage.contains(e.target)) e.preventDefault();
  }
  function setEditando(v) {
    editando = v;
    stage.classList.toggle('is-editing', v);
    document.documentElement.classList.toggle('pla-lock', v);
    editarBtn.textContent = v ? 'Terminar edición' : 'Editar posición';
    if (!v) { selId = null; gesto = null; punteros.clear(); }
    // El escenario cambia de tamaño (pantalla completa ↔ en la página)
    requestAnimationFrame(() => { encuadra(); render(); });
  }
  // touch-action:none ya bloquea el scroll; esto lo remata en navegadores
  // que lo ignoran (iOS antiguos) y evita el rebote de la página.
  document.addEventListener('touchmove', bloqueaTouch, { passive: false });

  function renderSel() {
    const m = porId(selId);
    selEl.textContent = m
      ? `${rotulo(m, 40)} · giro ${Math.round(normAng(m.rot))}°${m.presidencial ? ' · mira hacia la flecha' : ''}`
      : 'Toca una mesa para seleccionarla.';
    root.querySelector('#pla-rotl').disabled = !m;
    root.querySelector('#pla-rotr').disabled = !m;
    undoBtn.disabled = undo.length === 0;
    undoBtn.textContent = undo.length ? `↶ Deshacer (${undo.length})` : '↶ Deshacer';
  }

  function apuntaUndo(mesa) {
    undo.push({ id: mesa.id, x: mesa.x, y: mesa.y, rot: mesa.rot });
    if (undo.length > 50) undo.shift();
  }

  function gira(delta) {
    const m = porId(selId);
    if (!m) return;
    apuntaUndo(m);
    m.rot = normAng(m.rot + delta);
    Object.assign(m, limitaDentro(m.x, m.y, m, plano));
    render();
    guardarPos(m);
  }

  /* ---------- Gestos (Pointer Events sobre el SVG) ---------- */
  const punteros = new Map();
  let gesto = null;

  function iniciaPan(e) {
    gesto = { tipo: 'pan', id: e.pointerId, x0: e.clientX, y0: e.clientY, camX: cam.x, camY: cam.y, movido: false };
  }

  svg.addEventListener('pointerdown', (e) => {
    if (!editando) return;
    e.preventDefault();
    svg.setPointerCapture(e.pointerId);
    punteros.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (punteros.size === 2) {
      // Segundo dedo: zoom con pellizco. Si el primero cayó sobre una
      // mesa sin llegar a moverla, se recupera la selección anterior.
      if (gesto && gesto.tipo === 'mover' && !gesto.movido && selId !== gesto.selAntes) {
        selId = gesto.selAntes;
        renderPlano();
        renderSel();
      }
      terminaGesto();
      const [a, b] = [...punteros.values()];
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      gesto = {
        tipo: 'pinch', d0: Math.hypot(a.x - b.x, a.y - b.y) || 1,
        w0: cam.w, p0: aPlano(mid.x, mid.y),
      };
      return;
    }
    if (punteros.size > 2) return;

    const p = aPlano(e.clientX, e.clientY);
    if (e.target.closest('[data-rotar]') && porId(selId)) {
      const m = porId(selId);
      gesto = { tipo: 'rotar', id: e.pointerId, mesa: m, antes: { x: m.x, y: m.y, rot: m.rot }, movido: false };
      return;
    }
    const g = e.target.closest('[data-mesa]');
    if (g) {
      const m = porId(g.dataset.mesa);
      const selAntes = selId;
      if (selId !== m.id) { selId = m.id; renderPlano(); renderSel(); }
      gesto = {
        tipo: 'mover', id: e.pointerId, mesa: m, selAntes, offX: p.x - m.x, offY: p.y - m.y,
        x0: e.clientX, y0: e.clientY, antes: { x: m.x, y: m.y, rot: m.rot }, movido: false,
      };
      return;
    }
    iniciaPan(e);
  });

  svg.addEventListener('pointermove', (e) => {
    if (!editando || !punteros.has(e.pointerId)) return;
    e.preventDefault();
    punteros.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (!gesto) return;

    if (gesto.tipo === 'pinch') {
      const [a, b] = [...punteros.values()];
      if (!b) return;
      const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      const maxW = Math.max(plano.ancho, plano.largo) * 3;
      cam.w = Math.min(maxW, Math.max(3, (gesto.w0 * gesto.d0) / d));
      cam.h = cam.w * aspecto();
      // El punto del plano bajo los dedos se queda bajo los dedos
      const r = svg.getBoundingClientRect();
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      cam.x = gesto.p0.x - ((mid.x - r.left) * cam.w) / r.width;
      cam.y = gesto.p0.y - ((mid.y - r.top) * cam.h) / r.height;
      aplicaCam();
      return;
    }
    if (e.pointerId !== gesto.id) return;

    if (gesto.tipo === 'pan') {
      const r = svg.getBoundingClientRect();
      const dx = e.clientX - gesto.x0;
      const dy = e.clientY - gesto.y0;
      if (Math.hypot(dx, dy) > 4) gesto.movido = true;
      cam.x = gesto.camX - (dx * cam.w) / r.width;
      cam.y = gesto.camY - (dy * cam.h) / r.height;
      aplicaCam();
      return;
    }
    const m = gesto.mesa;
    const p = aPlano(e.clientX, e.clientY);
    if (gesto.tipo === 'mover') {
      // Umbral pequeño: un toque para seleccionar no desplaza la mesa
      if (!gesto.movido && Math.hypot(e.clientX - gesto.x0, e.clientY - gesto.y0) < 6) return;
      gesto.movido = true;
      let nx = p.x - gesto.offX;
      let ny = p.y - gesto.offY;
      if (plano.iman) { nx = imanta(nx, plano.rejilla); ny = imanta(ny, plano.rejilla); }
      Object.assign(m, limitaDentro(nx, ny, m, plano));
      mueveGrupo(m);
    } else if (gesto.tipo === 'rotar') {
      gesto.movido = true;
      let ang = (Math.atan2(p.y - m.y, p.x - m.x) * 180) / Math.PI + 90;
      if (plano.iman) ang = Math.round(ang / 15) * 15;
      m.rot = normAng(ang);
      Object.assign(m, limitaDentro(m.x, m.y, m, plano));
      mueveGrupo(m);
      renderSel();
    }
  });

  function terminaGesto() {
    if (!gesto) return;
    const g = gesto;
    gesto = null;
    if ((g.tipo === 'mover' || g.tipo === 'rotar') && g.movido) {
      undo.push({ id: g.mesa.id, ...g.antes });
      if (undo.length > 50) undo.shift();
      renderSel();
      renderStatsYAvisos();
      guardarPos(g.mesa);
    }
    return g;
  }

  function sueltaPuntero(e) {
    if (!punteros.has(e.pointerId)) return;
    punteros.delete(e.pointerId);
    if (gesto && gesto.tipo === 'pinch') {
      gesto = null;
      // Queda un dedo: sigue desplazando sin saltos
      const [[id, pos] = []] = [...punteros.entries()];
      if (id != null) gesto = { tipo: 'pan', id, x0: pos.x, y0: pos.y, camX: cam.x, camY: cam.y, movido: true };
      renderPlano();
      return;
    }
    if (gesto && gesto.id === e.pointerId) {
      const g = terminaGesto();
      // Toque en el suelo sin arrastrar: deselecciona
      if (g && g.tipo === 'pan' && !g.movido && selId) {
        selId = null;
        renderPlano();
        renderSel();
      }
    }
  }
  svg.addEventListener('pointerup', sueltaPuntero);
  svg.addEventListener('pointercancel', sueltaPuntero);

  // Fuera de edición: un toque abre el detalle de la mesa
  svg.addEventListener('click', (e) => {
    if (editando) return;
    const g = e.target.closest('[data-mesa]');
    if (g) abreDetalle(g.dataset.mesa);
  });

  /* ---------- Contadores y avisos (bloque de totales) ---------- */
  function renderStatsYAvisos() {
    const sentados = mesas.reduce((s, m) => s + m.comensales.length, 0);
    const libres = mesas.reduce((s, m) => s + Math.max(0, m.capacidad - m.comensales.length), 0);
    statsEl.innerHTML = '';
    [
      { num: mesas.length, label: 'mesas' },
      { num: sentados, label: 'personas sentadas' },
      { num: libres, label: 'plazas libres' },
    ].forEach((s) => {
      const card = el('div', 'res-stat');
      card.appendChild(el('span', 'res-stat__num', String(s.num)));
      card.appendChild(el('span', 'res-stat__label', s.label));
      statsEl.appendChild(card);
    });

    avisosEl.innerHTML = '';
    const sobre = mesas.filter((m) => m.comensales.length > m.capacidad);
    const vacias = mesas.filter((m) => m.comensales.length === 0);
    if (sobre.length) {
      avisosEl.appendChild(el('p', 'mes-aviso mes-aviso--error',
        `⚠ Sobreaforo: ${sobre.map((m) => `${m.nombre} (${m.comensales.length}/${m.capacidad})`).join(', ')}.`));
    }
    if (vacias.length) {
      avisosEl.appendChild(el('p', 'mes-aviso mes-aviso--warn',
        `⚠ ${vacias.length === 1 ? 'Mesa vacía' : 'Mesas vacías'}: ${vacias.map((m) => m.nombre).join(', ')}.`));
    }
    if (!presidencial()) {
      avisosEl.appendChild(el('p', 'mes-aviso mes-aviso--warn',
        '⚠ No hay mesa presidencial marcada (se marca desde el detalle de una mesa).'));
    }
    const sinNum = mesas.filter((m) => !m.presidencial && m.numero == null);
    if (sinNum.length) {
      avisosEl.appendChild(el('p', 'mes-aviso mes-aviso--warn',
        `⚠ ${sinNum.length === 1 ? 'Mesa sin número' : 'Mesas sin número'} (s/n en el plano): ${sinNum.map((m) => m.nombre).join(', ')}. Se pone en el detalle de la mesa.`));
    }
    numerosRepetidos(mesas).forEach((lista, n) => {
      avisosEl.appendChild(el('p', 'mes-aviso mes-aviso--error',
        `⚠ Número ${n} repetido: ${lista.map((m) => m.nombre).join(', ')}.`));
    });
    if (avisoFinca) {
      const box = el('div', 'mes-aviso mes-aviso--warn pla-aviso-finca');
      box.appendChild(el('p', null, avisoFinca));
      box.appendChild(btn('pla-estado__btn', 'Entendido', () => { avisoFinca = ''; renderStatsYAvisos(); }));
      avisosEl.appendChild(box);
    }
  }

  /* ---------- Detalle de una mesa ---------- */
  function abreDetalle(id) {
    detalleId = id;
    marcado = null;
    detalleMsg = '';
    detalleEl.hidden = false;
    document.documentElement.classList.add('pla-modal');
    renderDetalle();
  }
  function cierraDetalle() {
    detalleId = null;
    detalleEl.hidden = true;
    detalleEl.innerHTML = '';
    document.documentElement.classList.remove('pla-modal');
  }
  detalleEl.addEventListener('click', (e) => { if (e.target === detalleEl) cierraDetalle(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && detalleId) cierraDetalle(); });

  async function guardarDetalle(mesa, cambios, msg) {
    detalleMsg = 'Guardando…';
    renderDetalle();
    const ok = await guardarMesa(mesa, cambios);
    detalleMsg = ok ? `${msg} ✓` : '⚠ No se ha podido guardar. Inténtalo de nuevo.';
    render();
  }

  /** Intercambia dos puestos y guarda el orden. */
  function intercambia(mesa, i, j) {
    const slots = ordenPuestos(mesa);
    if (i < 0 || j < 0 || i >= slots.length || j >= slots.length || i === j) return;
    [slots[i], slots[j]] = [slots[j], slots[i]];
    mesa.asientos = slots.map((c) => (c ? c.key : ''));
    marcado = null;
    guardarDetalle(mesa, { asientos: mesa.asientos }, 'Orden guardado');
  }
  function tocaPuesto(mesa, i) {
    if (marcado == null) { marcado = i; renderDetalle(); return; }
    if (marcado === i) { marcado = null; renderDetalle(); return; }
    intercambia(mesa, marcado, i);
  }

  /** Flecha hacia la mesa presidencial (o el motivo de no poder darla). */
  function bloqueNovios(mesa) {
    const box = el('div', 'pla-novios');
    const pres = presidencial();
    if (mesa.presidencial) {
      box.appendChild(el('p', 'pla-novios__txt',
        'Ésta es la mesa presidencial. La raya gruesa es la cabecera (espalda contra la pared) y el triángulo indica hacia dónde mira.'));
      const fila = el('div', 'pla-mira-btns');
      fila.appendChild(el('span', 'pla-mira-btns__label', 'Mira hacia:'));
      MIRA.forEach((o) => {
        const b = btn(`pla-ico${normAng(mesa.rot) === normAng(o.rot) ? ' is-on' : ''}`, o.label, () => {
          mesa.rot = o.rot;
          Object.assign(mesa, limitaDentro(mesa.x, mesa.y, mesa, plano));
          mesa.provisional = false;
          guardarDetalle(mesa, { rot: o.rot, x: cm(mesa.x), y: cm(mesa.y), forma: mesa.forma }, 'Orientación guardada');
        }, o.titulo);
        fila.appendChild(b);
      });
      box.appendChild(fila);
      return box;
    }
    if (!pres) {
      box.classList.add('is-vacio');
      box.appendChild(el('p', 'pla-novios__txt',
        'No hay mesa presidencial marcada, así que no se puede indicar hacia dónde quedan los novios.'));
      return box;
    }
    const { ang, dist } = haciaMesa(mesa, pres);
    const brujula = sv('svg', { viewBox: '-30 -30 60 60', class: 'pla-brujula', 'aria-hidden': 'true' });
    brujula.appendChild(sv('circle', { cx: 0, cy: 0, r: 27, class: 'pla-brujula__aro' }));
    const flecha = sv('g', { transform: `rotate(${ang})` });
    flecha.appendChild(sv('path', { d: 'M -16 0 L 12 0 M 4 -8 L 14 0 L 4 8', class: 'pla-brujula__flecha' }));
    brujula.appendChild(flecha);
    box.appendChild(brujula);
    const txt = el('div', 'pla-novios__txt');
    txt.appendChild(el('strong', null, `Novios: ${rumbo(ang)}`));
    txt.appendChild(el('span', null, ` · a ${fmtM(dist)} · mesa ${cercania(dist, plano)}`));
    txt.appendChild(el('span', 'pla-novios__nota',
      `Según el plano visto en pantalla${mesa.provisional || pres.provisional ? ' (posición provisional)' : ''}. La flecha del dibujo de abajo señala lo mismo.`));
    box.appendChild(txt);
    return box;
  }

  /** Dibujo de la mesa con sus puestos y el nombre de cada ocupante. */
  function dibujoPuestos(mesa) {
    const n = numPuestos(mesa);
    const { w, h } = tamanoMesa(mesa.forma, n);
    const slots = ordenPuestos(mesa);
    const { hx, hy } = semiCaja(mesa.forma, n, mesa.rot);
    const half = Math.max(hx, hy) + 2.1;  // sitio para los nombres
    const svgD = sv('svg', { viewBox: `${-half} ${-half} ${2 * half} ${2 * half}`, class: 'pla-puestos' });
    const giro = sv('g', { transform: `rotate(${mesa.rot})` });
    if (mesa.forma === 'redonda') giro.appendChild(sv('circle', { cx: 0, cy: 0, r: w / 2, class: 'pla-tablero' }));
    else giro.appendChild(sv('rect', { x: -w / 2, y: -h / 2, width: w, height: h, rx: 0.06, class: 'pla-tablero' }));
    svgD.appendChild(giro);

    // Flecha hacia los novios en el borde (mismo sentido que en el plano)
    const pres = presidencial();
    if (pres && !mesa.presidencial) {
      const { ang } = haciaMesa(mesa, pres);
      const r0 = Math.min(w, h) / 2 - 0.15;
      const f = sv('g', { transform: `rotate(${ang})`, class: 'pla-puestos__novios' });
      f.appendChild(sv('path', { d: `M ${-r0 + 0.2} 0 L ${r0 - 0.05} 0 M ${r0 - 0.3} -0.2 L ${r0} 0 L ${r0 - 0.3} 0.2` }));
      svgD.appendChild(f);
    }

    const rad = (mesa.rot * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    puestosLocales(mesa.forma, n).forEach((p, i) => {
      const x = p.x * cos - p.y * sin;
      const y = p.x * sin + p.y * cos;
      const a = p.ang + rad;
      const c = slots[i];
      const exceso = i >= mesa.capacidad;
      const g = sv('g', {
        class: `pla-puesto${c ? ' is-ocupada' : ''}${exceso ? ' is-exceso' : ''}${marcado === i ? ' is-marcado' : ''}`,
        'data-puesto': i, role: 'button', tabindex: 0,
      });
      g.appendChild(sv('circle', { cx: x, cy: y, r: 0.24 }));
      g.appendChild(sv('text', { x, y, class: 'pla-puesto__num', 'font-size': 0.22 }, String(i + 1)));
      const lx = x + Math.cos(a) * 0.36;
      const ly = y + Math.sin(a) * 0.36;
      const ca = Math.cos(a);
      g.appendChild(sv('text', {
        x: lx, y: ly, class: 'pla-puesto__nombre', 'font-size': 0.24,
        'text-anchor': ca > 0.35 ? 'start' : ca < -0.35 ? 'end' : 'middle',
      }, c ? corto(c.nombre, 14) : '—'));
      g.addEventListener('click', () => tocaPuesto(mesa, i));
      svgD.appendChild(g);
    });
    return svgD;
  }

  /** Nº de mesa del plano de la finca (1-15). Vacío = sin número. Un
      número repetido se guarda igualmente y se avisa. */
  function campoNumero(mesa) {
    const fila = el('div', 'pla-seg');
    fila.appendChild(el('span', 'pla-seg__label', 'Número'));
    if (mesa.presidencial) {
      fila.appendChild(el('span', 'adm-hint pla-numero__nota', 'La presidencial no lleva número.'));
      return fila;
    }
    const input = el('input', 'field__input pla-cap pla-numero');
    input.type = 'number';
    input.min = '1';
    input.max = String(NUMERO_MAX);
    input.step = '1';
    input.inputMode = 'numeric';
    input.placeholder = 's/n';
    input.value = mesa.numero != null ? String(mesa.numero) : '';
    input.setAttribute('aria-label', `Número de mesa (1 a ${NUMERO_MAX})`);
    input.addEventListener('change', () => {
      const txt = input.value.trim();
      const n = txt === '' ? null : Number(txt);
      if (n !== null && !(Number.isInteger(n) && n >= 1 && n <= NUMERO_MAX)) {
        detalleMsg = `⚠ El número de mesa debe ser un entero del 1 al ${NUMERO_MAX} (o vacío).`;
        renderDetalle();
        return;
      }
      if (n === mesa.numero) return;
      mesa.numero = n;
      const otras = n == null ? [] : mesas.filter((m) => m !== mesa && !m.presidencial && m.numero === n);
      const msg = n == null ? 'Sin número' : `Número ${n}`;
      guardarDetalle(mesa, { numero: n }, otras.length
        ? `⚠ ${msg} guardado, pero también lo tiene ${otras.map((m) => m.nombre).join(', ')}`
        : msg);
    });
    fila.appendChild(input);
    fila.appendChild(el('span', `adm-hint pla-numero__nota${mesa.numero == null ? ' is-sinnum' : ''}`,
      mesa.numero == null ? 'Sin número todavía' : `Del 1 al ${NUMERO_MAX}`));
    return fila;
  }

  function renderDetalle() {
    const mesa = porId(detalleId);
    if (!mesa) { cierraDetalle(); return; }
    const scroll = detalleEl.querySelector('.mes-chooser__panel')?.scrollTop || 0;
    detalleEl.innerHTML = '';
    const panel = el('div', 'mes-chooser__panel pla-detalle__panel');

    // Cabecera
    const head = el('div', 'pla-detalle__head');
    const ic = iconoMesa(mesa);
    if (ic.url) {
      const img = el('img', 'pla-detalle__icono');
      img.src = ic.url;
      img.alt = '';
      img.addEventListener('error', () => img.replaceWith(el('span', 'pla-detalle__inicial', ic.inicial)), { once: true });
      head.appendChild(img);
    } else {
      head.appendChild(el('span', 'pla-detalle__inicial', ic.inicial));
    }
    const tit = el('div', 'pla-detalle__tit');
    tit.appendChild(el('h3', 'pla-detalle__nombre', rotulo(mesa, 60)));
    const sub = [...new Set([mesa.grupo, mesa.presidencial ? 'Mesa presidencial' : ''].filter(Boolean))].join(' · ');
    if (sub) tit.appendChild(el('p', 'pla-detalle__grupo', sub));
    head.appendChild(tit);
    const sobre = mesa.comensales.length > mesa.capacidad;
    head.appendChild(el('span', `mes-aforo${sobre ? ' is-sobre' : ''}`, `${mesa.comensales.length}/${mesa.capacidad}`));
    head.appendChild(btn('pla-ico pla-detalle__cerrar', '✕', cierraDetalle, 'Cerrar'));
    panel.appendChild(head);
    panel.appendChild(campoNumero(mesa));
    if (sobre) {
      panel.appendChild(el('p', 'mes-aviso mes-aviso--error',
        `⚠ Sobreaforo: ${mesa.comensales.length} comensales para ${mesa.capacidad} plazas (se dibujan los puestos de más en rojo).`));
    }
    if (detalleMsg) panel.appendChild(el('p', `pla-detalle__msg${detalleMsg.startsWith('⚠') ? ' is-error' : ''}`, detalleMsg));

    // Hacia los novios
    panel.appendChild(bloqueNovios(mesa));

    // Puestos (dibujo + lista de orden)
    panel.appendChild(el('h4', 'adm-subtitle', 'Puestos'));
    panel.appendChild(dibujoPuestos(mesa));
    panel.appendChild(el('p', 'adm-hint',
      marcado == null
        ? 'Para cambiar a alguien de sitio, toca su nombre y luego el de otra persona (o un puesto vacío): se intercambian. También puedes usar ↑ ↓.'
        : `Puesto ${marcado + 1} marcado: toca otro puesto para intercambiarlos (o el mismo para cancelar).`));
    const lista = el('ol', 'pla-orden');
    const slots = ordenPuestos(mesa);
    slots.forEach((c, i) => {
      const li = el('li', `pla-orden__fila${marcado === i ? ' is-marcado' : ''}${i >= mesa.capacidad ? ' is-exceso' : ''}`);
      const nombre = btn('pla-orden__nombre', '', () => tocaPuesto(mesa, i));
      nombre.appendChild(el('span', 'pla-orden__num', String(i + 1)));
      nombre.appendChild(el('span', c ? 'pla-orden__quien' : 'pla-orden__quien is-vacio', c ? c.nombre : 'puesto vacío'));
      li.appendChild(nombre);
      const sube = btn('pla-ico', '↑', () => intercambia(mesa, i, i - 1), `Subir al puesto ${i}`);
      sube.disabled = i === 0;
      const baja = btn('pla-ico', '↓', () => intercambia(mesa, i, i + 1), `Bajar al puesto ${i + 2}`);
      baja.disabled = i === slots.length - 1;
      li.append(sube, baja);
      lista.appendChild(li);
    });
    panel.appendChild(lista);
    if (mesa.comensales.length === 0) {
      panel.appendChild(el('p', 'adm-hint', 'Mesa vacía: sienta a gente desde Mesas del banquete.'));
    }

    // Configuración de la mesa
    panel.appendChild(el('h4', 'adm-subtitle', 'Mesa'));
    const formas = el('div', 'pla-seg');
    formas.appendChild(el('span', 'pla-seg__label', 'Forma'));
    FORMAS.forEach((f) => {
      formas.appendChild(btn(`pla-seg__btn${mesa.forma === f ? ' is-on' : ''}`, FORMA_LABEL[f], () => {
        if (mesa.forma === f) return;
        mesa.forma = f;
        Object.assign(mesa, limitaDentro(mesa.x, mesa.y, mesa, plano));
        mesa.provisional = false;
        guardarDetalle(mesa, { forma: f, x: cm(mesa.x), y: cm(mesa.y), rot: normAng(mesa.rot), icono: iconoMesa(mesa).clave },
          `Forma: ${FORMA_LABEL[f].toLowerCase()}`);
      }));
    });
    panel.appendChild(formas);

    const capRow = el('div', 'pla-seg');
    capRow.appendChild(el('span', 'pla-seg__label', 'Plazas'));
    const ponCap = (v) => {
      const cap = Math.round(Number(v));
      if (!Number.isFinite(cap) || cap < 1 || cap > 100) {
        detalleMsg = '⚠ La capacidad debe ser un número entre 1 y 100.';
        renderDetalle();
        return;
      }
      if (cap === mesa.capacidad) return;
      mesa.capacidad = cap;
      Object.assign(mesa, limitaDentro(mesa.x, mesa.y, mesa, plano));
      guardarDetalle(mesa, { capacidad: cap, x: cm(mesa.x), y: cm(mesa.y) }, `Capacidad: ${cap}`);
    };
    CAPACIDADES_RAPIDAS.forEach((v) => {
      capRow.appendChild(btn(`pla-seg__btn${mesa.capacidad === v ? ' is-on' : ''}`, String(v), () => ponCap(v)));
    });
    const capInput = el('input', 'field__input pla-cap');
    capInput.type = 'number';
    capInput.min = '1';
    capInput.max = '100';
    capInput.inputMode = 'numeric';
    capInput.value = String(mesa.capacidad);
    capInput.setAttribute('aria-label', 'Capacidad (otra)');
    capInput.addEventListener('change', () => ponCap(capInput.value));
    capRow.appendChild(capInput);
    panel.appendChild(capRow);
    panel.appendChild(el('p', 'adm-hint',
      `Ocupación real: ${plural(mesa.comensales.length, 'persona sentada', 'personas sentadas')}. La capacidad es la misma que ve Mesas del banquete.`));

    const presLabel = el('label', 'pla-check');
    const presCheck = document.createElement('input');
    presCheck.type = 'checkbox';
    presCheck.checked = mesa.presidencial;
    presCheck.addEventListener('change', async () => {
      const otra = presidencial();
      if (presCheck.checked && otra && otra !== mesa
        && !window.confirm(`"${otra.nombre}" deja de ser la presidencial y pasa a serlo "${mesa.nombre}". ¿Continuar?`)) {
        presCheck.checked = false;
        return;
      }
      detalleMsg = 'Guardando…';
      renderDetalle();
      try {
        await setPresidencial(presCheck.checked ? mesa.id : null, mesas);
        mesas.forEach((m) => { m.presidencial = presCheck.checked && m.id === mesa.id; });
        detalleMsg = presCheck.checked ? 'Marcada como presidencial ✓' : 'Ya no es la presidencial ✓';
      } catch (err) {
        console.error(err);
        detalleMsg = '⚠ No se ha podido guardar. Inténtalo de nuevo.';
      }
      render();
    });
    presLabel.append(presCheck, el('span', null, 'Mesa presidencial'));
    panel.appendChild(presLabel);

    detalleEl.appendChild(panel);
    panel.scrollTop = scroll;
  }

  /* ---------- Medidas del salón ---------- */
  const anchoInput = $('#pla-ancho');
  const largoInput = $('#pla-largo');
  const rejillaSel = $('#pla-rejilla');
  function rellenaSalon() {
    anchoInput.value = String(plano.ancho);
    largoInput.value = String(plano.largo);
    rejillaSel.value = String(plano.rejilla);
    imanInput.checked = plano.iman;
  }
  async function guardaPlano(msgOk) {
    try {
      await savePlano(plano);
      guardado.ultimo = new Date();
      renderEstado();
      if (msgOk) window.alert(msgOk);
    } catch (err) {
      console.error(err);
      window.alert('No se han podido guardar las medidas del salón. Inténtalo de nuevo.');
    }
  }
  $('#pla-salon-ok').addEventListener('click', async () => {
    const ancho = Number(anchoInput.value);
    const largo = Number(largoInput.value);
    if (!(ancho >= 4 && ancho <= 200 && largo >= 4 && largo <= 200)) {
      window.alert('Ancho y largo deben estar entre 4 y 200 metros.');
      return;
    }
    plano.ancho = ancho;
    plano.largo = largo;
    plano.rejilla = Number(rejillaSel.value);
    await guardaPlano();
    // Las mesas que se queden fuera de las nuevas paredes se meten dentro
    mesas.forEach((m) => {
      const p = limitaDentro(m.x, m.y, m, plano);
      if (Math.abs(p.x - m.x) > 0.001 || Math.abs(p.y - m.y) > 0.001) {
        Object.assign(m, p);
        if (!m.provisional) guardarPos(m);
      }
    });
    ajustaEscenario();
    encuadra();
    render();
  });
  imanInput.addEventListener('change', () => {
    plano.iman = imanInput.checked;
    guardaPlano();
  });

  /* ---------- Distribución automática ---------- */
  let copias = [];          // copias de colocación (más reciente primero)
  const distBtn = $('#pla-distribuir');
  const deshacerDistBtn = $('#pla-deshacer-dist');

  /** Sin posición guardada → colocación provisional; fuera de las paredes
      (p. ej. tras cambiar las medidas) → dentro, también provisional. */
  function colocaPendientes() {
    const sinPos = mesas.filter((m) => m.x == null || m.y == null);
    if (sinPos.length) {
      const ini = colocacionInicial(mesas, plano);
      sinPos.forEach((m) => { Object.assign(m, ini.get(m.id)); m.provisional = true; });
    }
    mesas.forEach((m) => {
      const p = limitaDentro(m.x, m.y, m, plano);
      if (Math.abs(p.x - m.x) > 0.005 || Math.abs(p.y - m.y) > 0.005) {
        Object.assign(m, p);
        m.provisional = true;
      }
    });
  }

  function renderDistBtns() {
    deshacerDistBtn.hidden = copias.length === 0;
    const c = copias[0];
    if (c) {
      const hora = c.fecha ? c.fecha.toLocaleString('es-ES', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
      deshacerDistBtn.textContent = `↶ Deshacer distribución${copias.length > 1 ? ` (${copias.length})` : ''}`;
      deshacerDistBtn.title = `Vuelve a la colocación anterior${hora ? ` (copia del ${hora})` : ''}`;
    }
    distBtn.disabled = guardado.pendientes > 0;
    fincaBtn.disabled = guardado.pendientes > 0;
  }

  async function distribuirMesas() {
    const res = distribuir(mesas, plano);
    if (!res) {
      window.alert('No caben todas las mesas con pasillos entre ellas en un salón de '
        + `${fmtM(plano.ancho)} × ${fmtM(plano.largo)}. Amplía las medidas del salón o colócalas a mano.`);
      return;
    }
    const ok = window.confirm(`¿Distribuir automáticamente las ${mesas.length} mesas?\n\n`
      + '⚠ Se SOBRESCRIBE la colocación actual, también la que hayas hecho a mano.\n\n'
      + 'Antes se guarda una copia y podrás volver a ella con «Deshacer distribución».');
    if (!ok) return;
    guardado.pendientes += 1;
    renderEstado();
    renderDistBtns();
    try {
      // 1) Copia de lo que hay guardado ahora (null = sin posición)
      const previa = mesas.map((m) => ({
        id: m.id, nombre: m.nombre,
        x: m.orig.x ?? null, y: m.orig.y ?? null, rot: m.orig.rot ?? 0,
      }));
      const copiaId = await crearCopia(previa, 'distribuir');
      copias.unshift({ id: copiaId, mesas: previa, fecha: new Date() });
      // 2) Nueva colocación, todas de una vez
      const lista = mesas.map((m) => {
        const p = res.pos.get(m.id);
        return { id: m.id, x: cm(p.x), y: cm(p.y), rot: normAng(p.rot) };
      });
      await guardaPosiciones(lista);
      lista.forEach((p) => {
        const m = porId(p.id);
        Object.assign(m, { x: p.x, y: p.y, rot: p.rot, provisional: false });
        m.orig = { x: p.x, y: p.y, rot: p.rot };
        guardado.errores.delete(m.id);
      });
      undo.length = 0;
      selId = null;
      guardado.ultimo = new Date();
    } catch (err) {
      console.error(err);
      window.alert('No se ha podido distribuir (no se ha cambiado nada guardado). Inténtalo de nuevo.');
    } finally {
      guardado.pendientes -= 1;
      render();
    }
  }

  /** Mensaje (persistente en avisos) tras colocar como la finca. */
  let avisoFinca = '';
  const fincaBtn = $('#pla-finca');

  async function colocarComoFinca() {
    const res = colocarFinca(mesas, plano);
    if (res.pos.size === 0) {
      window.alert('Ninguna mesa tiene número ni hay presidencial marcada: no hay nada que colocar.\n\n'
        + 'Pon el número de cada mesa en su detalle (toca la mesa en el plano).');
      return;
    }
    const nombres = (l) => l.map((m) => m.nombre).join(', ');
    const repes = [...numerosRepetidos(mesas)].map(([n, l]) => `${n} (${nombres(l)})`);
    let txt = `¿Colocar ${plural(res.pos.size, 'mesa', 'mesas')} como en el plano de la finca?\n\n`
      + '⚠ Se SOBRESCRIBE la colocación actual de esas mesas, también la que hayas hecho a mano.\n\n'
      + 'Antes se guarda una copia y podrás volver a ella con «Deshacer distribución».';
    if (res.sinNumero.length) txt += `\n\nNo se mueven (sin número): ${nombres(res.sinNumero)}.`;
    if (repes.length) txt += `\n\n⚠ Números repetidos (quedarán una encima de otra): ${repes.join('; ')}.`;
    if (!window.confirm(txt)) return;
    guardado.pendientes += 1;
    renderEstado();
    renderDistBtns();
    try {
      // 1) Copia de lo que hay guardado ahora (null = sin posición). La
      //    forma, solo de la mesa a la que se le cambia (la presidencial)
      const previa = mesas.map((m) => ({
        id: m.id, nombre: m.nombre,
        x: m.orig.x ?? null, y: m.orig.y ?? null, rot: m.orig.rot ?? 0,
        ...(res.pos.get(m.id)?.forma ? { forma: m.orig.forma } : {}),
      }));
      const copiaId = await crearCopia(previa, 'finca');
      copias.unshift({ id: copiaId, mesas: previa, fecha: new Date() });
      // 2) Posiciones del plano de la finca, de una vez (sin limitar a
      //    las paredes: van donde dice el plano aunque se salgan)
      const lista = [...res.pos].map(([id, p]) => ({
        id, x: cm(p.x), y: cm(p.y), rot: normAng(p.rot), ...(p.forma ? { forma: p.forma } : {}),
      }));
      await guardaPosiciones(lista);
      lista.forEach((p) => {
        const m = porId(p.id);
        Object.assign(m, { x: p.x, y: p.y, rot: p.rot, provisional: false });
        if (p.forma) m.forma = p.forma;
        m.orig = { x: p.x, y: p.y, rot: p.rot, forma: m.forma };
        guardado.errores.delete(m.id);
      });
      undo.length = 0;
      selId = null;
      guardado.ultimo = new Date();
      const partes = [`✓ ${plural(lista.length, 'mesa colocada', 'mesas colocadas')} como en el plano de la finca.`];
      if (res.sinNumero.length) partes.push(`Sin número, no se han movido: ${nombres(res.sinNumero)}.`);
      if (res.conflictos.length) {
        partes.push(`⚠ Revisa: ${res.conflictos.map((c) => `${c.mesa.nombre} (${[...new Set(c.motivos)].join(', ')})`).join('; ')}.`);
      }
      avisoFinca = partes.join(' ');
    } catch (err) {
      console.error(err);
      window.alert('No se ha podido colocar (no se ha cambiado nada guardado). Inténtalo de nuevo.');
    } finally {
      guardado.pendientes -= 1;
      render();
    }
  }

  async function deshacerDistribucion() {
    const c = copias[0];
    if (!c) return;
    if (!window.confirm('¿Volver a la colocación anterior a la última distribución (o colocación como la finca)?\n\nSe pierde la colocación actual.')) return;
    guardado.pendientes += 1;
    renderEstado();
    renderDistBtns();
    try {
      const lista = c.mesas.filter((e) => porId(e.id))
        .map((e) => ({ id: e.id, x: e.x, y: e.y, rot: e.rot, forma: e.forma }));
      await guardaPosiciones(lista);
      await borraCopia(c.id);
      copias.shift();
      lista.forEach((e) => {
        const m = porId(e.id);
        Object.assign(m, { x: e.x, y: e.y, rot: e.rot || 0, provisional: false });
        if (FORMAS.includes(e.forma)) m.forma = e.forma;
        m.orig = { x: e.x, y: e.y, rot: e.rot || 0, forma: m.forma };
      });
      colocaPendientes();
      avisoFinca = '';
      undo.length = 0;
      selId = null;
      guardado.ultimo = new Date();
    } catch (err) {
      console.error(err);
      window.alert('No se ha podido deshacer la distribución. Inténtalo de nuevo.');
    } finally {
      guardado.pendientes -= 1;
      render();
    }
  }
  distBtn.addEventListener('click', distribuirMesas);
  deshacerDistBtn.addEventListener('click', deshacerDistribucion);
  fincaBtn.addEventListener('click', colocarComoFinca);

  /* ---------- Botones ---------- */
  editarBtn.addEventListener('click', () => setEditando(!editando));
  root.querySelector('[data-listo]').addEventListener('click', () => setEditando(false));
  root.querySelectorAll('[data-zoom]').forEach((b) => {
    b.addEventListener('click', () => {
      if (b.dataset.zoom === 'fit') encuadra();
      else zoom(b.dataset.zoom === 'in' ? 1 / 1.35 : 1.35);
    });
  });
  root.querySelector('#pla-rotl').addEventListener('click', () => gira(-15));
  root.querySelector('#pla-rotr').addEventListener('click', () => gira(15));
  undoBtn.addEventListener('click', () => {
    const paso = undo.pop();
    if (!paso) return;
    const m = porId(paso.id);
    if (!m) { renderSel(); return; }
    Object.assign(m, { x: paso.x, y: paso.y, rot: paso.rot });
    selId = m.id;
    render();
    guardarPos(m);
  });
  new ResizeObserver(() => { if (plano) { aplicaCam(); renderPlano(); } }).observe(svg);

  /* ---------- Render general ---------- */
  function render() {
    renderDistBtns();
    renderStatsYAvisos();
    renderPlano();
    renderSel();
    renderEstado();
    if (detalleId) renderDetalle();
  }

  /* ---------- Carga inicial ---------- */
  [plano, mesas, copias] = await Promise.all([
    fetchPlano(), fetchMesasPlano(), fetchCopias().catch((err) => { console.error(err); return []; }),
  ]);
  mesas.forEach((m) => { m.orig = { x: m.x, y: m.y, rot: m.rot, forma: m.forma }; });
  colocaPendientes();
  rellenaSalon();
  ajustaEscenario();
  encuadra();
  render();
}

/* =================================================================
   Puerta de acceso compartida con el resto de páginas de gestión
   ================================================================= */
export function initPlanoPage() {
  const appRoot = document.getElementById('pla-app');
  if (!appRoot) return;
  initGate({
    async onEnter() {
      appRoot.hidden = false;
      await initApp(appRoot);
    },
  });
}
