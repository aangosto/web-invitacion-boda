/* =================================================================
   EXCEL PARA LA FINCA — lógica pura (sin DOM ni Firestore; la usan
   export-finca.js en el navegador y scripts/test-excel-finca.mjs en
   Node).

   Se RELLENA la plantilla oficial de La Bastilla
   (public/plantillas/INVITADOS_BASE.xlsx), no se genera un Excel nuevo.
   Edición QUIRÚRGICA del .xlsx (un zip de XML) con JSZip, no con
   ExcelJS: reescribir el libro con ExcelJS ocultaba los globos del
   tutorial de "Ayuda", perdía uno de ellos (H76) y alteraba alturas de
   fila, vista y configuración de impresión. Aquí solo cambian:
     · en la hoja de mesas, las celdas de nombre/tipo (texto en línea,
       con el MISMO estilo que traían) y el texto de las cabeceras;
     · el valor EN CACHÉ de las fórmulas (el <v>, nunca la <f>), para
       que las vistas previas que no recalculan (móvil) no enseñen 0;
     · workbook.xml: fullCalcOnLoad="1" (Excel recalcula al abrir).
   Todo lo demás (hoja "Ayuda", estilos, imágenes, comentarios,
   desplegables, protección…) sale byte a byte igual.

   Hoja "distribucion de mesas", columnas B-E:
     · "Presidencia": cabecera en la fila 4.
     · "Mesa N": cabecera en la fila 4+15·N (N=1..15) y 5+15·N
       (N=16..30). Sitios en las 13 filas siguientes a cada cabecera.
     · Cada fila, dos sitios: B nombre / C tipo, D nombre / E tipo
       (26 personas por bloque). Tipo: " ", "niño/a", "hueco", "trona".
   ================================================================= */

import { ordenPuestos } from './plano-geom.js';

export const HOJA = 'distribucion de mesas';
export const HOJA_AYUDA = 'Ayuda';
export const BLOQUES = 30;
export const FILAS_BLOQUE = 13;
export const MAX_POR_BLOQUE = FILAS_BLOQUE * 2;
/** Primer bloque para las mesas sin número (las numeradas van del 1 al 15). */
export const PRIMER_LIBRE = 16;
export const TIPO_NINO = 'niño/a';

/** Fila de la cabecera del bloque n (0 = Presidencia, 1..30 = Mesa n). */
export function filaCabecera(n) {
  if (n === 0) return 4;
  return n <= 15 ? 4 + 15 * n : 5 + 15 * n;
}

/** Texto que trae la plantilla en la cabecera del bloque n. */
export function rotuloPlantilla(n) {
  return n === 0 ? 'Presidencia' : `Mesa ${n}`;
}

/** Nombre del archivo: Distribucion_mesas_Alberto_Maria_AAAA-MM-DD.xlsx */
export function nombreArchivo(fecha = new Date()) {
  const p = (v) => String(v).padStart(2, '0');
  return `Distribucion_mesas_Alberto_Maria_${fecha.getFullYear()}-${p(fecha.getMonth() + 1)}-${p(fecha.getDate())}.xlsx`;
}

/** Niños: keys '<nucleoId>|<nombre>' (la misma que usa mesas.html) de
    las personas marcadas como niño en la lista de invitados. */
export function clavesNinos(nucleos = []) {
  const ninos = new Set();
  nucleos.forEach((n) => (n.personas || []).forEach((p) => {
    if (p.nino === true) ninos.add(`${n.id}|${p.nombre}`);
  }));
  return ninos;
}
/** ¿Es niño/a este comensal? (los añadidos a mano nunca lo son) */
export function esNino(c, ninos) {
  return !String(c.key).startsWith('manual|') && ninos.has(c.key);
}

/**
 * Prepara el reparto en bloques, sin tocar ningún Excel.
 *   mesas:   [{ id, nombre, numero, presidencial, capacidad,
 *              comensales: [{ key, nombre }], asientos }]   (orden de mesas.html)
 *   nucleos: colección invitados ([{ id, personas: [{ nombre, nino, estado }] }])
 * Devuelve { bloques: [{ n, mesa, cabecera, personas: [{ nombre, tipo }] }],
 *            avisos: [texto], errores: [texto],
 *            resumen: { mesas, comensales, ninos } }.
 * `errores` no vacío = no se puede generar el archivo.
 */
