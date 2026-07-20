/* =================================================================
   Reenvíos del cuestionario.
   El formulario puede reenviarse las veces que haga falta (cada envío
   crea un documento nuevo en "rsvp"): del mismo nombre solo debe
   CONTAR el último envío. Este módulo es puro (sin Firebase) y lo
   comparten Totales y Confirmaciones para decidir qué documentos
   están activos y cuáles son versiones antiguas reenviadas.
   ================================================================= */

/** Clave de agrupación: el nombre de quien rellena, normalizado. */
export function resubmitKey(d) {
  return (d.filledBy || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Separa los documentos en activos (el último envío de cada nombre) y
 * antiguos (reenvíos anteriores del mismo nombre, que no deben contar).
 * Documentos sin nombre o sin fecha se tratan de forma conservadora:
 * sin nombre → siempre activo; sin fecha → cuenta como el más antiguo.
 * @param {Array<Object>} docs documentos rsvp (con filledBy y createdAt)
 * @returns {{activos: Array, antiguos: Array}}
 */
export function splitResubmissions(docs) {
  const ms = (d) => (d.createdAt && typeof d.createdAt.toMillis === 'function') ? d.createdAt.toMillis() : 0;
  const ultimo = new Map();
  docs.forEach((d) => {
    const k = resubmitKey(d);
    if (!k) return;
    const cur = ultimo.get(k);
    if (!cur || ms(d) > ms(cur)) ultimo.set(k, d);
  });
  const activos = [];
  const antiguos = [];
  docs.forEach((d) => {
    const k = resubmitKey(d);
    if (!k || ultimo.get(k) === d) activos.push(d);
    else antiguos.push(d);
  });
  return { activos, antiguos };
}
