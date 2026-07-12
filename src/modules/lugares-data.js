/* =================================================================
   LUGARES — capa de datos compartida (Firestore, colección "lugares").

   La usan:
   · la sección pública "Nuestros lugares" (solo lectura), y
   · el panel /resultados, pestaña "Lugares" (crear/editar/borrar).

   Documento en Firestore (el id del documento hace de id del lugar):
     { x: 0-100, y: 0-100,      // posición en % sobre la ilustración
       titulo, texto,           // contenido de la tarjeta
       orden }                  // orden de lectura (menor = primero)

   Si Firebase no está configurado (.env vacío / modo test), la lectura
   devuelve SEED_LUGARES para poder desarrollar sin credenciales.
   ================================================================= */

import { db, isConfigured } from '../firebase.js';
import {
  collection, doc, getDocs, setDoc, addDoc, deleteDoc, updateDoc, orderBy, query,
} from 'firebase/firestore';

/** Lugares de ejemplo: siembra inicial y respaldo sin Firebase. */
export const SEED_LUGARES = [
  { id: 'catedral-murcia', x: 14, y: 30, orden: 1, titulo: 'Catedral de Murcia',
    texto: '[Aquí irá la explicación de este lugar y por qué es especial para nosotros.]' },
  { id: 'noria', x: 29, y: 28, orden: 2, titulo: 'La Noria',
    texto: '[Aquí irá la explicación de este lugar y por qué es especial para nosotros.]' },
  { id: 'casa', x: 56, y: 30, orden: 3, titulo: 'La casa',
    texto: '[Aquí irá la explicación de este lugar y por qué es especial para nosotros.]' },
  { id: 'pilar-zaragoza', x: 81, y: 38, orden: 4, titulo: 'Basílica del Pilar',
    texto: '[Aquí irá la explicación de este lugar y por qué es especial para nosotros.]' },
  { id: 'puente', x: 5, y: 58, orden: 5, titulo: 'El puente',
    texto: '[Aquí irá la explicación de este lugar y por qué es especial para nosotros.]' },
  { id: 'barca-limones', x: 9, y: 78, orden: 6, titulo: 'La barca y los limones',
    texto: '[Aquí irá la explicación de este lugar y por qué es especial para nosotros.]' },
];

/** Deja solo los campos que aceptan las reglas, con tipos correctos. */
function toDoc(lugar) {
  return {
    x: Number(lugar.x),
    y: Number(lugar.y),
    titulo: String(lugar.titulo).trim(),
    texto: String(lugar.texto).trim(),
    orden: Number(lugar.orden) || 0,
  };
}

/** Lee TODOS los documentos (activos y papelera), ordenados. */
async function fetchTodos() {
  const snap = await getDocs(query(collection(db, 'lugares'), orderBy('orden')));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/** Lugares ACTIVOS (los que ve la web pública y la lista normal del
    panel: se filtra la papelera). Sin Firebase → SEED (respaldo). */
export async function fetchLugares() {
  if (!isConfigured) return [...SEED_LUGARES];
  return (await fetchTodos()).filter((l) => l.deleted !== true);
}

/** Lugares en la PAPELERA (deleted: true). */
export async function fetchLugaresPapelera() {
  if (!isConfigured) return [];
  return (await fetchTodos()).filter((l) => l.deleted === true);
}

/** Soft delete: mueve el lugar a la papelera (recuperable). */
export async function softDeleteLugar(id) {
  await updateDoc(doc(db, 'lugares', id), { deleted: true });
}

/** Restaura un lugar de la papelera. */
export async function restoreLugar(id) {
  await updateDoc(doc(db, 'lugares', id), { deleted: false });
}

/** Borrado DEFINITIVO (irreversible): elimina el documento de verdad. */
export async function deleteLugarForever(id) {
  await deleteDoc(doc(db, 'lugares', id));
}

/** Crea (id = null) o actualiza (con id) un lugar. Devuelve su id. */
export async function saveLugar(id, lugar) {
  if (id) {
    await setDoc(doc(db, 'lugares', id), toDoc(lugar));
    return id;
  }
  const ref = await addDoc(collection(db, 'lugares'), toDoc(lugar));
  return ref.id;
}

/** Siembra los lugares de ejemplo (para la primera vez, desde el panel). */
export async function seedLugares() {
  for (const lugar of SEED_LUGARES) {
    await setDoc(doc(db, 'lugares', lugar.id), toDoc(lugar));
  }
}