export function planificar(mesas, nucleos = []) {
  const avisos = [];
  const errores = [];

  const ninos = clavesNinos(nucleos);
  const asignables = [];
  nucleos.forEach((n) => (n.personas || []).forEach((p) => {
    if (p.estado !== 'no_asiste') asignables.push({ key: `${n.id}|${p.nombre}`, nombre: p.nombre });
  }));

  // Bloque de cada mesa: presidencial → 0; número N → N; el resto (sin
  // número o con número repetido) → primeros libres desde la 16
  const ocupados = new Map();
  const pendientes = [];
  const sinNumero = [];
  const repetidas = [];
  const pres = mesas.filter((m) => m.presidencial);
  if (pres.length) ocupados.set(0, pres[0]);
  else avisos.push('No hay mesa presidencial marcada: el bloque «Presidencia» irá vacío.');
  pres.slice(1).forEach((m) => pendientes.push(m));
  mesas.forEach((m) => {
    if (m.presidencial) return;
    const n = Number.isInteger(m.numero) && m.numero >= 1 && m.numero <= 15 ? m.numero : null;
    if (n == null) { sinNumero.push(m); pendientes.push(m); return; }
    if (ocupados.has(n)) { repetidas.push([n, ocupados.get(n), m]); pendientes.push(m); return; }
    ocupados.set(n, m);
  });
  const destino = new Map(); // mesa.id → n
  ocupados.forEach((m, n) => destino.set(m.id, n));
  let libre = PRIMER_LIBRE;
  pendientes.forEach((m) => {
    while (libre <= BLOQUES && ocupados.has(libre)) libre += 1;
    if (libre > BLOQUES) {
      errores.push(`«${m.nombre}» no cabe: la plantilla solo tiene ${BLOQUES} mesas.`);
      return;
    }
    ocupados.set(libre, m);
    destino.set(m.id, libre);
  });

  if (sinNumero.length) {
    avisos.push(`Mesas sin número (van a los bloques libres desde «Mesa ${PRIMER_LIBRE}»): `
      + `${sinNumero.map((m) => `${m.nombre} → Mesa ${destino.get(m.id) ?? '—'}`).join(', ')}.`);
  }
  repetidas.forEach(([n, primera, otra]) => {
    avisos.push(`Número ${n} repetido: «${primera.nombre}» va a «Mesa ${n}» y «${otra.nombre}» a «Mesa ${destino.get(otra.id) ?? '—'}».`);
  });

  const sobre = mesas.filter((m) => m.comensales.length > m.capacidad);
  if (sobre.length) {
    avisos.push(`Sobreaforo: ${sobre.map((m) => `${m.nombre} (${m.comensales.length}/${m.capacidad})`).join(', ')}.`);
  }
  const sentados = new Set(mesas.flatMap((m) => m.comensales.map((c) => c.key)));
  const sinMesa = asignables.filter((p) => !sentados.has(p.key));
  if (sinMesa.length) {
    avisos.push(`${sinMesa.length === 1 ? 'Una persona sin mesa' : `${sinMesa.length} personas sin mesa`} en Mesas del banquete: `
      + `${sinMesa.map((p) => p.nombre).join(', ')}.`);
  }

  // Personas de cada bloque: orden de asientos del plano (si lo hay) o
  // el de la lista; los puestos vacíos no ocupan sitio en el Excel
  const bloques = [];
  let comensales = 0;
  let numNinos = 0;
  [...destino].sort((a, b) => a[1] - b[1]).forEach(([id, n]) => {
    const mesa = mesas.find((m) => m.id === id);
    const personas = ordenPuestos(mesa).filter(Boolean).map((c) => {
      const tipo = esNino(c, ninos) ? TIPO_NINO : '';
      return { nombre: String(c.nombre || '').trim() || '(sin nombre)', tipo };
    });
    if (personas.length > MAX_POR_BLOQUE) {
      errores.push(`«${mesa.nombre}» tiene ${personas.length} comensales y en el Excel de la finca caben ${MAX_POR_BLOQUE} por mesa.`);
    }
    comensales += personas.length;
    numNinos += personas.filter((p) => p.tipo === TIPO_NINO).length;
    // En un bloque que no es el suyo, se dice por qué (sin número / repetido)
    let nota = '';
    if (n !== 0 && mesa.numero !== n) nota = Number.isInteger(mesa.numero) ? ` (nº ${mesa.numero} repetido)` : ' (sin número)';
    const cabecera = n === 0 ? 'Presidencia' : `Mesa ${n} · ${mesa.nombre}${nota}`;
    bloques.push({ n, mesa, cabecera, personas });
  });

  return { bloques, avisos, errores, resumen: { mesas: bloques.length, comensales, ninos: numNinos } };
}

