/* =================================================================
   Prueba del Excel para la finca con datos SINTÉTICOS (sin Firestore).
   Rellena la plantilla real (public/plantillas/INVITADOS_BASE.xlsx)
   con el mismo código que la web (JSZip) y la vuelve a leer con ExcelJS
   (lector independiente) para comprobar nombres, tipos, cabeceras,
   fórmulas, desplegables, protección y que la hoja "Ayuda" no cambia
   (además, todo lo que no es la hoja de mesas sale byte a byte igual).
   Uso:  node scripts/test-excel-finca.mjs
   ================================================================= */

import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import {
  planificar, rellenarXlsx, filaCabecera, nombreArchivo,
  HOJA, HOJA_AYUDA, BLOQUES, MAX_POR_BLOQUE, TIPO_NINO,
} from '../src/modules/excel-finca.js';

const PLANTILLA = new URL('../public/plantillas/INVITADOS_BASE.xlsx', import.meta.url);

let ok = 0;
async function t(nombre, fn) { await fn(); ok += 1; console.log(`✓ ${nombre}`); }

/* ---------- Datos sintéticos ---------- */
// Núcleos de invitados: cada mesa tiene su núcleo; algunos niños
const nucleos = [];
const mesas = [];
const persona = (nucleoId, nombre) => ({ key: `${nucleoId}|${nombre}`, nombre });
function mesa(id, nombre, numero, n, extra = {}) {
  const nuc = { id: `nuc-${id}`, personas: [] };
  for (let i = 1; i <= n; i++) nuc.personas.push({ nombre: `${nombre} ${i}`, nino: false, estado: 'confirmado' });
  nucleos.push(nuc);
  const m = {
    id, nombre, numero, capacidad: 10, presidencial: false, asientos: null,
    comensales: nuc.personas.map((p) => persona(nuc.id, p.nombre)), ...extra,
  };
  mesas.push(m);
  return { m, nuc };
}
const NOMBRES = ['Ámbar', 'Chuches', 'Espetos', 'Estrella', 'Guardia Civil', 'Huevo Gamba', 'Jamón',
  'Limón', 'Marinera', 'Melocotón', 'Naranja', 'Paparajote', 'Patatas', 'Uvas', 'Vermut'];

const novios = mesa('novios', 'Novios', null, 6, { presidencial: true });
// Mesas 1..12 con su número; la 3 con 16 personas (dos niños)
for (let i = 0; i < 12; i++) mesa(`m${i + 1}`, NOMBRES[i], i + 1, i === 2 ? 16 : 9, i === 2 ? { capacidad: 16 } : {});
const m3 = mesas.find((m) => m.numero === 3);
nucleos.find((n) => n.id === 'nuc-m3').personas[4].nino = true;   // 5.º comensal → B
nucleos.find((n) => n.id === 'nuc-m3').personas[7].nino = true;   // 8.º comensal → D
// Número repetido (5) y dos sin número
const dup = mesa('m13', NOMBRES[12], 5, 8).m;
const sinA = mesa('m14', NOMBRES[13], null, 10).m;
const sinB = mesa('m15', NOMBRES[14], null, 11, { capacidad: 10 }).m; // sobreaforo
// Orden de asientos del plano en Uvas: puesto 1 vacío, el 3.º primero
sinA.asientos = ['', sinA.comensales[2].key, sinA.comensales[0].key];
// Comensal añadido a mano (aunque se llame como un niño, no lleva tipo)
sinA.comensales.push({ key: 'manual|zz', nombre: 'Chuches 5' });
// Una persona sin mesa y otra que no asiste (esta no cuenta)
nucleos.push({ id: 'nuc-suelto', personas: [
  { nombre: 'Prima Lejana', nino: false, estado: 'pendiente' },
  { nombre: 'No Viene', nino: false, estado: 'no_asiste' },
] });
assert.equal(mesas.length, 16);

/* ---------- Plantilla original y rellena ---------- */
const bufPlantilla = await readFile(PLANTILLA);
const original = new ExcelJS.Workbook();
await original.xlsx.load(bufPlantilla);

