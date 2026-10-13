/* =================================================================
   INSPECCIÓN (SOLO LECTURA) de la colección "mesas" frente al reparto
   definitivo de datos/mesas-banquete.txt. No escribe nada.

   Uso:  node scripts/inspeccionar-mesas.mjs
   ================================================================= */

import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
import {
  loadEnv, firebaseConfig, parseMesasBanquete, norm,
} from './lib/mesas-banquete.mjs';

/** Empareja multiconjuntos de nombres (hay repetidos: "Papá" x2…). */
function compara(listado, actuales) {
  const pendientes = [...actuales];
  const coinciden = [];
  const faltan = [];
  listado.forEach((n) => {
    const i = pendientes.findIndex((a) => norm(a) === norm(n));
    if (i >= 0) { coinciden.push(n); pendientes.splice(i, 1); } else faltan.push(n);
  });
  return { coinciden, faltan, sobran: pendientes };
}

async function main() {
  const listado = parseMesasBanquete();
  console.log(`Listado: ${listado.length} mesas, ${listado.reduce((s, m) => s + m.invitados.length, 0)} personas ✓`);

  const app = initializeApp(firebaseConfig(loadEnv()));
  await signInAnonymously(getAuth(app));
  const snap = await getDocs(collection(getFirestore(app), 'mesas'));
  const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  console.log(`Firestore "mesas": ${docs.length} documentos, `
    + `${docs.reduce((s, d) => s + (d.comensales || []).length, 0)} comensales.\n`);

  const usados = new Set();
  listado.forEach((m) => {
    const d = docs.find((x) => norm(x.nombre) === norm(m.nombre));
    if (!d) { console.log(`✗ FALTA  ${m.nombre} (${m.capacidad})`); return; }
    usados.add(d.id);
    const nombres = (d.comensales || []).map((c) => c.nombre);
    const r = compara(m.invitados, nombres);
    console.log(`✓ EXISTE ${m.nombre}  cap. Firestore ${d.capacidad} / listado ${m.capacidad}${d.capacidad !== m.capacidad ? '  ⚠ CAPACIDAD DISTINTA' : ''}`);
    console.log(`    coinciden (${r.coinciden.length}): ${r.coinciden.join(', ') || '—'}`);
    console.log(`    faltan    (${r.faltan.length}): ${r.faltan.join(', ') || '—'}`);
    if (r.sobran.length) console.log(`    ⚠ en Firestore y NO en el listado (${r.sobran.length}): ${r.sobran.join(', ')}`);
    (d.comensales || []).forEach((c) => {
      if (!c.manual) console.log(`    · vinculado a invitados: ${c.nombre} [${c.nucleo}] preboda=${c.preboda}`);
    });
  });
  docs.filter((d) => !usados.has(d.id)).forEach((d) => {
    console.log(`⚠ Mesa en Firestore que NO está en el listado: "${d.nombre}" (cap. ${d.capacidad}): `
      + `${(d.comensales || []).map((c) => c.nombre).join(', ') || 'vacía'}`);
  });
  process.exit(0);
}

main().catch((err) => { console.error('Error:', err.message || err); process.exit(1); });
