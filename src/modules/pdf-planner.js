/* =================================================================
   PDF "PLANO DE MESAS" para la wedding planner (jsPDF + autotable).

   Módulo PURO: ni Firebase ni DOM. Recibe las mesas, el salón, los
   invitados (solo para saber quién es niño/a) y la imagen del plano ya
   rasterizada (plano-imagen.js, en el navegador). Se carga LAZY. Mismo
   estilo que "Exportar PDF" (pdf-estilo.js). Se prueba en Node:
   scripts/test-pdf-planner.mjs.

   Contenido:
     1. Portada (vertical): resumen (mismos criterios que el Excel de la
        finca) e índice con enlaces.
     2. Plano del salón (A4 HORIZONTAL): la imagen a todo el ancho útil
        y una leyenda.
     3. Mesa por mesa (vertical, dos fichas por página; la que no cabe
        en media, página entera): dibujo con el nombre de cada comensal
        junto a su asiento y la flecha hacia los novios, y la lista en
        orden de asiento.

   Documento de COLOCACIÓN: sin confirmaciones, preboda, núcleos,
   alergias ni importes.
   ================================================================= */

import { jsPDF } from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import {
  BURDEOS, INK, SOFT, HEAD_FILL, LINE, GRIS, SERIF, SANS, M,
  txt, pl, tick, fechaArchivo, fechaHumana, estiloTabla, portadaCabecera, cabecerasYPies,
} from './pdf-estilo.js';
import {
  numPuestos, tamanoMesa, puestosLocales, ordenPuestos, haciaMesa, rumbo,
  recortePlano, FORMA_LABEL,
} from './plano-geom.js';
import { planificar, clavesNinos, esNino, TIPO_NINO } from './excel-finca.js';

const A4 = { corto: 210, largo: 297 };
const PT = 25.4 / 72;            // mm por punto tipográfico

/* ---------- Colores del dibujo (los de plano.html) ---------- */
const C = {
  tablero: [255, 255, 255], tableroBorde: [122, 107, 84],
  presFill: [247, 236, 238],
  silla: [251, 248, 242], sillaBorde: [182, 168, 148],
  ocupada: [217, 205, 185], ocupadaBorde: [122, 107, 84],
  exceso: [226, 203, 203], excesoBorde: [140, 47, 47],
  flecha: [175, 135, 144],
};

/** Nombre del archivo: Plano_mesas_Maria_Alberto_AAAA-MM-DD.pdf */
export function nombreArchivo(fecha = new Date()) {
  return `Plano_mesas_Maria_Alberto_${fechaArchivo(fecha)}.pdf`;
}

/** Título de una mesa: "Mesa 7 · Limón", "Mesa s/n · X" o "Mesa presidencial · Novios". */
export function tituloMesa(m) {
  if (m.presidencial) return `Mesa presidencial · ${m.nombre}`;
  return `Mesa ${m.numero != null ? m.numero : 's/n'} · ${m.nombre}`;
}

/** Presidencial primero, luego por número y las que no tienen, por nombre. */
export function ordenFichas(mesas) {
  return [...mesas].sort((a, b) => (b.presidencial - a.presidencial)
    || (a.numero ?? 999) - (b.numero ?? 999)
    || String(a.nombre).localeCompare(String(b.nombre), 'es'));
}

/** Puestos de una mesa para la lista: [{ n, nombre, tipo }] ('' | niño/a | hueco). */
export function puestosMesa(mesa, ninos) {
  return ordenPuestos(mesa).map((c, i) => ({
    n: i + 1,
    nombre: c ? String(c.nombre || '').trim() || '(sin nombre)' : '',
    tipo: c ? (esNino(c, ninos) ? TIPO_NINO : '') : 'hueco',
  }));
}

/**
 * Resumen de la portada. Comensales, niños y adultos con los MISMOS
 * criterios que el Excel de la finca (planificar): comensales = sillas
 * ocupadas; niño/a = marcado como niño en la lista de invitados;
 * adultos = comensales − niños − tronas. Tronas: no hay ninguna marcada
 * (el Excel también pone 0). Huecos: sillas libres de cada mesa.
 */
export function resumenPlanner(mesas, nucleos) {
  const { resumen } = planificar(mesas, nucleos);
  const huecos = mesas.reduce((s, m) => s + ordenPuestos(m).filter((c) => !c).length, 0);
  const tronas = 0;
  return {
    mesas: mesas.length,
    comensales: resumen.comensales,
    ninos: resumen.ninos,
    adultos: resumen.comensales - resumen.ninos - tronas,
    tronas,
    huecos,
  };
}

/* =================================================================
   Geometría de las etiquetas (mm): cajas orientadas y círculos
   ================================================================= */
