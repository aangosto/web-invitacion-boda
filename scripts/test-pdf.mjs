/* Prueba en Node de la exportación a PDF con datos SINTÉTICOS (sin
   Firebase). Genera dos PDFs en la carpeta indicada (o el directorio
   actual): uno completo y otro con colecciones que fallan o vienen
   vacías, para comprobar que el documento se genera igualmente.
   Uso: node scripts/test-pdf.mjs [carpeta-salida]                  */

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { construirPdf, fechaArchivo } from '../src/modules/export-pdf.js';

const out = process.argv[2] || '.';
let fallos = 0;
const ok = (cond, msg) => { console.log(`${cond ? '✓' : '✗'} ${msg}`); if (!cond) fallos += 1; };

const NOMBRES = ['María José Pérez', 'Íñigo Muñoz', 'Begoña Sáez', 'Ángel Núñez', 'Lucía Gómez', 'Jesús Peña', 'Carmen Ruiz', 'Óscar Díaz'];
const nombre = (i) => `${NOMBRES[i % NOMBRES.length]} ${i}`;
const ts = (ms) => ({ toMillis: () => ms, toDate: () => new Date(ms) });

// 91 núcleos, ~250 personas
const invitados = Array.from({ length: 91 }, (_, i) => ({
  id: `n${i}`,
  nombre: `Familia ${nombre(i)}`,
  lado: ['novia', 'novio', 'ambos'][i % 3],
  etiquetas: i % 4 ? ['Amigos', 'Uni'].slice(0, (i % 2) + 1) : [],
  personas: Array.from({ length: 1 + (i % 4) }, (_, j) => ({
    nombre: nombre(i * 10 + j), nino: j === 3, estado: ['confirmado', 'pendiente', 'no_asiste'][(i + j) % 3],
    regalo: 100, regaloMaterial: { descripcion: 'Tostadora', valor: 50 },
  })),
}));

// Mesas: sentar a parte de los no-"no_asiste"
const asignables = invitados.flatMap((n) => n.personas.filter((p) => p.estado !== 'no_asiste')
  .map((p) => ({ key: `${n.id}|${p.nombre}`, nombre: p.nombre, nucleo: n.nombre, lado: n.lado, manual: false })));
const mesas = Array.from({ length: 16 }, (_, i) => ({
  id: `m${i}`, nombre: `Mesa ${i + 1}`, capacidad: 10, orden: i,
  comensales: asignables.slice(i * 9, i * 9 + 9 + (i === 3 ? 2 : 0)).map((c, j) => ({ ...c, preboda: j % 3 !== 0 })),
}));
mesas[5].comensales.push({ key: 'manual|x', nombre: 'Fotógrafo — “Pepe”', nucleo: '', lado: '', manual: true, preboda: false });

// ~150 confirmaciones (con papelera y reenvíos)
const rsvp = Array.from({ length: 150 }, (_, i) => {
  const people = Array.from({ length: 1 + (i % 3) }, (_, j) => ({
    name: nombre(i * 10 + j),
    menu: ['ninguno', 'ninguno', 'vegetariano', 'vegano', 'otro'][(i + j) % 5],
    menuOther: 'Sin cerdo',
    allergies: (i + j) % 7 === 0 ? 'Celíaca (gluten) — muy estricta 🌾' : '',
    needsShoes: (i + j) % 4 === 0, shoeSize: (i + j) % 8 === 0 ? 'sin talla' : String(36 + ((i + j) % 9)),
    busIda: i % 5 === 0, busVuelta: i % 6 === 0,
  }));
  return {
    filledBy: people[0].name,
    attending: i % 11 !== 0,
    origin: i % 3 ? 'fuera' : 'zaragoza',
    people,
    comentario: i % 9 === 0 ? '¡Qué ilusión! Llegaremos tarde… lo siento 🙈' : '',
    travel: {
      ida: { mode: ['coche', 'ave', 'bus', 'buscando'][i % 4], from: 'Madrid', arrivalDay: ['2026-10-23', '2026-10-24', ''][i % 3], arrivalTime: `${10 + (i % 10)}:30`, canCarry: i % 8 === 0, seats: 2, departTime: '08:00' },
      vuelta: { mode: 'coche', day: '2026-10-25', departTime: `${12 + (i % 6)}:00` },
    },
    createdAt: ts(1_700_000_000_000 + i * 1000),
    deleted: i === 7,
  };
});
rsvp.push({ ...rsvp[10], comentario: 'Reenvío nuevo', createdAt: ts(1_800_000_000_000) });

const habitaciones = Array.from({ length: 51 }, (_, i) => ({
  id: `h${i}`, tipo: ['individual', 'doble', 'supletoria'][i % 3], entrada: '2026-10-23', salida: i % 2 ? '2026-10-25' : '2026-10-26',
  noches: i % 2 ? 2 : 3, ocupantes: i % 6 === 0 ? [] : [nombre(i), nombre(i + 100)].slice(0, 1 + (i % 2)),
  cuna: i === 4, importe: 210, pagado: i % 3 === 0, cobrado: 123.45, notas: 'pagó 50 € en efectivo',
}));

const datos = {
  rsvp: { ok: true, data: rsvp },
  invitados: { ok: true, data: invitados },
  mesas: { ok: true, data: mesas },
  habitaciones: { ok: true, data: habitaciones },
};

const t0 = performance.now();
const pasos = [];
const doc = await construirPdf(datos, { generado: new Date(2026, 9, 2, 18, 30), onPaso: (p) => pasos.push(p) });
const buf = Buffer.from(doc.output('arraybuffer'));
const ms = Math.round(performance.now() - t0);
const ruta = join(out, `boda-datos-${fechaArchivo(new Date(2026, 9, 2))}.pdf`);
writeFileSync(ruta, buf);
ok(pasos.length === 8, `8 pasos de progreso (${pasos.join(', ')})`);
ok(doc.getNumberOfPages() > 8, `${doc.getNumberOfPages()} páginas, ${Math.round(buf.length / 1024)} KB en ${ms} ms → ${ruta}`);
const texto = buf.toString('latin1');
ok(!/123[.,]45|210|pagó 50|Tostadora/.test(texto), 'sin importes, cobros, notas ni regalos (texto plano)');

// Colecciones que fallan o vacías: el PDF se genera igualmente
const doc2 = await construirPdf({
  rsvp: { ok: true, data: [] },
  invitados: { ok: false, error: 'permission-denied' },
  mesas: { ok: false, error: 'unavailable' },
  habitaciones: { ok: true, data: [] },
});
const ruta2 = join(out, 'boda-datos-fallos.pdf');
writeFileSync(ruta2, Buffer.from(doc2.output('arraybuffer')));
ok(doc2.getNumberOfPages() === 8, `con fallos/vacías: ${doc2.getNumberOfPages()} páginas → ${ruta2}`);

console.log(fallos ? `\n${fallos} fallo(s).` : '\nTodo correcto.');
process.exit(fallos ? 1 : 0);
