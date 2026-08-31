/* =================================================================
   INVITADOS — capa de datos (Firestore, colección "invitados").

   Cada documento es un NÚCLEO (id autogenerado, nunca el nombre: hay
   núcleos con el mismo nombre en la lista):
     { nombre, lado: 'novia'|'novio'|'ambos', etiquetas: [string],
       personas: [{ nombre, nino, estado, regalo, regaloMaterial }],
       regalo,            // dinero regalado del núcleo (number|null)
       regaloMaterial,    // { descripcion, valor }|null — regalo material
                          // (valor = estimación en €, opcional). Puede
                          // coexistir con el dinero: no son excluyentes.
       orden, createdAt, updatedAt }

   `estado` de cada persona: 'confirmado' | 'pendiente' | 'no_asiste'.
   Es el control INTERNO de los novios, independiente de las
   confirmaciones que llegan por la web (colección rsvp).
   `regalo` null significa "sin apuntar" (distinto de 0 €).

   Las reglas exigen sesión (anónima tras la contraseña) para TODO:
   nada de esta colección es legible sin autenticación.
   ================================================================= */

import { db } from '../firebase.js';
import {
  collection, doc, getDocs, addDoc, updateDoc, deleteDoc,
  orderBy, query, serverTimestamp,
} from 'firebase/firestore';

export const LADOS = ['novia', 'novio', 'ambos'];

/** Lado válido o 'novia' como respaldo (datos antiguos o corruptos). */
export function toLado(v) {
  return LADOS.includes(v) ? v : 'novia';
}

export const ESTADOS = ['confirmado', 'pendiente', 'no_asiste'];
export const ESTADO_LABEL = {
  confirmado: 'Confirmado',
  pendiente: 'Pendiente',
  no_asiste: 'No asiste',
};

/** Normaliza un regalo material: { descripcion, valor } o null. */
export function toRegaloMaterial(m) {
  if (!m || typeof m.descripcion !== 'string' || !m.descripcion.trim()) return null;
  return {
    descripcion: m.descripcion.trim(),
    valor: typeof m.valor === 'number' ? m.valor : null,
  };
}

/** Normaliza una persona (por si faltan campos en datos antiguos). */
export function toPersona(p) {
  return {
    nombre: String(p.nombre || '').trim(),
    nino: p.nino === true,
    estado: ESTADOS.includes(p.estado) ? p.estado : 'pendiente',
    regalo: typeof p.regalo === 'number' ? p.regalo : null,
    regaloMaterial: toRegaloMaterial(p.regaloMaterial),
  };
}

/** Todos los núcleos, en el orden del listado original. */
export async function fetchNucleos() {
  const snap = await getDocs(query(collection(db, 'invitados'), orderBy('orden')));
  return snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      nombre: data.nombre || '',
      lado: toLado(data.lado),
      etiquetas: Array.isArray(data.etiquetas) ? data.etiquetas : [],
      personas: (Array.isArray(data.personas) ? data.personas : []).map(toPersona),
      regalo: typeof data.regalo === 'number' ? data.regalo : null,
      regaloMaterial: toRegaloMaterial(data.regaloMaterial),
      orden: typeof data.orden === 'number' ? data.orden : 0,
    };
  });
}

/** Actualiza campos sueltos de un núcleo (personas, nombre, etiquetas…). */
export async function updateNucleo(id, cambios) {
  await updateDoc(doc(db, 'invitados', id), {
    ...cambios,
    updatedAt: serverTimestamp(),
  });
}

/** Crea un núcleo nuevo. Devuelve su id (autogenerado). */
export async function createNucleo({ nombre, lado, etiquetas, personas, orden }) {
  const ref = await addDoc(collection(db, 'invitados'), {
    nombre: String(nombre).trim(),
    lado: toLado(lado),
    etiquetas: etiquetas || [],
    personas: (personas || []).map(toPersona),
    regalo: null,
    regaloMaterial: null,
    orden: Number(orden) || 0,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

/** Borra un núcleo DEFINITIVAMENTE (la página pide confirmación doble). */
export async function deleteNucleo(id) {
  await deleteDoc(doc(db, 'invitados', id));
}
