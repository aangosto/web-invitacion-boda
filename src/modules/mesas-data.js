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
         preboda }],         // true = viene a la preboda (por defecto
                             // true; viaja con el comensal al moverlo)
       orden, createdAt, updatedAt }

   La página cruza cada `key` con la colección "invitados" al cargar
   (SOLO lectura de invitados) para detectar cambios de estado o
   personas borradas; aquí solo se guarda el snapshot.
   Las reglas exigen sesión para TODO.
   ================================================================= */

import { db } from '../firebase.js';
import {
  collection, doc, getDocs, addDoc, updateDoc, deleteDoc,
  orderBy, query, serverTimestamp,
} from 'firebase/firestore';

function toComensal(c) {
  return {
    key: String(c.key || ''),
    nombre: String(c.nombre || '').trim(),
    nucleo: String(c.nucleo || '').trim(),
    lado: ['novia', 'novio', 'ambos'].includes(c.lado) ? c.lado : '',
    manual: c.manual === true,
    // Por defecto SÍ viene: solo un false explícito lo desactiva
    preboda: c.preboda !== false,
  };
}

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