/** Caja orientada: centro, eje u (unitario), semiancho y semialto. */
const caja = (cx, cy, ux, uy, hw, hh) => ({ cx, cy, ux, uy, hw, hh });
const esquinas = (b) => {
  const vx = -b.uy; const vy = b.ux;
  return [[1, 1], [1, -1], [-1, -1], [-1, 1]].map(([i, j]) => [
    b.cx + b.ux * b.hw * i + vx * b.hh * j, b.cy + b.uy * b.hw * i + vy * b.hh * j]);
};
const infla = (b, p) => ({ ...b, hw: b.hw + p, hh: b.hh + p });

function solapanCajas(a, b) {
  const ejes = [[a.ux, a.uy], [-a.uy, a.ux], [b.ux, b.uy], [-b.uy, b.ux]];
  const ea = esquinas(a);
  const eb = esquinas(b);
  return ejes.every(([x, y]) => {
    const pa = ea.map(([px, py]) => px * x + py * y);
    const pb = eb.map(([px, py]) => px * x + py * y);
    return Math.max(...pa) > Math.min(...pb) && Math.max(...pb) > Math.min(...pa);
  });
}
function solapaCirculo(b, c) {
  const dx = c.x - b.cx; const dy = c.y - b.cy;
  const lx = dx * b.ux + dy * b.uy;         // en ejes de la caja
  const ly = -dx * b.uy + dy * b.ux;
  const qx = Math.max(-b.hw, Math.min(b.hw, lx));
  const qy = Math.max(-b.hh, Math.min(b.hh, ly));
  return Math.hypot(lx - qx, ly - qy) < c.r;
}

const FUENTES = [9, 8.5, 8, 7.5, 7];   // puntos de los nombres alrededor de la mesa
const FUENTE_MIN = 6.5;
const ESCALA = { min: 10, max: 22 };   // mm por metro del dibujo

/**
 * Elementos del dibujo de una mesa a escala `s` (mm/m), centrada en 0,0:
 * sillas, obstáculos y la etiqueta de cada asiento ocupado.
 *   modo 'horizontal': nombres en horizontal junto a la silla
 *   modo 'radial':     nombres en la dirección de la silla (hacia fuera)
 */
