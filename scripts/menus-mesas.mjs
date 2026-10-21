/* =================================================================
   CARGA DE TIPO Y MENÚ en comensales reales (colección "mesas").

   Uso:  node scripts/menus-mesas.mjs            (SOLO LECTURA: comprueba)
         node scripts/menus-mesas.mjs --aplicar  (copia en datos/, escribe
                                                  en transacción y verifica)

   Busca cada persona por NOMBRE DE MESA + NOMBRE DE COMENSAL exactos (sin
   mayúsculas ni tildes); si falta o sale más de una vez, para. Solo
   cambia `tipo` y `menu` de esas personas (cambiaComensalEnTx); nada más.
   ================================================================= */

import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import {
  getFirestore, collection, getDocs, doc, runTransaction, serverTimestamp,
} from 'firebase/firestore';
import { loadEnv, firebaseConfig, norm, ROOT } from './lib/mesas-banquete.mjs';
import {
  cambiaComensalEnTx, conCambiosComensal, clavesNinos, recuentoMesas, etiquetaTipoMenu, toComensal,
} from '../src/modules/comensal.js';

const CARGA = [
  { mesa: 'Naranja', persona: 'Luisito', cambios: { tipo: 'trona', menu: 'infantil reducido' } },
  { mesa: 'Paparajote', persona: 'Jorgito', cambios: { tipo: 'trona', menu: 'sin menú' } },
];
const APLICAR = process.argv.includes('--aplicar');
const ahora = new Date();
const hoy = `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}-${String(ahora.getDate()).padStart(2, '0')}`;
/** JSON con las claves ordenadas: Firestore no garantiza el orden de los mapas. */
const canon = (v) => JSON.stringify(v, (_, x) => (x && typeof x === 'object' && !Array.isArray(x)
  ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, x[k]])) : x));

async function leer(db) {
  const snap = await getDocs(collection(db, 'mesas'));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

function plan(crudas) {
  const errores = [];
  const res = CARGA.map((p) => {
    const ms = crudas.filter((m) => norm(m.nombre) === norm(p.mesa));
    if (ms.length !== 1) { errores.push(`Mesa "${p.mesa}": ${ms.length} coincidencias`); return null; }
    const cs = (ms[0].comensales || []).filter((c) => norm(c.nombre) === norm(p.persona));
    if (cs.length !== 1) {
      errores.push(`"${p.persona}" en "${p.mesa}": ${cs.length} coincidencias (hay: ${(ms[0].comensales || []).map((c) => c.nombre).join(', ')})`);
      return null;
    }
    if (!cs[0].key) { errores.push(`"${p.persona}" no tiene key`); return null; }
    return { ...p, mesaDoc: ms[0], comensal: cs[0] };
  });
  return { errores, res: res.filter(Boolean) };
}

async function main() {
  const app = initializeApp(firebaseConfig(loadEnv()));
  await signInAnonymously(getAuth(app));
  const db = getFirestore(app);
  const antes = await leer(db);
  const nucleos = (await getDocs(collection(db, 'invitados'))).docs.map((d) => ({ id: d.id, ...d.data() })); // solo lectura
  const ninos = clavesNinos(nucleos);
  console.log(`Leídas ${antes.length} mesas y ${nucleos.length} núcleos de invitados (solo lectura).`);
  const p = plan(antes);
  if (p.errores.length) {
    console.log('\n✗ PARO, hay que revisar:');
    p.errores.forEach((e) => console.log(`  - ${e}`));
    process.exit(2);
  }
  p.res.forEach((r) => {
    const c = r.comensal;
    console.log(`✓ ${r.persona} en ${r.mesa}: key ${c.key}; ahora tipo=${c.tipo ?? '(sin guardar)'} menu=${c.menu ?? '(sin guardar)'} `
      + `→ «${etiquetaTipoMenu(toComensal(c), ninos) || 'adulto · adulto'}»; pasará a tipo=${r.cambios.tipo} menu=${r.cambios.menu}`);
  });
  if (!APLICAR) { console.log('\n(solo lectura: no se ha escrito nada)'); process.exit(0); }

  const fichero = resolve(ROOT, 'datos', `backup-mesas-${hoy}-menus.json`);
  writeFileSync(fichero, JSON.stringify(antes, null, 2));
  console.log(`\nCopia: ${fichero} (${antes.length} mesas)`);
  for (const r of p.res) {
    const nueva = await runTransaction(db, (tx) => cambiaComensalEnTx(tx, doc(db, 'mesas', r.mesaDoc.id), r.comensal.key, r.cambios,
      { updatedAt: serverTimestamp() }));
    if (!nueva) throw new Error(`${r.persona} ya no está en ${r.mesa}`);
    console.log(`  ✓ ${r.persona}`);
  }

  // Verificación: releer y comparar con la copia
  const despues = await leer(db);
  const mal = [];
  const quita = (o) => Object.fromEntries(Object.entries(o).filter(([k]) => k !== 'updatedAt'));
  antes.forEach((a) => {
    const d = despues.find((x) => x.id === a.id);
    if (!d) { mal.push(`falta ${a.nombre}`); return; }
    const r = p.res.filter((x) => x.mesaDoc.id === a.id);
    let esperada = a.comensales || [];
    r.forEach((x) => { esperada = conCambiosComensal(esperada, x.comensal.key, x.cambios); });
    if (canon(esperada) !== canon(d.comensales || [])) mal.push(`${a.nombre}: comensales distintos de lo esperado`);
    const resto = (o) => canon({ ...quita(o), comensales: null });
    if (resto(a) !== resto(d)) mal.push(`${a.nombre}: cambió otro campo de la mesa`);
    if (!r.length && canon(a.updatedAt) !== canon(d.updatedAt)) mal.push(`${a.nombre}: se ha escrito y no debía`);
  });
  console.log('\nVERIFICACIÓN (releído de Firestore):');
  p.res.forEach((r) => {
    const c = despues.find((m) => m.id === r.mesaDoc.id).comensales.find((x) => x.key === r.comensal.key);
    console.log(`  ${r.persona} (${r.mesa}): tipo=${c.tipo} menu=${c.menu} preboda=${c.preboda} → «${etiquetaTipoMenu(toComensal(c), ninos)}»`);
  });
  const rec = recuentoMesas(despues.map((m) => ({ ...m, comensales: (m.comensales || []).map(toComensal) })), ninos);
  console.log(`  Recuento: ${rec.total} comensales · tipos ${JSON.stringify(rec.tipos)} · menús ${JSON.stringify(rec.menus)}`);
  if (mal.length) { mal.forEach((x) => console.log(`✗ ${x}`)); process.exit(1); }
  console.log('✓ Solo han cambiado tipo y menú de esas dos personas (y la fecha de sus mesas).');
  process.exit(0);
}

main().catch((err) => { console.error('Error:', err.message || err); process.exit(1); });
