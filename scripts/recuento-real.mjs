/* =================================================================
   RECUENTO REAL de tipos y menús (SOLO LECTURA): lee "mesas", "plano"
   e "invitados" y comprueba que mesas.html, el Excel de la finca (el
   .xlsx generado, leído con ExcelJS), el PDF de la wedding planner y el
   PDF de datos dan las mismas cifras. No escribe nada en Firestore.

   Uso:  node scripts/recuento-real.mjs
   ================================================================= */

import { readFile } from 'node:fs/promises';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
import { loadEnv, firebaseConfig } from './lib/mesas-banquete.mjs';
import { toComensal, clavesNinos, recuentoMesas, TIPOS, MENUS } from '../src/modules/comensal.js';
import { FORMAS, numeroValido, completaPosiciones } from '../src/modules/plano-geom.js';
import { planificar, rellenarXlsx, HOJA } from '../src/modules/excel-finca.js';
import { resumenPlanner } from '../src/modules/pdf-planner.js';
import { construirPdf } from '../src/modules/export-pdf.js';

const app = initializeApp(firebaseConfig(loadEnv()));
await signInAnonymously(getAuth(app));
const db = getFirestore(app);
const leer = async (c) => (await getDocs(collection(db, c))).docs.map((d) => ({ id: d.id, ...d.data() }));
const [crudas, nucleosCrudos, planoDocs] = await Promise.all([leer('mesas'), leer('invitados'), leer('plano')]);
const nucleos = nucleosCrudos.map((n) => ({
  id: n.id, nombre: n.nombre || '', lado: n.lado || '', etiquetas: n.etiquetas || [],
  personas: (n.personas || []).map((p) => ({ nombre: String(p.nombre || ''), nino: p.nino === true, estado: p.estado || 'pendiente' })),
}));
const ninos = clavesNinos(nucleos);
crudas.sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));

// Forma de fetchMesas (mesas.html, PDF de datos) y de fetchMesasPlano (Excel, PDF planner)
const mesasM = crudas.map((m) => ({ ...m, capacidad: m.capacidad ?? 8, comensales: (m.comensales || []).map(toComensal) }));
const salon = planoDocs.find((d) => d.id === 'salon') || {};
const plano = { ancho: salon.ancho ?? 24, largo: salon.largo ?? 18 };
const mesasP = completaPosiciones(crudas.map((m) => ({
  id: m.id, nombre: m.nombre || '', capacidad: m.capacidad ?? 8, presidencial: m.presidencial === true,
  numero: numeroValido(m.numero), forma: FORMAS.includes(m.forma) ? m.forma : 'redonda',
  x: typeof m.x === 'number' ? m.x : null, y: typeof m.y === 'number' ? m.y : null, rot: m.rot || 0,
  asientos: Array.isArray(m.asientos) ? m.asientos.map(String) : null, asientoInicio: Number.isInteger(m.asientoInicio) ? m.asientoInicio : 0,
  comensales: (m.comensales || []).map((c) => ({
    key: String(c.key || ''), nombre: String(c.nombre || ''), estrella: c.estrella === true, nota: c.nota || '',
    ...(TIPOS.includes(c.tipo) ? { tipo: c.tipo } : {}), ...(MENUS.includes(c.menu) ? { menu: c.menu } : {}),
  })),
})), plano);

const fila = (nombre, t, m) => ({ sitio: nombre, comensales: t.total, adultos: t.adulto, ninos: t.nino, tronas: t.trona, huecos: t.hueco,
  'm.adulto': m.adulto, 'm.infantil': m.infantil, 'm.inf.reducido': m['infantil reducido'], 'm.sin menú': m['sin menú'] });

// 1 · mesas.html
const r1 = recuentoMesas(mesasM, ninos);
// 2 · Excel: plan y celdas del .xlsx generado
const plan = planificar(mesasP, nucleos);
const xlsx = await rellenarXlsx(JSZip, await readFile(new URL('../public/plantillas/INVITADOS_BASE.xlsx', import.meta.url)), plan);
const wb = new ExcelJS.Workbook();
await wb.xlsx.load(Buffer.from(xlsx));
const ws = wb.getWorksheet(HOJA);
// Valor en caché de las fórmulas, del XML (ExcelJS no devuelve un resultado 0)
const zip = await JSZip.loadAsync(xlsx);
const hojaXml = (await Promise.all(Object.keys(zip.files).filter((n) => /worksheets\/sheet\d+\.xml$/.test(n))
  .map((n) => zip.file(n).async('string')))).find((x) => x.includes('COUNTIF(C5:C17,"trona")'));
const res = (ref) => {
  const i = hojaXml.indexOf(`<c r="${ref}"`);
  const celda = hojaXml.slice(i, hojaXml.indexOf('</c>', i));
  return Number((celda.match(/<v>([^<]*)<\/v>/) || [])[1]);
};
let tronasCeldas = 0;
ws.eachRow((row) => row.eachCell((cell) => { if (cell.value === 'trona') tronasCeldas += 1; }));
// 3 · PDF planner
const r3 = resumenPlanner(mesasP, nucleos);
// 4 · PDF de datos (la tabla sale de este mismo recuento; se genera para comprobar que no falla)
await construirPdf({ rsvp: { ok: true, data: [] }, invitados: { ok: true, data: nucleos }, mesas: { ok: true, data: mesasM }, habitaciones: { ok: true, data: [] } });
const r4 = recuentoMesas(mesasM, ninos);

const filas = [
  fila('mesas.html', { total: r1.total, ...r1.tipos }, r1.menus),
  fila('Excel (plan)', { total: plan.resumen.comensales, adulto: plan.resumen.adultos, nino: plan.resumen.ninos, trona: plan.resumen.tronas, hueco: plan.resumen.huecos }, plan.resumen.menus),
  fila('Excel (.xlsx I7-I11)', { total: res('I7'), adulto: res('I8'), nino: res('I9'), trona: res('I11'), hueco: res('I10') }, plan.resumen.menus),
  fila('PDF planner', { total: r3.comensales, adulto: r3.adultos, nino: r3.ninos, trona: r3.tronas, hueco: r3.huecos }, r3.menus),
  fila('PDF de datos', { total: r4.total, ...r4.tipos }, r4.menus),
];
console.table(filas);
console.log(`Celdas "trona" en el .xlsx: ${tronasCeldas}`);
const iguales = filas.every((f) => JSON.stringify({ ...f, sitio: '' }) === JSON.stringify({ ...filas[0], sitio: '' }));
console.log(iguales ? '✓ Las cifras coinciden en los cuatro sitios.' : '✗ Las cifras NO coinciden.');
process.exit(iguales ? 0 : 1);
