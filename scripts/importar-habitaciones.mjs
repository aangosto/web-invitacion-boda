/* =================================================================
   IMPORTACIÓN del bloqueo de hotel a Firestore (colección "habitaciones").

   Uso:  node scripts/importar-habitaciones.mjs

   · Parsea datos/listado.txt (51 habitaciones del Hotel Exe Boston,
     reserva 0034652508): secciones por TIPO y sub-bloques por FECHAS.
   · Cada habitación es un documento con id AUTOGENERADO. Las
     "Pendiente de asignar" se crean con ocupantes vacíos.
   · El importe se calcula con la tarifa (habitaciones-precios.js) y se
     verifica que las 51 sumen EXACTAMENTE 12.770,00 €.
   · GUARDA DE IDEMPOTENCIA: si la colección ya tiene documentos,
     ABORTA sin escribir (igual que la importación de invitados).
   · Verificación final: 51 habitaciones, 112 pax (plazas por tipo),
     12.770,00 €.
   ================================================================= */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import {
  getFirestore, collection, doc, getDocs, writeBatch, serverTimestamp,
} from 'firebase/firestore';

import {
  calcImporte, calcNoches, TIPO_PLAZAS,
} from '../src/modules/habitaciones-precios.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function loadEnv() {
  const env = {};
  for (const line of readFileSync(resolve(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2];
  }
  return env;
}

/* ---------- Parser de datos/listado.txt ----------
   Formato:
     3 INDIVIDUALES / 35 DOBLES / 13 DOBLES CON CAMA SUPLETORIA
     Del 23 al 25 de octubre (N habitaciones):
     - Nombre / Nombre [/ Nombre]  [(+ bebé, con cuna)]
     - Pendiente de asignar                                          */
function parseListado(txt) {
  const habitaciones = [];
  let tipo = null;
  let entrada = null;
  let salida = null;
  let declaradasBloque = 0;
  let vistasBloque = 0;
  const bloques = []; // para validar los (N habitaciones) declarados

  function cierraBloque() {
    if (entrada) bloques.push({ declaradas: declaradasBloque, vistas: vistasBloque });
  }

  for (const rawLine of txt.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    const mTipo = line.match(/^\d+\s+(INDIVIDUALES|DOBLES CON CAMA SUPLETORIA|DOBLES)$/);
    if (mTipo) {
      cierraBloque();
      entrada = null;
      tipo = { INDIVIDUALES: 'individual', DOBLES: 'doble', 'DOBLES CON CAMA SUPLETORIA': 'supletoria' }[mTipo[1]];
      continue;
    }

    const mFechas = line.match(/^Del (\d+) al (\d+) de octubre \((\d+) habitaci(?:ón|ones)\):$/);
    if (mFechas) {
      cierraBloque();
      entrada = `2026-10-${String(mFechas[1]).padStart(2, '0')}`;
      salida = `2026-10-${String(mFechas[2]).padStart(2, '0')}`;
      declaradasBloque = Number(mFechas[3]);
      vistasBloque = 0;
      continue;
    }

    const mHab = line.match(/^-\s+(.+)$/);
    if (mHab) {
      if (!tipo || !entrada) throw new Error(`Habitación fuera de sección: "${line}"`);
      let resto = mHab[1].trim();
      const cuna = /\(\+\s*beb[eé],\s*con cuna\)/i.test(resto);
      resto = resto.replace(/\s*\(\+\s*beb[eé],\s*con cuna\)\s*/gi, ' ').trim();
      const pendiente = /^pendiente de asignar$/i.test(resto);
      const ocupantes = pendiente
        ? []
        : resto.split('/').map((s) => s.trim()).filter(Boolean);
      habitaciones.push({ tipo, entrada, salida, ocupantes, cuna });
      vistasBloque += 1;
    }
  }
  cierraBloque();

  for (const b of bloques) {
    if (b.declaradas !== b.vistas) {
      throw new Error(`Un bloque declara ${b.declaradas} habitaciones pero se han leído ${b.vistas}.`);
    }
  }
  return habitaciones;
}

/* ---------- Programa principal ---------- */
async function main() {
  const txt = readFileSync(resolve(ROOT, 'datos', 'listado.txt'), 'utf8');
  const habitaciones = parseListado(txt);

  // Importes y totales locales
  let totalImporte = 0;
  let totalPax = 0;
  const porTipo = { individual: 0, doble: 0, supletoria: 0 };
  let pendientes = 0;
  habitaciones.forEach((h) => {
    h.noches = calcNoches(h.entrada, h.salida);
    h.importe = calcImporte(h.tipo, h.entrada, h.salida);
    totalImporte += h.importe;
    totalPax += TIPO_PLAZAS[h.tipo];
    porTipo[h.tipo] += 1;
    if (h.ocupantes.length === 0) pendientes += 1;
  });

  console.log(`Parseadas: ${habitaciones.length} habitaciones `
    + `(${porTipo.individual} ind, ${porTipo.doble} dobles, ${porTipo.supletoria} supletorias), `
    + `${totalPax} pax, ${pendientes} pendientes de asignar.`);
  console.log(`Importe total calculado: ${totalImporte.toFixed(2)} €`);

  if (habitaciones.length !== 51) throw new Error(`Se esperaban 51 habitaciones y hay ${habitaciones.length}. No se importa.`);
  if (totalPax !== 112) throw new Error(`Se esperaban 112 pax y salen ${totalPax}. No se importa.`);
  if (totalImporte !== 12770) throw new Error(`El total debía ser 12.770,00 € y sale ${totalImporte.toFixed(2)} €. No se importa.`);
  if (porTipo.individual !== 3 || porTipo.doble !== 35 || porTipo.supletoria !== 13 || pendientes !== 6) {
    throw new Error('El desglose por tipo o los "pendiente de asignar" no cuadran con el resumen. No se importa.');
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

  // GUARDA DE IDEMPOTENCIA
  const existentes = await getDocs(collection(db, 'habitaciones'));
  if (existentes.size > 0) {
    console.error(`⚠️  La colección "habitaciones" YA tiene ${existentes.size} documentos.`);
    console.error('    Para no duplicar, NO se importa nada. Si de verdad quieres');
    console.error('    reimportar, borra antes la colección desde la consola.');
    process.exit(2);
  }

  console.log('Importando 51 habitaciones…');
  const batch = writeBatch(db);
  habitaciones.forEach((h, i) => {
    const ref = doc(collection(db, 'habitaciones'));
    batch.set(ref, {
      tipo: h.tipo,
      entrada: h.entrada,
      salida: h.salida,
      noches: h.noches,
      ocupantes: h.ocupantes,
      cuna: h.cuna,
      importe: h.importe,
      pagado: false,
      cobrado: null,     // importe realmente recibido (null = nada apuntado)
      notas: '',
      orden: i,
      createdAt: serverTimestamp(),
    });
  });
  await batch.commit();

  // Verificación releyendo la colección
  const snap = await getDocs(collection(db, 'habitaciones'));
  let pax = 0;
  let importe = 0;
  snap.forEach((d) => {
    const data = d.data();
    pax += TIPO_PLAZAS[data.tipo] || 0;
    importe += data.importe || 0;
  });
  console.log(`Verificación en Firestore: ${snap.size} habitaciones, ${pax} pax, ${importe.toFixed(2)} €.`);
  if (snap.size === 51 && pax === 112 && importe === 12770) {
    console.log('✓ Importación correcta (51 habitaciones / 112 pax / 12.770,00 €).');
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
