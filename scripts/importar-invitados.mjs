/* =================================================================
   IMPORTACIÓN de la lista de invitados a Firestore (colección "invitados").

   Uso:  node scripts/importar-invitados.mjs

   · Parsea datos/invitados.txt (91 núcleos, 207 personas).
   · Cada NÚCLEO es un documento con id AUTOGENERADO (nunca el nombre:
     hay núcleos repetidos — "Pili" x2, "Celia" x2, "Ana" x2… — que no
     deben pisarse).
   · GUARDA DE IDEMPOTENCIA: si la colección ya tiene documentos, el
     script ABORTA sin escribir nada (para no duplicar los 91 núcleos).
     No hay flag para forzar: si de verdad quieres reimportar, borra la
     colección a mano desde la consola de Firebase primero.
   · Al terminar relee la colección y verifica 91 núcleos / 207 personas.

   Necesita el .env del proyecto (credenciales Firebase) y el proveedor
   de acceso ANÓNIMO activo: las reglas exigen sesión para escribir en
   "invitados".
   ================================================================= */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import {
  getFirestore, collection, doc, getDocs, writeBatch, serverTimestamp,
} from 'firebase/firestore';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/* ---------- .env (sin dependencia de dotenv) ---------- */
function loadEnv() {
  const env = {};
  const raw = readFileSync(resolve(ROOT, '.env'), 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2];
  }
  return env;
}

/* ---------- Parser de datos/invitados.txt ----------
   Formato:
     LADO: MARÍA / LADO: ALBERTO          → lado novia / novio
     • Nombre  [Etiqueta1, Etiqueta2]  (n) → núcleo
         - Nombre  (estado[, niño])        → persona
   El paréntesis de estado es SIEMPRE el último de la línea: hay nombres
   con paréntesis propios ("Acompañante de Ana (por confirmar)").       */
function parseInvitados(txt) {
  const nucleos = [];
  let lado = null;
  let nucleo = null;

  for (const rawLine of txt.split(/\r?\n/)) {
    const line = rawLine.trim();

    const mLado = line.match(/^LADO:\s+(.+?)\s+\(/);
    if (mLado) {
      lado = mLado[1].toUpperCase().includes('MAR') ? 'novia' : 'novio';
      continue;
    }

    const mNucleo = line.match(/^•\s+(.+?)\s+\[([^\]]+)\]\s+\((\d+)\)$/);
    if (mNucleo) {
      if (!lado) throw new Error(`Núcleo antes de un encabezado LADO: "${line}"`);
      nucleo = {
        nombre: mNucleo[1].trim(),
        lado,
        etiquetas: mNucleo[2].split(',').map((s) => s.trim()).filter(Boolean),
        declarados: Number(mNucleo[3]),
        personas: [],
      };
      nucleos.push(nucleo);
      continue;
    }

    // Persona: el ESTADO es el último paréntesis (greedy en el nombre)
    const mPersona = line.match(/^-\s+(.*\S)\s+\(([^()]+)\)$/);
    if (mPersona && nucleo) {
      const flags = mPersona[2].split(',').map((s) => s.trim());
      const estado = flags[0];
      if (!['confirmado', 'pendiente', 'no_asiste'].includes(estado)) {
        throw new Error(`Estado desconocido "${estado}" en: "${line}"`);
      }
      nucleo.personas.push({
        nombre: mPersona[1].trim(),
        nino: flags.includes('niño'),
        estado,
        regalo: null,          // dinero regalado individual (null = sin apuntar)
      });
    }
  }

  // Validación: el (n) declarado de cada núcleo debe cuadrar
  for (const n of nucleos) {
    if (n.personas.length !== n.declarados) {
      throw new Error(`El núcleo "${n.nombre}" declara ${n.declarados} personas pero se han leído ${n.personas.length}.`);
    }
  }
  return nucleos;
}

/* ---------- Programa principal ---------- */
async function main() {
  const txt = readFileSync(resolve(ROOT, 'datos', 'invitados.txt'), 'utf8');
  const nucleos = parseInvitados(txt);
  const totalPersonas = nucleos.reduce((s, n) => s + n.personas.length, 0);

  console.log(`Parseados: ${nucleos.length} núcleos, ${totalPersonas} personas.`);
  if (nucleos.length !== 91 || totalPersonas !== 207) {
    throw new Error(`Se esperaban 91 núcleos / 207 personas y hay ${nucleos.length} / ${totalPersonas}. No se importa nada.`);
  }

  const env = loadEnv();
  const app = initializeApp({
    apiKey: env.VITE_FIREBASE_API_KEY,
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: env.VITE_FIREBASE_APP_ID,
  });
  const db = getFirestore(app);

  console.log('Iniciando sesión anónima (las reglas exigen sesión)…');
  await signInAnonymously(getAuth(app));

  // GUARDA DE IDEMPOTENCIA: si ya hay documentos, no tocar nada.
  const existentes = await getDocs(collection(db, 'invitados'));
  if (existentes.size > 0) {
    console.error(`⚠️  La colección "invitados" YA tiene ${existentes.size} documentos.`);
    console.error('    Para no duplicar núcleos, NO se importa nada. Si de verdad');
    console.error('    quieres reimportar, borra antes la colección desde la consola.');
    process.exit(2);
  }

  // Escritura en batches (91 docs; el límite de un batch es 500)
  console.log('Importando 91 núcleos…');
  const batch = writeBatch(db);
  nucleos.forEach((n, i) => {
    const ref = doc(collection(db, 'invitados'));   // id autogenerado
    batch.set(ref, {
      nombre: n.nombre,
      lado: n.lado,
      etiquetas: n.etiquetas,
      personas: n.personas,
      regalo: null,            // dinero regalado del núcleo (null = sin apuntar)
      orden: i,                // conserva el orden del listado original
      createdAt: serverTimestamp(),
    });
  });
  await batch.commit();

  // Verificación releyendo la colección
  const snap = await getDocs(collection(db, 'invitados'));
  let personas = 0;
  snap.forEach((d) => { personas += (d.data().personas || []).length; });
  console.log(`Verificación en Firestore: ${snap.size} núcleos, ${personas} personas.`);
  if (snap.size === 91 && personas === 207) {
    console.log('✓ Importación correcta (91 núcleos / 207 personas).');
  } else {
    console.error('✗ Los recuentos NO cuadran. Revisa la colección en la consola.');
    process.exit(1);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error('Error en la importación:', err.message || err);
  process.exit(1);
});
