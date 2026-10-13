/* =================================================================
   Parser compartido de datos/mesas-banquete.txt (reparto definitivo).
   Formato por línea:  mesa | grupo | nº | invitado, invitado, …
   Verifica que el nº declarado coincide con los nombres de la línea y
   que el total es 16 mesas / 166 personas.
   ================================================================= */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const MESAS_ESPERADAS = 16;
export const PERSONAS_ESPERADAS = 166;
export const MESA_PRESIDENCIAL = 'Novios';

export function loadEnv() {
  const env = {};
  for (const line of readFileSync(resolve(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2];
  }
  return env;
}

export function firebaseConfig(env) {
  return {
    apiKey: env.VITE_FIREBASE_API_KEY,
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: env.VITE_FIREBASE_APP_ID,
  };
}

/** minúsculas, sin tildes ni espacios sobrantes (para comparar nombres) */
export function norm(s) {
  return String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ').trim();
}

export function parseMesasBanquete() {
  const txt = readFileSync(resolve(ROOT, 'datos', 'mesas-banquete.txt'), 'utf8');
  const mesas = [];
  txt.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line) return;
    const partes = line.split('|').map((s) => s.trim());
    if (partes.length !== 4) throw new Error(`Línea ${i + 1} mal formada: "${line}"`);
    const [nombre, grupo, numTxt, lista] = partes;
    const num = Number(numTxt);
    const invitados = lista.split(',').map((s) => s.trim()).filter(Boolean);
    if (!Number.isInteger(num) || num !== invitados.length) {
      throw new Error(`"${nombre}" declara ${numTxt} y tiene ${invitados.length} nombres.`);
    }
    mesas.push({ nombre, grupo, capacidad: num, invitados });
  });
  const total = mesas.reduce((s, m) => s + m.invitados.length, 0);
  if (mesas.length !== MESAS_ESPERADAS || total !== PERSONAS_ESPERADAS) {
    throw new Error(`Se esperaban ${MESAS_ESPERADAS} mesas / ${PERSONAS_ESPERADAS} personas y salen ${mesas.length} / ${total}.`);
  }
  return mesas;
}