/* ---------- Escritura en el .xlsx (zip de XML) ---------- */

const escXml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const desXml = (s) => String(s).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
  .replace(/&apos;/g, "'").replace(/&amp;/g, '&');
const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Ruta (dentro del zip) de la hoja llamada `nombre`. */
async function rutaHoja(zip, nombre) {
  const wb = await zip.file('xl/workbook.xml').async('string');
  const hoja = [...wb.matchAll(/<sheet\b[^>]*>/g)].map((m) => m[0])
    .find((t) => desXml((t.match(/\bname="([^"]*)"/) || [])[1] || '') === nombre);
  const rid = hoja && (hoja.match(/\br:id="([^"]*)"/) || [])[1];
  if (!rid) throw new Error(`La plantilla no tiene la hoja «${nombre}».`);
  const rels = await zip.file('xl/_rels/workbook.xml.rels').async('string');
  const rel = [...rels.matchAll(/<Relationship\b[^>]*>/g)].map((m) => m[0])
    .find((t) => t.includes(`Id="${rid}"`));
  const target = rel && (rel.match(/\bTarget="([^"]*)"/) || [])[1];
  if (!target) throw new Error(`No encuentro el XML de la hoja «${nombre}».`);
  return target.startsWith('/') ? target.slice(1) : `xl/${target}`;
}

/** Textos de sharedStrings.xml (índice → texto, uniendo los tramos con formato). */
async function textosCompartidos(zip) {
  const f = zip.file('xl/sharedStrings.xml');
  if (!f) return [];
  const xml = await f.async('string');
  return [...xml.matchAll(/<si>([\s\S]*?)<\/si>/g)]
    .map((m) => [...m[1].matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((t) => desXml(t[1])).join(''));
}

/** Celda <c r="ref" …/> o <c r="ref" …>…</c>: { completo, attrs, dentro } o null. */
function buscaCelda(xml, ref) {
  const m = xml.match(new RegExp(`<c r="${reEsc(ref)}"([^>]*?)(?:/>|>([\\s\\S]*?)</c>)`));
  return m ? { completo: m[0], attrs: m[1], dentro: m[2] ?? '' } : null;
}

/** Texto que muestra una celda (cadena compartida, en línea o valor). */
function textoCelda(celda, compartidos) {
  if (!celda) return null;
  const t = (celda.attrs.match(/\bt="([^"]*)"/) || [])[1];
  if (t === 's') {
    const v = (celda.dentro.match(/<v>([^<]*)<\/v>/) || [])[1];
    return v == null ? null : compartidos[Number(v)] ?? null;
  }
  if (t === 'inlineStr') {
    return [...celda.dentro.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((x) => desXml(x[1])).join('');
  }
  const v = (celda.dentro.match(/<v>([^<]*)<\/v>/) || [])[1];
  return v == null ? null : desXml(v);
}

/**
 * Rellena la plantilla y devuelve el .xlsx (Uint8Array).
 *   JSZip:      el constructor de JSZip (se pasa para cargarlo lazy)
 *   plantilla:  ArrayBuffer/Uint8Array/Buffer con INVITADOS_BASE.xlsx
 * Comprueba antes que la plantilla tiene la estructura esperada (lanza
 * un Error si no, para no escribir en celdas equivocadas).
 */
export async function rellenarXlsx(JSZip, plantilla, plan) {
  if (plan.errores.length) throw new Error(plan.errores.join(' '));
  const zip = await JSZip.loadAsync(plantilla);
  const ruta = await rutaHoja(zip, HOJA);
  const compartidos = await textosCompartidos(zip);
  let xml = await zip.file(ruta).async('string');

  // Estructura: cabecera con su rótulo en B y COUNTA en E; celdas de sitio presentes
  for (let n = 0; n <= BLOQUES; n++) {
    const f = filaCabecera(n);
    const e = buscaCelda(xml, `E${f}`);
    if (textoCelda(buscaCelda(xml, `B${f}`), compartidos) !== rotuloPlantilla(n) || !e || !/<f>COUNTA\(/.test(e.dentro)) {
      throw new Error(`La plantilla ha cambiado: no encuentro «${rotuloPlantilla(n)}» en B${f}.`);
    }
  }

  /** Pone texto en una celda existente conservando su estilo (s="…"). */
  const ponTexto = (ref, texto) => {
    const c = buscaCelda(xml, ref);
    if (!c) throw new Error(`La plantilla ha cambiado: falta la celda ${ref}.`);
    const attrs = c.attrs.replace(/\s+t="[^"]*"/, '');
    const nueva = `<c r="${ref}"${attrs} t="inlineStr"><is><t xml:space="preserve">${escXml(texto)}</t></is></c>`;
    xml = xml.replace(c.completo, () => nueva);
  };
  /** Cambia SOLO el valor en caché de una fórmula (la <f> no se toca). */
  const ponCache = (ref, num) => {
    const c = buscaCelda(xml, ref);
    if (!c || !/<f[\s>]/.test(c.dentro)) return;
    const attrs = c.attrs.replace(/\s+t="[^"]*"/, '');
    const dentro = /<v>[^<]*<\/v>/.test(c.dentro)
      ? c.dentro.replace(/<v>[^<]*<\/v>/, `<v>${num}</v>`)
      : `${c.dentro}<v>${num}</v>`;
    xml = xml.replace(c.completo, () => `<c r="${ref}"${attrs}>${dentro}</c>`);
  };

  const cuenta = new Map(); // n → personas en el bloque
  plan.bloques.forEach(({ n, cabecera, personas }) => {
    const f = filaCabecera(n);
    if (cabecera !== rotuloPlantilla(n)) ponTexto(`B${f}`, cabecera);
    personas.forEach((p, i) => {
      const fila = f + 1 + Math.floor(i / 2);
      const [colNombre, colTipo] = i % 2 === 0 ? ['B', 'C'] : ['D', 'E'];
      ponTexto(`${colNombre}${fila}`, p.nombre);
      if (p.tipo) ponTexto(`${colTipo}${fila}`, p.tipo);
    });
    cuenta.set(n, personas.length);
  });

  // Valores en caché (lo mismo que calculan las fórmulas de la plantilla)
  let total = 0;
  let mesasConGente = 0;
  for (let n = 0; n <= BLOQUES; n++) {
    const c = cuenta.get(n) || 0;
    ponCache(`E${filaCabecera(n)}`, c);
    total += c;
    if (n > 0 && c > 0) mesasConGente += 1;
  }
  const ninos = plan.bloques.reduce((s, b) => s + b.personas.filter((p) => p.tipo === TIPO_NINO).length, 0);
  ponCache('I5', mesasConGente);   // mesas (sin Presidencia) con alguien
  ponCache('I7', total);           // invitados
  ponCache('I8', total - ninos);   // adultos (= I7 - niños - huecos - tronas)
  ponCache('I9', ninos);
  ponCache('I10', 0);              // huecos
  ponCache('I11', 0);              // tronas
  zip.file(ruta, xml);

  // Excel recalcula cabeceras y Resumen al abrir
  let wbXml = await zip.file('xl/workbook.xml').async('string');
  if (/<calcPr\b/.test(wbXml)) {
    wbXml = wbXml.replace(/<calcPr\b([^>]*?)(\/?)>/, (m, attrs, cierre) => `<calcPr${attrs.replace(/\s+fullCalcOnLoad="[^"]*"/, '')} fullCalcOnLoad="1"${cierre}>`);
  } else {
    // calcPr va después de sheets/definedNames
    const tras = wbXml.includes('</definedNames>') ? '</definedNames>' : '</sheets>';
    wbXml = wbXml.replace(tras, () => `${tras}<calcPr fullCalcOnLoad="1"/>`);
  }
  zip.file('xl/workbook.xml', wbXml);

  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}
