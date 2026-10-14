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
  ordenPuestos, haciaMesa, rumbo,
  recortePlano, FORMA_LABEL,
} from './plano-geom.js';
import { planificar, clavesNinos, esNino, TIPO_NINO } from './excel-finca.js';
import { disenaMesa } from './mesa-etiquetas.js';

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
   Dibujo de la mesa (cálculo compartido con plano.html:
   mesa-etiquetas.js; aquí solo se pinta con jsPDF, unidades = mm)
   ================================================================= */
/** Opciones del dibujo en el PDF: letra de 9 a 7 pt. */
function opcionesPdf(doc) {
  return {
    fuentes: [9, 8.5, 8, 7.5, 7],
    altoLinea: (fs) => fs * PT * 1.2,
    medir: (t, fs) => {
      doc.setFont(SANS, 'normal');
      doc.setFontSize(fs);
      return doc.getTextWidth(txt(t));
    },
    unidad: 0.35,
    separacion: 1.6,
    sillaMin: 2.4,
    trazoMin: 0.4,
    escala: { min: 9.5, max: 24 },
    fraccionMesa: 0.62,
  };
}

/** Desplaza un diseño (coordenadas del área) a la página. */
function aPagina(d, dx, dy) {
  const P = ([x, y]) => [x + dx, y + dy];
  const L = (l) => [l[0] + dx, l[1] + dy, l[2] + dx, l[3] + dy];
  return {
    ...d,
    sillas: d.sillas.map((c) => ({ ...c, x: c.x + dx, y: c.y + dy })),
    tablero: d.tablero.circ ? { circ: { ...d.tablero.circ, x: d.tablero.circ.x + dx, y: d.tablero.circ.y + dy } }
      : { pts: d.tablero.pts.map(P) },
    flecha: d.flecha && { ...d.flecha, linea: L(d.flecha.linea), punta: d.flecha.punta.map(P) },
    cabecera: d.cabecera && { ...d.cabecera, linea: L(d.cabecera.linea), tri: d.cabecera.tri.map(P) },
    etiquetas: d.etiquetas.map((e) => ({
      ...e, x: e.x + dx, guia: e.guia && L(e.guia),
      caja: { x0: e.caja.x0 + dx, y0: e.caja.y0 + dy, x1: e.caja.x1 + dx, y1: e.caja.y1 + dy },
    })),
  };
}

function poligono(doc, pts, estilo) {
  const [x0, y0] = pts[0];
  const segs = pts.slice(1).map(([x, y], k) => [x - pts[k][0], y - pts[k][1]]);
  doc.lines(segs, x0, y0, [1, 1], estilo, true);
}