export function geometria(mesa, s, modo, fs, anchos, sinNombre) {
  const n = numPuestos(mesa);
  const { w, h } = tamanoMesa(mesa.forma, n);
  const rad = ((mesa.rot || 0) * Math.PI) / 180;
  const cos = Math.cos(rad); const sin = Math.sin(rad);
  const gira = (x, y) => [(x * cos - y * sin) * s, (x * sin + y * cos) * s];
  const rS = Math.max(2.4, 0.22 * s);
  const th = fs * PT * 0.95;               // alto de la letra (con acentos)
  const media = fs * PT * 0.35;            // de la línea media a la base

  const sillas = puestosLocales(mesa.forma, n).map((p, i) => {
    const [x, y] = gira(p.x, p.y);
    return { i, x, y, r: rS, a: p.ang + rad };
  });

  // Obstáculo fijo: el tablero
  const obst = [];
  if (mesa.forma === 'redonda') obst.push({ circ: { x: 0, y: 0, r: (w / 2) * s } });
  else obst.push({ caja: caja(0, 0, cos, sin, (w / 2) * s, (h / 2) * s) });

  const etiquetas = [];
  sillas.forEach((si) => {
    const tw = anchos[si.i];
    if (tw == null || sinNombre.has(si.i)) return;
    const ca = Math.cos(si.a); const sa = Math.sin(si.a);
    const d0 = si.r + 1.0;
    const px = si.x + ca * d0; const py = si.y + sa * d0;
    if (modo === 'horizontal') {
      // El texto se apoya en la silla por su lado (o esquina) más cercano:
      // a la derecha/izquierda, encima/debajo o en diagonal
      // Arriba/abajo, cada nombre hacia su lado (el de la izquierda a la
      // izquierda…) para que los vecinos no se monten
      const lim = (v) => Math.max(-1, Math.min(1, v / 0.35));
      const lado = Math.abs(si.x) > si.r * 0.5 ? Math.sign(si.x) : 0;
      const hx = Math.abs(ca) >= 0.35 ? Math.sign(ca) : lado || lim(ca);
      const cx = px + hx * tw / 2;
      const cy = py + lim(sa) * th / 2;
      etiquetas.push({
        i: si.i, caja: caja(cx, cy, 1, 0, tw / 2, th / 2),
        x: cx - tw / 2, y: cy + media, ang: 0,
      });
    } else {
      const derecho = ca > 0.01 || (Math.abs(ca) <= 0.01 && sa < 0);
      const b = derecho ? si.a : si.a + Math.PI;
      const ux = Math.cos(b); const uy = Math.sin(b);
      const sx = derecho ? px : px + ca * tw;
      const sy = derecho ? py : py + sa * tw;
      etiquetas.push({
        i: si.i, caja: caja(px + ca * tw / 2, py + sa * tw / 2, ux, uy, tw / 2, th / 2),
        x: sx - uy * media, y: sy + ux * media, ang: (-b * 180) / Math.PI,
      });
    }
  });

  // Presidencial: la cabecera (pared) por detrás de sillas y nombres, y
  // el triángulo "mira hacia" por delante, sin pisar ningún nombre
  let pres = null;
  if (mesa.presidencial) {
    const ux = sin; const uy = -cos;            // "arriba" de la mesa (hacia la pared)
    const pts = [];
    sillas.forEach((c) => pts.push([c.x, c.y, c.r]));
    etiquetas.forEach((e) => esquinas(e.caja).forEach(([x, y]) => pts.push([x, y, 0])));
    const arriba = Math.max(...pts.map(([x, y, r]) => x * ux + y * uy + r)) + 1.6;
    const abajo = Math.max(...pts.map(([x, y, r]) => -(x * ux + y * uy) + r)) + 1.2;
    const grosor = Math.max(0.8, 0.14 * s);
    pres = {
      linea: { cx: ux * arriba, cy: uy * arriba, ax: cos, ay: sin, half: (w / 2) * s, grosor },
      tri: { cx: -ux * abajo, cy: -uy * abajo, dx: -ux, dy: -uy, ax: cos, ay: sin, base: 0.22 * s, alto: 0.32 * s },
    };
  }

  // Caja que lo engloba todo
  let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
  const mete = (x, y) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); };
  sillas.forEach((c) => { mete(c.x - c.r, c.y - c.r); mete(c.x + c.r, c.y + c.r); });
  obst.forEach((o) => {
    if (o.circ) { mete(-o.circ.r, -o.circ.r); mete(o.circ.r, o.circ.r); } else esquinas(o.caja).forEach(([x, y]) => mete(x, y));
  });
  etiquetas.forEach((e) => esquinas(e.caja).forEach(([x, y]) => mete(x, y)));
  if (pres) {
    const { linea: l, tri: t } = pres;
    mete(l.cx - l.ax * l.half - l.grosor, l.cy - l.ay * l.half - l.grosor);
    mete(l.cx + l.ax * l.half + l.grosor, l.cy + l.ay * l.half + l.grosor);
    [[t.ax * t.base, t.ay * t.base], [-t.ax * t.base, -t.ay * t.base], [t.dx * t.alto, t.dy * t.alto]]
      .forEach(([dx, dy]) => mete(t.cx + dx, t.cy + dy));
  }
  return { s, rS, sillas, obst, etiquetas, pres, bbox: { x0, y0, x1, y1 } };
}

/** Pares de etiquetas que se pisan (entre sí, con sillas, tablero…). Devuelve
    cuántos choques tiene cada etiqueta (Map i → nº). */
export function choques(g) {
  const cuenta = new Map();
  const suma = (i) => cuenta.set(i, (cuenta.get(i) || 0) + 1);
  g.etiquetas.forEach((e, k) => {
    const b = infla(e.caja, 0.3);
    g.sillas.forEach((c) => { if (solapaCirculo(b, c)) suma(e.i); });
    g.obst.forEach((o) => {
      if (o.circ ? solapaCirculo(b, o.circ) : solapanCajas(b, o.caja)) suma(e.i);
    });
    g.etiquetas.slice(k + 1).forEach((f) => {
      if (solapanCajas(infla(e.caja, 0.25), infla(f.caja, 0.25))) { suma(e.i); suma(f.i); }
    });
  });
  return cuenta;
}

/** Mayor escala (mm/m) a la que todo cabe en W × H, o null. */
export function escalaQueCabe(mesa, modo, fs, anchos, sinNombre, W, H) {
  const cabe = (s) => {
    const { bbox } = geometria(mesa, s, modo, fs, anchos, sinNombre);
    return bbox.x1 - bbox.x0 <= W && bbox.y1 - bbox.y0 <= H;
  };
  if (!cabe(ESCALA.min)) return null;
  if (cabe(ESCALA.max)) return ESCALA.max;
  let lo = ESCALA.min; let hi = ESCALA.max;
  for (let k = 0; k < 18; k++) {
    const mid = (lo + hi) / 2;
    if (cabe(mid)) lo = mid; else hi = mid;
  }
  return lo;
}

/** Ancho (mm) de cada nombre a `fs` puntos: índice de asiento → mm. */
export function anchosNombres(doc, puestos, fs) {
  doc.setFont(SANS, 'normal');
  doc.setFontSize(fs);
  const res = {};
  puestos.forEach((p, i) => { if (p.nombre) res[i] = doc.getTextWidth(txt(p.nombre)); });
  return res;
}

