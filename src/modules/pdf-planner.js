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
     3. Invitados destacados (vertical): todas las ★ por mesa, con su
        asiento, nota y si quedan de cara, de lado o de espaldas a los
        novios (de espaldas, resaltado).
     4. Mesa por mesa (vertical, dos fichas por página; la que no cabe
        en media, página entera): dibujo con el nombre de cada comensal
        (★ en los destacados) junto a su asiento y la flecha hacia los
        novios, y la lista en orden de asiento desde el asiento 1 elegido
        (con nota y orientación de las ★).

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
  puestosNumerados, numAsiento, orientacionSilla, ORIENTACION_LABEL,
} from './plano-geom.js';
import { planificar, clavesNinos } from './excel-finca.js';
import { tipoDe, menuDe, etiquetaTipoMenu, filasRecuento } from './comensal.js';
import {
  disenaMesa, etiquetaPuesto, trozosEtiqueta, ESTRELLA, NBSP,
} from './mesa-etiquetas.js';

const A4 = { corto: 210, largo: 297 };
const PT = 25.4 / 72;            // mm por punto tipográfico
const ROJO = [140, 47, 47];       // ★ de espaldas a los novios
const ROJO_FONDO = [248, 232, 232];

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

/**
 * Puestos de una mesa para la lista, en orden de NÚMERO (desde el asiento
 * 1 elegido): [{ n, i (silla física), nombre, tipo ('' | niño/a | trona |
 * hueco; silla vacía = hueco), menu, etiqueta ("trona · sin menú"; vacía si
 * es adulto con menú de adulto), estrella, nota, orient ('cara' | 'lado' |
 * 'espaldas', solo ★) }].
 */
export function puestosMesa(mesa, ninos, pres = null) {
  return puestosNumerados(mesa).map(({ i, n, c }) => ({
    n, i,
    nombre: c ? String(c.nombre || '').trim() || '(sin nombre)' : '',
    tipo: c ? tipoDe(c, ninos) : 'hueco',
    menu: c ? menuDe(c, ninos) : '',
    etiqueta: c ? etiquetaTipoMenu(c, ninos) : 'hueco',
    estrella: Boolean(c && c.estrella),
    nota: c && c.nota ? String(c.nota) : '',
    orient: c && c.estrella ? orientacionSilla(mesa, i, pres) : null,
  }));
}

/**
 * Invitados destacados (★) de todas las mesas, ordenados por mesa (como
 * las fichas) y asiento: [{ mesa, titulo, n, nombre, nota, orient }].
 */
export function destacados(mesas) {
  const pres = mesas.find((m) => m.presidencial) || null;
  return ordenFichas(mesas).flatMap((m) => puestosMesa(m, new Set(), pres)
    .filter((p) => p.estrella)
    .map((p) => ({ mesa: m, titulo: tituloMesa(m), n: p.n, nombre: p.nombre, nota: p.nota, orient: p.orient })));
}

/** Estrella de 5 puntas rellena (las fuentes estándar del PDF no la tienen). */
export function estrellaPdf(doc, cx, cy, r, color = BURDEOS) {
  const pts = Array.from({ length: 10 }, (_, k) => {
    const a = -Math.PI / 2 + (k * Math.PI) / 5;
    const rr = k % 2 ? r * 0.45 : r;
    return [cx + rr * Math.cos(a), cy + rr * Math.sin(a)];
  });
  doc.setFillColor(...color);
  const segs = pts.slice(1).map(([x, y], k) => [x - pts[k][0], y - pts[k][1]]);
  doc.lines(segs, pts[0][0], pts[0][1], [1, 1], 'F', true);
}

/**
 * Resumen de la portada: el MISMO recuento que el Excel de la finca
 * (planificar → comensal.js): comensales = sillas ocupadas; tipo y menú
 * de cada uno, guardados o deducidos; adultos = comensales − niños −
 * tronas − huecos. Aparte, las sillas libres de cada mesa.
 */
