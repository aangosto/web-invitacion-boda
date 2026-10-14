/* Prueba en Node del PDF "Plano de mesas" para la wedding planner y del
   dibujo de cada mesa (el mismo cálculo que el detalle de plano.html),
   con datos SINTÉTICOS (sin Firebase, nada se lee ni se escribe en
   Firestore): 16 mesas, entre ellas el caso real del móvil (redonda de
   11 con "Tía Ana Mari" y "Tío Jose Antonio" en los asientos 1 y 2),
   redondas de 12 y 16, cuadrada de 8, rectangular de 16, nombres
   largos, niños, huecos y una mesa girada.
   Uso: node scripts/test-pdf-planner.mjs [carpeta-salida] [plano.jpg]
   (el plano rasterizado solo existe en el navegador; sin él, la página
   del plano lleva un recuadro de relleno).                            */

import { writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { jsPDF } from 'jspdf';
import {
  construirPdfPlanner, nombreArchivo, ordenFichas, tituloMesa, resumenPlanner,
} from '../src/modules/pdf-planner.js';
import { planificar } from '../src/modules/excel-finca.js';
import { colocarFincaSinSolapes, numPuestos, ordenPuestos } from '../src/modules/plano-geom.js';
import { disenaMesa } from '../src/modules/mesa-etiquetas.js';
import { OPCIONES_PANTALLA } from '../src/modules/plano-dibujo.js';

const out = process.argv[2] || '.';
const planoJpg = process.argv[3];
let fallos = 0;
const ok = (cond, msg) => { console.log(`${cond ? '✓' : '✗'} ${msg}`); if (!cond) fallos += 1; };

/* ---------- Datos sintéticos ---------- */
const NOMBRES = ['Tía Mariángeles', 'Tío Jose Antonio', 'Acompañante de Laura Casaus', 'Begoña Sáez Ortega',
  'Ángel Núñez', 'Lucía Gómez', 'Jesús Peña Caballero', 'Carmen Ruiz', 'Óscar Díaz',
  'Maximiliano Bustamante Echeverría', 'Ana', 'Pepe', 'Concepción Rodríguez de la Fuente'];
// El caso real del móvil: redonda de 11 con estos dos en los asientos 1 y 2
const PRIMEROS = { 1: ['Tía Ana Mari', 'Tío Jose Antonio'] };
//          nombre, capacidad, sentados, forma, rot, presidencial
const DEF = [['Novios', 8, 8, 'redonda', 0, true], ['Ámbar', 11, 11], ['Chuches', 16, 16, 'rectangular', 0],
  ['Espetos', 16, 16], ['Estrella', 10, 9], ['Guardia Civil', 11, 11], ['Huevo Gamba', 12, 12],
  ['Jamón con chorreras', 9, 7], ['Limón', 10, 10], ['Marinera', 9, 9], ['Melocotón', 10, 10, 'redonda', 30],
  ['Naranja', 11, 11], ['Paparajote', 11, 10], ['Patatas', 11, 11], ['Uvas', 8, 8, 'cuadrada', 0], ['Vermut', 10, 10]];
const nucleos = [];
const mesas = DEF.map(([nombre, capacidad, sentados, forma = 'redonda', rot = 0, presidencial = false], i) => {
  const nuc = { id: `n${i}`, nombre: `Familia ${nombre}`, personas: [] };
  const comensales = Array.from({ length: sentados }, (_, k) => {
    const base = NOMBRES[(i * 5 + k) % NOMBRES.length];
    // En las mesas del caso de pantalla, nombres reales (sin sufijo)
    const persona = PRIMEROS[i]?.[k] ?? (k % 3 === 2 || [1, 2, 6, 14].includes(i) ? base : `${base} ${i}-${k}`);
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

/* ---------- Estructura del PDF ---------- */
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

// Dos por página; la que no quepa en media, página entera
const porPagina = new Map();
f.forEach((x) => porPagina.set(x.pagina, [...(porPagina.get(x.pagina) || []), x]));
ok([...porPagina.values()].every((l) => l.length <= 2 && (l.length === 1 || l.every((x) => x.alto === 'mitad'))),
  'como mucho dos fichas por página (solo si ambas caben en media)');
console.log(`   media página: ${f.filter((x) => x.alto === 'mitad').map((x) => x.titulo.replace('Mesa ', '')).join(', ')}`);
console.log(`   página entera: ${f.filter((x) => x.alto !== 'mitad').map((x) => x.titulo.replace('Mesa ', '')).join(', ')}`);

/* ---------- Geometría de comprobación (independiente del módulo) ---------- */
const EPS = 0.01;
const cajasSolapan = (a, b) => a.x0 < b.x1 - EPS && b.x0 < a.x1 - EPS && a.y0 < b.y1 - EPS && b.y0 < a.y1 - EPS;
const cajaCirculo = (b, c) => {
  const qx = Math.max(b.x0, Math.min(b.x1, c.x));
  const qy = Math.max(b.y0, Math.min(b.y1, c.y));
  return Math.hypot(c.x - qx, c.y - qy) < c.r - EPS;
};
const cajaPoligono = (b, pts) => {
  const caja = [[b.x0, b.y0], [b.x1, b.y0], [b.x1, b.y1], [b.x0, b.y1]];
  const ejes = [[1, 0], [0, 1], ...pts.map(([x, y], k) => {
    const [x2, y2] = pts[(k + 1) % pts.length];
    return [-(y2 - y), x2 - x];
  })];
  return ejes.every(([ex, ey]) => {
    const l = Math.hypot(ex, ey) || 1;
    const pa = caja.map(([x, y]) => (x * ex + y * ey) / l);
    const pb = pts.map(([x, y]) => (x * ex + y * ey) / l);
    return Math.max(...pa) - Math.min(...pb) > EPS && Math.max(...pb) - Math.min(...pa) > EPS;
  });
};
const grueso = ([x1, y1, x2, y2], g) => {
  const l = Math.hypot(x2 - x1, y2 - y1) || 1;
  const nx = (-(y2 - y1) / l) * g / 2;
  const ny = ((x2 - x1) / l) * g / 2;
  return [[x1 + nx, y1 + ny], [x2 + nx, y2 + ny], [x2 - nx, y2 - ny], [x1 - nx, y1 - ny]];
};
/** Problemas de un dibujo (coordenadas absolutas) dentro de `area`. */
function problemas(d, area, quien) {
  const mal = [];
  d.etiquetas.forEach((e, k) => {
    const n = `${quien} asiento ${e.i + 1}`;
    if (e.lineas.some((l) => l.includes('…') || l.includes('...'))) mal.push(`${n}: lleva "…"`);
    if (e.lineas.length > 2 && !d.forzado) mal.push(`${n}: más de dos líneas`);
    d.etiquetas.slice(k + 1).forEach((g) => { if (cajasSolapan(e.caja, g.caja)) mal.push(`${n} pisa al ${g.i + 1}`); });
    d.sillas.forEach((c) => { if (cajaCirculo(e.caja, c)) mal.push(`${n} pisa la silla ${c.i + 1}`); });
    if (d.tablero.circ ? cajaCirculo(e.caja, d.tablero.circ) : cajaPoligono(e.caja, d.tablero.pts)) mal.push(`${n} pisa la mesa`);
    if (d.flecha && (cajaPoligono(e.caja, grueso(d.flecha.linea, d.flecha.grosor)) || cajaPoligono(e.caja, d.flecha.punta))) mal.push(`${n} pisa la flecha`);
    if (d.cabecera && (cajaPoligono(e.caja, grueso(d.cabecera.linea, d.cabecera.grosor)) || cajaPoligono(e.caja, d.cabecera.tri))) mal.push(`${n} pisa la cabecera`);
    if (e.caja.x0 < area.x - EPS || e.caja.x1 > area.x + area.w + EPS
      || e.caja.y0 < area.y - EPS || e.caja.y1 > area.y + area.h + EPS) mal.push(`${n} se sale del área`);
  });
  d.sillas.forEach((c) => {
    if (c.x - c.r < area.x - EPS || c.x + c.r > area.x + area.w + EPS
      || c.y - c.r < area.y - EPS || c.y + c.r > area.y + area.h + EPS) mal.push(`${quien} silla ${c.i + 1} se sale`);
  });
  return mal;
}
/** Cada nombre completo junto a su asiento: las líneas unidas dan el nombre. */
const completos = (d, nombres) => d.etiquetas.every((e) => e.lineas.join(' ') === nombres[e.i])
  && nombres.every((nm, i) => !nm || d.etiquetas.some((e) => e.i === i));

/* ---------- Fichas del PDF ---------- */
const malos = [];
f.forEach((x) => malos.push(...problemas(x.dibujo, x.area, x.titulo)));
ok(malos.length === 0, `PDF: ningún nombre pisa a otro, a una silla, a la mesa, a la flecha ni a la cabecera, ni se sale ni lleva "…"${malos.length ? `: ${malos.slice(0, 6).join(' | ')}` : ''}`);
ok(f.every((x) => x.cabe), 'PDF: todas las mesas caben en su ficha');
ok(f.every((x) => x.dibujo.etiquetas.every((e) => e.fs >= 7)),
  `PDF: letra de los nombres ${[...new Set(f.map((x) => x.fs))].sort((a, b) => b - a).join(', ')} pt (mínimo 7)`);
ok(f.every((x) => completos(x.dibujo, x.lista.map((p) => p.nombre))),
  'PDF: todos los nombres completos junto a su asiento (en dos líneas como mucho)');
const ambar = f.find((x) => x.id === 'm1');
const e1 = ambar.dibujo.etiquetas.find((e) => e.i === 0);
const e2 = ambar.dibujo.etiquetas.find((e) => e.i === 1);
ok(e1.lado === 'izq' && e2.lado === 'dcha' && !cajasSolapan(e1.caja, e2.caja),
  `PDF caso real: "${e1.lineas.join(' / ')}" a la izquierda y "${e2.lineas.join(' / ')}" a la derecha`);
console.log(`   ${f.reduce((s, x) => s + x.dibujo.etiquetas.filter((e) => e.guia).length, 0)} nombres unidos a su silla con una línea guía`);

/* ---------- Pantalla (detalle de mesa en plano.html) ---------- */
// Ancho del dibujo = ancho del móvil − 2 rem de márgenes del panel.
// Texto medido con las métricas de Helvetica (en el navegador se mide
// con la fuente real: ver la prueba con capturas).
const medidor = new jsPDF({ unit: 'pt', format: 'a4' });
const medirPx = (t, fs) => { medidor.setFont('helvetica', 'normal'); medidor.setFontSize(fs); return medidor.getTextWidth(t); };
const presM = mesas.find((m) => m.presidencial);
const CASOS = [['m1', 'redonda de 11 (caso real)'], ['m6', 'redonda de 12'], ['m14', 'cuadrada de 8'], ['m2', 'rectangular de 16']];
const malPantalla = [];
const enTres = [];
const resumenPantalla = [];
for (const movil of [360, 390, 430]) {
  CASOS.forEach(([id, nombre]) => {
    const m = mesas.find((x) => x.id === id);
    const nombres = ordenPuestos(m).map((c) => (c ? c.nombre : ''));
    const d = disenaMesa(m, presM, nombres, { ...OPCIONES_PANTALLA, ancho: movil - 32, medir: medirPx });
    malPantalla.push(...problemas(d, { x: 0, y: 0, w: d.ancho, h: d.alto }, `${movil}px ${nombre}`));
    if (!d.cabe) malPantalla.push(`${movil}px ${nombre}: no cabe`);
    // Último recurso (más de dos líneas): solo para nombres larguísimos
    d.etiquetas.filter((e) => e.lineas.length > 2).forEach((e) => {
      const nm = e.lineas.join(' ');
      if (nm.length < 30) malPantalla.push(`${movil}px ${nombre}: "${nm}" en ${e.lineas.length} líneas`);
      else enTres.push(`${movil} px, ${nombre}, asiento ${e.i + 1}: "${e.lineas.join(' / ')}"`);
    });
    if (!completos(d, nombres)) malPantalla.push(`${movil}px ${nombre}: faltan nombres o están cortados`);
    if (d.etiquetas.some((e) => e.fs < 11)) malPantalla.push(`${movil}px ${nombre}: letra < 11 px`);
    if (movil === 390) {
      resumenPantalla.push(`${nombre}: ${Math.round(d.alto)} px de alto, letra ${d.fs} px, `
        + `${d.etiquetas.filter((e) => e.lineas.length > 1).length} en dos líneas, ${d.etiquetas.filter((e) => e.guia).length} con guía`);
    }
  });
}
ok(malPantalla.length === 0, `pantalla a 360, 390 y 430 px: sin solapes, nada fuera, sin "…" y letra ≥ 11 px${malPantalla.length ? `: ${malPantalla.slice(0, 6).join(' | ')}` : ''}`);
resumenPantalla.forEach((t) => console.log(`   390 px · ${t}`));
enTres.forEach((t) => console.log(`   último recurso, en tres líneas (no cabe en dos ni a 11 px): ${t}`));

/* ---------- Listas, resumen y contenido ---------- */
const faltan = [];
f.forEach((x) => {
  const m = mesas.find((y) => y.id === x.id);
  const enLista = x.lista.filter((p) => p.nombre).map((p) => p.nombre).sort();
  if (JSON.stringify(enLista) !== JSON.stringify(m.comensales.map((c) => c.nombre).sort())) faltan.push(`${x.titulo}: lista`);
  if (x.lista.length !== numPuestos(m) || x.lista.some((p, i) => p.n !== i + 1)) faltan.push(`${x.titulo}: nº de asiento`);
});
ok(faltan.length === 0, `la lista de cada ficha tiene a todos en orden de asiento${faltan.length ? `: ${faltan.join(', ')}` : ''}`);

const estrella = f.find((x) => x.id === 'm4');
ok(estrella.lista[0].tipo === 'hueco' && estrella.lista[0].nombre === '', 'asiento vacío → "hueco" en la lista');
ok(f.some((x) => x.lista.some((p) => p.tipo === 'niño/a')), 'niños marcados como "niño/a"');

// Resumen = criterios del Excel de la finca
const r = resumenPlanner(mesas, nucleos);
const ex = planificar(mesas, nucleos).resumen;
ok(r.comensales === ex.comensales && r.ninos === ex.ninos && r.adultos === ex.comensales - ex.ninos && r.tronas === 0,
  `resumen como el Excel: ${r.mesas} mesas · ${r.comensales} comensales · ${r.adultos} adultos · ${r.ninos} niños · ${r.tronas} tronas · ${r.huecos} huecos`);

// Nada de confirmaciones, preboda, núcleos, alergias ni importes
const texto = buf.toString('latin1');
const prohibido = ['preboda', 'Preboda', 'onfirm', 'lergia', 'EUR', 'Familia', 'cleo', 'mporte'].filter((p) => texto.includes(p));
ok(prohibido.length === 0, `sin confirmaciones, preboda, núcleos, alergias ni importes${prohibido.length ? `: ${prohibido}` : ''}`);
ok(mesas.every((m) => texto.includes(tituloMesa(m).replace(/·/g, '\xb7'))), 'el título de cada mesa está en el PDF');

console.log(fallos ? `\n${fallos} prueba(s) fallida(s).` : '\nTodo correcto.');
process.exit(fallos ? 1 : 0);