const plan = planificar(mesas, nucleos);
const bufSalida = Buffer.from(await rellenarXlsx(JSZip, bufPlantilla, plan));
const salidaPath = join(tmpdir(), nombreArchivo(new Date(2026, 9, 14)));
await writeFile(salidaPath, Buffer.from(bufSalida));
const leido = new ExcelJS.Workbook();
await leido.xlsx.load(bufSalida);
const ws = leido.getWorksheet(HOJA);
const wsOrig = original.getWorksheet(HOJA);

/* ---------- Reparto ---------- */
await t('filas de cabecera leídas de la plantilla (Presidencia 4, Mesa 1 19, 15 229, 16 245, 30 455)', () => {
  assert.deepEqual([0, 1, 15, 16, 30].map(filaCabecera), [4, 19, 229, 245, 455]);
  for (let n = 0; n <= BLOQUES; n++) {
    assert.equal(wsOrig.getCell(`B${filaCabecera(n)}`).value, n === 0 ? 'Presidencia' : `Mesa ${n}`);
  }
});

await t('presidencial → Presidencia; número N → Mesa N; repetida y sin número → desde la 16', () => {
  const bloque = (m) => plan.bloques.find((b) => b.mesa === m).n;
  assert.equal(bloque(novios.m), 0);
  assert.equal(bloque(m3), 3);
  assert.equal(bloque(mesas.find((m) => m.numero === 5 && m !== dup)), 5);
  assert.equal(bloque(dup), 16);
  assert.equal(bloque(sinA), 17);
  assert.equal(bloque(sinB), 18);
  assert.equal(plan.bloques.length, 16, 'no se pierde ninguna mesa');
  assert.deepEqual(plan.errores, []);
});

await t('resumen previo y avisos (sin número, repetido, sobreaforo, sin mesa)', () => {
  // 6 + 11·9 + 16 + 8 + 11 (10 + 1 a mano) + 11
  assert.equal(plan.resumen.comensales, 6 + 11 * 9 + 16 + 8 + 11 + 11);
  assert.equal(plan.resumen.ninos, 2);
  assert.equal(plan.resumen.mesas, 16);
  const av = plan.avisos.join('\n');
  assert.match(av, /sin número.*Uvas → Mesa 17.*Vermut → Mesa 18/);
  assert.match(av, /Número 5 repetido.*Patatas.*Mesa 16/);
  assert.match(av, /Sobreaforo: .*Uvas \(11\/10\).*Vermut \(11\/10\)/);
  assert.match(av, /Una persona sin mesa.*Prima Lejana/);
  assert.doesNotMatch(av, /No Viene/);
});

await t('más de 26 en una mesa: error y no se genera', async () => {
  const grande = { id: 'g', nombre: 'Gigante', numero: 1, capacidad: 30, presidencial: false,
    comensales: Array.from({ length: MAX_POR_BLOQUE + 1 }, (_, i) => ({ key: `x|${i}`, nombre: `P${i}` })) };
  const p = planificar([grande], []);
  assert.equal(p.errores.length, 1);
  assert.match(p.errores[0], /Gigante.*27.*26/);
  await assert.rejects(() => rellenarXlsx(JSZip, bufPlantilla, p), /Gigante/);
  // 26 justos sí caben
  const justo = planificar([{ ...grande, comensales: grande.comensales.slice(0, 26) }], []);
  assert.deepEqual(justo.errores, []);
});

await t('plantilla con otra estructura: no escribe y avisa', async () => {
  const w = new ExcelJS.Workbook();
  await w.xlsx.load(bufPlantilla);
  w.getWorksheet(HOJA).getCell('B229').value = 'Otra cosa';
  const cambiada = await w.xlsx.writeBuffer();
  await assert.rejects(() => rellenarXlsx(JSZip, cambiada, planificar(mesas, nucleos)), /Mesa 15.*B229/);
});

