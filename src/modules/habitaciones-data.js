/* =================================================================
   HABITACIONES — capa de datos (Firestore, colección "habitaciones").

   Cada documento es una habitación del bloqueo del hotel (id
   autogenerado):
     { tipo: 'individual'|'doble'|'supletoria',
       entrada, salida,     // ISO 'aaaa-mm-dd'
       noches,              // nº de noches (salida - entrada)
       ocupantes: [string], // vacío = pendiente de asignar
       cuna,                // lleva cuna/bebé
       importe,             // lo que debe según tarifa (€, IVA incl.)
       pagado,              // control de pago (bool)
       cobrado,             // € realmente recibidos (number|null)
       notas, orden, createdAt, updatedAt }

   Las reglas exigen sesión para TODO (nombres reales + importes).
   La tarifa y el cálculo de importes están en habitaciones-precios.js.
   ================================================================= */

import { db } from '../firebase.js';
import {
  collection, doc, getDocs, addDoc, updateDoc, deleteDoc,
  orderBy, query, serverTimestamp,
} from 'firebase/firestore';
import { TIPOS, calcNoches, calcImporte } from './habitaciones-precios.js';

/** Todas las habitaciones, en el orden del listado original. */
export async function fetchHabitaciones() {
  const snap = await getDocs(query(collection(db, 'habitaciones'), orderBy('orden')));
  return snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      tipo: TIPOS.includes(data.tipo) ? data.tipo : 'doble',
      entrada: data.entrada || '',
      salida: data.salida || '',
      noches: typeof data.noches === 'number' ? data.noches : 0,
      ocupantes: Array.isArray(data.ocupantes)
        ? data.ocupantes.map((o) => String(o).trim()).filter(Boolean)
        : [],
      cuna: data.cuna === true,
      importe: typeof data.importe === 'number' ? data.importe : 0,
      pagado: data.pagado === true,
      cobrado: typeof data.cobrado === 'number' ? data.cobrado : null,
      notas: typeof data.notas === 'string' ? data.notas : '',
      orden: typeof data.orden === 'number' ? data.orden : 0,
    };
  });
}

/** Actualiza campos sueltos (pagado, cobrado, ocupantes…). */
export async function updateHabitacion(id, cambios) {
  await updateDoc(doc(db, 'habitaciones', id), {
    ...cambios,
    updatedAt: serverTimestamp(),
  });
}

/** Crea una habitación nueva (importe y noches por tarifa). */
export async function createHabitacion({ tipo, entrada, salida, ocupantes, cuna, notas, orden }) {
  const ref = await addDoc(collection(db, 'habitaciones'), {
    tipo,
    entrada,
    salida,
    noches: calcNoches(entrada, salida),
    ocupantes: ocupantes || [],
    cuna: cuna === true,
    importe: calcImporte(tipo, entrada, salida),
    pagado: false,
    cobrado: null,
    notas: notas || '',
    orden: Number(orden) || 0,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

/** Borra una habitación DEFINITIVAMENTE (la página confirma dos veces). */
export async function deleteHabitacion(id) {
  await deleteDoc(doc(db, 'habitaciones', id));
}
