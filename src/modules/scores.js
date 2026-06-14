/* =================================================================
   Capa de datos del RANKING del juego.
   Aísla la persistencia para que el resto del código no sepa si los
   datos vienen de localStorage o de Firestore.
   >>> En esta versión: localStorage (demo). En el CAMBIO 1 (Firebase)
       estas dos funciones se reimplementan contra la colección "scores".
   ================================================================= */

const KEY = 'ma-scores';
const listeners = new Set();

function read() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || [];
  } catch (_) {
    return [];
  }
}

/**
 * Guarda una puntuación.
 * @param {{name:string, team:'novia'|'novio', points:number}} score
 * @returns {Promise<boolean>}
 */
export async function saveScore(score) {
  const all = read();
  all.push({ ...score, createdAt: Date.now() });
  localStorage.setItem(KEY, JSON.stringify(all));
  listeners.forEach((fn) => fn(all));
  await new Promise((r) => setTimeout(r, 150));
  return true;
}

/**
 * Suscribe un callback a los cambios del ranking (estilo "en vivo").
 * @param {(scores:Array)=>void} cb
 * @returns {()=>void} función para cancelar la suscripción
 */
export function watchRanking(cb) {
  listeners.add(cb);
  cb(read());
  return () => listeners.delete(cb);
}
