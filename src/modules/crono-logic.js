/* =================================================================
   CRONOLOGÍA de llegadas y salidas — lógica pura (sin Firebase).

   A partir de los documentos rsvp construye, para 'llegadas' o
   'salidas', los grupos por DÍA ordenados cronológicamente y un bloque
   final "sin fecha/hora" con los casos que no se pueden ordenar:
   · quien marcó "Aún no lo sé" (mode 'buscando' o seeking true),
   · quien tiene modo pero no indicó el día,
   · y los de Zaragoza (no tienen viaje).

   Módulo separado de la pestaña para poder probarlo en Node con datos
   sintéticos (importa solo JS puro).
   ================================================================= */

export const CRONO_MODE_LABELS = {
  bus: 'Bus', ave: 'AVE/Tren', coche: 'Coche', avion: 'Avión',
  otro: 'Otro', buscando: 'Aún no lo sé',
};

/** 'aaaa-mm-dd' → 'Viernes 23 de octubre'. Devuelve el ISO si no parsea. */
export function formatDia(iso) {
  const [y, m, d] = String(iso).split('-').map(Number);
  if (!y || !m || !d) return String(iso);
  const texto = new Date(y, m - 1, d)
    .toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/**
 * Construye la cronología de un sentido.
 * @param docs  documentos rsvp ya filtrados (sin papelera ni reenvíos)
 * @param tipo  'llegadas' (ida: arrivalDay/arrivalTime) o 'salidas'
 *              (vuelta: day/departTime)
 * @returns { dias: [{ iso, personas, entradas: [entrada] }], sinFecha: [entrada] }
 * entrada: { nombre, personas, mode, lugar, time, plazas, motivo? }
 *  · lugar: de dónde viene (llegadas) o a dónde vuelve (salidas) — en
 *    ambos casos el `from` de la ida, que es el único lugar preguntado.
 *  · plazas: { seats, hora } si viene en coche y ofrece sitio (hora =
 *    a la que sale de origen en la ida; en la vuelta ya es `time`).
 *  · motivo: solo en el bloque sinFecha (por qué no está ordenado).
 */
export function buildCronologia(docs, tipo) {
  const porDia = new Map();
  const sinFecha = [];

  docs.forEach((data) => {
    if (data.attending === false) return;
    const nombre = data.filledBy || '—';
    const personas = (data.people || []).length || 1;

    if (data.origin === 'zaragoza') {
      sinFecha.push({ nombre, personas, mode: '', lugar: '', time: '', plazas: null,
        motivo: 'de Zaragoza · sin viaje' });
      return;
    }

    const ida = data.travel?.ida || {};
    const tramo = tipo === 'llegadas' ? ida : (data.travel?.vuelta || {});
    const mode = String(tramo.mode || '').trim();
    const lugar = String(ida.from || '').trim();
    const day = String((tipo === 'llegadas' ? tramo.arrivalDay : tramo.day) || '').trim();
    const time = String((tipo === 'llegadas' ? tramo.arrivalTime : tramo.departTime) || '').trim();

    // Coche con plazas libres: en la ida, la hora útil es a la que SALE
    // de su origen (departTime); en la vuelta esa hora ya es `time`.
    const plazas = mode === 'coche' && tramo.canCarry === true
      ? {
          seats: tramo.seats || null,
          hora: tipo === 'llegadas' ? String(tramo.departTime || '').trim() : '',
        }
      : null;

    const entrada = { nombre, personas, mode, lugar, time, plazas };

    if (mode === 'buscando' || tramo.seeking === true) {
      sinFecha.push({ ...entrada, motivo: 'aún no lo sabe / busca transporte' });
      return;
    }
    if (!day) {
      sinFecha.push({ ...entrada, motivo: mode ? 'sin fecha indicada' : 'sin viaje indicado' });
      return;
    }
    if (!porDia.has(day)) porDia.set(day, []);
    porDia.get(day).push(entrada);
  });

  // Días en orden (el ISO aaaa-mm-dd ordena bien como texto) y, dentro,
  // por hora; quien no indicó hora va al final de su día.
  const dias = [...porDia.keys()].sort().map((iso) => {
    const entradas = porDia.get(iso)
      .sort((a, b) => (a.time || '99:99').localeCompare(b.time || '99:99'));
    return {
      iso,
      personas: entradas.reduce((s, e) => s + e.personas, 0),
      entradas,
    };
  });

  return { dias, sinFecha };
}
