/* =================================================================
   Pruebas del asiento 1 elegido, los invitados ★ con nota y su
   orientación hacia la mesa presidencial (sin Firestore: datos
   SINTÉTICOS, nada se lee ni se escribe en las mesas reales).
   Uso:  node scripts/test-destacados.mjs [carpeta-salida]
   ================================================================= */

import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  ordenPuestos, giraPuestos, intercambio, numAsiento, inicioAsientos, puestosNumerados,
  orientacionSilla, posSilla, estrellasMesa, hayEstrellaDeEspaldas, conDestacado, numPuestos,
} from '../src/modules/plano-geom.js';
import { toComensal, NOTA_MAX } from '../src/modules/comensal.js';
import { planificar } from '../src/modules/excel-finca.js';
import { construirPdfPlanner, puestosMesa, destacados } from '../src/modules/pdf-planner.js';
import { etiquetaPuesto, trozosEtiqueta } from '../src/modules/mesa-etiquetas.js';

const out = process.argv[2] || '.';
let ok = 0;
function t(nombre, fn) { fn(); ok += 1; console.log(`✓ ${nombre}`); }
const asyncT = async (nombre, fn) => { await fn(); ok += 1; console.log(`✓ ${nombre}`); };

const c = (key, extra = {}) => ({ key, nombre: key, nucleo: 'X', lado: 'novia', manual: false, preboda: true, ...extra });
const mesa = (id, extra = {}) => ({
  id, nombre: `Mesa ${id}`, capacidad: 8, forma: 'redonda', rot: 0, x: 10, y: 10, numero: 1,
  comensales: ['a', 'b', 'c', 'd', 'e', 'f'].map((k) => c(`${id}${k}`)), asientos: null, asientoInicio: 0, ...extra,
});
const PRES = { id: 'pres', nombre: 'Novios', presidencial: true, capacidad: 2, forma: 'rectangular', rot: 0, x: 10, y: 2, comensales: [] };

/* ---------- 1 · Asiento 1 ---------- */
t('por defecto el asiento 1 es la silla de arriba (0) y se numera como siempre', () => {
  const m = mesa('m');
  assert.equal(inicioAsientos(m), 0);
  assert.deepEqual(ordenPuestos(m).map((_, i) => numAsiento(m, i)), [1, 2, 3, 4, 5, 6, 7, 8]);
});

