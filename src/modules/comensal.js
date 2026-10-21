/* =================================================================
   COMENSAL — forma normalizada de cada persona sentada en una mesa
   (colección "mesas", campo `comensales`). Módulo PURO (sin Firebase):
   lo usa mesas-data.js al leer y se prueba en Node
   (scripts/test-destacados.mjs).
   ================================================================= */

/** Largo máximo de la nota de un comensal (plano.html). */
export const NOTA_MAX = 60;

export function toComensal(c) {
  return {
    key: String(c.key || ''),
    nombre: String(c.nombre || '').trim(),
    nucleo: String(c.nucleo || '').trim(),
    lado: ['novia', 'novio', 'ambos'].includes(c.lado) ? c.lado : '',
    manual: c.manual === true,
    // Por defecto SÍ viene: solo un false explícito lo desactiva
    preboda: c.preboda !== false,
    // ★ y nota (se ponen en plano.html): solo si existen, viajan con el
    // comensal al moverlo como la preboda
    ...(c.estrella === true ? { estrella: true } : {}),
    ...(typeof c.nota === 'string' && c.nota.trim() ? { nota: c.nota.trim().slice(0, NOTA_MAX) } : {}),
  };
}
