/* =================================================================
   Pruebas del TIPO y el MENÚ de cada comensal (datos SINTÉTICOS: nada
   se lee ni se escribe en Firestore).
     · deducción (sin tipo/menú guardado) y etiqueta junto al nombre;
     · se conservan al mover de mesa, girar, intercambiar mesas, elegir
       el asiento 1 y al cambiar ★/nota/preboda;
     · las cifras coinciden en mesas.html, el Excel de la finca (también
       leído del .xlsx con ExcelJS), el PDF de la wedding planner y el
       PDF de datos (texto de los PDF);
     · la escritura de un comensal en transacción no pierde cambios con
       dos escrituras simultáneas en la misma mesa.
   Uso:  node scripts/test-menus.mjs
   ================================================================= */

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { inflateSync } from 'node:zlib';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import {
  toComensal, tipoDe, menuDe, etiquetaTipoMenu, recuentoMesas, clavesNinos,
  conCambiosComensal, cambiaComensalEnTx, TIPOS, MENUS,
} from '../src/modules/comensal.js';
import {
  giraPuestos, intercambio, ordenPuestos, conDestacado,
} from '../src/modules/plano-geom.js';
import { planificar, rellenarXlsx, filaCabecera, HOJA } from '../src/modules/excel-finca.js';
import { construirPdfPlanner, resumenPlanner, puestosMesa } from '../src/modules/pdf-planner.js';
import { construirPdf } from '../src/modules/export-pdf.js';

let ok = 0;
async function t(nombre, fn) { await fn(); ok += 1; console.log(`✓ ${nombre}`); }

/* ---------- Datos sintéticos ---------- */
// Núcleo con dos niños en invitados (uno sin tipo guardado → niño/a deducido)
const nucleos = [
  { id: 'n1', personas: [{ nombre: 'Ana', nino: false, estado: 'confirmado' }, { nombre: 'Peque', nino: true, estado: 'confirmado' },
    { nombre: 'Bebé', nino: true, estado: 'confirmado' }, { nombre: 'Bebé 2', nino: false, estado: 'confirmado' }] },
  { id: 'n2', personas: Array.from({ length: 8 }, (_, i) => ({ nombre: `Invitado ${i}`, nino: false, estado: 'confirmado' })) },
  { id: 'n3', personas: [{ nombre: 'Novio', nino: false, estado: 'confirmado' }, { nombre: 'Novia', nino: false, estado: 'confirmado' }] },
];
const ninos = clavesNinos(nucleos);
const c = (nuc, nombre, extra = {}) => ({ key: `${nuc}|${nombre}`, nombre, nucleo: nuc, lado: 'novia', manual: false, preboda: true, ...extra });
// Crudos tal cual en Firestore
const crudas = [
  { id: 'pres', nombre: 'Novios', capacidad: 2, presidencial: true, forma: 'rectangular', x: 12, y: 2, rot: 0,
    comensales: [c('n3', 'Novio'), c('n3', 'Novia')] },
  { id: 'a', nombre: 'Naranja', numero: 1, capacidad: 8, forma: 'redonda', x: 6, y: 9, rot: 0, asientos: null, asientoInicio: 0,
    comensales: [
      c('n1', 'Ana'),                                                    // adulto · adulto (sin nada)
      c('n1', 'Peque'),                                                  // niño/a (deducido) · infantil (deducido)
      c('n1', 'Bebé', { tipo: 'trona', menu: 'infantil reducido' }),     // trona · infantil reducido
      c('n1', 'Bebé 2', { tipo: 'trona', menu: 'sin menú', estrella: true, nota: 'bebé' }), // trona · sin menú
      { key: 'manual|h', nombre: 'Reservado', nucleo: '', lado: '', manual: true, preboda: false, tipo: 'hueco' }, // hueco · adulto
      c('n2', 'Invitado 0', { menu: 'infantil' }),                       // adulto · infantil
    ] },
  { id: 'b', nombre: 'Paparajote', numero: 2, capacidad: 9, forma: 'redonda', x: 18, y: 9, rot: 0, asientos: null, asientoInicio: 0,
    comensales: [1, 2, 3, 4, 5, 6, 7].map((i) => c('n2', `Invitado ${i}`, i === 3 ? { tipo: 'niño/a' } : {})) },  // niño/a guardado
];
// Formas que usan las páginas: mesas.html y el PDF de datos (fetchMesas →
// toComensal) y plano.html, el Excel y el PDF planner (fetchMesasPlano)
const formaMesas = (m) => ({ ...m, comensales: m.comensales.map(toComensal) });
const formaPlano = (m) => ({
  ...m,
  comensales: m.comensales.map((x) => ({
    key: String(x.key || ''), nombre: String(x.nombre || ''), estrella: x.estrella === true, nota: x.nota || '',
    ...(TIPOS.includes(x.tipo) ? { tipo: x.tipo } : {}), ...(MENUS.includes(x.menu) ? { menu: x.menu } : {}),
  })),
});
const ESPERADO = {
  total: 15,
  tipos: { adulto: 10, nino: 2, trona: 2, hueco: 1 },
  menus: { adulto: 10, infantil: 3, 'infantil reducido': 1, 'sin menú': 1 },
};