/**
 * Busca cómo dibujar la mesa en un hueco de W × H mm: la letra más
 * grande (9 → 7 pt) en horizontal o, si no, en radial, sin que ningún
 * nombre pise a otro, a una silla o al tablero, ni se salga.
 * Con `ultimoRecurso`, baja a 6,5 pt y quita el nombre del dibujo (solo
 * el número de asiento; el nombre sigue en la lista) a los que chocan.
 */
export function disenaDibujo(doc, mesa, puestos, W, H, { ultimoRecurso = false } = {}) {
  const prueba = (fs, modo, sinNombre = new Set()) => {
    const anchos = anchosNombres(doc, puestos, fs);
    const s = escalaQueCabe(mesa, modo, fs, anchos, sinNombre, W, H);
    if (s == null) return null;
    const g = geometria(mesa, s, modo, fs, anchos, sinNombre);
    return { g, fs, modo, sinNombre, anchos, choques: choques(g) };
  };
  for (const modo of ['horizontal', 'radial']) {
    for (const fs of FUENTES) {
      const r = prueba(fs, modo);
      if (r && r.choques.size === 0) return r;
    }
  }
  if (!ultimoRecurso) return null;
  for (const modo of ['radial', 'horizontal']) {
    const r = prueba(FUENTE_MIN, modo);
    if (r && r.choques.size === 0) return r;
  }
  // Solo número en el dibujo para los nombres que chocan o no caben
  const sinNombre = new Set();
  const anchos = anchosNombres(doc, puestos, FUENTE_MIN);
  for (let vuelta = 0; vuelta <= puestos.length; vuelta++) {
    const r = prueba(FUENTE_MIN, 'radial', sinNombre);
    if (r && r.choques.size === 0) return r;
    let peor = null;
    if (r) {
      // El que más choca (a igualdad, el más largo)
      r.choques.forEach((nc, i) => {
        if (!peor || nc > peor.nc || (nc === peor.nc && anchos[i] > anchos[peor.i])) peor = { i, nc };
      });
    } else {
      // No cabe ni a la escala mínima: fuera el nombre más largo
      Object.keys(anchos).map(Number).filter((i) => !sinNombre.has(i))
        .forEach((i) => { if (!peor || anchos[i] > anchos[peor.i]) peor = { i }; });
    }
    if (!peor) break;
    sinNombre.add(peor.i);
  }
  return prueba(FUENTE_MIN, 'radial', sinNombre);
}

/* =================================================================
   Dibujo (jsPDF)
   ================================================================= */
function poligono(doc, pts, estilo) {
  const [x0, y0] = pts[0];
  const segs = pts.slice(1).map(([x, y], k) => [x - pts[k][0], y - pts[k][1]]);
  doc.lines(segs, x0, y0, [1, 1], estilo, true);
}

