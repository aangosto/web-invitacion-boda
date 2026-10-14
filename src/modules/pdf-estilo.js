/* =================================================================
   ESTILO COMÚN DE LOS PDF (jsPDF + autotable).

   Lo comparten "Exportar PDF" (export-pdf.js) y el PDF del plano para
   la wedding planner (pdf-planner.js): paleta burdeos, títulos en serif,
   cabeceras de tabla rosa pálido, portada, cabecera corrida y pie con
   "Página X de Y". Módulo PURO (sin DOM ni Firebase): se prueba en Node.
   ================================================================= */

/* ---------- Identidad visual (sobria: poca tinta) ---------- */
export const BURDEOS = [110, 36, 53];
export const INK = [63, 58, 50];
export const SOFT = [109, 97, 82];
export const HEAD_FILL = [244, 234, 236];   // rosa muy claro en las cabeceras
export const STRIPE = [250, 247, 245];
export const LINE = [214, 204, 198];
export const VERDE = [47, 107, 58];
export const AMBAR = [138, 90, 0];
export const GRIS = [140, 134, 126];

export const SERIF = 'times';      // títulos (eco de Cormorant Garamond)
export const SANS = 'helvetica';   // texto y tablas (eco de Jost)

/** Márgenes (mm) de todas las páginas, verticales u horizontales. */
export const M = { top: 20, bottom: 18, left: 14, right: 14 };

export const NOVIOS = 'María & Alberto';
export const FECHA_BODA = '24 · 10 · 2026';
export const CABECERA = 'María & Alberto · 24·10·2026';

/* Las fuentes estándar de PDF solo cubren Latin-1: se sustituyen los
   signos tipográficos habituales y se quitan emojis y demás. */
const SUSTITUTOS = {
  '—': '-', '–': '-', '‘': "'", '’': "'", '“': '"', '”': '"', '„': '"',
  '…': '...', '•': '·', '→': '->', '←': '<-', '€': 'EUR', '✓': 'si', '✗': 'no',
};
export function txt(v) {
  return String(v ?? '')
    .replace(/[^\n\x20-\xFF]/g, (c) => SUSTITUTOS[c] ?? (/\s/.test(c) ? ' ' : ''))
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

export const pl = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;
export const dd = (n) => String(n).padStart(2, '0');
export const tick = () => new Promise((r) => setTimeout(r, 0));

/** Fecha local 'aaaa-mm-dd' (para el nombre del archivo). */
export function fechaArchivo(fecha = new Date()) {
  return `${fecha.getFullYear()}-${dd(fecha.getMonth() + 1)}-${dd(fecha.getDate())}`;
}

export function fechaHumana(f) {
  return `${dd(f.getDate())}/${dd(f.getMonth() + 1)}/${f.getFullYear()} a las ${dd(f.getHours())}:${dd(f.getMinutes())}`;
}

/** Medidas de la página actual (vertical u horizontal). */
export function pagina(doc) {
  const s = doc.internal.pageSize;
  return { w: s.getWidth(), h: s.getHeight() };
}

/** Opciones de autoTable con el estilo común (se mezclan con las propias). */
export function estiloTabla({ fontSize = 9 } = {}) {
  return {
    theme: 'grid',
    styles: {
      font: SANS, fontSize, textColor: INK, cellPadding: { top: 1.6, bottom: 1.6, left: 2, right: 2 },
      lineColor: LINE, lineWidth: 0.15, valign: 'top', overflow: 'linebreak',
    },
    headStyles: { fillColor: HEAD_FILL, textColor: BURDEOS, fontStyle: 'bold', lineColor: LINE },
    alternateRowStyles: { fillColor: STRIPE },
  };
}

/**
 * Cabecera de la portada: rótulo pequeño en versalitas, los nombres en
 * serif cursiva, la fecha, una línea y "Generado el…". Devuelve la y
 * donde sigue el contenido.
 */
export function portadaCabecera(doc, etiqueta, generado, y = 46) {
  const cx = pagina(doc).w / 2;
  doc.setFont(SANS, 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...SOFT);
  doc.text(etiqueta, cx, y, { align: 'center', charSpace: 1 });
  y += 16;
  doc.setFont(SERIF, 'italic');
  doc.setFontSize(34);
  doc.setTextColor(...BURDEOS);
  doc.text(NOVIOS, cx, y, { align: 'center' });
  y += 10;
  doc.setFont(SERIF, 'normal');
  doc.setFontSize(13);
  doc.text(FECHA_BODA, cx, y, { align: 'center' });
  y += 6;
  doc.setDrawColor(...BURDEOS);
  doc.setLineWidth(0.4);
  doc.line(cx - 20, y, cx + 20, y);
  y += 8;
  doc.setFont(SANS, 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(...SOFT);
  doc.text(`Generado el ${fechaHumana(generado)}`, cx, y, { align: 'center' });
  return y + 12;
}

/**
 * Cabecera corrida y pie con "Página X de Y" en todas menos la portada.
 *   pie:      texto del pie a la izquierda (todas las páginas)
 *   derecha:  (página) => texto de la cabecera a la derecha (o '')
 */
export function cabecerasYPies(doc, { pie, derecha = () => '' }) {
  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i += 1) {
    doc.setPage(i);
    const { w, h } = pagina(doc);
    doc.setFont(SANS, 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...SOFT);
    if (i > 1) {
      doc.text(CABECERA, M.left, 11);
      const dcha = derecha(i);
      if (dcha) doc.text(txt(dcha), w - M.right, 11, { align: 'right' });
      doc.setDrawColor(...LINE);
      doc.setLineWidth(0.2);
      doc.line(M.left, 13, w - M.right, 13);
    }
    doc.text(pie, M.left, h - 9);
    doc.text(`Página ${i} de ${total}`, w - M.right, h - 9, { align: 'right' });
  }
}