/* ---------- 1 · Deducción y etiqueta ---------- */
await t('los cuatro tipos y los cuatro menús; sin guardar se deducen', () => {
  const [ana, peque, bebe, bebe2, hueco, adultoInf] = crudas[1].comensales.map(toComensal);
  assert.deepEqual([tipoDe(ana, ninos), menuDe(ana, ninos)], ['', 'adulto']);
  assert.deepEqual([tipoDe(peque, ninos), menuDe(peque, ninos)], ['niño/a', 'infantil']);
  assert.deepEqual([tipoDe(bebe, ninos), menuDe(bebe, ninos)], ['trona', 'infantil reducido']);
  assert.deepEqual([tipoDe(bebe2, ninos), menuDe(bebe2, ninos)], ['trona', 'sin menú'], 'el tipo guardado manda sobre invitados');
  assert.deepEqual([tipoDe(hueco, ninos), menuDe(hueco, ninos)], ['hueco', 'adulto']);
  assert.deepEqual([tipoDe(adultoInf, ninos), menuDe(adultoInf, ninos)], ['', 'infantil']);
  // Trona sin menú guardado → infantil; '' guardado = adulto aunque en invitados sea niño
  assert.equal(menuDe({ key: 'x', tipo: 'trona' }, ninos), 'infantil');
  assert.equal(tipoDe({ key: 'n1|Peque', tipo: '' }, ninos), '');
  // Un añadido a mano nunca es niño por invitados
  assert.equal(tipoDe({ key: 'manual|n1|Peque' }, ninos), '');
});

await t('etiqueta junto al nombre solo si no es adulto con menú de adulto', () => {
  const [ana, peque, bebe, bebe2, hueco, adultoInf] = crudas[1].comensales.map(toComensal);
  assert.equal(etiquetaTipoMenu(ana, ninos), '');
  assert.equal(etiquetaTipoMenu(peque, ninos), 'niño/a · infantil');
  assert.equal(etiquetaTipoMenu(bebe, ninos), 'trona · infantil reducido');
  assert.equal(etiquetaTipoMenu(bebe2, ninos), 'trona · sin menú');
  assert.equal(etiquetaTipoMenu(hueco, ninos), 'hueco · adulto');
  assert.equal(etiquetaTipoMenu(adultoInf, ninos), 'adulto · infantil');
});

await t('valores no válidos: ni se leen ni se escriben', () => {
  const x = toComensal({ key: 'k', nombre: 'X', tipo: 'bebé', menu: 'vegano' });
  assert.ok(!('tipo' in x) && !('menu' in x));
  assert.throws(() => conCambiosComensal([{ key: 'k' }], 'k', { tipo: 'bebé' }));
  assert.throws(() => conCambiosComensal([{ key: 'k' }], 'k', { menu: 'vegano' }));
});

/* ---------- 2 · Se conservan ---------- */
const conTipos = (lista) => lista.filter((x) => 'tipo' in x || 'menu' in x).map((x) => [x.key, x.tipo, x.menu]);

await t('mover de mesa (mesas.html: el mismo objeto pasa a la otra lista) conserva tipo y menú', () => {
  const [a, b] = [formaMesas(crudas[1]), formaMesas(crudas[2])];
  const bebe = a.comensales[2];
  // Lo que hace mover(): añadir al destino, quitar del origen y guardar las dos listas
  const destino = [...b.comensales, bebe].map(toComensal);   // lo que vuelve de Firestore
  assert.deepEqual(destino.at(-1), toComensal(crudas[1].comensales[2]));
  assert.equal(destino.at(-1).tipo, 'trona');
  assert.equal(destino.at(-1).menu, 'infantil reducido');
  assert.equal(destino.at(-1).preboda, true);
  // Y al volver a leerlo (round-trip por toComensal), igual
  assert.deepEqual(toComensal(JSON.parse(JSON.stringify(destino.at(-1)))), destino.at(-1));
});

