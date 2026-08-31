/* Prueba en Node de la lógica de la cronología (crono-logic.js) con
   datos SINTÉTICOS: no toca Firestore. Uso: node scripts/test-crono.mjs */
import { buildCronologia, formatDia } from '../src/modules/crono-logic.js';

const docs = [
  // Normal: coche con plazas, llega el 23 por la tarde
  { filledBy: 'Coche Murcia', attending: true, origin: 'fuera', people: [{}, {}],
    travel: { ida: { mode: 'coche', from: 'Murcia', arrivalDay: '2026-10-23', arrivalTime: '21:30', canCarry: true, seats: 2, departTime: '17:00' },
              vuelta: { mode: 'coche', day: '2026-10-25', departTime: '13:00', canCarry: true, seats: 2 } } },
  // AVE, llega el 23 más pronto (debe salir ANTES que el de arriba)
  { filledBy: 'AVE Málaga', attending: true, origin: 'fuera', people: [{}],
    travel: { ida: { mode: 'ave', from: 'Málaga', arrivalDay: '2026-10-23', arrivalTime: '20:02' },
              vuelta: { mode: 'ave', day: '2026-10-25', departTime: '16:30' } } },
  // Avión el 22 (día anterior, debe agrupar en día propio primero)
  { filledBy: 'Avión Stansted', attending: true, origin: 'fuera', people: [{}],
    travel: { ida: { mode: 'avion', from: 'Stansted', arrivalDay: '2026-10-22', arrivalTime: '20:10' },
              vuelta: { mode: 'avion', day: '2026-10-26', departTime: '10:00' } } },
  // Con día pero SIN hora: al final de su día
  { filledBy: 'Sin hora', attending: true, origin: 'fuera', people: [{}],
    travel: { ida: { mode: 'coche', from: 'Murcia', arrivalDay: '2026-10-23', arrivalTime: '' },
              vuelta: { mode: 'coche', day: '2026-10-25', departTime: '' } } },
  // "Aún no lo sé" → bloque sin fecha
  { filledBy: 'Buscando', attending: true, origin: 'fuera', people: [{}],
    travel: { ida: { mode: 'buscando', from: 'Madrid', seeking: true },
              vuelta: { mode: 'buscando', seeking: true } } },
  // Modo indicado pero sin día → bloque sin fecha
  { filledBy: 'Avión sin fecha', attending: true, origin: 'fuera', people: [{}],
    travel: { ida: { mode: 'avion', from: '', arrivalDay: '', arrivalTime: '' },
              vuelta: { mode: 'avion', day: '', departTime: '' } } },
  // De Zaragoza → bloque sin fecha con motivo propio
  { filledBy: 'Zaragozano', attending: true, origin: 'zaragoza', people: [{}, {}, {}] },
  // No asiste → fuera de la cronología
  { filledBy: 'No asiste', attending: false, people: [] },
];

function assert(cond, msg) {
  if (!cond) { console.error(`✗ ${msg}`); process.exitCode = 1; }
  else console.log(`✓ ${msg}`);
}

const ll = buildCronologia(docs, 'llegadas');
assert(ll.dias.map((d) => d.iso).join(',') === '2026-10-22,2026-10-23',
  'llegadas: días ordenados (22 antes que 23)');
assert(ll.dias[1].entradas.map((e) => e.nombre).join(',') === 'AVE Málaga,Coche Murcia,Sin hora',
  'llegadas día 23: por hora, y "sin hora" al final');
assert(ll.dias[1].personas === 4, 'llegadas día 23: suma de personas (1+2+1)');
assert(ll.dias[1].entradas[1].plazas && ll.dias[1].entradas[1].plazas.seats === 2
  && ll.dias[1].entradas[1].plazas.hora === '17:00',
  'llegadas: coche con 2 plazas y hora de salida de origen');
assert(ll.sinFecha.map((e) => e.nombre).sort().join(',') === 'Avión sin fecha,Buscando,Zaragozano',
  'llegadas sin fecha: buscando + sin día + Zaragoza (y el "no asiste" fuera)');
assert(ll.sinFecha.find((e) => e.nombre === 'Zaragozano').motivo.includes('Zaragoza'),
  'llegadas: motivo propio para los de Zaragoza');

const ss = buildCronologia(docs, 'salidas');
assert(ss.dias.map((d) => d.iso).join(',') === '2026-10-25,2026-10-26',
  'salidas: días ordenados (25 antes que 26)');
assert(ss.dias[0].entradas.map((e) => e.nombre).join(',') === 'Coche Murcia,AVE Málaga,Sin hora',
  'salidas día 25: por hora de salida, "sin hora" al final');
assert(ss.dias[0].entradas[0].lugar === 'Murcia', 'salidas: destino = from de la ida');
assert(ss.dias[0].entradas[0].plazas && ss.dias[0].entradas[0].plazas.hora === '',
  'salidas: en la vuelta las plazas no repiten hora (ya es la de la fila)');
assert(formatDia('2026-10-23').includes('23') && formatDia('2026-10-23').toLowerCase().includes('octubre'),
  `formatDia legible: "${formatDia('2026-10-23')}"`);

console.log(process.exitCode ? '\nHAY FALLOS' : '\nTodo correcto.');
