/* =================================================================
   ICONOS DE LAS MESAS — único sitio donde se asocia cada mesa con su
   dibujo (lo usa el plano del salón, plano.html).

   🖼  PARA AÑADIR UN DIBUJO NUEVO:
     1. Copia la imagen (PNG con fondo transparente, cuadrada si puede
        ser) a la carpeta public/  →  p. ej. public/nov_uvas.png
     2. Pon su nombre de archivo aquí abajo, en la mesa que toque:
          'uvas': 'nov_uvas.png',
     3. Build + deploy. Nada más: no hay que tocar otro código.

   La clave es el nombre de la mesa en minúsculas, sin tildes y con
   guiones ("Jamón con chorreras" → 'jamon-con-chorreras'). Si una mesa
   tiene `null` (o no está en la lista) se dibuja un marcador
   provisional con la inicial de su nombre.
   ================================================================= */

export const ICONOS_MESAS = {
  // ---- Ya dibujadas (archivos existentes en public/) ----
  'limon': 'nov_limon.png',
  'espetos': 'nov_espeto.png',
  'marinera': 'nov_marinera.png',
  'vermut': 'nio_vermut.png',

  // ---- Pendientes de dibujo (marcador con la inicial) ----
  'novios': null,
  'ambar': null,
  'chuches': null,
  'estrella': null,
  'guardia-civil': null,
  'huevo-gamba': null,
  'jamon-con-chorreras': null,
  'melocoton': null,
  'naranja': null,
  'paparajote': null,
  'patatas': null,
  'uvas': null,
};

/** "Jamón con chorreras" → 'jamon-con-chorreras' */
export function claveIcono(nombre) {
  return String(nombre || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Icono de una mesa: { url, inicial, clave }. `url` es null si aún no
 * hay dibujo (se pinta la inicial). Respeta `mesa.icono` si el
 * documento trae una clave guardada que exista en ICONOS_MESAS.
 */
export function iconoMesa(mesa) {
  // La clave guardada solo manda si existe en el mapa; si no, la del nombre
  const clave = mesa.icono && mesa.icono in ICONOS_MESAS ? mesa.icono : claveIcono(mesa.nombre);
  const archivo = ICONOS_MESAS[clave] || null;
  const inicial = (String(mesa.nombre || '?').trim()[0] || '?').toUpperCase();
  return {
    clave,
    inicial,
    url: archivo ? `${import.meta.env.BASE_URL}${archivo}` : null,
  };
}