await t('girar, intercambiar mesas y elegir asiento 1 no tocan los comensales', () => {
  const m = formaPlano(crudas[1]);
  const antes = JSON.stringify(m.comensales);
  const asientos = giraPuestos(m, 3);
  const girada = { ...m, asientos };
  assert.equal(JSON.stringify(girada.comensales), antes);
  assert.deepEqual(conTipos(ordenPuestos(girada).filter(Boolean)).sort(), conTipos(m.comensales).sort());
  const cambios = intercambio(m, formaPlano(crudas[2]));
  cambios.forEach((ch) => assert.deepEqual(Object.keys(ch).sort(), ['id', 'numero', 'rot', 'x', 'y']));
  const uno = { ...m, asientoInicio: 4 };
  assert.equal(JSON.stringify(uno.comensales), antes);
});

await t('cambiar ★, nota, preboda, tipo o menú de uno no toca los demás campos ni a los demás', () => {
  const lista = crudas[1].comensales;
  const l1 = conDestacado(lista, 'n1|Bebé', { estrella: true, nota: 'trona junto a mamá' });
  assert.equal(l1[2].tipo, 'trona');
  assert.equal(l1[2].menu, 'infantil reducido');
  const l2 = conCambiosComensal(l1, 'n1|Bebé', { preboda: false });
  assert.deepEqual({ ...l2[2], preboda: true }, l1[2]);
  const l3 = conCambiosComensal(l2, 'n1|Ana', { tipo: 'niño/a', menu: 'infantil reducido' });
  assert.deepEqual(l3.filter((_, i) => i !== 0), l2.filter((_, i) => i !== 0));
  assert.deepEqual(l3[0], { ...l2[0], tipo: 'niño/a', menu: 'infantil reducido' });
  assert.equal(conCambiosComensal(l3, 'no-existe', { tipo: '' }), null);
});

/* ---------- 3 · Las mismas cifras en los cuatro sitios ---------- */
const mesasM = crudas.map(formaMesas);
const mesasP = crudas.map(formaPlano);

/** Texto de un PDF: descomprime los flujos y une los literales (…) Tj. */
function textoPdf(bytes) {
  const raw = Buffer.from(bytes).toString('latin1');
  let todo = raw;
  for (const m of raw.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
    try { todo += inflateSync(Buffer.from(m[1], 'latin1')).toString('latin1'); } catch { /* sin comprimir */ }
  }
  return [...todo.matchAll(/\(((?:\\.|[^\\)])*)\)\s*Tj/g)].map((m) => m[1].replace(/\\(.)/g, '$1')).join('\n');
}

await t('mesas.html (recuentoMesas sobre fetchMesas)', () => {
  assert.deepEqual(recuentoMesas(mesasM, ninos), ESPERADO);
  // misma cifra con la forma de plano.html
  assert.deepEqual(recuentoMesas(mesasP, ninos), ESPERADO);
});