function pintaDibujo(doc, mesa, puestos, d) {
  // Tablero
  doc.setLineWidth(mesa.presidencial ? 0.5 : 0.35);
  doc.setDrawColor(...(mesa.presidencial ? BURDEOS : C.tableroBorde));
  doc.setFillColor(...(mesa.presidencial ? C.presFill : C.tablero));
  if (d.tablero.circ) doc.circle(d.tablero.circ.x, d.tablero.circ.y, d.tablero.circ.r, 'FD');
  else poligono(doc, d.tablero.pts, 'FD');

  // Presidencial: cabecera y "mira hacia"; el resto, flecha hacia los novios
  if (d.cabecera) {
    doc.setDrawColor(...BURDEOS);
    doc.setLineWidth(d.cabecera.grosor);
    doc.setLineCap('round');
    doc.line(...d.cabecera.linea);
    doc.setLineCap('butt');
    doc.setFillColor(...BURDEOS);
    doc.triangle(...d.cabecera.tri.flat(), 'F');
  }
  if (d.flecha) {
    doc.setDrawColor(...C.flecha);
    doc.setLineWidth(d.flecha.grosor);
    doc.setLineCap('round');
    doc.setLineJoin('round');
    doc.line(...d.flecha.linea);
    const [a, b, c] = d.flecha.punta;
    doc.lines([[b[0] - a[0], b[1] - a[1]], [c[0] - b[0], c[1] - b[1]]], a[0], a[1], [1, 1], 'S', false);
    doc.setLineCap('butt');
    doc.setLineJoin('miter');
  }

  // Guías (debajo de las sillas)
  doc.setDrawColor(...C.sillaBorde);
  doc.setLineWidth(0.2);
  d.etiquetas.forEach((e) => { if (e.guia) doc.line(...e.guia); });

  // Sillas con su número
  const numFs = Math.min(8, Math.max(5, d.rS * 2.1));
  d.sillas.forEach((c) => {
    const ocupada = Boolean(puestos[c.i].nombre);
    const exceso = c.i >= mesa.capacidad;
    const [fill, borde] = exceso ? [C.exceso, C.excesoBorde] : ocupada ? [C.ocupada, C.ocupadaBorde] : [C.silla, C.sillaBorde];
    doc.setFillColor(...fill);
    doc.setDrawColor(...borde);
    doc.setLineWidth(0.25);
    doc.circle(c.x, c.y, c.r, 'FD');
    doc.setFont(SANS, 'bold');
    doc.setFontSize(numFs);
    doc.setTextColor(...(ocupada ? INK : GRIS));
    doc.text(String(c.i + 1), c.x, c.y + numFs * PT * 0.35, { align: 'center' });
  });

  // Nombres completos, en una o dos líneas
  doc.setFont(SANS, 'normal');
  doc.setTextColor(...INK);
  d.etiquetas.forEach((e) => {
    doc.setFontSize(e.fs);
    e.lineas.forEach((l, k) => {
      doc.text(txt(l), e.x, e.caja.y0 + e.lh * (k + 0.5) + e.fs * PT * 0.35, { align: e.align });
    });
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

/** Diseña la ficha: media página si el dibujo cabe; si no, entera. */
function planFicha(doc, medidor, mesa, ninos, pres) {
  const puestos = puestosMesa(mesa, ninos);
  const lista = altoLista(medidor, puestos);
  const W = A4.corto - M.left - M.right;
  const nombres = puestos.map((p) => p.nombre);
  let d;
  for (const alto of ['mitad', 'util']) {
    const H = ALTO[alto] - CAB - NOTA - lista - 3;
    if (alto === 'mitad' && H < DIBUJO_MIN) continue;
    d = disenaMesa(mesa, pres, nombres, { ...opcionesPdf(doc), ancho: W, altoMax: H });
    if (d.cabe || alto === 'util') return { mesa, puestos, lista, alto, d, W, H };
  }
  return null;
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

  // Dibujo: la mesa centrada en el ancho y el conjunto, en su hueco
  const yD = y0 + CAB;
  const dp = aPagina(d, x0, yD + Math.max(0, (H - d.alto) / 2));
  pintaDibujo(doc, mesa, puestos, dp);

  // Nota bajo el dibujo
  const yN = yD + H + 4;
  let nota;
  if (mesa.presidencial) nota = 'Raya gruesa: cabecera (espalda contra la pared). Triángulo: hacia dónde mira la mesa.';
  else if (pres) {
    const { ang, dist } = haciaMesa(mesa, pres);
    nota = `La flecha señala hacia los novios (${rumbo(ang)} en el plano, a ${dist.toLocaleString('es-ES', { maximumFractionDigits: 1 })} m).`;
  } else nota = 'No hay mesa presidencial marcada.';
  doc.setFont(SANS, 'italic');
  doc.setFontSize(8);
  doc.setTextColor(...SOFT);
  doc.text(doc.splitTextToSize(txt(nota), W), x0, yN);

  // Lista en orden de asiento
  const yL = yD + H + NOTA;
  listaOpciones(puestos, x0, W, yL).forEach((o) => autoTable(doc, o));

  return {
    id: mesa.id, titulo: tituloMesa(mesa), alto: f.alto, fs: d.fs, escala: d.s, cabe: d.cabe,
    area: { x: x0, y: yD, w: W, h: H },
    // Dibujo en coordenadas de página (para comprobar solapes en las pruebas)
    dibujo: dp,
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
    const f = planFicha(doc, medidor, mesa, ninos, pres);
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
