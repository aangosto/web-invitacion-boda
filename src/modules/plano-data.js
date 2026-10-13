/* =================================================================
   PLANO DEL SALÓN — capa de datos.

   · Medidas del salón: documento plano/salon
       { ancho, largo, rejilla, iman, updatedAt }   (metros)
   · Cada mesa: la MISMA colección "mesas" que usa mesas.html. Esta
     página solo escribe los campos del plano:
       forma, x, y, rot, icono, asientos, capacidad, presidencial
     NUNCA `comensales` (ni su flag de preboda): el reparto de gente
     sigue siendo cosa de mesas.html. Todo con updateDoc (no pisa el
     resto del documento).
   · Copias de seguridad de la colocación: colección planoCopias
       { motivo, mesas: [{ id, nombre, x, y, rot }], createdAt }
     (x/y null = la mesa no tenía posición guardada). "Distribuir mesas"
     crea una ANTES de sobrescribir; "Deshacer distribución" restaura la
     última y la borra (pila: deshaciendo varias veces se vuelve atrás
     distribución a distribución hasta la colocación manual).
   ================================================================= */

import { db } from '../firebase.js';
import {
  collection, doc, getDoc, getDocs, setDoc, updateDoc, addDoc, deleteDoc, writeBatch,
  orderBy, query, limit, serverTimestamp, deleteField,
} from 'firebase/firestore';
import { FORMAS, PLANO_DEFAULT } from './plano-geom.js';

const CAMPOS_PLANO = ['forma', 'x', 'y', 'rot', 'icono', 'asientos', 'capacidad', 'presidencial'];

/** Medidas del salón (o las de por defecto si aún no se han guardado). */
export async function fetchPlano() {
  const snap = await getDoc(doc(db, 'plano', 'salon'));
  const d = snap.exists() ? snap.data() : {};
  return {
    ancho: typeof d.ancho === 'number' ? d.ancho : PLANO_DEFAULT.ancho,
    largo: typeof d.largo === 'number' ? d.largo : PLANO_DEFAULT.largo,
    rejilla: typeof d.rejilla === 'number' ? d.rejilla : PLANO_DEFAULT.rejilla,
    iman: typeof d.iman === 'boolean' ? d.iman : PLANO_DEFAULT.iman,
    guardado: snap.exists(),
  };
}

export async function savePlano({ ancho, largo, rejilla, iman }) {
  await setDoc(doc(db, 'plano', 'salon'), {
    ancho: Number(ancho),
    largo: Number(largo),
    rejilla: Number(rejilla),
    iman: Boolean(iman),
    updatedAt: serverTimestamp(),
  });
}

/** Mesas con los campos del plano. `comensales` es SOLO lectura aquí. */
export async function fetchMesasPlano() {
  const snap = await getDocs(query(collection(db, 'mesas'), orderBy('orden')));
  return snap.docs.map((d) => {
    const m = d.data();
    return {
      id: d.id,
      nombre: m.nombre || '',
      grupo: m.grupo || '',
      capacidad: typeof m.capacidad === 'number' ? m.capacidad : 8,
      comensales: Array.isArray(m.comensales)
        ? m.comensales.map((c) => ({ key: String(c.key || ''), nombre: String(c.nombre || '') }))
        : [],
      presidencial: m.presidencial === true,
      forma: FORMAS.includes(m.forma) ? m.forma : 'redonda',
      x: typeof m.x === 'number' ? m.x : null,
      y: typeof m.y === 'number' ? m.y : null,
      rot: typeof m.rot === 'number' ? m.rot : 0,
      icono: typeof m.icono === 'string' ? m.icono : '',
      asientos: Array.isArray(m.asientos) ? m.asientos.map(String) : null,
    };
  });
}

/** Guarda campos del plano de una mesa (lista blanca: nunca comensales). */
export async function updateMesaPlano(id, cambios) {
  const limpio = {};
  Object.keys(cambios).forEach((k) => {
    if (CAMPOS_PLANO.includes(k)) limpio[k] = cambios[k];
  });
  await updateDoc(doc(db, 'mesas', id), { ...limpio, updatedAt: serverTimestamp() });
}

/** Marca UNA mesa como presidencial (desmarca la que lo fuera antes). */
export async function setPresidencial(id, mesas) {
  const batch = writeBatch(db);
  mesas.forEach((m) => {
    const debe = m.id === id;
    if (m.presidencial !== debe) {
      batch.update(doc(db, 'mesas', m.id), { presidencial: debe, updatedAt: serverTimestamp() });
    }
  });
  await batch.commit();
}

/**
 * Guarda de golpe (un batch atómico) la posición de varias mesas.
 * `x`/`y` null borra la posición (la mesa vuelve a "sin colocar").
 */
export async function guardaPosiciones(lista) {
  const batch = writeBatch(db);
  lista.forEach(({ id, x, y, rot }) => {
    const sinPos = x == null || y == null;
    batch.update(doc(db, 'mesas', id), {
      x: sinPos ? deleteField() : x,
      y: sinPos ? deleteField() : y,
      rot: typeof rot === 'number' ? rot : 0,
      updatedAt: serverTimestamp(),
    });
  });
  await batch.commit();
}

/** Copia de la colocación actual. Devuelve su id. */
export async function crearCopia(mesas, motivo) {
  const ref = await addDoc(collection(db, 'planoCopias'), {
    motivo: String(motivo).slice(0, 60),
    mesas: mesas.map((m) => ({ id: m.id, nombre: m.nombre, x: m.x, y: m.y, rot: m.rot })),
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

/** Copias guardadas, de la más reciente a la más antigua. */
export async function fetchCopias() {
  const snap = await getDocs(query(collection(db, 'planoCopias'), orderBy('createdAt', 'desc'), limit(50)));
  return snap.docs.map((d) => {
    const data = d.data();
    return { id: d.id, mesas: data.mesas || [], fecha: data.createdAt ? data.createdAt.toDate() : null };
  });
}

export async function borraCopia(id) {
  await deleteDoc(doc(db, 'planoCopias', id));
}
