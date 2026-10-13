/* =================================================================
   RECONCILIACIÓN de la colección "mesas" con el reparto definitivo
   (datos/mesas-banquete.txt).

   Uso:  node scripts/reconciliar-mesas.mjs           (escribe)
         node scripts/reconciliar-mesas.mjs --dry-run (solo muestra)

   Decisiones validadas por los novios tras la inspección
   (scripts/inspeccionar-mesas.mjs):
   · Las 16 mesas YA EXISTEN con el nombre del grupo: se actualizan
     los MISMOS documentos (mismo id) → nombre nuevo, `grupo`, capacidad
     del listado y `presidencial` (solo Novios).
   · Los comensales ya sentados están VINCULADOS a "invitados" (key
     '<nucleo>|<nombre>'): se conservan con su key y su flag de
     preboda. Las variantes de nombre solo cambian el nombre visible.
   · Limón: salen Maki y Rosalía (vuelven a "sin asignar").
   · Se añaden como TEXTO (comensal manual, sin cruzar con invitados):
     Alberto y María (Novios) y Macarena (Limón).
   · NO se toca ninguna otra colección.

   IDEMPOTENTE: si alguna mesa ya tiene un nombre nuevo, `grupo` o
   `presidencial`, o el estado de partida no es el inspeccionado,
   ABORTA sin escribir nada. Todo va en un único batch atómico.
   ================================================================= */

import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import {
  getFirestore, collection, doc, getDocs, writeBatch, serverTimestamp,
} from 'firebase/firestore';
import {
  loadEnv, firebaseConfig, parseMesasBanquete, norm,
  MESAS_ESPERADAS, PERSONAS_ESPERADAS, MESA_PRESIDENCIAL,
} from './lib/mesas-banquete.mjs';

const DRY = process.argv.includes('--dry-run');

/** Nombre nuevo → nombre actual del documento en Firestore. */
const MESA_ACTUAL = {
  'Novios': 'Mesa novios',
  'Ámbar': 'Mesa RM +Mates',
  'Chuches': 'Mesa niños',
  'Espetos': 'Mesa Tios Naranjo',
  'Estrella': 'Mesa titos',
  'Guardia Civil': 'Tios abuelos Alberto',
  'Huevo Gamba': 'Mesa Tios Alberto',
  'Jamón con chorreras': 'Mesa mates',
  'Limón': 'Mesa vecinos mix',
  'Marinera': 'Mesa amigos Maria',
  'Melocotón': 'Mesa Primos Alberto',
  'Naranja': 'Mesa 8 Quique',
  'Paparajote': 'Mesa Ana',
  'Patatas': 'Mesa Monitores jovenes',
  'Uvas': 'Meda cristiana',
  'Vermut': 'Mesa carmen',
};

/** Misma persona, otro nombre visible: [mesa, nombre actual, nombre nuevo]. */
const RENOMBRAR = [
  ['Espetos', 'Javier', 'Tío Javier'],
  ['Guardia Civil', 'Jose Antonio', 'Tío Jose Antonio'],
  ['Guardia Civil', 'Ana Mari', 'Tía Ana Mari'],
  ['Guardia Civil', 'Aurelia', 'Tía Aurelia'],
  ['Guardia Civil', 'Benito', 'Tío Benito'],
  ['Huevo Gamba', 'Mariángeles', 'Tía Mariángeles'],
  ['Huevo Gamba', 'Primo Jesús', 'Jesús'],
  ['Marinera', 'Laura Casaus', 'Laura'],
  ['Naranja', 'JC', 'Jean Cristian'],
  ['Uvas', 'Sonia González', 'Sonia'],
  ['Ámbar', 'Acompañante de Biesa (por confirmar)', 'Mireia'],
  ['Vermut', 'Novia de Óscar', 'Nicole'],
];

/** Salen de la mesa (vinculados: vuelven a "sin asignar"). */
const QUITAR = [
  ['Limón', 'Maki'],
  ['Limón', 'Rosalía'],
];

/** Entran como texto (comensal manual). El tercer valor los pone delante. */
const ANADIR = [
  ['Novios', 'Alberto', true],
  ['Novios', 'María', true],
  ['Limón', 'Macarena', false],
];

function manual(nombre, i) {
  return {
    key: `manual|${Date.now()}-${i}-${Math.random().toString(36).slice(2, 8)}`,
    nombre, nucleo: '', lado: '', manual: true, preboda: true,
  };
}

