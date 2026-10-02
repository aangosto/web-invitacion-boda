/* =================================================================
   EXPORTAR A PDF — lectura de datos (SOLO LECTURA).

   Lee las cuatro colecciones que entran en el PDF. Cada lectura va por
   separado y nunca lanza: devuelve { ok: true, data } o
   { ok: false, error }, para que el PDF se genere igualmente y la
   sección afectada diga que no se pudo leer.

   Aquí no hay ni una escritura: solo getDocs / fetch* de lectura.
   ================================================================= */

import { db } from '../firebase.js';
import { collection, getDocs } from 'firebase/firestore';
import { fetchNucleos } from './invitados-data.js';
import { fetchMesas } from './mesas-data.js';
import { fetchHabitaciones } from './habitaciones-data.js';

const FUENTES = [
  ['rsvp', 'confirmaciones', async () => {
    const snap = await getDocs(collection(db, 'rsvp'));
    return snap.docs.map((d) => d.data());
  }],
  ['invitados', 'invitados', fetchNucleos],
  ['mesas', 'mesas', fetchMesas],
  ['habitaciones', 'habitaciones', fetchHabitaciones],
];

/** Nº de pasos de lectura (para la barra de progreso). */
export const PASOS_LECTURA = FUENTES.length;

/**
 * Lee todas las colecciones en paralelo.
 * @param onPaso (etiqueta) => void, se llama al terminar cada lectura
 * @returns { rsvp, invitados, mesas, habitaciones } con { ok, data|error }
 */
export async function leerDatosExport(onPaso = () => {}) {
  const resultados = await Promise.all(FUENTES.map(async ([clave, etiqueta, leer]) => {
    let res;
    try {
      res = { ok: true, data: await leer() };
    } catch (err) {
      console.error(`[Exportar PDF] No se ha podido leer "${clave}":`, err);
      res = { ok: false, error: (err && (err.code || err.message)) || 'error desconocido' };
    }
    onPaso(etiqueta);
    return [clave, res];
  }));
  return Object.fromEntries(resultados);
}
