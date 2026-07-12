/* =================================================================
   Capa de datos del RANKING del juego (colección "scores").
   Si Firebase está configurado, lee/escribe en Firestore en vivo.
   Si no, usa localStorage como respaldo para poder desarrollar sin
   credenciales. El resto del código no necesita saber cuál se usa.
   ================================================================= */

import { db, isConfigured } from '../firebase.js';
import {
  collection, addDoc, onSnapshot, query, orderBy, limit, serverTimestamp,
} from 'firebase/firestore';

// Se leen las mejores puntuaciones y se reparten por equipo en el cliente
// (evita tener que crear un índice compuesto en Firestore).
const TOP_LIMIT = 100;

/* ---------- Firestore ---------- */
async function saveFirestore(score) {
  await addDoc(collection(db, 'scores'), {
    name: score.name,
    team: score.team,          // 'novia' | 'novio'
    points: score.points,
    createdAt: serverTimestamp(),
  });
  return true;
}
function watchFirestore(cb) {
  const q = query(collection(db, 'scores'), orderBy('points', 'desc'), limit(TOP_LIMIT));
  return onSnapshot(
    q,
    // Las puntuaciones en la papelera del panel (deleted) no se muestran
    (snap) => cb(snap.docs.map((d) => d.data()).filter((s) => s.deleted !== true)),
    (err) => console.error('[scores] onSnapshot:', err)
  );
}

/* ---------- Respaldo local (sin Firebase) ---------- */
const KEY = 'ma-scores';
const listeners = new Set();
function readLocal() {
  try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch (_) { return []; }
}
async function saveLocal(score) {
  const all = readLocal();
  all.push({ ...score, createdAt: Date.now() });
  localStorage.setItem(KEY, JSON.stringify(all));
  listeners.forEach((fn) => fn(all));
  await new Promise((r) => setTimeout(r, 150));
  return true;
}
function watchLocal(cb) {
  listeners.add(cb);
  cb(readLocal());
  return () => listeners.delete(cb);
}

/* ---------- API pública ---------- */
/**
 * Guarda una puntuación en el ranking.
 * @param {{name:string, team:'novia'|'novio', points:number}} score
 * @returns {Promise<boolean>}
 */
export function saveScore(score) {
  return isConfigured ? saveFirestore(score) : saveLocal(score);
}

/**
 * Suscribe un callback a los cambios del ranking (en vivo).
 * @param {(scores:Array)=>void} cb
 * @returns {()=>void} cancela la suscripción
 */
export function watchRanking(cb) {
  return isConfigured ? watchFirestore(cb) : watchLocal(cb);
}
