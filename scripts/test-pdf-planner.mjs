/* Prueba en Node del PDF "Plano de mesas" para la wedding planner, con
   datos SINTÉTICOS (sin Firebase, nada se lee ni se escribe en
   Firestore): 16 mesas, una rectangular, una de 16 personas, nombres
   largos, niños, huecos y una mesa girada.
   Uso: node scripts/test-pdf-planner.mjs [carpeta-salida] [plano.jpg]
   (el plano rasterizado solo existe en el navegador; sin él, la página
   del plano lleva un recuadro de relleno).                            */

import { writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  construirPdfPlanner, nombreArchivo, ordenFichas, tituloMesa, resumenPlanner,
} from '../src/modules/pdf-planner.js';
import { planificar } from '../src/modules/excel-finca.js';
import { colocarFincaSinSolapes, numPuestos } from '../src/modules/plano-geom.js';

const out = process.argv[2] || '.';
const planoJpg = process.argv[3];
let fallos = 0;
const ok = (cond, msg) => { console.log(`${cond ? '✓' : '✗'} ${msg}`); if (!cond) fallos += 1; };

/* ---------- Datos sintéticos ---------- */
const NOMBRES = ['María de los Ángeles Fernández-Villaverde', 'Íñigo Muñoz', 'Begoña Sáez Ortega', 'Ángel Núñez',
  'Lucía Gómez', 'Jesús Peña Caballero', 'Carmen Ruiz', 'Óscar Díaz', 'Maximiliano Bustamante Echeverría',
  'Ana', 'Pepe', 'Concepción Rodríguez de la Fuente'];
//          nombre, capacidad, sentados, forma, rot
const DEF = [['Novios', 8, 8, 'redonda', 0, true], ['Ámbar', 10, 10], ['Chuches', 14, 13, 'rectangular', 0],
  ['Espetos', 16, 16], ['Estrella', 10, 9], ['Guardia Civil', 11, 11], ['Huevo Gamba', 12, 12],
  ['Jamón con chorreras', 9, 7], ['Limón', 10, 10], ['Marinera', 9, 9], ['Melocotón', 10, 10, 'redonda', 30],
  ['Naranja', 11, 11], ['Paparajote', 11, 10], ['Patatas', 11, 11], ['Uvas', 8, 8, 'cuadrada', 0], ['Vermut', 10, 10]];
const nucleos = [];
const mesas = DEF.map(([nombre, capacidad, sentados, forma = 'redonda', rot = 0, presidencial = false], i) => {
  const nuc = { id: `n${i}`, nombre: `Familia ${nombre}`, personas: [] };
  const comensales = Array.from({ length: sentados }, (_, k) => {
    const persona = `${NOMBRES[(i * 5 + k) % NOMBRES.length]} ${i}-${k}`;
    nuc.personas.push({ nombre: persona, nino: k % 7 === 5, estado: 'confirmado' });
    return { key: `n${i}|${persona}`, nombre: persona, nucleo: nuc.nombre, preboda: true };
  });
  nucleos.push(nuc);
  if (i === 9) comensales.push({ key: 'manual|f', nombre: 'Fotógrafo', manual: true, preboda: false }); // sobreaforo
  // Orden de asientos con un hueco en medio (Estrella)
  const asientos = i === 4 ? ['', ...comensales.map((c) => c.key)] : null;
  return {
    id: `m${i}`, nombre, capacidad, comensales, asientos, forma, rot, presidencial,
    numero: presidencial ? null : (i === 13 ? null : i), x: null, y: null,
  };
});
const plano = { ancho: 24, largo: 18 };
const col = colocarFincaSinSolapes(mesas, plano);
ok(col.ok, 'mesas colocadas como el plano de la finca (sin solapes)');
col.pos.forEach((p, id) => Object.assign(mesas.find((m) => m.id === id), p));
mesas.filter((m) => m.x == null).forEach((m, k) => Object.assign(m, { x: 3 + k * 4, y: 15 }));