await t('Excel de la finca: tipos en la columna y Resumen (I7-I11) con las mismas cifras', async () => {
  const plan = planificar(mesasP, nucleos);
  assert.equal(plan.resumen.comensales, ESPERADO.total);
  assert.equal(plan.resumen.ninos, ESPERADO.tipos.nino);
  assert.equal(plan.resumen.tronas, ESPERADO.tipos.trona);
  assert.equal(plan.resumen.huecos, ESPERADO.tipos.hueco);
  assert.equal(plan.resumen.adultos, ESPERADO.tipos.adulto);
  assert.deepEqual(plan.resumen.menus, ESPERADO.menus);
  const bytes = await rellenarXlsx(JSZip, await readFile(new URL('../public/plantillas/INVITADOS_BASE.xlsx', import.meta.url)), plan);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(Buffer.from(bytes));
  const ws = wb.getWorksheet(HOJA);
  // Tipo de cada persona en su celda (Naranja = Mesa 1)
  const f = filaCabecera(1);
  const celdas = [];
  for (let r = f + 1; r <= f + 13; r++) {
    [['B', 'C'], ['D', 'E']].forEach(([n, tcol]) => {
      const nombre = ws.getCell(`${n}${r}`).value;
      if (nombre) celdas.push([nombre, ws.getCell(`${tcol}${r}`).value || '']);
    });
  }
  assert.deepEqual(Object.fromEntries(celdas), {
    Ana: '', Peque: 'niño/a', 'Bebé': 'trona', 'Bebé 2': 'trona', Reservado: 'hueco', 'Invitado 0': '',
  });
  const cache = (ref) => ws.getCell(ref).value.result;
  assert.equal(cache('I7'), ESPERADO.total);
  assert.equal(cache('I8'), ESPERADO.tipos.adulto);
  assert.equal(cache('I9'), ESPERADO.tipos.nino);
  assert.equal(cache('I10'), ESPERADO.tipos.hueco);
  assert.equal(cache('I11'), ESPERADO.tipos.trona);
  // Y lo que calcularía Excel con la fórmula de la plantilla (COUNTIF del texto)
  let tronas = 0;
  ws.eachRow((row) => row.eachCell((cell) => { if (cell.value === 'trona') tronas += 1; }));
  assert.equal(tronas, ESPERADO.tipos.trona);
});

await t('PDF wedding planner: portada por tipo y por menú, y tipo · menú en la ficha', async () => {
  const r = resumenPlanner(mesasP, nucleos);
  assert.deepEqual({ adulto: r.adultos, nino: r.ninos, trona: r.tronas, hueco: r.huecos }, ESPERADO.tipos);
  assert.deepEqual(r.menus, ESPERADO.menus);
  assert.equal(r.comensales, ESPERADO.total);
  const lista = puestosMesa(mesasP[1], ninos);
  assert.deepEqual(lista.filter((p) => p.nombre).map((p) => p.etiqueta),
    ['', 'niño/a · infantil', 'trona · infantil reducido', 'trona · sin menú', 'hueco · adulto', 'adulto · infantil']);
  const { doc } = await construirPdfPlanner({ mesas: mesasP, plano: { ancho: 24, largo: 18 }, nucleos }, { compress: false });
  const texto = textoPdf(doc.output('arraybuffer'));
  // Ficha: la etiqueta junto al comensal (la celda parte «infantil / reducido» en dos líneas)
  ['Por tipo', 'Por menú', 'Tipo · menú', 'trona · sin menú', 'trona · infantil', 'reducido',
    'niño/a · infantil', 'hueco · adulto'].forEach((x) => assert.ok(texto.includes(x), `falta «${x}» en el PDF`));
  // Portada: cada cifra en la celda siguiente a su etiqueta
  const lineas = texto.split(/\n/);
  const tras = (label) => Number(lineas[lineas.indexOf(label) + 1]);
  assert.deepEqual(
    ['Comensales', 'Adultos', 'Niños', 'Tronas', 'Huecos', 'Menú adulto', 'Menú infantil', 'Infantil reducido', 'Sin menú'].map(tras),
    [ESPERADO.total, ESPERADO.tipos.adulto, ESPERADO.tipos.nino, ESPERADO.tipos.trona, ESPERADO.tipos.hueco,
      ESPERADO.menus.adulto, ESPERADO.menus.infantil, ESPERADO.menus['infantil reducido'], ESPERADO.menus['sin menú']]);
});

await t('PDF de datos: recuento por tipo y por menú en «Alergias y menús», en «Mesas» y en la portada', async () => {
  const datos = {
    rsvp: { ok: true, data: [] }, invitados: { ok: true, data: nucleos.map((n) => ({ ...n, nombre: n.id, lado: 'novia', etiquetas: [] })) },
    mesas: { ok: true, data: mesasM }, habitaciones: { ok: true, data: [] },
  };
  const doc = await construirPdf(datos);
  const texto = textoPdf(doc.output('arraybuffer'));
  const veces = (s) => texto.split(s).length - 1;
  assert.ok(veces('Banquete: comensales por tipo y por men\xfa') >= 2, 'en las dos secciones');
  const e = ESPERADO;
  assert.ok(texto.includes(`${e.tipos.adulto} \xb7 ${e.tipos.nino} \xb7 ${e.tipos.trona} \xb7 ${e.tipos.hueco}`), 'portada: tipos');
  assert.ok(texto.includes(`${e.menus.adulto} \xb7 ${e.menus.infantil} \xb7 ${e.menus['infantil reducido']} \xb7 ${e.menus['sin menú']}`), 'portada: menús');
  assert.ok(texto.includes('Bebé 2 (trona \xb7 sin men\xfa)'.replace('é', '\xe9')), 'comensal con su tipo en la tabla de la mesa');
});

