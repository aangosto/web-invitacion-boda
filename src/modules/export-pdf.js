/* =================================================================
   EXPORTAR A PDF — construcción del documento (jsPDF + autotable).

   Módulo PURO: ni Firebase ni DOM. Recibe los datos ya leídos (ver
   export-datos.js) y devuelve el documento jsPDF. Se carga de forma
   LAZY desde el panel (import dinámico) para que jsPDF no engorde el
   bundle; y al no depender del navegador se puede probar en Node
   (scripts/test-pdf.mjs).

   Contenido: portada con resumen + índice, y una sección por bloque
   (cada una en página nueva): invitados, alergias y menús, transporte
   y horarios, alpargatas, mesas, hotel y comentarios.

   SIN IMPORTES: no sale ningún dato de dinero (ni regalos, ni importes
   ni cobros del hotel; del hotel solo el estado de pago). Tampoco las
   notas de las habitaciones, que podrían mencionar cantidades.

   Confirmaciones deduplicadas igual que en el panel: fuera la papelera
   (deleted) y, de los reenvíos, solo cuenta el último envío.
   ================================================================= */

import { jsPDF } from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import { splitResubmissions } from './rsvp-dedupe.js';
import { aggregate, MENU_LABELS } from './totales-logic.js';
import { buildCronologia, formatDia, describeEntrada } from './crono-logic.js';
import { TIPO_LABEL } from './habitaciones-precios.js';

/* ---------- Identidad visual (sobria: poca tinta) ---------- */
const BURDEOS = [110, 36, 53];
const INK = [63, 58, 50];
const SOFT = [109, 97, 82];
const HEAD_FILL = [244, 234, 236];   // rosa muy claro en las cabeceras
const STRIPE = [250, 247, 245];
const LINE = [214, 204, 198];
const VERDE = [47, 107, 58];
const AMBAR = [138, 90, 0];
const GRIS = [140, 134, 126];

const SERIF = 'times';      // títulos (eco de Cormorant Garamond)
const SANS = 'helvetica';   // texto y tablas (eco de Jost)

const PAGE_W = 210;
const PAGE_H = 297;
const M = { top: 20, bottom: 18, left: 14, right: 14 };
const CONTENT_W = PAGE_W - M.left - M.right;

const LADO_LABEL = { novia: 'Novia', novio: 'Novio', ambos: 'Ambos' };
const ESTADO_LABEL = { confirmado: 'Confirmado', pendiente: 'Pendiente', no_asiste: 'No asiste' };
const ESTADO_COLOR = { Confirmado: VERDE, Pendiente: AMBAR, 'No asiste': GRIS, Pagada: VERDE, 'Sin pagar': AMBAR, 'Sin asignar': GRIS };

/* Las fuentes estándar de PDF solo cubren Latin-1: se sustituyen los
   signos tipográficos habituales y se quitan emojis y demás. */