/* ---------- Generación ---------- */
const imagen = planoJpg ? (() => {
  const b = readFileSync(planoJpg);
  // Medidas del JPEG (marcador SOF)
  let i = 2;
  while (i < b.length && !(b[i] === 0xff && b[i + 1] >= 0xc0 && b[i + 1] <= 0xc2)) i += 2 + b.readUInt16BE(i + 2);
  return { dataUrl: `data:image/jpeg;base64,${b.toString('base64')}`, alto: b.readUInt16BE(i + 5), ancho: b.readUInt16BE(i + 7) };
})() : null;
const pasos = [];
const t0 = performance.now();
const { doc, informe } = await construirPdfPlanner({ mesas, plano, nucleos }, {
  generado: new Date(2026, 9, 14, 18, 30), imagen, compress: false, onPaso: (p) => pasos.push(p),
});
const buf = Buffer.from(doc.output('arraybuffer'));
const ms = Math.round(performance.now() - t0);
const ruta = join(out, nombreArchivo(new Date(2026, 9, 14)));
writeFileSync(ruta, buf);
ok(true, `${informe.paginas} páginas, ${Math.round(buf.length / 1024)} KB en ${ms} ms → ${ruta}`);

/* ---------- Comprobaciones ---------- */
ok(nombreArchivo(new Date(2026, 9, 14)) === 'Plano_mesas_Maria_Alberto_2026-10-14.pdf', 'nombre del archivo');
ok(pasos.length === mesas.length + 3, `${pasos.length} pasos de progreso`);

const orient = [];
for (let p = 1; p <= doc.getNumberOfPages(); p++) {
  doc.setPage(p);
  const s = doc.internal.pageSize;
  orient.push(s.getWidth() > s.getHeight() ? 'H' : 'V');
}
ok(orient[0] === 'V' && orient[1] === 'H' && orient.slice(2).every((o) => o === 'V'),
  `portada vertical, plano en HORIZONTAL (pág. 2), fichas en vertical: ${orient.join('')}`);

const f = informe.fichas;
ok(f.length === 16 && new Set(f.map((x) => x.id)).size === 16, 'las 16 mesas tienen su ficha');
ok(JSON.stringify(f.map((x) => x.id)) === JSON.stringify(ordenFichas(mesas).map((m) => m.id))
  && f[0].id === 'm0' && f[1].titulo === 'Mesa 1 · Ámbar',
  `orden: presidencial primero y luego por número (${f.slice(0, 4).map((x) => x.titulo).join(', ')}…)`);
ok(f.at(-1).titulo === 'Mesa s/n · Patatas', 'la mesa sin número va al final ("Mesa s/n · Patatas")');

// Dos por página; la de 16 (o la que no quepa), página entera
const porPagina = new Map();
f.forEach((x) => porPagina.set(x.pagina, [...(porPagina.get(x.pagina) || []), x]));
ok([...porPagina.values()].every((l) => l.length <= 2 && (l.length === 1 || l.every((x) => x.alto === 'mitad'))),
  'como mucho dos fichas por página (solo si ambas caben en media)');
const de16 = f.find((x) => x.id === 'm3');
ok(de16.alto === 'util' && porPagina.get(de16.pagina).length === 1, `la mesa de 16 (Espetos) ocupa una página entera`);
console.log(`   media página: ${f.filter((x) => x.alto === 'mitad').map((x) => x.titulo.replace('Mesa ', '')).join(', ')}`);
console.log(`   página entera: ${f.filter((x) => x.alto !== 'mitad').map((x) => x.titulo.replace('Mesa ', '')).join(', ')}`);

// Ningún nombre pisado ni fuera de su hueco
const esq = (b) => [[1, 1], [1, -1], [-1, -1], [-1, 1]].map(([i, j]) => [
  b.cx + b.ux * b.hw * i - b.uy * b.hh * j, b.cy + b.uy * b.hw * i + b.ux * b.hh * j]);