export function resumenPlanner(mesas, nucleos) {
  const { resumen } = planificar(mesas, nucleos);
  const sillasLibres = mesas.reduce((s, m) => s + ordenPuestos(m).filter((c) => !c).length, 0);
  return {
    mesas: mesas.length,
    comensales: resumen.comensales,
    adultos: resumen.adultos,
    ninos: resumen.ninos,
    tronas: resumen.tronas,
    huecos: resumen.huecos,
    menus: resumen.menus,
    sillasLibres,
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
      // La ★ se dibuja aparte: ocupa lo que una «M»
      return doc.getTextWidth(txt(String(t).replace(ESTRELLA, 'M')));
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
  const porSilla = new Map(puestos.map((p) => [p.i, p]));
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
    const ocupada = Boolean(porSilla.get(c.i)?.nombre);
    const exceso = c.i >= mesa.capacidad;
    const [fill, borde] = exceso ? [C.exceso, C.excesoBorde] : ocupada ? [C.ocupada, C.ocupadaBorde] : [C.silla, C.sillaBorde];
    doc.setFillColor(...fill);
    doc.setDrawColor(...borde);
    doc.setLineWidth(0.25);
    doc.circle(c.x, c.y, c.r, 'FD');
    doc.setFont(SANS, 'bold');
    doc.setFontSize(numFs);
    doc.setTextColor(...(ocupada ? INK : GRIS));
    doc.text(String(numAsiento(mesa, c.i)), c.x, c.y + numFs * PT * 0.35, { align: 'center' });
  });

  // Nombres completos, en una o dos líneas; la ★ de los destacados se
  // dibuja en el hueco de una «M» delante del nombre
  doc.setFont(SANS, 'normal');
  doc.setTextColor(...INK);
  d.etiquetas.forEach((e) => {
    doc.setFontSize(e.fs);
    e.lineas.forEach((l, k) => {
      const yc = e.caja.y0 + e.lh * (k + 0.5);
      const yb = yc + e.fs * PT * 0.35;
      const { estrella, texto } = trozosEtiqueta(l);
      if (!estrella) {
        doc.text(txt(l), e.x, yb, { align: e.align });
        return;
      }
      const wM = doc.getTextWidth('M');
      const pre = wM + doc.getTextWidth(NBSP);
      const wT = doc.getTextWidth(txt(texto));
      const x0 = e.align === 'left' ? e.x : e.x - wT - pre;
      estrellaPdf(doc, x0 + wM / 2, yc - e.fs * PT * 0.04, wM * 0.5);
      doc.text(txt(texto), x0 + pre, yb);
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
  const fila = (p) => [String(p.n), p.nombre || '', p.etiqueta, p.nota || '',
    p.estrella && p.orient ? ORIENTACION_LABEL[p.orient] : ''];
  // Con notas o ★ la lista va a una columna (para que quepan)
  const extra = puestos.some((p) => p.estrella || p.nota || (p.nombre && p.etiqueta));
  const cols = puestos.length > 6 && !extra ? 2 : 1;
  const mitad = Math.ceil(puestos.length / cols);
  const trozos = cols === 2 ? [puestos.slice(0, mitad), puestos.slice(mitad)] : [puestos];
  const hueco = 4;
  const w = cols === 2 ? (ancho - hueco) / 2 : ancho;
  return trozos.map((t, k) => ({
    startY: y,
    head: [['Nº', 'Nombre', 'Tipo · menú', 'Nota', 'Hacia los novios']],
    body: t.map(fila).map((f) => f.map(txt)),
    margin: { left: x + k * (w + hueco), right: A4.corto - (x + k * (w + hueco) + w), top: M.top, bottom: M.bottom },
    tableWidth: w,
    ...estiloTabla({ fontSize: 8.5 }),
    styles: { ...estiloTabla({ fontSize: 8.5 }).styles, cellPadding: { top: 1.1, bottom: 1.1, left: 1.6, right: 1.6 } },
    columnStyles: cols === 2
      ? { 0: { cellWidth: 8, halign: 'right' }, 2: { cellWidth: 13 }, 3: { cellWidth: 11 }, 4: { cellWidth: 15 } }
      : { 0: { cellWidth: 8, halign: 'right' }, 1: { cellWidth: 52 }, 2: { cellWidth: 30 }, 4: { cellWidth: 27 } },
    rowPageBreak: 'avoid',
    didParseCell(data) {
      if (data.section !== 'body') return;
      const p = t[data.row.index];
      if (data.column.index === 1 && p.estrella) {
        data.cell.styles.cellPadding = { top: 1.1, bottom: 1.1, left: 5, right: 1.6 };
        data.cell.styles.fontStyle = 'bold';
      }
      if (data.column.index === 3) { data.cell.styles.fontStyle = 'italic'; data.cell.styles.textColor = SOFT; }
      if (data.column.index === 4 && p.orient === 'espaldas') {
        data.cell.styles.textColor = ROJO;
        data.cell.styles.fontStyle = 'bold';
      }
      if (data.column.index !== 2) return;
      if (data.cell.raw === 'hueco') { data.cell.styles.textColor = GRIS; data.cell.styles.fontStyle = 'italic'; }
      if (data.cell.raw && data.cell.raw !== 'hueco') { data.cell.styles.textColor = BURDEOS; data.cell.styles.fontStyle = 'bold'; }
    },
    didDrawCell(data) {
      if (data.section !== 'body' || data.column.index !== 1 || !t[data.row.index].estrella) return;
      estrellaPdf(data.doc, data.cell.x + 2.8, data.cell.y + 1.1 + 8.5 * PT * 0.55, 1.35);
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
  const puestos = puestosMesa(mesa, ninos, pres);
  const lista = altoLista(medidor, puestos);
  const W = A4.corto - M.left - M.right;
  // Etiqueta de cada silla FÍSICA ("★ Nombre" en los destacados)
  const nombres = new Array(puestos.length).fill('');
  puestos.forEach((p) => { nombres[p.i] = p.nombre ? etiquetaPuesto({ nombre: p.nombre, estrella: p.estrella }) : ''; });
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
  if (puestos.some((p) => p.estrella)) nota += ' Estrella: invitado destacado.';
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
  const { tipos, menus } = filasRecuento({ tipos: { adulto: r.adultos, nino: r.ninos, trona: r.tronas, hueco: r.huecos }, menus: r.menus });
  const cab = (t) => [{ content: txt(t), colSpan: 2, styles: { fontStyle: 'bold', textColor: BURDEOS, fontSize: 9 } }];
  autoTable(doc, {
    startY: y,
    body: [
      fila('Mesas', r.mesas),
      fila('Comensales', r.comensales),
      cab('Por tipo'),
      ...tipos.map(([l, v]) => fila(l, v)),
      cab('Por menú'),
      ...menus.map(([l, v]) => fila(l, v)),
      fila('Sillas libres', r.sillasLibres),
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
  linea('2.  Invitados destacados', indice.destacados, 35, 175);
  y += 6;
  linea('3.  Mesa por mesa', indice.fichas[0]?.pagina ?? indice.destacados + 1, 35, 175);
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
    'Mismo recuento que el Excel de la finca. Tipo y menú de cada comensal: el indicado en el reparto o, si no hay, '
    + 'niño/a según la lista de invitados y menú infantil para niños y tronas. Sillas libres: las que quedan sin nadie en cada mesa.'),
  A4.corto - 70), 35, y);
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
   Invitados destacados (★): todas las estrellas, por mesa
   ================================================================= */
function paginaDestacados(doc, mesas) {
  doc.addPage('a4', 'portrait');
  const lista = destacados(mesas);
  const W = A4.corto - M.left - M.right;
  let y = M.top + 6;
  doc.setFont(SERIF, 'bold');
  doc.setFontSize(17);
  doc.setTextColor(...BURDEOS);
  doc.text('Invitados destacados', M.left, y);
  y += 6;
  const espaldas = lista.filter((d) => d.orient === 'espaldas').length;
  doc.setFont(SANS, 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...SOFT);
  const sub = lista.length
    ? `${pl(lista.length, 'invitado marcado', 'invitados marcados')} con estrella, por mesa y asiento.`
      + `${espaldas ? ` ${pl(espaldas, 'queda', 'quedan')} de espaldas a los novios (resaltado).` : ''}`
    : 'No hay invitados marcados con estrella.';
  doc.text(doc.splitTextToSize(txt(sub), W), M.left, y);
  y += 3;
  doc.setDrawColor(...LINE);
  doc.setLineWidth(0.2);
  doc.line(M.left, y, M.left + W, y);
  if (!lista.length) return { filas: [], espaldas: 0 };
  const filas = lista.map((d) => [txt(d.titulo.replace(/^Mesa /, '')), String(d.n), txt(d.nombre), txt(d.nota),
    txt(d.orient ? ORIENTACION_LABEL[d.orient] : (d.mesa.presidencial ? 'presidencial' : '-'))]);
  autoTable(doc, {
    startY: y + 4,
    head: [['Mesa', 'Asiento', 'Nombre', 'Nota', 'Hacia los novios']],
    body: filas,
    margin: { left: M.left, right: M.right, top: M.top, bottom: M.bottom },
    ...estiloTabla({ fontSize: 9 }),
    columnStyles: { 0: { cellWidth: 36 }, 1: { cellWidth: 18, halign: 'right' }, 2: { cellWidth: 46 }, 4: { cellWidth: 31 } },
    rowPageBreak: 'avoid',
    didParseCell(data) {
      if (data.section !== 'body') return;
      const d = lista[data.row.index];
      if (data.column.index === 2) {
        data.cell.styles.cellPadding = { top: 1.6, bottom: 1.6, left: 5.4, right: 2 };
        data.cell.styles.fontStyle = 'bold';
      }
      if (data.column.index === 3) data.cell.styles.fontStyle = 'italic';
      if (d.orient === 'espaldas') {
        data.cell.styles.fillColor = ROJO_FONDO;
        if (data.column.index === 4) { data.cell.styles.textColor = ROJO; data.cell.styles.fontStyle = 'bold'; }
      }
    },
    didDrawCell(data) {
      if (data.section !== 'body' || data.column.index !== 2) return;
      estrellaPdf(data.doc, data.cell.x + 2.8, data.cell.y + 1.6 + 9 * PT * 0.55, 1.4);
    },
  });
  return { filas: lista.map((d) => ({ mesa: d.mesa.id, n: d.n, nombre: d.nombre, nota: d.nota, orient: d.orient })), espaldas };
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

  // 3 · invitados destacados (★), justo después del plano
  const pagDest = doc.getNumberOfPages() + 1;
  const dest = paginaDestacados(doc, mesas);
  const finDest = doc.getNumberOfPages();

  // 4 · fichas
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
  portada(doc, resumen, generado, { plano: 2, destacados: pagDest, fichas });
  onPaso('Portada');
  cabecerasYPies(doc, {
    pie: `Plano de mesas · generado el ${fechaHumana(generado)}`,
    derecha: (i) => (i === 2 ? 'Plano del salón'
      : i >= pagDest && i <= finDest ? 'Invitados destacados' : i > 2 ? 'Mesa por mesa' : ''),
  });
  onPaso('Listo');
  return {
    doc,
    informe: {
      resumen, fichas, paginas: doc.getNumberOfPages(),
      destacados: { pagina: pagDest, ...dest },
    },
  };
}