const SUSTITUTOS = {
  '—': '-', '–': '-', '‘': "'", '’': "'", '“': '"', '”': '"', '„': '"',
  '…': '...', '•': '·', '→': '->', '←': '<-', '€': 'EUR', '✓': 'si', '✗': 'no',
};
function txt(v) {
  return String(v ?? '')
    .replace(/[^\n\x20-\xFF]/g, (c) => SUSTITUTOS[c] ?? (/\s/.test(c) ? ' ' : ''))
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function norm(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .trim().toLowerCase().replace(/\s+/g, ' ');
}
const pl = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;
const dd = (n) => String(n).padStart(2, '0');
const fechaCorta = (iso) => {
  const [y, m, d] = String(iso || '').split('-');
  return y && m && d ? `${d}/${m}` : '-';
};
const tick = () => new Promise((r) => setTimeout(r, 0));

/** Fecha local 'aaaa-mm-dd' (para el nombre del archivo). */
export function fechaArchivo(fecha = new Date()) {
  return `${fecha.getFullYear()}-${dd(fecha.getMonth() + 1)}-${dd(fecha.getDate())}`;
}

/* =================================================================
   Preparación de datos (todo lo que comparten varias secciones)
   ================================================================= */
function preparar(datos) {
  const p = { ...datos };

  // Confirmaciones: sin papelera y solo el último envío de cada persona
  if (datos.rsvp?.ok) {
    const vivos = datos.rsvp.data.filter((d) => d.deleted !== true);
    const { activos, antiguos } = splitResubmissions(vivos);
    p.activos = activos;
    p.descartados = { papelera: datos.rsvp.data.length - vivos.length, reenvios: antiguos.length };
    p.totales = aggregate(activos);
  }

  // Estados actuales de invitados por key '<nucleoId>|<nombre>' (como mesas)
  if (datos.invitados?.ok) {
    p.estados = new Map();
    datos.invitados.data.forEach((n) => n.personas.forEach((per) => {
      p.estados.set(`${n.id}|${per.nombre}`, per.estado);
    }));
  }

  // Mesa de cada nombre (para poner la mesa junto a cada alergia)
  if (datos.mesas?.ok) {
    p.mesaDeNombre = new Map();
    datos.mesas.data.forEach((m) => m.comensales.forEach((c) => {
      const k = norm(c.nombre);
      if (!k) return;
      const prev = p.mesaDeNombre.get(k);
      p.mesaDeNombre.set(k, prev && prev !== m.nombre ? `${prev} / ${m.nombre}` : m.nombre);
    }));
  }
  return p;
}

/* =================================================================
   Primitivas de maquetación
   ================================================================= */
function crearContexto() {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  doc.setProperties({ title: 'Datos de la boda · María & Alberto', creator: 'Panel de los novios' });
  return { doc, y: M.top, secciones: [] };
}

function asegura(ctx, alto) {
  if (ctx.y + alto > PAGE_H - M.bottom) {
    ctx.doc.addPage();
    ctx.y = M.top;
  }
}

/** Página nueva con el encabezado de sección. */
function seccion(ctx, num, titulo, intro) {
  const { doc } = ctx;
  doc.addPage();
  ctx.secciones.push({ num, titulo, pagina: doc.getNumberOfPages() });
  ctx.y = M.top + 4;
  doc.setFont(SANS, 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...SOFT);
  doc.text(`SECCIÓN ${num}`, M.left, ctx.y, { charSpace: 0.6 });
  ctx.y += 8;
  doc.setFont(SERIF, 'bold');
  doc.setFontSize(22);
  doc.setTextColor(...BURDEOS);
  doc.text(txt(titulo), M.left, ctx.y);
  ctx.y += 3;
  doc.setDrawColor(...BURDEOS);
  doc.setLineWidth(0.5);
  doc.line(M.left, ctx.y, M.left + 40, ctx.y);
  ctx.y += 7;
  if (intro) { parrafo(ctx, intro); ctx.y += 2; }
}

function subtitulo(ctx, texto, extra) {
  const { doc } = ctx;
  asegura(ctx, 26); // título + cabecera + un par de filas: nada huérfano
  ctx.y += 2;
  doc.setFont(SERIF, 'bold');
  doc.setFontSize(14);
  doc.setTextColor(...BURDEOS);
  doc.text(txt(texto), M.left, ctx.y);
  if (extra) {
    doc.setFont(SANS, 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...SOFT);
    doc.text(txt(extra), PAGE_W - M.right, ctx.y, { align: 'right' });
  }
  ctx.y += 4;
}

function parrafo(ctx, texto, { color = SOFT, size = 9, estilo = 'normal' } = {}) {
  const { doc } = ctx;
  doc.setFont(SANS, estilo);
  doc.setFontSize(size);
  doc.setTextColor(...color);
  const lineas = doc.splitTextToSize(txt(texto), CONTENT_W);
  const alto = lineas.length * size * 0.42;
  asegura(ctx, alto + 2);
  doc.text(lineas, M.left, ctx.y + size * 0.3);
  ctx.y += alto + 3;
}

/** Aviso destacado (colección vacía o que no se pudo leer). */
function aviso(ctx, texto) {
  parrafo(ctx, texto, { color: BURDEOS, size: 10, estilo: 'italic' });
}
function avisoError(ctx, que, fuente) {
  aviso(ctx, `No se han podido leer los datos de ${que} (${txt(fuente.error)}). `
    + 'El resto del documento está completo; vuelve a exportar más tarde para esta sección.');
}

/** Tabla con el estilo común. `filasTotal`: índices de fila en negrita. */
function tabla(ctx, { head, body, columnStyles, fontSize = 9, filasTotal = [], colorCol, didParseCell }) {
  autoTable(ctx.doc, {
    startY: ctx.y,
    head: [head.map(txt)],
    body: body.map((fila) => fila.map((c) => (c && typeof c === 'object')
      ? { ...c, content: txt(c.content) } : txt(c))),
    margin: { left: M.left, right: M.right, top: M.top, bottom: M.bottom },
    theme: 'grid',
    showHead: 'everyPage',
    rowPageBreak: 'avoid',
    styles: {
      font: SANS, fontSize, textColor: INK, cellPadding: { top: 1.6, bottom: 1.6, left: 2, right: 2 },
      lineColor: LINE, lineWidth: 0.15, valign: 'top', overflow: 'linebreak',
    },
    headStyles: { fillColor: HEAD_FILL, textColor: BURDEOS, fontStyle: 'bold', lineColor: LINE },
    alternateRowStyles: { fillColor: STRIPE },
    columnStyles,
    didParseCell(data) {
      if (data.section !== 'body') return;
      if (filasTotal.includes(data.row.index)) {
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.fillColor = HEAD_FILL;
      }
      if (colorCol != null && data.column.index === colorCol) {
        const color = ESTADO_COLOR[data.cell.raw?.content ?? data.cell.raw];
        if (color) { data.cell.styles.textColor = color; data.cell.styles.fontStyle = 'bold'; }
      }
      if (didParseCell) didParseCell(data);
    },
  });
  ctx.y = ctx.doc.lastAutoTable.finalY + 6;
}

/* =================================================================
   1 · INVITADOS
   ================================================================= */
function secInvitados(ctx, p) {
  seccion(ctx, 1, 'Invitados',
    'Lista de núcleos con su lado, etiquetas y el estado de cada persona '
    + '(control interno de los novios en la página de invitados).');
  if (!p.invitados?.ok) return avisoError(ctx, 'invitados', p.invitados);
  const nucleos = p.invitados.data;
  if (!nucleos.length) return aviso(ctx, 'Todavía no hay invitados cargados.');

  // Totales por lado y estado (personas)
  const fila = () => ({ nucleos: 0, personas: 0, ninos: 0, confirmado: 0, pendiente: 0, no_asiste: 0 });
  const porLado = { novia: fila(), novio: fila(), ambos: fila() };
  const total = fila();
  nucleos.forEach((n) => {
    [porLado[n.lado], total].forEach((f) => {
      f.nucleos += 1;
      n.personas.forEach((per) => {
        f.personas += 1;
        f[per.estado] += 1;
        if (per.nino) f.ninos += 1;
      });
    });
  });
  subtitulo(ctx, 'Totales por lado y estado', pl(total.personas, 'persona', 'personas'));
  const filaTot = (label, f) => [label, f.nucleos, f.personas, f.confirmado, f.pendiente, f.no_asiste, f.ninos];
  tabla(ctx, {
    head: ['Lado', 'Núcleos', 'Personas', 'Confirmado', 'Pendiente', 'No asiste', 'Niños'],
    body: [
      ...Object.keys(porLado).map((k) => filaTot(LADO_LABEL[k], porLado[k])),
      filaTot('Total', total),
    ],
    filasTotal: [3],
    columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right' } },
  });

  // Detalle: una fila por persona, con el núcleo agrupado (rowSpan)
  subtitulo(ctx, 'Núcleos y personas', pl(nucleos.length, 'núcleo', 'núcleos'));
  const body = [];
  nucleos.forEach((n, i) => {
    const personas = n.personas.length ? n.personas : [null];
    personas.forEach((per, j) => {
      const filaP = [];
      if (j === 0) {
        const span = personas.length;
        filaP.push(
          { content: String(i + 1), rowSpan: span },
          { content: n.nombre || '(sin nombre)', rowSpan: span, styles: { fontStyle: 'bold' } },
          { content: LADO_LABEL[n.lado] || n.lado, rowSpan: span },
          { content: n.etiquetas.join(', ') || '-', rowSpan: span },
        );
      }
      filaP.push(
        per ? `${per.nombre || '(sin nombre)'}${per.nino ? ' (niño)' : ''}` : '(sin personas)',
        per ? ESTADO_LABEL[per.estado] : '-',
      );
      body.push(filaP);
    });
  });
  tabla(ctx, {
    head: ['#', 'Núcleo', 'Lado', 'Etiquetas', 'Persona', 'Estado'],
    body,
    fontSize: 8.5,
    colorCol: 5,
    columnStyles: { 0: { cellWidth: 8, halign: 'right' }, 1: { cellWidth: 40 }, 2: { cellWidth: 15 }, 3: { cellWidth: 32 }, 5: { cellWidth: 22 } },
  });
}

/* =================================================================
   2 · ALERGIAS Y MENÚS (la que se pasa al catering)
   ================================================================= */
function secCatering(ctx, p) {
  seccion(ctx, 2, 'Alergias y menús',
    'Para el catering. Datos de las confirmaciones recibidas por la web '
    + '(solo el último envío de cada persona). La columna "Mesa" se rellena '
    + 'cuando la persona ya está sentada en el plano de mesas.');
  if (!p.rsvp?.ok) return avisoError(ctx, 'las confirmaciones', p.rsvp);
  const t = p.totales;
  if (!t.asisten.length) return aviso(ctx, 'Todavía no hay confirmaciones de asistencia.');
  const mesa = (nombre) => p.mesaDeNombre?.get(norm(nombre)) || '-';
  const porSiDistinto = (m) => (m.por && m.por !== m.nombre ? m.por : '');

  // Menú de cada persona (para mostrarlo junto a su alergia)
  const menuDe = new Map();
  Object.entries(t.menus).forEach(([k, lista]) => lista.forEach((m) => {
    menuDe.set(`${m.nombre}|${m.por}`, k === 'otro' && m.extra ? `Otro: ${m.extra}` : MENU_LABELS[k]);
  }));

  subtitulo(ctx, 'Recuento por tipo de menú', pl(t.asisten.length, 'comensal', 'comensales'));
  const claves = Object.keys(t.menus);
  const sinMenu = t.asisten.length - claves.reduce((s, k) => s + t.menus[k].length, 0);
  const bodyMenus = claves.map((k) => [MENU_LABELS[k], t.menus[k].length]);
  if (sinMenu > 0) bodyMenus.push(['Sin indicar', sinMenu]);
  bodyMenus.push(['Total', t.asisten.length]);
  tabla(ctx, {
    head: ['Menú', 'Personas'],
    body: bodyMenus,
    fontSize: 10.5,
    filasTotal: [bodyMenus.length - 1],
    columnStyles: { 1: { halign: 'right', cellWidth: 30 } },
  });

  subtitulo(ctx, 'Alergias e intolerancias', pl(t.alergias.length, 'persona', 'personas'));
  if (!t.alergias.length) {
    aviso(ctx, 'Nadie ha declarado alergias ni intolerancias.');
  } else {
    tabla(ctx, {
      head: ['#', 'Persona', 'Alergia / intolerancia', 'Menú', 'Mesa', 'Confirmó'],
      body: t.alergias.map((m, i) => [
        i + 1, m.nombre, { content: m.extra, styles: { fontStyle: 'bold' } },
        menuDe.get(`${m.nombre}|${m.por}`) || '-', mesa(m.nombre), porSiDistinto(m),
      ]),
      fontSize: 10,
      columnStyles: { 0: { cellWidth: 8, halign: 'right' }, 1: { cellWidth: 38 }, 3: { cellWidth: 26 }, 4: { cellWidth: 24 }, 5: { cellWidth: 30 } },
    });
  }

  const especiales = ['vegetariano', 'vegano', 'otro'].flatMap((k) => t.menus[k].map((m) => ({ ...m, k })));
  subtitulo(ctx, 'Menús especiales', pl(especiales.length, 'persona', 'personas'));
  if (!especiales.length) {
    aviso(ctx, 'Todos los comensales llevan menú normal.');
  } else {
    tabla(ctx, {
      head: ['#', 'Persona', 'Menú', 'Detalle', 'Mesa', 'Confirmó'],
      body: especiales.map((m, i) => [
        i + 1, m.nombre, MENU_LABELS[m.k], m.k === 'otro' ? m.extra : '-', mesa(m.nombre), porSiDistinto(m),
      ]),
      fontSize: 10,
      columnStyles: { 0: { cellWidth: 8, halign: 'right' }, 1: { cellWidth: 40 }, 2: { cellWidth: 26 }, 4: { cellWidth: 24 }, 5: { cellWidth: 30 } },
    });
  }
}

/* =================================================================
   3 · TRANSPORTE Y HORARIOS
   ================================================================= */
function secTransporte(ctx, p) {
  seccion(ctx, 3, 'Transporte y horarios',
    'Autobús y flujo de llegadas y salidas según las confirmaciones. '
    + 'Cada entrada de la cronología es un formulario con sus personas; la hora es la aproximada que indicaron.');
  if (!p.rsvp?.ok) return avisoError(ctx, 'las confirmaciones', p.rsvp);
  const t = p.totales;

  subtitulo(ctx, 'Autobús');
  tabla(ctx, {
    head: ['Trayecto', 'Personas'],
    body: [['Ida', t.busIda.length], ['Vuelta', t.busVuelta.length]],
    fontSize: 10,
    columnStyles: { 1: { halign: 'right', cellWidth: 30 } },
  });
  const viajeros = new Map();
  [['ida', t.busIda], ['vuelta', t.busVuelta]].forEach(([k, lista]) => lista.forEach((m) => {
    const key = `${m.nombre}|${m.por}`;
    if (!viajeros.has(key)) viajeros.set(key, { ...m, ida: false, vuelta: false });
    viajeros.get(key)[k] = true;
  }));
  if (viajeros.size) {
    tabla(ctx, {
      head: ['#', 'Persona', 'Ida', 'Vuelta', 'Confirmó'],
      body: [...viajeros.values()].map((m, i) => [
        i + 1, m.nombre, m.ida ? 'Sí' : '-', m.vuelta ? 'Sí' : '-', m.por !== m.nombre ? m.por : '',
      ]),
      columnStyles: { 0: { cellWidth: 8, halign: 'right' }, 2: { cellWidth: 16, halign: 'center' }, 3: { cellWidth: 16, halign: 'center' } },
    });
  } else {
    aviso(ctx, 'Nadie ha pedido autobús todavía.');
  }

  [['llegadas', 'Llegadas'], ['salidas', 'Salidas']].forEach(([tipo, titulo]) => {
    const crono = buildCronologia(p.activos, tipo);
    subtitulo(ctx, `Cronología · ${titulo}`);
    if (!crono.dias.length && !crono.sinFecha.length) {
      aviso(ctx, 'Nada que mostrar todavía.');
      return;
    }
    crono.dias.forEach((dia) => {
      asegura(ctx, 22);
      parrafo(ctx, `${formatDia(dia.iso)} · ${pl(dia.personas, 'persona', 'personas')}`,
        { color: INK, size: 10, estilo: 'bold' });
      ctx.y -= 1;
      tabla(ctx, {
        head: ['Hora', 'Quién', 'Pers.', 'Detalle'],
        body: dia.entradas.map((e) => [e.time ? `~${e.time}` : 'sin hora', e.nombre, e.personas, describeEntrada(e, tipo, '')]),
        columnStyles: { 0: { cellWidth: 18 }, 1: { cellWidth: 50 }, 2: { cellWidth: 12, halign: 'right' } },
      });
    });
    if (crono.sinFecha.length) {
      const n = crono.sinFecha.reduce((s, e) => s + e.personas, 0);
      asegura(ctx, 22);
      parrafo(ctx, `Sin fecha/hora indicada · ${pl(n, 'persona', 'personas')}`, { color: INK, size: 10, estilo: 'bold' });
      ctx.y -= 1;
      tabla(ctx, {
        head: ['Quién', 'Pers.', 'Detalle'],
        body: crono.sinFecha.map((e) => [e.nombre, e.personas, describeEntrada(e, tipo, '')]),
        columnStyles: { 0: { cellWidth: 68 }, 1: { cellWidth: 12, halign: 'right' } },
      });
    }
  });
}

/* =================================================================
   4 · ALPARGATAS
   ================================================================= */
function secAlpargatas(ctx, p) {
  seccion(ctx, 4, 'Alpargatas',
    'Zapatos de recambio pedidos en las confirmaciones. Igual que en el panel, '
    + 'los marcados "sin talla" no cuentan en el total ni en el desglose.');
  if (!p.rsvp?.ok) return avisoError(ctx, 'las confirmaciones', p.rsvp);
  const t = p.totales;
  if (!t.zapatos.length && !t.zapatosSinTalla.length) return aviso(ctx, 'Nadie ha pedido alpargatas todavía.');

  const tallas = [...t.tallas.entries()]
    .sort((a, b) => (parseFloat(a[0]) || 999) - (parseFloat(b[0]) || 999));
  subtitulo(ctx, 'Recuento por talla', pl(t.zapatos.length, 'par', 'pares'));
  const body = tallas.map(([talla, lista]) => [talla, lista.length]);
  body.push(['Total', t.zapatos.length]);
  tabla(ctx, {
    head: ['Talla', 'Pares'],
    body,
    fontSize: 10.5,
    filasTotal: [body.length - 1],
    columnStyles: { 1: { halign: 'right', cellWidth: 30 } },
  });

  if (t.zapatos.length) {
    subtitulo(ctx, 'Quién las pide');
    tabla(ctx, {
      head: ['#', 'Persona', 'Talla', 'Confirmó'],
      body: t.zapatos.map((m, i) => [i + 1, m.nombre, m.extra.replace(/^talla /, ''), m.por !== m.nombre ? m.por : '']),
      columnStyles: { 0: { cellWidth: 8, halign: 'right' }, 2: { cellWidth: 20 } },
    });
  }
  if (t.zapatosSinTalla.length) {
    subtitulo(ctx, 'Sin talla · no contabilizadas', pl(t.zapatosSinTalla.length, 'persona', 'personas'));
    tabla(ctx, {
      head: ['#', 'Persona', 'Confirmó'],
      body: t.zapatosSinTalla.map((m, i) => [i + 1, m.nombre, m.por !== m.nombre ? m.por : '']),
      columnStyles: { 0: { cellWidth: 8, halign: 'right' } },
    });
  }
}

/* =================================================================
   5 · MESAS
   ================================================================= */
function secMesas(ctx, p) {
  seccion(ctx, 5, 'Mesas',
    'Reparto del banquete. En cada comensal se indica si viene a la preboda '
    + 'y su estado actual en la lista de invitados.');
  if (!p.mesas?.ok) return avisoError(ctx, 'mesas', p.mesas);
  if (!p.invitados?.ok) aviso(ctx, 'No se ha podido leer la lista de invitados: faltan los estados y la lista de personas sin asignar.');
  const mesas = p.mesas.data;

  const estadoDe = (c) => {
    if (c.manual) return 'A mano';
    if (!p.estados) return '-';
    const e = p.estados.get(c.key);
    return e ? ESTADO_LABEL[e] : 'Ya no está en la lista';
  };

  if (!mesas.length) {
    aviso(ctx, 'Todavía no hay mesas creadas.');
  } else {
    const sentados = mesas.reduce((s, m) => s + m.comensales.length, 0);
    const plazas = mesas.reduce((s, m) => s + m.capacidad, 0);
    const preboda = mesas.reduce((s, m) => s + m.comensales.filter((c) => c.preboda).length, 0);
    subtitulo(ctx, 'Resumen por mesa',
      `${pl(mesas.length, 'mesa', 'mesas')} · ${sentados}/${plazas} plazas · preboda ${preboda}`);
    const body = mesas.map((m) => {
      const si = m.comensales.filter((c) => c.preboda).length;
      return [m.nombre || '(sin nombre)', m.capacidad, `${m.comensales.length}/${m.capacidad}${m.comensales.length > m.capacidad ? ' (excede)' : ''}`,
        si, m.comensales.length - si];
    });
    body.push(['Total', plazas, `${sentados}/${plazas}`, preboda, sentados - preboda]);
    tabla(ctx, {
      head: ['Mesa', 'Capacidad', 'Ocupación', 'Preboda: sí', 'Preboda: no'],
      body,
      filasTotal: [body.length - 1],
      columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' } },
    });

    mesas.forEach((m) => {
      const si = m.comensales.filter((c) => c.preboda).length;
      subtitulo(ctx, m.nombre || '(sin nombre)',
        `${m.comensales.length}/${m.capacidad} ocupadas${m.comensales.length > m.capacidad ? ' (excede)' : ''} · preboda ${si}`);
      if (!m.comensales.length) {
        parrafo(ctx, 'Mesa vacía.');
        return;
      }
      tabla(ctx, {
        head: ['#', 'Comensal', 'Núcleo', 'Estado', 'Preboda'],
        body: m.comensales.map((c, i) => [
          i + 1, c.nombre, c.manual ? '(añadido a mano)' : c.nucleo, estadoDe(c),
          { content: c.preboda ? 'Sí' : 'No', styles: { fontStyle: 'bold', textColor: c.preboda ? VERDE : GRIS } },
        ]),
        colorCol: 3,
        columnStyles: { 0: { cellWidth: 8, halign: 'right' }, 3: { cellWidth: 30 }, 4: { cellWidth: 18, halign: 'center' } },
      });
    });
  }

  // Sin asignar: confirmados y pendientes que no están en ninguna mesa
  if (p.invitados?.ok) {
    const sentadas = new Set(mesas.flatMap((m) => m.comensales.map((c) => c.key)));
    const libres = [];
    p.invitados.data.forEach((n) => n.personas.forEach((per) => {
      if (per.estado === 'no_asiste' || sentadas.has(`${n.id}|${per.nombre}`)) return;
      libres.push([per.nombre + (per.nino ? ' (niño)' : ''), n.nombre, LADO_LABEL[n.lado], ESTADO_LABEL[per.estado]]);
    }));
    subtitulo(ctx, 'Personas sin asignar a ninguna mesa', pl(libres.length, 'persona', 'personas'));
    if (!libres.length) {
      parrafo(ctx, 'Nadie sin asignar: todo el mundo tiene mesa.');
    } else {
      tabla(ctx, {
        head: ['#', 'Persona', 'Núcleo', 'Lado', 'Estado'],
        body: libres.map((f, i) => [i + 1, ...f]),
        colorCol: 4,
        columnStyles: { 0: { cellWidth: 8, halign: 'right' }, 3: { cellWidth: 16 }, 4: { cellWidth: 24 } },
      });
    }
  }
}

/* =================================================================
   6 · HOTEL (solo estado de pago, ningún importe)
   ================================================================= */
function estadoHab(h) {
  if (!h.ocupantes.length) return 'Sin asignar';
  return h.pagado ? 'Pagada' : 'Sin pagar';
}

function secHotel(ctx, p) {
  seccion(ctx, 6, 'Hotel',
    'Habitaciones del bloqueo con sus ocupantes y su estado de pago. '
    + 'Las habitaciones sin ocupantes cuentan como "sin asignar".');
  if (!p.habitaciones?.ok) return avisoError(ctx, 'habitaciones', p.habitaciones);
  const habs = p.habitaciones.data;
  if (!habs.length) return aviso(ctx, 'Todavía no hay habitaciones cargadas.');

  const cuenta = { Pagada: 0, 'Sin pagar': 0, 'Sin asignar': 0 };
  habs.forEach((h) => { cuenta[estadoHab(h)] += 1; });
  subtitulo(ctx, 'Estado de pago', pl(habs.length, 'habitación', 'habitaciones'));
  tabla(ctx, {
    head: ['Estado', 'Habitaciones'],
    body: [...Object.entries(cuenta), ['Total', habs.length]],
    fontSize: 10,
    colorCol: 0,
    filasTotal: [3],
    columnStyles: { 1: { halign: 'right', cellWidth: 30 } },
  });

  subtitulo(ctx, 'Habitaciones');
  tabla(ctx, {
    head: ['#', 'Tipo', 'Fechas', 'Noches', 'Ocupantes', 'Estado'],
    body: habs.map((h, i) => [
      i + 1, `${TIPO_LABEL[h.tipo] || h.tipo}${h.cuna ? ' + cuna' : ''}`,
      `${fechaCorta(h.entrada)} - ${fechaCorta(h.salida)}`, h.noches,
      h.ocupantes.length ? h.ocupantes.join('\n') : '(pendiente de asignar)', estadoHab(h),
    ]),
    colorCol: 5,
    columnStyles: { 0: { cellWidth: 8, halign: 'right' }, 1: { cellWidth: 32 }, 2: { cellWidth: 25 }, 3: { cellWidth: 18, halign: 'right' }, 5: { cellWidth: 22 } },
  });
}

/* =================================================================
   7 · COMENTARIOS
   ================================================================= */
function secComentarios(ctx, p) {
  seccion(ctx, 7, 'Comentarios',
    'Comentarios libres que dejaron en el formulario de confirmación (asistan o no).');
  if (!p.rsvp?.ok) return avisoError(ctx, 'las confirmaciones', p.rsvp);
  const lista = p.activos.filter((d) => String(d.comentario || '').trim());
  if (!lista.length) return aviso(ctx, 'Nadie ha dejado comentarios.');
  tabla(ctx, {
    head: ['#', 'Quién', 'Asiste', 'Comentario'],
    body: lista.map((d, i) => [i + 1, d.filledBy || '-', d.attending === false ? 'No' : 'Sí', d.comentario.trim()]),
    fontSize: 9.5,
    columnStyles: { 0: { cellWidth: 8, halign: 'right' }, 1: { cellWidth: 38 }, 2: { cellWidth: 14, halign: 'center' } },
  });
}

/* =================================================================
   Portada (se dibuja al final, cuando ya se saben las páginas)
   ================================================================= */
function portada(ctx, p, generado) {
  const { doc } = ctx;
  doc.setPage(1);
  let y = 46;
  doc.setFont(SANS, 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...SOFT);
  doc.text('DATOS DE LA BODA', PAGE_W / 2, y, { align: 'center', charSpace: 1 });
  y += 16;
  doc.setFont(SERIF, 'italic');
  doc.setFontSize(34);
  doc.setTextColor(...BURDEOS);
  doc.text('María & Alberto', PAGE_W / 2, y, { align: 'center' });
  y += 10;
  doc.setFont(SERIF, 'normal');
  doc.setFontSize(13);
  doc.text('24 · 10 · 2026', PAGE_W / 2, y, { align: 'center' });
  y += 6;
  doc.setDrawColor(...BURDEOS);
  doc.setLineWidth(0.4);
  doc.line(PAGE_W / 2 - 20, y, PAGE_W / 2 + 20, y);
  y += 8;
  doc.setFont(SANS, 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(...SOFT);
  doc.text(`Generado el ${fechaHumana(generado)}`, PAGE_W / 2, y, { align: 'center' });
  y += 12;

  // Resumen de cifras globales
  const filas = [];
  const t = p.totales;
  const titulo = (s) => filas.push([{ content: s, colSpan: 2, styles: { fontStyle: 'bold', textColor: BURDEOS, fillColor: HEAD_FILL } }]);
  const dato = (label, valor) => filas.push([label, valor]);
  const noLeido = 'no se pudo leer';

  titulo('Invitados');
  if (p.invitados?.ok) {
    const per = p.invitados.data.flatMap((n) => n.personas);
    const c = (e) => per.filter((x) => x.estado === e).length;
    dato('Núcleos', p.invitados.data.length);
    dato('Personas', per.length);
    dato('Confirmadas · pendientes · no asisten', `${c('confirmado')} · ${c('pendiente')} · ${c('no_asiste')}`);
  } else dato('Invitados', noLeido);

  titulo('Confirmaciones por la web');
  if (p.rsvp?.ok) {
    dato('Formularios (último envío de cada uno)', t.confirmaciones.length);
    dato('Asisten · no asisten', `${t.asisten.length} · ${t.noAsisten.length}`);
    dato('Personas con alergias', t.alergias.length);
    dato('Menús especiales (veg., vegano, otro)', t.menus.vegetariano.length + t.menus.vegano.length + t.menus.otro.length);
    dato('Autobús ida · vuelta', `${t.busIda.length} · ${t.busVuelta.length}`);
    dato('Alpargatas', `${t.zapatos.length} pares`);
    dato('Comentarios', p.activos.filter((d) => String(d.comentario || '').trim()).length);
  } else dato('Confirmaciones', noLeido);

  titulo('Mesas');
  if (p.mesas?.ok) {
    const sentados = p.mesas.data.flatMap((m) => m.comensales);
    dato('Mesas · plazas', `${p.mesas.data.length} · ${p.mesas.data.reduce((s, m) => s + m.capacidad, 0)}`);
    dato('Sentados · vienen a la preboda', `${sentados.length} · ${sentados.filter((c) => c.preboda).length}`);
  } else dato('Mesas', noLeido);

  titulo('Hotel');
  if (p.habitaciones?.ok) {
    const h = p.habitaciones.data;
    const n = (e) => h.filter((x) => estadoHab(x) === e).length;
    dato('Habitaciones', h.length);
    dato('Pagadas · sin pagar · sin asignar', `${n('Pagada')} · ${n('Sin pagar')} · ${n('Sin asignar')}`);
  } else dato('Hotel', noLeido);

  autoTable(doc, {
    startY: y,
    body: filas.map((f) => f.map((c) => (typeof c === 'object' ? { ...c, content: txt(c.content) } : txt(c)))),
    margin: { left: 35, right: 35 },
    theme: 'plain',
    styles: { font: SANS, fontSize: 9.5, textColor: INK, cellPadding: { top: 1.3, bottom: 1.3, left: 2.5, right: 2.5 } },
    columnStyles: { 1: { halign: 'right', fontStyle: 'bold' } },
  });
  y = doc.lastAutoTable.finalY + 10;

  // Índice con enlaces (útil en el móvil: toca para saltar)
  doc.setFont(SERIF, 'bold');
  doc.setFontSize(13);
  doc.setTextColor(...BURDEOS);
  doc.text('Contenido', 35, y);
  y += 6;
  doc.setFont(SANS, 'normal');
  doc.setFontSize(10);
  ctx.secciones.forEach((s) => {
    doc.setTextColor(...INK);
    doc.textWithLink(`${s.num}.  ${txt(s.titulo)}`, 35, y, { pageNumber: s.pagina });
    doc.setTextColor(...SOFT);
    doc.text(`pág. ${s.pagina}`, PAGE_W - 35, y, { align: 'right' });
    y += 6;
  });

  if (p.descartados) {
    y += 4;
    doc.setFontSize(8);
    doc.setTextColor(...SOFT);
    const nota = doc.splitTextToSize(txt(
      `Confirmaciones deduplicadas como en el panel: ${pl(p.descartados.papelera, 'en papelera', 'en papelera')} `
      + `y ${pl(p.descartados.reenvios, 'reenvío antiguo', 'reenvíos antiguos')} descartados. `
      + 'Documento sin importes: no incluye dinero, regalos ni importes del hotel.'), PAGE_W - 70);
    doc.text(nota, 35, y);
  }
}

function fechaHumana(f) {
  return `${dd(f.getDate())}/${dd(f.getMonth() + 1)}/${f.getFullYear()} a las ${dd(f.getHours())}:${dd(f.getMinutes())}`;
}

/** Cabecera corrida y pie con "Página X de Y" en todas menos la portada. */
function cabecerasYPies(ctx, generado) {
  const { doc } = ctx;
  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i += 1) {
    doc.setPage(i);
    doc.setFont(SANS, 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...SOFT);
    if (i > 1) {
      const sec = [...ctx.secciones].reverse().find((s) => s.pagina <= i);
      doc.text('María & Alberto · 24·10·2026', M.left, 11);
      if (sec) doc.text(txt(`${sec.num} · ${sec.titulo}`), PAGE_W - M.right, 11, { align: 'right' });
      doc.setDrawColor(...LINE);
      doc.setLineWidth(0.2);
      doc.line(M.left, 13, PAGE_W - M.right, 13);
    }
    doc.text(`Datos de la boda · generado el ${fechaHumana(generado)}`, M.left, PAGE_H - 9);
    doc.text(`Página ${i} de ${total}`, PAGE_W - M.right, PAGE_H - 9, { align: 'right' });
  }
}

/* =================================================================
   API
   ================================================================= */
const SECCIONES = [
  ['Invitados', secInvitados],
  ['Alergias y menús', secCatering],
  ['Transporte y horarios', secTransporte],
  ['Alpargatas', secAlpargatas],
  ['Mesas', secMesas],
  ['Hotel', secHotel],
  ['Comentarios', secComentarios],
];
export const PASOS_PDF = SECCIONES.length + 1;

/**
 * Construye el PDF.
 * @param datos { rsvp, invitados, mesas, habitaciones } con { ok, data|error }
 * @param opts.generado Date de generación
 * @param opts.onPaso (etiqueta) => void tras cada sección (barra de progreso)
 * @returns jsPDF
 */
export async function construirPdf(datos, { generado = new Date(), onPaso = () => {} } = {}) {
  const p = preparar(datos);
  const ctx = crearContexto();

  for (const [nombre, fn] of SECCIONES) {
    try {
      fn(ctx, p);
    } catch (err) {
      // Un fallo inesperado en una sección no tumba el documento entero
      console.error(`[Exportar PDF] Error en la sección "${nombre}":`, err);
      aviso(ctx, `No se ha podido generar esta sección (${txt(err && err.message)}).`);
    }
    onPaso(nombre);
    await tick(); // deja respirar a la interfaz (barra de progreso)
  }

  portada(ctx, p, generado);
  cabecerasYPies(ctx, generado);
  onPaso('Portada');
  return ctx.doc;
}