/** ¿Coinciden los nombres de la mesa con el listado (como multiconjunto)? */
function mismoReparto(nombres, listado) {
  const a = nombres.map(norm).sort();
  const b = listado.map(norm).sort();
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

async function main() {
  const listado = parseMesasBanquete();
  console.log(`Listado: ${listado.length} mesas / ${listado.reduce((s, m) => s + m.invitados.length, 0)} personas ✓`);

  const app = initializeApp(firebaseConfig(loadEnv()));
  const db = getFirestore(app);
  await signInAnonymously(getAuth(app));
  const docs = (await getDocs(collection(db, 'mesas'))).docs.map((d) => ({ id: d.id, ...d.data() }));

  // ---------- GUARDA DE IDEMPOTENCIA ----------
  const nuevos = new Set(listado.map((m) => m.nombre));
  const yaHecho = docs.filter((d) => nuevos.has(d.nombre) || 'grupo' in d || 'presidencial' in d);
  if (yaHecho.length) {
    console.error(`⚠️  ${yaHecho.length} mesa(s) ya están reconciliadas (${yaHecho.map((d) => d.nombre).join(', ')}).`);
    console.error('    NO se escribe nada.');
    process.exit(2);
  }
  if (docs.length !== MESAS_ESPERADAS) {
    console.error(`⚠️  Se esperaban ${MESAS_ESPERADAS} mesas en Firestore y hay ${docs.length}. NO se escribe nada.`);
    process.exit(2);
  }

  // ---------- Plan en memoria ----------
  const plan = [];
  for (const m of listado) {
    const d = docs.find((x) => x.nombre === MESA_ACTUAL[m.nombre]);
    if (!d) throw new Error(`No encuentro la mesa actual "${MESA_ACTUAL[m.nombre]}" para "${m.nombre}". No se escribe nada.`);
    let comensales = (d.comensales || []).map((c) => ({ ...c }));

    RENOMBRAR.filter(([mesa]) => mesa === m.nombre).forEach(([, de, a]) => {
      const c = comensales.find((x) => x.nombre === de);
      if (!c) throw new Error(`"${m.nombre}": no está "${de}" para renombrarlo. No se escribe nada.`);
      c.nombre = a;
    });
    QUITAR.filter(([mesa]) => mesa === m.nombre).forEach(([, nombre]) => {
      const i = comensales.findIndex((x) => x.nombre === nombre);
      if (i < 0) throw new Error(`"${m.nombre}": no está "${nombre}" para quitarlo. No se escribe nada.`);
      comensales.splice(i, 1);
    });
    const delante = [];
    ANADIR.filter(([mesa]) => mesa === m.nombre).forEach(([, nombre, alPrincipio], i) => {
      (alPrincipio ? delante : comensales).push(manual(nombre, i));
    });
    comensales = [...delante, ...comensales];

    if (!mismoReparto(comensales.map((c) => c.nombre), m.invitados)) {
      throw new Error(`"${m.nombre}" no cuadra con el listado tras aplicar los cambios: `
        + `${comensales.map((c) => c.nombre).join(', ')}. No se escribe nada.`);
    }
    // El flag de preboda de los que ya estaban NO cambia (copiado tal cual)
    plan.push({
      id: d.id,
      antes: d.nombre,
      cambios: {
        nombre: m.nombre,
        grupo: m.grupo,
        capacidad: m.capacidad,
        presidencial: m.nombre === MESA_PRESIDENCIAL,
        comensales,
      },
    });
  }

  const total = plan.reduce((s, p) => s + p.cambios.comensales.length, 0);
  const keys = plan.flatMap((p) => p.cambios.comensales.map((c) => c.key));
  if (new Set(keys).size !== keys.length) throw new Error('Hay keys de comensal repetidas. No se escribe nada.');
  if (total !== PERSONAS_ESPERADAS) throw new Error(`El plan da ${total} comensales, no ${PERSONAS_ESPERADAS}. No se escribe nada.`);

  plan.forEach((p) => console.log(`  "${p.antes}" → ${p.cambios.nombre} (${p.cambios.grupo}) `
    + `${p.cambios.comensales.length}/${p.cambios.capacidad}${p.cambios.presidencial ? ' · PRESIDENCIAL' : ''}`));
  if (DRY) {
    console.log(`\n[dry-run] ${plan.length} mesas / ${total} comensales. Nada escrito.`);
    process.exit(0);
  }

  const batch = writeBatch(db);
  plan.forEach((p) => batch.update(doc(db, 'mesas', p.id), { ...p.cambios, updatedAt: serverTimestamp() }));
  await batch.commit();

  // ---------- Verificación releyendo ----------
  const snap = await getDocs(collection(db, 'mesas'));
  const n = snap.docs.reduce((s, d) => s + (d.data().comensales || []).length, 0);
  const pres = snap.docs.filter((d) => d.data().presidencial === true).map((d) => d.data().nombre);
  const okListado = listado.every((m) => {
    const d = snap.docs.find((x) => x.data().nombre === m.nombre);
    return d && d.data().capacidad === m.capacidad
      && mismoReparto(d.data().comensales.map((c) => c.nombre), m.invitados);
  });
  console.log(`\nVerificación en Firestore: ${snap.size} mesas, ${n} comensales, presidencial: ${pres.join(', ') || '—'}.`);
  if (snap.size === MESAS_ESPERADAS && n === PERSONAS_ESPERADAS && okListado && pres.length === 1) {
    console.log(`✓ Reconciliación correcta (${MESAS_ESPERADAS} mesas / ${PERSONAS_ESPERADAS} comensales).`);
    process.exit(0);
  }
  console.error('✗ Los recuentos NO cuadran. Revisa la colección.');
  process.exit(1);
}

main().catch((err) => { console.error('Error:', err.message || err); process.exit(1); });