/* ---------- 4 · Transacción: dos escrituras a la vez en la misma mesa ---------- */
/** Firestore de mentira con la semántica de runTransaction: lecturas dentro
    de la transacción y, si el documento cambió entre la lectura y el
    commit, se repite (control optimista, como el SDK). */
function fakeFirestore(datos) {
  const doc = { datos: structuredClone(datos), version: 0 };
  const espera = (ms) => new Promise((r) => setTimeout(r, ms));
  let intentos = 0;
  async function runTransaction(fn, latencia) {
    for (let i = 0; i < 5; i++) {
      intentos += 1;
      let leida = null;
      const escrituras = [];
      const tx = {
        async get() { await espera(latencia); leida = doc.version; const d = structuredClone(doc.datos); return { exists: () => true, data: () => d }; },
        update(_ref, cambios) { escrituras.push(cambios); },
      };
      const r = await fn(tx);
      await espera(latencia);
      if (leida !== doc.version) continue; // otra escritura entró: se repite
      escrituras.forEach((ch) => { doc.datos = { ...doc.datos, ...ch }; doc.version += 1; });
      return r;
    }
    throw new Error('demasiados reintentos');
  }
  /** Escritura SIN transacción (leer y luego escribir), para comparar. */
  async function leerYEscribir(key, cambios, latencia) {
    await espera(latencia);
    const lista = structuredClone(doc.datos.comensales);
    await espera(latencia);
    doc.datos = { ...doc.datos, comensales: conCambiosComensal(lista, key, cambios) };
    doc.version += 1;
  }
  return { doc, runTransaction, leerYEscribir, intentos: () => intentos };
}

await t('dos escrituras simultáneas en la misma mesa: con transacción no se pisan', async () => {
  const fs = fakeFirestore({ nombre: 'Naranja', comensales: crudas[1].comensales });
  await Promise.all([
    fs.runTransaction((tx) => cambiaComensalEnTx(tx, 'ref', 'n1|Ana', { tipo: 'trona', menu: 'sin menú' }), 5),
    fs.runTransaction((tx) => cambiaComensalEnTx(tx, 'ref', 'n2|Invitado 0', { menu: 'infantil reducido' }), 7),
    fs.runTransaction((tx) => cambiaComensalEnTx(tx, 'ref', 'n1|Peque', { estrella: true, nota: 'cumple' }), 3),
  ]);
  const final = fs.doc.datos.comensales;
  assert.equal(final[0].tipo, 'trona');
  assert.equal(final[0].menu, 'sin menú');
  assert.equal(final[5].menu, 'infantil reducido');
  assert.equal(final[1].estrella, true);
  assert.equal(final[1].nota, 'cumple');
  // El resto, intacto
  assert.deepEqual(final[2], crudas[1].comensales[2]);
  assert.deepEqual(final[3], crudas[1].comensales[3]);
  assert.ok(fs.intentos() > 3, 'alguna transacción se ha tenido que repetir');
  // Sin transacción, la segunda escritura borra la primera (por eso se usa)
  const sin = fakeFirestore({ nombre: 'Naranja', comensales: crudas[1].comensales });
  await Promise.all([
    sin.leerYEscribir('n1|Ana', { tipo: 'trona' }, 5),
    sin.leerYEscribir('n2|Invitado 0', { menu: 'infantil reducido' }, 6),
  ]);
  const perdida = sin.doc.datos.comensales;
  assert.ok(!(perdida[0].tipo === 'trona' && perdida[5].menu === 'infantil reducido'), 'sin transacción se pierde un cambio');
});

await t('si el comensal ya no está en la mesa, la transacción no escribe', async () => {
  const fs = fakeFirestore({ nombre: 'Naranja', comensales: crudas[1].comensales });
  const r = await fs.runTransaction((tx) => cambiaComensalEnTx(tx, 'ref', 'n9|Nadie', { tipo: 'trona' }), 1);
  assert.equal(r, null);
  assert.equal(fs.doc.version, 0);
});

console.log(`\n${ok} pruebas OK`);