const sat = (a, b) => [[a.ux, a.uy], [-a.uy, a.ux], [b.ux, b.uy], [-b.uy, b.ux]].every(([x, y]) => {
  const pa = esq(a).map(([p, q]) => p * x + q * y); const pb = esq(b).map(([p, q]) => p * x + q * y);
  return Math.max(...pa) > Math.min(...pb) && Math.max(...pb) > Math.min(...pa);
});
const tocaCirc = (b, c) => {
  const dx = c.x - b.cx; const dy = c.y - b.cy;
  const lx = dx * b.ux + dy * b.uy; const ly = -dx * b.uy + dy * b.ux;
  return Math.hypot(lx - Math.max(-b.hw, Math.min(b.hw, lx)), ly - Math.max(-b.hh, Math.min(b.hh, ly))) < c.r;
};
const malos = [];
f.forEach((x) => {
  x.etiquetas.forEach((e, k) => {
    x.etiquetas.slice(k + 1).forEach((g) => { if (sat(e.caja, g.caja)) malos.push(`${x.titulo}: ${e.i + 1}/${g.i + 1}`); });
    x.sillas.forEach((c) => { if (tocaCirc(e.caja, c)) malos.push(`${x.titulo}: nombre ${e.i + 1} sobre silla ${c.i + 1}`); });
    x.obstaculos.forEach((o) => { if (o.circ ? tocaCirc(e.caja, o.circ) : sat(e.caja, o.caja)) malos.push(`${x.titulo}: nombre ${e.i + 1} sobre la mesa`); });
    const fuera = esq(e.caja).some(([px, py]) => px < x.area.x - 0.01 || px > x.area.x + x.area.w + 0.01
      || py < x.area.y - 0.01 || py > x.area.y + x.area.h + 0.01);
    if (fuera) malos.push(`${x.titulo}: nombre ${e.i + 1} fuera de la ficha`);
  });
});
ok(malos.length === 0, `ningún nombre pisado ni fuera de su ficha${malos.length ? `: ${malos.slice(0, 5).join(' | ')}` : ''}`);

// Todos en el dibujo (o, si no caben, solo número) y todos en la lista
const faltan = [];
f.forEach((x) => {
  const m = mesas.find((y) => y.id === x.id);
  const enLista = x.lista.filter((p) => p.nombre).map((p) => p.nombre).sort();
  if (JSON.stringify(enLista) !== JSON.stringify(m.comensales.map((c) => c.nombre).sort())) faltan.push(`${x.titulo}: lista`);
  if (x.lista.length !== numPuestos(m) || x.lista.some((p, i) => p.n !== i + 1)) faltan.push(`${x.titulo}: nº de asiento`);
  const dibujados = new Set([...x.etiquetas.map((e) => e.i), ...x.sinNombre]);
  x.lista.forEach((p, i) => { if (p.nombre && !dibujados.has(i)) faltan.push(`${x.titulo}: asiento ${i + 1}`); });
});
ok(faltan.length === 0, `cada comensal está junto a su asiento y en la lista${faltan.length ? `: ${faltan.join(', ')}` : ''}`);
const conNum = f.filter((x) => x.sinNombre.length);
console.log(`   letra de los nombres: ${[...new Set(f.map((x) => x.fs))].sort((a, b) => b - a).join(', ')} pt · `
  + `solo número en el dibujo: ${conNum.length ? conNum.map((x) => `${x.titulo} (${x.sinNombre.map((i) => i + 1).join(',')})`).join('; ') : 'ninguno'}`);

const estrella = f.find((x) => x.id === 'm4');
ok(estrella.lista[0].tipo === 'hueco' && estrella.lista[0].nombre === '', 'asiento vacío → "hueco" en la lista');
ok(f.some((x) => x.lista.some((p) => p.tipo === 'niño/a')), 'niños marcados como "niño/a"');

// Resumen = criterios del Excel de la finca
const r = resumenPlanner(mesas, nucleos);
const ex = planificar(mesas, nucleos).resumen;
ok(r.comensales === ex.comensales && r.ninos === ex.ninos && r.adultos === ex.comensales - ex.ninos && r.tronas === 0,
  `resumen como el Excel: ${r.mesas} mesas · ${r.comensales} comensales · ${r.adultos} adultos · ${r.ninos} niños · ${r.tronas} tronas · ${r.huecos} huecos`);

// Nada de confirmaciones, preboda, núcleos, alergias ni importes
const plano_txt = buf.toString('latin1');
const prohibido = ['preboda', 'Preboda', 'onfirm', 'lergia', 'EUR', 'Familia', 'cleo', 'mporte'].filter((p) => plano_txt.includes(p));
ok(prohibido.length === 0, `sin confirmaciones, preboda, núcleos, alergias ni importes${prohibido.length ? `: ${prohibido}` : ''}`);
ok(mesas.every((m) => plano_txt.includes(`(${tituloMesa(m).replace(/·/g, '\xb7')})`)
  || plano_txt.includes(tituloMesa(m).replace(/·/g, '\xb7'))), 'el título de cada mesa está en el PDF');

console.log(fallos ? `\n${fallos} prueba(s) fallida(s).` : '\nTodo correcto.');
process.exit(fallos ? 1 : 0);
