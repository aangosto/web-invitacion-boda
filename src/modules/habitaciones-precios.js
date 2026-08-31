/* =================================================================
   HABITACIONES — tarifa y cálculo de importes (lógica pura, sin
   Firebase: la usan la página /hoteles y el script de importación).

   Bloqueo del Hotel Exe Boston (reserva 0034652508), boda 24·10·2026.
   Precio POR NOCHE con IVA según tipo; la noche del 25 de octubre es
   más barata. Una estancia paga las noches de entrada a salida-1.

   Para fechas fuera de la tarifa (no las hay en el bloqueo, pero el
   editor permite cualquier fecha) se aplica el precio de noche normal;
   la página muestra siempre el importe calculado antes de guardar.
   ================================================================= */

export const TIPOS = ['individual', 'doble', 'supletoria'];
export const TIPO_LABEL = {
  individual: 'Individual',
  doble: 'Doble',
  supletoria: 'Doble + supletoria',
};

/** Plazas de cada tipo (para el recuento de pax del bloqueo). */
export const TIPO_PLAZAS = { individual: 1, doble: 2, supletoria: 3 };

/** € por noche, IVA incluido: [noche normal (22/23/24), noche del 25]. */
const TARIFA = {
  individual: [95, 80],
  doble: [105, 90],
  supletoria: [135, 120],
};

/** 'aaaa-mm-dd' → Date local (12:00 para esquivar saltos de DST). */
function aDate(iso) {
  const [y, m, d] = String(iso).split('-').map(Number);
  return y && m && d ? new Date(y, m - 1, d, 12) : null;
}

/** Nº de noches entre entrada y salida (0 si las fechas no valen). */
export function calcNoches(entrada, salida) {
  const e = aDate(entrada);
  const s = aDate(salida);
  if (!e || !s) return 0;
  return Math.max(0, Math.round((s - e) / 86400000));
}

/** Importe total de la estancia según tipo y fechas (€, IVA incluido). */
export function calcImporte(tipo, entrada, salida) {
  const tarifa = TARIFA[tipo];
  const e = aDate(entrada);
  const noches = calcNoches(entrada, salida);
  if (!tarifa || !e || noches === 0) return 0;
  let total = 0;
  for (let i = 0; i < noches; i += 1) {
    const noche = new Date(e.getTime() + i * 86400000);
    const esNoche25 = noche.getMonth() === 9 && noche.getDate() === 25; // 25 oct
    total += esNoche25 ? tarifa[1] : tarifa[0];
  }
  return total;
}