t('elegir el asiento 1 solo cambia los NÚMEROS: nadie se mueve', () => {
  const m = mesa('m', { asientos: ['ma', '', 'mb', 'mc', 'md', 'me', '', 'mf'] });
  const antes = ordenPuestos(m).map((x) => (x ? x.key : ''));
  const asientosAntes = [...m.asientos];
  m.asientoInicio = 3;
  assert.deepEqual(ordenPuestos(m).map((x) => (x ? x.key : '')), antes, 'cada persona sigue en su silla');
  assert.deepEqual(m.asientos, asientosAntes);
  assert.equal(numAsiento(m, 3), 1);
  assert.equal(numAsiento(m, 4), 2, 'sigue en el mismo sentido');
  assert.equal(numAsiento(m, 2), 8);
  const lista = puestosNumerados(m);
  assert.deepEqual(lista.map((p) => p.n), [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.deepEqual(lista.map((p) => p.i), [3, 4, 5, 6, 7, 0, 1, 2]);
  assert.equal(lista[0].c.key, 'mc', 'la lista empieza por quien está en el asiento 1');
});

t('asiento 1 fuera de rango (menos sillas) → se ajusta, sin romper nada', () => {
  const m = mesa('m', { asientoInicio: 11 });
  assert.equal(inicioAsientos(m), 3);
  assert.equal(new Set(puestosNumerados(m).map((p) => p.i)).size, numPuestos(m));
});

t('girar (⟲ ⟳) mueve a las personas, no la numeración', () => {
  const m = mesa('m', { asientoInicio: 2 });
  const enUno = ordenPuestos(m)[2].key;
  const enOcho = ordenPuestos(m)[1]?.key || '';
  m.asientos = giraPuestos(m, 1);
  assert.equal(m.asientoInicio, 2, 'el asiento 1 sigue siendo la misma silla');
  assert.equal(numAsiento(m, 2), 1);
  assert.equal(ordenPuestos(m)[3].key, enUno, 'quien estaba en el 1 pasa al 2');
  assert.equal(ordenPuestos(m)[2]?.key || '', enOcho, 'al 1 llega quien estaba en el 8');
  m.asientos = giraPuestos(m, -1);
  assert.equal(ordenPuestos(m)[2].key, enUno, 'y girar al revés lo deshace');
});

t('Excel de la finca: el orden empieza por el asiento 1 elegido', () => {
  const m = mesa('m', { asientoInicio: 4, numero: 3 });
  const plan = planificar([m, { ...PRES }], []);
  const bloque = plan.bloques.find((b) => b.n === 3);
  assert.deepEqual(bloque.personas.map((p) => p.nombre), ['me', 'mf', 'ma', 'mb', 'mc', 'md']);
});

/* ---------- 2 · Estrella y nota ---------- */
t('★ y nota se guardan SOLO en ese comensal (el resto, intacto)', () => {
  const lista = [c('a', { preboda: false }), c('b')];
  const nueva = conDestacado(lista, 'a', { estrella: true, nota: '  Hermana de la novia ' });
  assert.deepEqual(nueva[0], { ...lista[0], estrella: true, nota: 'Hermana de la novia' });
  assert.equal(nueva[1], lista[1]);
  const quitada = conDestacado(nueva, 'a', { estrella: false, nota: '' });
  assert.deepEqual(quitada[0], lista[0], 'quitar ★ y nota deja el comensal como estaba');
  assert.equal(conDestacado(lista, 'zz', { estrella: true }), null);
  const larga = conDestacado(lista, 'b', { estrella: false, nota: 'x'.repeat(80) });
  assert.equal(larga[1].nota.length, NOTA_MAX);
  assert.equal('estrella' in larga[1], false, 'nota sin estrella');
});

t('★ y nota sobreviven a mover de mesa (mesas.html), como la preboda', () => {
  const origen = mesa('o');
  const destino = mesa('d');
  origen.comensales = conDestacado(origen.comensales, 'oa', { estrella: true, nota: 'Abuela, movilidad reducida' });
  const comensal = origen.comensales.find((x) => x.key === 'oa');
  // mover(): se añade al destino y se quita del origen; al recargar pasa por toComensal
  destino.comensales = [...destino.comensales, comensal].map(toComensal);
  origen.comensales = origen.comensales.filter((x) => x !== comensal).map(toComensal);
  const movido = destino.comensales.find((x) => x.key === 'oa');
  assert.equal(movido.estrella, true);
  assert.equal(movido.nota, 'Abuela, movilidad reducida');
  assert.equal(movido.preboda, true);
  // Sin ★ ni nota, toComensal no añade campos
  assert.equal('estrella' in toComensal(c('z')) || 'nota' in toComensal(c('z')), false);
});

t('★ y nota sobreviven a girar y a intercambiar mesas', () => {
  const a = mesa('a');
  const b = mesa('b', { x: 15, y: 12, numero: 2 });
  a.comensales = conDestacado(a.comensales, 'ac', { estrella: true, nota: 'Prima del novio' });
  const antes = JSON.stringify(a.comensales);
  a.asientos = giraPuestos(a, 1);
  a.asientos = giraPuestos(a, 1);
  assert.equal(JSON.stringify(a.comensales), antes, 'girar solo cambia `asientos`');
  const cambios = intercambio(a, b);
  cambios.forEach((ch) => assert.deepEqual(Object.keys(ch).sort(), ['id', 'numero', 'rot', 'x', 'y']));
  const pc = ordenPuestos(a).find((x) => x && x.key === 'ac');
  assert.equal(pc.estrella, true);
  assert.equal(pc.nota, 'Prima del novio');
});

t('etiqueta del dibujo: "★ Nombre" + icono, que nunca se separan del nombre', () => {
  const e = etiquetaPuesto({ nombre: 'Tía Ana Mari', estrella: true }, 'espaldas');
  assert.ok(!/ (?=★)|★ /.test(e), 'la ★ va con espacio duro');
  assert.deepEqual(trozosEtiqueta(e), { estrella: true, texto: 'Tía Ana Mari', orient: 'espaldas' });
  assert.equal(etiquetaPuesto({ nombre: 'Pepe' }, 'cara'), 'Pepe');
});

/* ---------- 3 · Orientación ---------- */
// Presidencial ARRIBA (y = 2) y la mesa debajo (y = 10): quien se sienta
// en la parte de abajo mira hacia arriba, a los novios (de cara); quien
// está arriba les da la espalda.
const masCerca = (m) => ordenPuestos(m).map((_, i) => i)
  .sort((i, j) => Math.hypot(posSilla(m, i).x - PRES.x, posSilla(m, i).y - PRES.y)
    - Math.hypot(posSilla(m, j).x - PRES.x, posSilla(m, j).y - PRES.y));

t('redonda: la silla de enfrente (lado contrario a los novios) → de cara; la más cercana → de espaldas', () => {
  const m = mesa('m', { x: 10, y: 10 });
  const orden = masCerca(m);
  assert.equal(orientacionSilla(m, orden.at(-1), PRES), 'cara');
  assert.equal(orientacionSilla(m, orden[0], PRES), 'espaldas');
});

t('redonda girada 180°: se invierte (la misma silla pasa de espaldas a de cara)', () => {
  const m = mesa('m', { capacidad: 10 });
  const i = masCerca(m)[0];
  assert.equal(orientacionSilla(m, i, PRES), 'espaldas');
  m.rot = 180;
  assert.equal(orientacionSilla(m, i, PRES), 'cara');
  m.rot = 90;
  const o = orientacionSilla(m, i, PRES);
  assert.ok(o === 'lado', `girada 90° queda de lado (${o})`);
});

t('rectangular sin girar: lado de arriba de espaldas, abajo de cara, cabeceras de lado', () => {
  const m = mesa('r', { forma: 'rectangular', capacidad: 10, x: 10, y: 10, rot: 0 });
  // 10 puestos: 4 arriba, 1 dcha, 4 abajo, 1 izq
  [0, 1, 2, 3].forEach((i) => assert.equal(orientacionSilla(m, i, PRES), 'espaldas', `arriba ${i}`));
  [5, 6, 7, 8].forEach((i) => assert.equal(orientacionSilla(m, i, PRES), 'cara', `abajo ${i}`));
  [4, 9].forEach((i) => assert.equal(orientacionSilla(m, i, PRES), 'lado', `cabecera ${i}`));
});

t('rectangular girada 90°: el centro de los lados largos queda de lado; las cabeceras, una de cara y otra de espaldas', () => {
  const m = mesa('r', { forma: 'rectangular', capacidad: 10, x: 10, y: 10, rot: 90 });
  // Cada uno mira al CENTRO de su mesa: en los extremos de los lados
  // largos esa dirección ya se inclina (por eso se miran las centrales)
  [1, 2, 6, 7].forEach((i) => assert.equal(orientacionSilla(m, i, PRES), 'lado', `largo ${i}`));
  assert.equal(orientacionSilla(m, 0, PRES), 'espaldas', 'extremo del lado largo más cerca de los novios');
  // rot 90 (horario): la cabecera derecha (4) pasa abajo y la izquierda (9) arriba
  assert.equal(orientacionSilla(m, 4, PRES), 'cara');
  assert.equal(orientacionSilla(m, 9, PRES), 'espaldas');
});

t('mesa a un lado de los novios: la silla que mira hacia ellos → de cara', () => {
  const m = mesa('m', { x: 20, y: 2, forma: 'cuadrada', capacidad: 8, rot: 0 });
  // cuadrada de 8: 2 por lado; izquierda = 6, 7 (miran hacia +x, alejándose) → espaldas; derecha 2, 3 → cara
  assert.equal(orientacionSilla(m, 2, PRES), 'cara');
  assert.equal(orientacionSilla(m, 7, PRES), 'espaldas');
});

t('girar comensales cambia la orientación de cada persona (va con su silla)', () => {
  const m = mesa('m', { x: 10, y: 10 });
  const cerca = masCerca(m)[0];
  m.comensales = conDestacado(m.comensales, ordenPuestos(m)[cerca].key, { estrella: true });
  assert.ok(hayEstrellaDeEspaldas(m, PRES));
  m.asientos = giraPuestos(m, 4); // media vuelta en una mesa de 8
  assert.ok(!hayEstrellaDeEspaldas(m, PRES));
  assert.equal(estrellasMesa(m, PRES)[0].orient, 'cara');
});

t('sin presidencial, o en la propia presidencial: no hay orientación', () => {
  const m = mesa('m');
  assert.equal(orientacionSilla(m, 0, null), null);
  assert.equal(orientacionSilla(PRES, 0, PRES), null);
});

/* ---------- 4 · PDF para la wedding planner ---------- */
await asyncT('PDF: página «Invitados destacados» justo después del plano, por mesa, con nota y orientación', async () => {
  const pres = { ...PRES, capacidad: 4, comensales: [c('pn'), c('px')], numero: null };
  const m1 = mesa('m1', { numero: 1, x: 6, y: 9 });
  const m2 = mesa('m2', { numero: 2, x: 14, y: 9, forma: 'rectangular', capacidad: 10, asientoInicio: 5 });
  const m3 = mesa('m3', { numero: 3, x: 10, y: 14 });
  // m1: estrella en la silla más cercana (de espaldas) con nota
  const k1 = ordenPuestos(m1)[masCerca(m1)[0]].key;
  m1.comensales = conDestacado(m1.comensales, k1, { estrella: true, nota: 'Tía de la novia' });
  // m2: estrella abajo (de cara) y una nota sin estrella
  m2.asientos = ['m2a', 'm2b', '', '', '', 'm2c', 'm2d', 'm2e', '', 'm2f'];
  m2.comensales = conDestacado(m2.comensales, 'm2c', { estrella: true, nota: 'Prima del novio' });
  m2.comensales = conDestacado(m2.comensales, 'm2a', { estrella: false, nota: 'Vegetariana' });
  const mesas = [m3, m2, m1, pres];
  const nucleos = [];
  const { doc, informe } = await construirPdfPlanner({ mesas, plano: { ancho: 24, largo: 18 }, nucleos }, {
    generado: new Date(2026, 9, 22, 12, 0), compress: false,
  });
  const buf = Buffer.from(doc.output('arraybuffer'));
  writeFileSync(join(out, 'Plano_mesas_destacados_prueba.pdf'), buf);
  const texto = buf.toString('latin1');
  assert.equal(informe.destacados.pagina, 3, 'pág. 3: justo después del plano');
  assert.ok(texto.includes('Invitados destacados'));
  assert.deepEqual(informe.destacados.filas.map((f) => [f.mesa, f.nombre, f.orient]),
    [['m1', k1, 'espaldas'], ['m2', 'm2c', 'cara']], 'ordenadas por mesa');
  assert.equal(informe.destacados.espaldas, 1);
  assert.equal(informe.destacados.filas[1].n, 1, 'asiento según el asiento 1 elegido (m2: silla 5 = nº 1)');
  ['Tía de la novia', 'Prima del novio', 'Vegetariana', 'de espaldas', 'de cara', 'Hacia los novios', 'Nota']
    .forEach((s) => assert.ok(texto.includes(s), `el PDF lleva "${s}"`));
  // Fichas: lista desde el asiento 1, nota y orientación (solo ★)
  const f2 = informe.fichas.find((f) => f.id === 'm2');
  assert.equal(f2.lista[0].i, 5);
  assert.equal(f2.lista[0].n, 1);
  assert.equal(f2.lista[0].nombre, 'm2c');
  assert.equal(f2.lista[0].orient, 'cara');
  assert.equal(f2.lista.find((p) => p.nombre === 'm2a').orient, null, 'sin ★ no hay orientación');
  assert.equal(f2.lista.find((p) => p.nombre === 'm2a').nota, 'Vegetariana');
  // Dibujo: "★ Nombre" junto a la silla de la estrella
  const e = f2.dibujo.etiquetas.find((x) => x.i === 5);
  assert.ok(trozosEtiqueta(e.lineas[0]).estrella && e.lineas.join(' ').endsWith('m2c'));
  // Índice en la portada
  assert.ok(texto.includes('2.  Invitados destacados') || texto.includes('Invitados destacados'));
  // m1 y m3 siguen bien: el asiento 1 por defecto
  assert.deepEqual(puestosMesa(m3, new Set(), pres).map((p) => p.i), [0, 1, 2, 3, 4, 5, 6, 7]);
  assert.equal(destacados(mesas).length, 2);
  console.log(`   ${informe.paginas} páginas → ${join(out, 'Plano_mesas_destacados_prueba.pdf')}`);
});

await asyncT('PDF sin estrellas: la página existe y lo dice', async () => {
  const { doc, informe } = await construirPdfPlanner({ mesas: [mesa('m1'), { ...PRES }], plano: { ancho: 24, largo: 18 }, nucleos: [] }, { compress: false });
  const texto = Buffer.from(doc.output('arraybuffer')).toString('latin1');
  assert.equal(informe.destacados.pagina, 3);
  assert.ok(texto.includes('No hay invitados marcados con estrella.'));
});

console.log(`\n${ok} pruebas OK`);