function pintaDibujo(doc, mesa, pres, puestos, d, ox, oy) {
  const { g, fs } = d;
  const n = numPuestos(mesa);
  const { w, h } = tamanoMesa(mesa.forma, n);
  const rad = ((mesa.rot || 0) * Math.PI) / 180;
  const cos = Math.cos(rad); const sin = Math.sin(rad);
  const s = g.s;
  const P = (x, y) => [ox + (x * cos - y * sin) * s, oy + (x * sin + y * cos) * s];

  // Tablero
  doc.setLineWidth(mesa.presidencial ? 0.5 : 0.35);
  doc.setDrawColor(...(mesa.presidencial ? BURDEOS : C.tableroBorde));
  doc.setFillColor(...(mesa.presidencial ? C.presFill : C.tablero));
  if (mesa.forma === 'redonda') doc.circle(ox, oy, (w / 2) * s, 'FD');
  else poligono(doc, [P(-w / 2, -h / 2), P(w / 2, -h / 2), P(w / 2, h / 2), P(-w / 2, h / 2)], 'FD');

  // Presidencial: cabecera y "mira hacia"; el resto, flecha hacia los novios
  if (g.pres) {
    const { linea: l, tri: t } = g.pres;
    doc.setDrawColor(...BURDEOS);
    doc.setLineWidth(l.grosor);
    doc.setLineCap('round');
    doc.line(ox + l.cx - l.ax * l.half, oy + l.cy - l.ay * l.half, ox + l.cx + l.ax * l.half, oy + l.cy + l.ay * l.half);
    doc.setLineCap('butt');
    doc.setFillColor(...BURDEOS);
    doc.triangle(ox + t.cx + t.ax * t.base, oy + t.cy + t.ay * t.base, ox + t.cx - t.ax * t.base, oy + t.cy - t.ay * t.base,
      ox + t.cx + t.dx * t.alto, oy + t.cy + t.dy * t.alto, 'F');
  } else if (pres) {
    const { ang } = haciaMesa(mesa, pres);
    const a = (ang * Math.PI) / 180;
    const r0 = (Math.min(w, h) / 2 - 0.15) * s;
    const ux = Math.cos(a); const uy = Math.sin(a); const vx = -uy; const vy = ux;
    const pt = (t, v = 0) => [ox + ux * t + vx * v, oy + uy * t + vy * v];
    doc.setDrawColor(...C.flecha);
    doc.setLineWidth(Math.max(0.4, 0.05 * s));
    doc.setLineCap('round');
    doc.setLineJoin('round');
    doc.line(...pt(-r0 + 0.2 * s), ...pt(r0 - 0.05 * s));
    doc.lines([[ux * 0.3 * s - vx * 0.2 * s, uy * 0.3 * s - vy * 0.2 * s], [-ux * 0.3 * s - vx * 0.2 * s, -uy * 0.3 * s - vy * 0.2 * s]],
      ...pt(r0 - 0.3 * s, 0.2 * s), [1, 1], 'S', false);
    doc.setLineCap('butt');
    doc.setLineJoin('miter');
  }

  // Sillas con su número
  const numFs = Math.min(8, Math.max(5, g.rS * 2.1));
  g.sillas.forEach((c) => {
    const ocupada = Boolean(puestos[c.i].nombre);
    const exceso = c.i >= mesa.capacidad;
    const [fill, borde] = exceso ? [C.exceso, C.excesoBorde] : ocupada ? [C.ocupada, C.ocupadaBorde] : [C.silla, C.sillaBorde];
    doc.setFillColor(...fill);
    doc.setDrawColor(...borde);
    doc.setLineWidth(0.25);
    doc.circle(ox + c.x, oy + c.y, c.r, 'FD');
    doc.setFont(SANS, 'bold');
    doc.setFontSize(numFs);
    doc.setTextColor(...(ocupada ? INK : GRIS));
    doc.text(String(c.i + 1), ox + c.x, oy + c.y + numFs * PT * 0.35, { align: 'center' });
  });

  // Nombres
  doc.setFont(SANS, 'normal');
  doc.setFontSize(fs);
  doc.setTextColor(...INK);
  g.etiquetas.forEach((e) => {
    doc.text(txt(puestos[e.i].nombre), ox + e.x, oy + e.y, e.ang ? { angle: e.ang } : undefined);
  });
}

/* =================================================================
   Ficha de una mesa
   ================================================================= */
const ALTO = { util: A4.largo - M.top - M.bottom, sep: 8 };
ALTO.mitad = (ALTO.util - ALTO.sep) / 2;
const CAB = 17;           // cabecera de la ficha (título y línea)
const NOTA = 7;           // línea bajo el dibujo
const DIBUJO_MIN = 55;    // alto mínimo del dibujo en media página

/** Opciones de la lista en orden de asiento (una o dos columnas). */
function listaOpciones(puestos, x, ancho, y) {
  const fila = (p) => [String(p.n), p.nombre || '', p.tipo];
  const cols = puestos.length > 6 ? 2 : 1;
  const mitad = Math.ceil(puestos.length / cols);
  const trozos = cols === 2 ? [puestos.slice(0, mitad), puestos.slice(mitad)] : [puestos];
  const hueco = 4;
  const w = cols === 2 ? (ancho - hueco) / 2 : ancho;
  return trozos.map((t, k) => ({
    startY: y,
    head: [['Nº', 'Nombre', 'Tipo']],
    body: t.map(fila).map((f) => f.map(txt)),
    margin: { left: x + k * (w + hueco), right: A4.corto - (x + k * (w + hueco) + w), top: M.top, bottom: M.bottom },
    tableWidth: w,
    ...estiloTabla({ fontSize: 8.5 }),
    styles: { ...estiloTabla({ fontSize: 8.5 }).styles, cellPadding: { top: 1.1, bottom: 1.1, left: 1.6, right: 1.6 } },
    columnStyles: { 0: { cellWidth: 8, halign: 'right' }, 2: { cellWidth: 15 } },
    rowPageBreak: 'avoid',
    didParseCell(data) {
      if (data.section !== 'body' || data.column.index !== 2) return;
      if (data.cell.raw === 'hueco') { data.cell.styles.textColor = GRIS; data.cell.styles.fontStyle = 'italic'; }
      if (data.cell.raw === txt(TIPO_NINO)) { data.cell.styles.textColor = BURDEOS; data.cell.styles.fontStyle = 'bold'; }
    },
  }));
}

/** Alto (mm) que ocupará la lista (se mide en un documento aparte). */
function altoLista(medidor, puestos) {
  let alto = 0;
  listaOpciones(puestos, M.left, A4.corto - M.left - M.right, 0).forEach((o) => {
    medidor.addPage();
    autoTable(medidor, { ...o, startY: M.top });
    alto = Math.max(alto, medidor.lastAutoTable.finalY - M.top);
  });
  return alto;
}

