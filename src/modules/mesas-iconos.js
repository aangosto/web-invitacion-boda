/* =================================================================
   ICONOS DE LAS MESAS — único sitio donde se asocia cada mesa con su
   dibujo (lo usa el plano del salón, plano.html).

   🖼  PARA AÑADIR O CAMBIAR UN DIBUJO:
     1. Copia la imagen (cuadrada; vale con fondo blanco, el plano la
        recorta en círculo) a la carpeta public/ → p. ej. public/mesa_uvas.webp
     2. Pon su nombre de archivo aquí abajo, en la mesa que toque:
          'uvas': 'mesa_uvas.webp',
     3. Build + deploy. Nada más: no hay que tocar otro código.

   La clave es el nombre de la mesa en minúsculas, sin tildes y con
   guiones ("Jamón con chorreras" → 'jamon-con-chorreras'). Si una mesa
   tiene `null`, no está en la lista o su imagen no carga, se dibuja
   un marcador con la inicial de su nombre.
   ================================================================= */

export const ICONOS_MESAS = {
  // Meseros reales de la boda (mismo ilustrador que la mesa física):
  // cuadrados de 320px en WebP, fondo blanco con mancha de acuarela.
  'novios': 'mesa_novios.webp',
  'ambar': 'mesa_ambar.webp',
  'chuches': 'mesa_chuches.webp',
  'espetos': 'mesa_espetos.webp',
  'estrella': 'mesa_estrella.webp',
  'guardia-civil': 'mesa_guardia_civil.webp',
  'huevo-gamba': 'mesa_huevo_gamba.webp',
  'jamon-con-chorreras': 'mesa_jamon_chorreras.webp',
  'limon': 'mesa_limon.webp',
  'marinera': 'mesa_marinera.webp',
  'melocoton': 'mesa_melocoton.webp',
  'naranja': 'mesa_naranja.webp',
  'paparajote': 'mesa_paparajote.webp',
  'patatas': 'mesa_patatas.webp',
  'uvas': 'mesa_uvas.webp',
  'vermut': 'mesa_vermut.webp',
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