await t('nombres con caracteres especiales (& < > " $) se escriben tal cual', async () => {
  const raro = 'Tom & Jerry <"$&$1">';
  const p = planificar([{ id: 'r', nombre: 'Rara & Cía', numero: 2, capacidad: 2, presidencial: false,
    comensales: [{ key: 'x|1', nombre: raro }] }], []);
  const w = new ExcelJS.Workbook();
  await w.xlsx.load(Buffer.from(await rellenarXlsx(JSZip, bufPlantilla, p)));
  assert.equal(w.getWorksheet(HOJA).getCell('B35').value, raro);
  assert.equal(w.getWorksheet(HOJA).getCell('B34').value, 'Mesa 2 · Rara & Cía');
});

/* ---------- Archivo rellenado ---------- */
await t('nombres en sus celdas, de dos en dos (B, D, B, D…)', () => {
  plan.bloques.forEach(({ n, personas }) => {
    const f = filaCabecera(n);
    for (let i = 0; i < MAX_POR_BLOQUE; i++) {
      const fila = f + 1 + Math.floor(i / 2);
      const col = i % 2 === 0 ? 'B' : 'D';
      assert.equal(ws.getCell(`${col}${fila}`).value ?? null, personas[i] ? personas[i].nombre : null, `${col}${fila}`);
    }
  });
  // Mesa 3 (cabecera 49): 16 personas en 8 filas (50-57); el 16.º en D57, B58 vacía
  assert.equal(ws.getCell('B50').value, 'Espetos 1');
  assert.equal(ws.getCell('D50').value, 'Espetos 2');
  assert.equal(ws.getCell('B51').value, 'Espetos 3');
  assert.equal(ws.getCell('D57').value, 'Espetos 16');
  assert.equal(ws.getCell('B58').value, null);
  // Presidencia
  assert.equal(ws.getCell('B5').value, 'Novios 1');
  assert.equal(ws.getCell('D7').value, 'Novios 6');
});

await t('orden de asientos del plano (huecos fuera) y tipo niño/a', () => {
  // Uvas: asientos ['', Uvas 3, Uvas 1]; como en el plano, quien no tiene
  // puesto ocupa el primer hueco (Uvas 2 en el puesto 1)
  const f = filaCabecera(17);
  assert.equal(ws.getCell(`B${f + 1}`).value, 'Uvas 2');
  assert.equal(ws.getCell(`D${f + 1}`).value, 'Uvas 3');
  assert.equal(ws.getCell(`B${f + 2}`).value, 'Uvas 1');
  assert.equal(ws.getCell(`D${f + 2}`).value, 'Uvas 4');
  // Puestos vacíos de verdad: no dejan hueco en el Excel
  const k = (i) => `nuc-x|P${i}`;
  const conHuecos = planificar([{ id: 'h', nombre: 'Huecos', numero: 1, capacidad: 6, presidencial: false,
    comensales: [1, 2, 3].map((i) => ({ key: k(i), nombre: `P${i}` })), asientos: ['', k(3), '', k(1), k(2), ''] }], []);
  assert.deepEqual(conHuecos.bloques[0].personas.map((p) => p.nombre), ['P3', 'P1', 'P2']);
  // Mesa 3 (cabecera 49): 5.º → B52 / C52, 8.º → D53 / E53
  assert.equal(ws.getCell('B52').value, 'Espetos 5');
  assert.equal(ws.getCell('C52').value, TIPO_NINO);
  assert.equal(ws.getCell('D53').value, 'Espetos 8');
  assert.equal(ws.getCell('E53').value, TIPO_NINO);
  // El resto de tipos vacíos; el comensal a mano tampoco lleva
  let tipos = 0;
  for (let n = 0; n <= BLOQUES; n++) {
    const f2 = filaCabecera(n);
    for (let r = f2 + 1; r <= f2 + 13; r++) ['C', 'E'].forEach((c) => { if (ws.getCell(`${c}${r}`).value) tipos += 1; });
  }
  assert.equal(tipos, 2);
});