/** Diseña la ficha: media página si cabe con letra ≥ 7 pt; si no, entera. */
function planFicha(doc, medidor, mesa, ninos) {
  const puestos = puestosMesa(mesa, ninos);
  const lista = altoLista(medidor, puestos);
  const W = A4.corto - M.left - M.right;
  for (const alto of ['mitad', 'util']) {
    const H = ALTO[alto] - CAB - NOTA - lista - 3;
    if (alto === 'mitad' && H < DIBUJO_MIN) continue;
    const d = disenaDibujo(doc, mesa, puestos, W, H, { ultimoRecurso: alto === 'util' });
    if (d) return { mesa, puestos, lista, alto, d, W, H };
  }
  return null; // no ocurre: a página entera siempre hay último recurso
}

function pintaFicha(doc, f, y0, pres, meseros) {
  const { mesa, puestos, d, W, H } = f;
  const x0 = M.left;
  // Cabecera: mesero, título y ocupación
  const med = meseros && meseros.get(mesa.id);
  const lado = 13;
  if (med) {
    doc.addImage(med, 'PNG', x0, y0, lado, lado, `mesero-${mesa.id}`, 'FAST');
  } else {
    doc.setFillColor(247, 236, 238);
    doc.setDrawColor(...BURDEOS);
    doc.setLineWidth(0.3);
    doc.circle(x0 + lado / 2, y0 + lado / 2, lado / 2, 'FD');
    doc.setFont(SERIF, 'italic');
    doc.setFontSize(18);
    doc.setTextColor(...BURDEOS);
    doc.text(txt((String(mesa.nombre || '?').trim()[0] || '?').toUpperCase()), x0 + lado / 2, y0 + lado / 2 + 2.3, { align: 'center' });
  }
  doc.setFont(SERIF, 'bold');
  doc.setFontSize(17);
  doc.setTextColor(...BURDEOS);
  doc.text(txt(tituloMesa(mesa)), x0 + lado + 3.5, y0 + 6.5);
  const ocupadas = puestos.filter((p) => p.nombre).length;
  const huecos = puestos.length - ocupadas;
  doc.setFont(SANS, 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...SOFT);
  doc.text(txt(`${FORMA_LABEL[mesa.forma] || 'Redonda'} · ${pl(puestos.length, 'silla', 'sillas')}`
    + `${huecos ? ` · ${pl(huecos, 'hueco', 'huecos')}` : ''}`), x0 + lado + 3.5, y0 + 11.5);
  doc.setFont(SANS, 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...INK);
  doc.text(pl(ocupadas, 'comensal', 'comensales'), x0 + W, y0 + 6.5, { align: 'right' });
  doc.setDrawColor(...LINE);
  doc.setLineWidth(0.2);
  doc.line(x0, y0 + 14.5, x0 + W, y0 + 14.5);

  // Dibujo centrado en su hueco
  const yD = y0 + CAB;
  const { bbox } = d.g;
  const ox = x0 + W / 2 - (bbox.x0 + bbox.x1) / 2;
  const oy = yD + H / 2 - (bbox.y0 + bbox.y1) / 2;
  pintaDibujo(doc, mesa, pres, puestos, d, ox, oy);

  // Nota bajo el dibujo
  const yN = yD + H + 4;
  let nota;
  if (mesa.presidencial) nota = 'Raya gruesa: cabecera (espalda contra la pared). Triángulo: hacia dónde mira la mesa.';
  else if (pres) {
    const { ang, dist } = haciaMesa(mesa, pres);
    nota = `La flecha señala hacia los novios (${rumbo(ang)} en el plano, a ${dist.toLocaleString('es-ES', { maximumFractionDigits: 1 })} m).`;
  } else nota = 'No hay mesa presidencial marcada.';
  if (d.sinNombre.size) {
    nota += ` En el dibujo, ${d.sinNombre.size === 1 ? 'el asiento' : 'los asientos'} `
      + `${[...d.sinNombre].sort((a, b) => a - b).map((i) => i + 1).join(', ')} solo con su número: el nombre está en la lista.`;
  }
  doc.setFont(SANS, 'italic');
  doc.setFontSize(8);
  doc.setTextColor(...SOFT);
  doc.text(doc.splitTextToSize(txt(nota), W), x0, yN);

  // Lista en orden de asiento
  const yL = yD + H + NOTA;
  listaOpciones(puestos, x0, W, yL).forEach((o) => autoTable(doc, o));

  return {
    id: mesa.id, titulo: tituloMesa(mesa), alto: f.alto, fs: d.fs, modo: d.modo, escala: d.g.s,
    sinNombre: [...d.sinNombre], area: { x: x0, y: yD, w: W, h: H },
    // Cajas en coordenadas de página (para comprobar solapes en las pruebas)
    etiquetas: d.g.etiquetas.map((e) => ({ i: e.i, nombre: puestos[e.i].nombre, caja: { ...e.caja, cx: e.caja.cx + ox, cy: e.caja.cy + oy } })),
    sillas: d.g.sillas.map((c) => ({ i: c.i, x: c.x + ox, y: c.y + oy, r: c.r })),
    pres: d.g.pres ? { ...d.g.pres, ox, oy } : null,
    obstaculos: d.g.obst.map((o) => (o.circ ? { circ: { ...o.circ, x: o.circ.x + ox, y: o.circ.y + oy } }
      : { caja: { ...o.caja, cx: o.caja.cx + ox, cy: o.caja.cy + oy } })),
    lista: puestos,
  };
}

