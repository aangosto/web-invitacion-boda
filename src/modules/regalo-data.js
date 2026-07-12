/* =================================================================
   REGALO — capa de datos (Firestore, documento "config/regalo").

   La usan la sección pública "Regalo" de la home (solo lectura) y el
   panel /resultados, pestaña "Regalo" (edición). Campos:
     { frase, iban }
   Si Firebase no está configurado o falla la lectura, se usa el
   respaldo DEFAULT_REGALO para no quedarse en blanco.
   ================================================================= */

import { db, isConfigured } from '../firebase.js';
import { doc, getDoc, setDoc } from 'firebase/firestore';

/** Texto de respaldo (y siembra inicial). */
export const DEFAULT_REGALO = {
  frase: 'Vuestra presencia es nuestro mejor regalo. Si además queréis tener un detalle con nosotros, aquí os dejamos nuestra cuenta.',
  iban: 'ESXX XXXX XXXX XXXX XXXX XXXX',
};

const REF = () => doc(db, 'config', 'regalo');

/** Lee la frase y el IBAN. Sin Firebase / si no existe → respaldo. */
export async function fetchRegalo() {
  if (!isConfigured) return { ...DEFAULT_REGALO };
  const snap = await getDoc(REF());
  if (!snap.exists()) return { ...DEFAULT_REGALO };
  const d = snap.data();
  return {
    frase: typeof d.frase === 'string' ? d.frase : DEFAULT_REGALO.frase,
    iban: typeof d.iban === 'string' ? d.iban : DEFAULT_REGALO.iban,
  };
}

/** Guarda la frase y el IBAN (documento completo). */
export async function saveRegalo({ frase, iban }) {
  await setDoc(REF(), { frase: String(frase).trim(), iban: String(iban).trim() });
}
