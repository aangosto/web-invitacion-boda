/* =================================================================
   PLANO DEL SALÓN — capa de datos.

   · Medidas del salón: documento plano/salon
       { ancho, largo, rejilla, iman, updatedAt }   (metros)
   · Cada mesa: la MISMA colección "mesas" que usa mesas.html. Esta
     página solo escribe los campos del plano:
       forma, x, y, rot, icono, asientos, capacidad, presidencial,
       numero (nº de mesa 1-15 del plano de la finca; null = se borra),
       asientoInicio (silla física que lleva el nº 1; 0 = la cabecera)
     De `comensales` SOLO toca `estrella` (bool) y `nota` (≤60) de UN
     comensal, en una transacción que conserva todo lo demás
     (guardaDestacado). El reparto de gente sigue siendo cosa de
     mesas.html. Todo con updateDoc (no pisa el resto del documento).
   · Copias de seguridad de la colocación: colección planoCopias
       { motivo, mesas: [{ id, nombre, x, y, rot, forma? }], createdAt }
     (x/y null = la mesa no tenía posición guardada; `forma` solo en las
     copias de "Colocar como la finca", que cambia la de la presidencial;
     `numero` solo en las de "Intercambiar", que cambia números).
     "Distribuir mesas" y "Colocar como la finca" crean una ANTES de sobrescribir; "Deshacer distribución" restaura la
     última y la borra (pila: deshaciendo varias veces se vuelve atrás
     distribución a distribución hasta la colocación manual).
   ================================================================= */

import { db } from '../firebase.js';
import {
  collection, doc, getDoc, getDocs, setDoc, updateDoc, addDoc, deleteDoc, writeBatch,
  orderBy, query, limit, serverTimestamp, deleteField, runTransaction,
} from 'firebase/firestore';
import {
  FORMAS, PLANO_DEFAULT, numeroValido, NOTA_MAX, conDestacado,
} from './plano-geom.js';

const CAMPOS_PLANO = ['forma', 'x', 'y', 'rot', 'icono', 'asientos', 'capacidad', 'presidencial', 'numero', 'asientoInicio'];

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
        ? m.comensales.map((c) => ({
          key: String(c.key || ''), nombre: String(c.nombre || ''),
          estrella: c.estrella === true, nota: typeof c.nota === 'string' ? c.nota.slice(0, NOTA_MAX) : '',
        }))
        : [],
      presidencial: m.presidencial === true,
      numero: numeroValido(m.numero),
      forma: FORMAS.includes(m.forma) ? m.forma : 'redonda',
      x: typeof m.x === 'number' ? m.x : null,
      y: typeof m.y === 'number' ? m.y : null,
      rot: typeof m.rot === 'number' ? m.rot : 0,
      icono: typeof m.icono === 'string' ? m.icono : '',
      asientos: Array.isArray(m.asientos) ? m.asientos.map(String) : null,
      asientoInicio: Number.isInteger(m.asientoInicio) && m.asientoInicio >= 0 ? m.asientoInicio : 0,
    };
  });
}

/** Guarda campos del plano de una mesa (lista blanca: nunca comensales). */
export async function updateMesaPlano(id, cambios) {
  const limpio = {};
  Object.keys(cambios).forEach((k) => {
    if (CAMPOS_PLANO.includes(k)) limpio[k] = cambios[k];
  });
  if ('numero' in limpio && limpio.numero == null) limpio.numero = deleteField();
  await updateDoc(doc(db, 'mesas', id), { ...limpio, updatedAt: serverTimestamp() });
}

/**
 * ★ y nota de UN comensal (por su key). Transacción: lee la mesa, cambia
 * solo esos dos campos de ese comensal (estrella false / nota vacía = se
 * quitan) y conserva el resto de la lista tal cual (preboda, núcleo…).
 * Devuelve false si el comensal ya no está en la mesa.
 */
export async function guardaDestacado(mesaId, key, { estrella, nota }) {
  const ref = doc(db, 'mesas', mesaId);
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const lista = snap.exists() && Array.isArray(snap.data().comensales) ? snap.data().comensales : [];
    const nueva = conDestacado(lista, key, { estrella, nota });
    if (!nueva) return false;
    tx.update(ref, { comensales: nueva, updatedAt: serverTimestamp() });
    return true;
  });
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
 * `forma` y `numero` (opcionales) también se guardan si vienen (numero
 * null = sin número; lo usa "Intercambiar mesas" y su deshacer).
 */
export async function guardaPosiciones(lista) {
  const batch = writeBatch(db);
  lista.forEach((item) => {
    const { id, x, y, rot, forma } = item;
    const sinPos = x == null || y == null;
    const cambios = {
      x: sinPos ? deleteField() : x,
      y: sinPos ? deleteField() : y,
      rot: typeof rot === 'number' ? rot : 0,
      updatedAt: serverTimestamp(),
    };
    if (FORMAS.includes(forma)) cambios.forma = forma;
    if ('numero' in item) cambios.numero = numeroValido(item.numero) ?? deleteField();
    batch.update(doc(db, 'mesas', id), cambios);
  });
  await batch.commit();
}

/** Copia de la colocación actual. Devuelve su id. */
export async function crearCopia(mesas, motivo) {
  const ref = await addDoc(collection(db, 'planoCopias'), {
    motivo: String(motivo).slice(0, 60),
    mesas: mesas.map((m) => {
      const e = { id: m.id, nombre: m.nombre, x: m.x, y: m.y, rot: m.rot };
      if (m.forma) e.forma = m.forma;
      if ('numero' in m) e.numero = m.numero ?? null;
      return e;
    }),
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