/* =================================================================
   Portada y página del plano
   ================================================================= */
function portada(doc, r, generado, indice) {
  doc.setPage(1);
  let y = portadaCabecera(doc, 'PLANO DE MESAS', generado);
  const fila = (label, valor) => [txt(label), String(valor)];
  autoTable(doc, {
    startY: y,
    body: [
      fila('Mesas', r.mesas),
      fila('Comensales', r.comensales),
      fila('Adultos', r.adultos),
      fila('Niños', r.ninos),
      fila('Tronas', r.tronas),
      fila('Huecos (sillas libres)', r.huecos),
    ],
    margin: { left: 35, right: 35 },
    theme: 'plain',
    styles: { font: SANS, fontSize: 10, textColor: INK, cellPadding: { top: 1.4, bottom: 1.4, left: 2.5, right: 2.5 } },
    columnStyles: { 1: { halign: 'right', fontStyle: 'bold' } },
    didParseCell(data) {
      if (data.row.index === 1) { data.cell.styles.fillColor = HEAD_FILL; data.cell.styles.textColor = BURDEOS; data.cell.styles.fontStyle = 'bold'; }
    },
  });
  y = doc.lastAutoTable.finalY + 10;

  // Índice con enlaces (en el móvil, toca para saltar)
  doc.setFont(SERIF, 'bold');
  doc.setFontSize(13);
  doc.setTextColor(...BURDEOS);
  doc.text('Contenido', 35, y);
  y += 6.5;
  const linea = (texto, pag, x, xd, size = 10) => {
    doc.setFont(SANS, 'normal');
    doc.setFontSize(size);
    doc.setTextColor(...INK);
    doc.textWithLink(txt(texto), x, y, { pageNumber: pag });
    doc.setTextColor(...SOFT);
    doc.text(`pág. ${pag}`, xd, y, { align: 'right' });
  };
  linea('1.  Plano del salón', indice.plano, 35, 175);
  y += 6;
  linea('2.  Mesa por mesa', indice.fichas[0]?.pagina ?? indice.plano + 1, 35, 175);
  y += 5.5;
  // Las mesas, en dos columnas
  const mitad = Math.ceil(indice.fichas.length / 2);
  const y0 = y;
  indice.fichas.forEach((f, k) => {
    const col = k < mitad ? 0 : 1;
    y = y0 + (k % mitad) * 5;
    linea(f.titulo, f.pagina, col ? 108 : 41, col ? 175 : 102, 8.5);
  });
  y = y0 + mitad * 5 + 6;

  doc.setFont(SANS, 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...SOFT);
  doc.text(doc.splitTextToSize(txt(
    'Niños según la lista de invitados y tronas como en el Excel de la finca (no hay ninguna marcada). '
    + 'Huecos: sillas que quedan libres en cada mesa.'), A4.corto - 70), 35, y);
}

/** Hueco del plano en el A4 horizontal (mm): todo el ancho útil, salvo
    que la proporción del salón obligue a ajustarse al alto. */
export function cajaPlanoMm(plano) {
  const caja0 = { x: M.left, y: 17, w: A4.largo - M.left - M.right, h: A4.corto - 17 - 25 };
  const rec = recortePlano(plano);
  let w = caja0.w;
  let h = (w * rec.h) / rec.w;
  if (h > caja0.h) { h = caja0.h; w = (h * rec.w) / rec.h; }
  return { x: caja0.x + (caja0.w - w) / 2, y: caja0.y, w, h };
}

