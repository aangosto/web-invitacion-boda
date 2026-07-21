/* =================================================================
   Capa de datos del RANKING del juego (colección "scores").
   Si Firebase está configurado, lee/escribe en Firestore en vivo.
   Si no, usa localStorage como respaldo para poder desarrollar sin
   credenciales. El resto del código no necesita saber cuál se usa.
   ================================================================= */

import { db, isConfigured } from '../firebase.js';
import {
  collection, addDoc, doc, updateDoc, onSnapshot, query, orderBy, limit, serverTimestamp,
} from 'firebase/firestore';

// Se leen las mejores puntuaciones y se reparten por equipo en el cliente
// (evita tener que crear un índice compuesto en Firestore). El tope es
// holgado porque el marcador global suma TODAS las partidas guardadas.
const TOP_LIMIT = 500;

/* ---------- Firestore ---------- */
async function saveFirestore(score) {
  const ref = await addDoc(collection(db, 'scores'), {
    name: score.name,          // '' = partida anónima (cuenta al global)
    team: score.team,          // 'novia' | 'novio'
    points: score.points,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}
function nameFirestore(id, name) {
  // Las reglas solo permiten esto si el registro sigue con name == ''
  return updateDoc(doc(db, 'scores', id), { name });
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
  const id = `loc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  all.push({ ...score, id, createdAt: Date.now() });
  localStorage.setItem(KEY, JSON.stringify(all));
  listeners.forEach((fn) => fn(all));
  await new Promise((r) => setTimeout(r, 150));
  return id;
}
async function nameLocal(id, name) {
  const all = readLocal().map((s) => (s.id === id && !s.name ? { ...s, name } : s));
  localStorage.setItem(KEY, JSON.stringify(all));
  listeners.forEach((fn) => fn(all));
}
function watchLocal(cb) {
  listeners.add(cb);
  cb(readLocal());
  return () => listeners.delete(cb);
}

/* ---------- API pública ---------- */
/**
 * Guarda una puntuación (con name: '' es una partida anónima: suma al
 * marcador global aunque no entre en el Top 3).
 * @param {{name:string, team:'novia'|'novio', points:number}} score
 * @returns {Promise<string>} id del registro creado
 */
export function saveScore(score) {
  return isConfigured ? saveFirestore(score) : saveLocal(score);
}

/**
 * Pone nombre a una partida guardada anónima (una sola vez): el mismo
 * registro pasa a contar también para el Top 3, sin duplicar puntos.
 * @param {string} id id devuelto por saveScore
 * @param {string} name
 * @returns {Promise<void>}
 */
export function nameScore(id, name) {
  return isConfigured ? nameFirestore(id, name) : nameLocal(id, name);
}

/**
 * Suscribe un callback a los cambios del ranking (en vivo).
 * @param {(scores:Array)=>void} cb
 * @returns {()=>void} cancela la suscripción
 */
export function watchRanking(cb) {
  return isConfigured ? watchFirestore(cb) : watchLocal(cb);
}
