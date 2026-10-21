/* =================================================================
   MESAS — capa de datos (Firestore, colección "mesas").

   Cada documento es una mesa del banquete (id autogenerado):
     { nombre,               // "Mesa 1", "Amigos de la uni"…
       capacidad,            // plazas de ESA mesa (cada una la suya)
       comensales: [{        // personas sentadas
         key,                // '<nucleoId>|<nombre>' (invitado) o
                             // 'manual|<aleatorio>' (añadido a mano)
         nombre,             // snapshot del nombre al sentarla
         nucleo, lado,       // núcleo y lado (vacíos si es manual)
         manual,             // true = escrito a mano, no está en invitados
         preboda,            // true = viene a la preboda (por defecto
                             // true; viaja con el comensal al moverlo)
         estrella, nota,     // invitado destacado (★) y nota corta
                             // (≤60); opcionales, se ponen en plano.html
         tipo, menu }],      // '' | niño/a | trona | hueco y adulto |
                             // infantil | infantil reducido | sin menú;
                             // opcionales: sin ellos se deducen (comensal.js)
       asientoInicio,        // silla que lleva el nº 1 (plano.html)
       orden, createdAt, updatedAt,
       numero }              // nº de mesa (1-15) del plano de la finca;
                             // se pone en plano.html, aquí solo se muestra

   La página cruza cada `key` con la colección "invitados" al cargar
   (SOLO lectura de invitados) para detectar cambios de estado o
   personas borradas; aquí solo se guarda el snapshot.
   Las reglas exigen sesión para TODO.
   ================================================================= */

import { db } from '../firebase.js';
import {
  collection, doc, getDocs, addDoc, updateDoc, deleteDoc,
  orderBy, query, serverTimestamp, runTransaction,
} from 'firebase/firestore';
import { toComensal, cambiaComensalEnTx } from './comensal.js';

/** Todas las mesas, por orden de creación. */
export async function fetchMesas() {
  const snap = await getDocs(query(collection(db, 'mesas'), orderBy('orden')));
  return snap.docs.map((d) => {
    const data = d.data();
    const crudos = Array.isArray(data.comensales) ? data.comensales : [];
    return {
      id: d.id,
      nombre: data.nombre || '',
      capacidad: typeof data.capacidad === 'number' ? data.capacidad : 8,
      comensales: crudos.map(toComensal),
      orden: typeof data.orden === 'number' ? data.orden : 0,
      numero: Number.isInteger(data.numero) ? data.numero : null,
      presidencial: data.presidencial === true,
      // Comensales anteriores al flag de preboda: la página se lo añade
      // (con su valor por defecto) una sola vez al cargar
      faltaPreboda: crudos.some((c) => typeof c.preboda !== 'boolean'),
    };
  });
}

/** Actualiza campos sueltos de una mesa (comensales, nombre, capacidad). */
export async function updateMesa(id, cambios) {
  await updateDoc(doc(db, 'mesas', id), {
    ...cambios,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Cambia campos de UN comensal (preboda, ★, nota, tipo, menú) en una
 * TRANSACCIÓN: lee la mesa y reescribe la lista con solo ese cambio, así
 * dos personas editando la misma mesa a la vez no se pisan. Devuelve la
 * lista guardada (normalizada) o null si el comensal ya no está.
 */
export async function guardaComensal(mesaId, key, cambios) {
  const ref = doc(db, 'mesas', mesaId);
  const nueva = await runTransaction(db, (tx) => cambiaComensalEnTx(tx, ref, key, cambios, { updatedAt: serverTimestamp() }));
  return nueva ? nueva.map(toComensal) : null;
}

/** Crea una mesa nueva. Devuelve su id (autogenerado). */
export async function createMesa({ nombre, capacidad, orden }) {
  const ref = await addDoc(collection(db, 'mesas'), {
    nombre: String(nombre).trim(),
    capacidad: Number(capacidad),
    comensales: [],
    orden: Number(orden) || 0,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

/** Borra una mesa. Sus comensales invitados vuelven a "sin asignar"
    automáticamente (solo existían dentro del documento de la mesa). */
export async function deleteMesa(id) {
  await deleteDoc(doc(db, 'mesas', id));
}