await t('cabeceras: "Mesa N · nombre", "Presidencia" y bloques libres intactos', () => {
  assert.equal(ws.getCell('B4').value, 'Presidencia');
  assert.equal(ws.getCell('B49').value, 'Mesa 3 · Espetos');
  assert.equal(ws.getCell('B245').value, 'Mesa 16 · Patatas (nº 5 repetido)');
  assert.equal(ws.getCell('B260').value, 'Mesa 17 · Uvas (sin número)');
  assert.equal(ws.getCell('B229').value, 'Mesa 15', 'la 15 no tiene mesa: queda como en la plantilla');
  assert.equal(ws.getCell('B455').value, 'Mesa 30');
});

await t('fórmulas: las mismas que en la plantilla (cabeceras y Resumen)', () => {
  const formulas = (hoja) => {
    const m = new Map();
    hoja.eachRow((row) => row.eachCell((c) => { if (c.formula) m.set(c.address, c.formula); }));
    return m;
  };
  const fo = formulas(wsOrig);
  const fs = formulas(ws);
  assert.equal(fo.size, 31 + 6, 'plantilla: 31 COUNTA + 6 del Resumen (I5, I7-I11)');
  assert.deepEqual([...fs].sort(), [...fo].sort());
  for (let n = 0; n <= BLOQUES; n++) assert.match(ws.getCell(`E${filaCabecera(n)}`).formula, /^COUNTA\(/);
  ['I5', 'I7', 'I8', 'I9', 'I10', 'I11'].forEach((a) => { assert.ok(fo.has(a), a); assert.equal(fs.get(a), fo.get(a), a); });
});

await t('desplegables de tipo: las mismas 806 celdas con " ,niño/a,hueco,trona"', () => {
  const dvO = wsOrig.dataValidations.model;
  const dvS = ws.dataValidations.model;
  assert.equal(Object.keys(dvO).length, 31 * 2 * 13);
  assert.deepEqual(Object.keys(dvS).sort(), Object.keys(dvO).sort());
  Object.keys(dvO).forEach((k) => {
    assert.equal(dvS[k].type, 'list');
    assert.deepEqual(dvS[k].formulae, dvO[k].formulae, k);
  });
  assert.deepEqual(dvS.C5.formulae, ['" ,niño/a,hueco,trona"']);
});

await t('hoja "Ayuda" sin cambios (valores, fórmulas, estilos, notas, combinadas, imagen)', () => {
  const a = original.getWorksheet(HOJA_AYUDA);
  const b = leido.getWorksheet(HOJA_AYUDA);
  const vuelca = (h) => {
    const out = {};
    h.eachRow({ includeEmpty: true }, (row) => row.eachCell({ includeEmpty: true }, (c) => {
      out[c.address] = { v: c.value, s: c.style, n: c.note ?? null };
    }));
    return out;
  };
  assert.deepEqual(vuelca(b), vuelca(a));
  assert.deepEqual(Object.keys(b._merges).sort(), Object.keys(a._merges).sort());
  assert.deepEqual(b.columns.map((c) => c.width), a.columns.map((c) => c.width));
  assert.equal(b.getImages().length, a.getImages().length);
  assert.ok(a.getImages().length >= 1, 'la plantilla trae el logo');
});

await t('fuera de la hoja de mesas, el archivo es byte a byte la plantilla', async () => {
  const zO = await JSZip.loadAsync(bufPlantilla);
  const zS = await JSZip.loadAsync(bufSalida);
  const hojaMesas = 'xl/worksheets/sheet2.xml';
  const partes = (z) => Object.keys(z.files).filter((f) => !z.files[f].dir).sort();
  assert.deepEqual(partes(zS), partes(zO), 'mismas partes');
  for (const f of Object.keys(zO.files)) {
    if (zO.files[f].dir || f === hojaMesas || f === 'xl/workbook.xml') continue;
    const [a, b] = await Promise.all([zO.file(f).async('nodebuffer'), zS.file(f).async('nodebuffer')]);
    assert.ok(a.equals(b), `${f} ha cambiado`);
  }
  // workbook.xml: solo se añade fullCalcOnLoad
  const wbO = await zO.file('xl/workbook.xml').async('string');
  const wbS = await zS.file('xl/workbook.xml').async('string');
  assert.equal(wbS.replace(' fullCalcOnLoad="1"', ''), wbO);
  // Hoja de mesas: mismas fórmulas, desplegables, protección, vista,
  // columnas y filas (atributos de <row>: alturas…) que la plantilla
  const hO = await zO.file(hojaMesas).async('string');
  const hS = await zS.file(hojaMesas).async('string');
  const todos = (x, re) => [...x.matchAll(re)].map((m) => m[0]);
  assert.deepEqual(todos(hS, /<f>[\s\S]*?<\/f>/g), todos(hO, /<f>[\s\S]*?<\/f>/g));
  for (const re of [/<dataValidations[\s\S]*?<\/dataValidations>/g, /<sheetProtection[^>]*>/g,
    /<sheetViews>[\s\S]*?<\/sheetViews>/g, /<cols>[\s\S]*?<\/cols>/g, /<row [^>]*>/g,
    /<sheetPr[^>]*>/g, /<pageSetup[^>]*>/g, /<drawing [^>]*>/g, /<mergeCells[\s\S]*?<\/mergeCells>/g]) {
    assert.deepEqual(todos(hS, re), todos(hO, re), String(re));
  }
});

const xmlMesas = await (await JSZip.loadAsync(bufSalida)).file('xl/worksheets/sheet2.xml').async('string');
await t('valores en caché de las fórmulas (para vistas previas sin recálculo)', () => {
  // Leído del XML: ExcelJS no devuelve los resultados que valen 0
  const v = (a) => {
    const m = xmlMesas.match(new RegExp(`<c r="${a}"[^>]*>(<f>[\\s\\S]*?</f>)<v>(\\d+)</v></c>`));
    assert.ok(m, `${a} sin valor en caché`);
    return Number(m[2]);
  };
  plan.bloques.forEach(({ n, personas }) => assert.equal(v(`E${filaCabecera(n)}`), personas.length));
  assert.equal(v('E229'), 0);
  assert.equal(v('I7'), plan.resumen.comensales);
  assert.equal(v('I9'), 2);
  assert.equal(v('I8'), plan.resumen.comensales - 2);
  assert.equal(v('I5'), 15, 'mesas con gente sin contar Presidencia');
});

await t('protección de la hoja y recálculo al abrir', async () => {
  const zO = await JSZip.loadAsync(bufPlantilla);
  const zS = await JSZip.loadAsync(bufSalida);
  // Las dos hojas están protegidas (la de mesas, con contraseña)
  const prot = async (z, f) => {
    const m = (await z.file(f).async('string')).match(/<sheetProtection ([^>]*)\/>/);
    return m && Object.fromEntries([...m[1].matchAll(/(\w+)="([^"]*)"/g)].map(([, k, v]) => [k, v]));
  };
  const pO = await prot(zO, 'xl/worksheets/sheet2.xml');
  assert.ok(pO && pO.hashValue, 'la hoja de mesas está protegida con contraseña');
  assert.deepEqual(await prot(zS, 'xl/worksheets/sheet2.xml'), pO);
  assert.deepEqual(await prot(zS, 'xl/worksheets/sheet1.xml'), await prot(zO, 'xl/worksheets/sheet1.xml'));
  assert.match(await zS.file('xl/workbook.xml').async('string'), /fullCalcOnLoad="1"/);
  // Las dos hojas, en el mismo orden
  assert.deepEqual(leido.worksheets.map((w) => w.name), original.worksheets.map((w) => w.name));
});

await t('nombre del archivo', () => {
  assert.equal(nombreArchivo(new Date(2026, 9, 4)), 'Distribucion_mesas_Alberto_Maria_2026-10-04.xlsx');
});

console.log(`\n${ok} pruebas OK · archivo de prueba: ${salidaPath}`);