function paginaPlano(doc, plano, imagen) {
  doc.addPage('a4', 'landscape');
  const { x: ix, y: iy, w: iw, h: ih } = cajaPlanoMm(plano);
  if (imagen) {
    doc.addImage(imagen.dataUrl, 'JPEG', ix, iy, iw, ih, 'plano', 'NONE');
  } else {
    doc.setDrawColor(...LINE);
    doc.rect(ix, iy, iw, ih);
    doc.setFont(SANS, 'italic');
    doc.setFontSize(10);
    doc.setTextColor(...SOFT);
    doc.text('(plano no disponible)', ix + iw / 2, iy + ih / 2, { align: 'center' });
  }

  // Leyenda
  let y = iy + ih + 4.5;
  const x = ix;
  doc.setLineWidth(0.4);
  doc.setDrawColor(...BURDEOS);
  doc.setFillColor(...C.presFill);
  doc.circle(x + 1.6, y - 1.1, 1.6, 'FD');
  doc.setFontSize(7.5);
  let cx = x + 4.5;
  const pon = (t, estilo = 'normal', color = INK) => {
    doc.setFont(SANS, estilo);
    doc.setTextColor(...color);
    doc.text(txt(t), cx, y);
    cx += doc.getTextWidth(txt(t));
  };
  const hueco = () => { cx += 5; };
  pon('Mesa presidencial', 'bold');
  pon(': raya gruesa, cabecera contra la pared; triángulo, hacia dónde mira.');
  hueco();
  pon('7 · Limón', 'bold');
  pon(': número de mesa y nombre.');
  hueco();
  pon('8/10', 'bold', [46, 107, 69]);
  pon(': sentados / sillas.');
  y += 4.2;
  cx = x;
  const m1 = (v) => v.toLocaleString('es-ES', { maximumFractionDigits: 1 });
  pon(`Salón de ${m1(plano.ancho)} x ${m1(plano.largo)} m.`, 'bold');
  hueco();
  pon('Línea discontinua y zona más clara a la izquierda, como en el plano de la finca. SALIDAS en las paredes laterales.');
}

/* =================================================================
   API
   ================================================================= */
/** Pasos de progreso: portada + plano + una por mesa + cabeceras. */
export const pasosPdf = (nMesas) => nMesas + 3;

/**
 * Construye el PDF.
 *   datos: { mesas (con x, y, rot, forma, numero, presidencial, capacidad,
 *            comensales, asientos), plano: { ancho, largo }, nucleos }
 *   opts:  generado (Date), imagen ({ dataUrl JPEG, ancho, alto } del
 *          plano o null), meseros (Map id → PNG), onPaso(etiqueta),
 *          compress (por defecto true)
 * Devuelve { doc, informe }: `informe` describe lo dibujado (pruebas).
 */
export async function construirPdfPlanner(datos, {
  generado = new Date(), imagen = null, meseros = new Map(), onPaso = () => {}, compress = true,
} = {}) {
  const { mesas, plano, nucleos = [] } = datos;
  const ninos = clavesNinos(nucleos);
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress });
  doc.setProperties({ title: 'Plano de mesas · María & Alberto', creator: 'Panel de los novios' });
  const medidor = new jsPDF({ unit: 'mm', format: 'a4' });
  const pres = mesas.find((m) => m.presidencial) || null;

  // 1 · portada (se rellena al final) y 2 · plano
  paginaPlano(doc, plano, imagen);
  onPaso('Plano del salón');
  await tick();

  // 3 · fichas
  const fichas = [];
  let libre = null; // y de la media página libre en la página actual
  for (const mesa of ordenFichas(mesas)) {
    const f = planFicha(doc, medidor, mesa, ninos);
    let y0;
    if (f.alto === 'mitad' && libre != null) {
      y0 = libre;
      libre = null;
      // Separador entre las dos fichas de la página
      doc.setDrawColor(...LINE);
      doc.setLineWidth(0.3);
      doc.setLineDashPattern([1.5, 1.2], 0);
      doc.line(M.left, y0 - ALTO.sep / 2, A4.corto - M.right, y0 - ALTO.sep / 2);
      doc.setLineDashPattern([], 0);
    } else {
      doc.addPage('a4', 'portrait');
      y0 = M.top;
      libre = f.alto === 'mitad' ? M.top + ALTO.mitad + ALTO.sep : null;
    }
    const info = pintaFicha(doc, f, y0, pres, meseros);
    info.pagina = doc.getNumberOfPages();
    fichas.push(info);
    onPaso(tituloMesa(mesa));
    await tick();
  }

  const resumen = resumenPlanner(mesas, nucleos);
  portada(doc, resumen, generado, { plano: 2, fichas });
  onPaso('Portada');
  cabecerasYPies(doc, {
    pie: `Plano de mesas · generado el ${fechaHumana(generado)}`,
    derecha: (i) => (i === 2 ? 'Plano del salón' : i > 2 ? 'Mesa por mesa' : ''),
  });
  onPaso('Listo');
  return { doc, informe: { resumen, fichas, paginas: doc.getNumberOfPages() } };
}
