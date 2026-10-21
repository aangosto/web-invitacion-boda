/* =================================================================
   COMENSAL — forma normalizada de cada persona sentada en una mesa
   (colección "mesas", campo `comensales`). Módulo PURO (sin Firebase):
   lo usan mesas-data.js / plano-data.js al leer y escribir, los
   recuentos (mesas.html, Excel de la finca y los dos PDF) y las pruebas
   en Node (scripts/test-destacados.mjs, scripts/test-menus.mjs).
   ================================================================= */

/** Largo máximo de la nota de un comensal (plano.html). */
export const NOTA_MAX = 60;

/** Tipo de comensal: los MISMOS valores que la plantilla de la finca
    ('' = adulto, que en el Excel va en blanco). */
export const TIPOS = ['', 'niño/a', 'trona', 'hueco'];
export const TIPO_NINO = 'niño/a';
export const TIPO_LABEL = { '': 'adulto', 'niño/a': 'niño/a', trona: 'trona', hueco: 'hueco' };
export const MENUS = ['adulto', 'infantil', 'infantil reducido', 'sin menú'];

const esTipo = (v) => typeof v === 'string' && TIPOS.includes(v);
const esMenu = (v) => typeof v === 'string' && MENUS.includes(v);

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
    // Tipo y menú: solo si están guardados (si no, se deducen al contar)
    ...(esTipo(c.tipo) ? { tipo: c.tipo } : {}),
    ...(esMenu(c.menu) ? { menu: c.menu } : {}),
  };
}

/* ---------- Tipo y menú (guardados o deducidos) ---------- */

/** Niños: keys '<nucleoId>|<nombre>' de las personas marcadas como niño
    en la lista de invitados. */
export function clavesNinos(nucleos = []) {
  const ninos = new Set();
  nucleos.forEach((n) => (n.personas || []).forEach((p) => {
    if (p.nino === true) ninos.add(`${n.id}|${p.nombre}`);
  }));
  return ninos;
}

/** ¿Es niño/a en la lista de invitados? (los añadidos a mano nunca lo son) */
export function esNino(c, ninos) {
  return Boolean(ninos) && !String(c.key).startsWith('manual|') && ninos.has(c.key);
}

/** Tipo efectivo: el guardado o, si no hay, niño/a si lo es en invitados. */
export function tipoDe(c, ninos) {
  if (esTipo(c.tipo)) return c.tipo;
  return esNino(c, ninos) ? TIPO_NINO : '';
}

/** Menú efectivo: el guardado o, si no hay, infantil para trona y niño/a. */
export function menuDe(c, ninos) {
  if (esMenu(c.menu)) return c.menu;
  const t = tipoDe(c, ninos);
  return t === 'trona' || t === TIPO_NINO ? 'infantil' : 'adulto';
}

/** Etiqueta junto al nombre ("trona · sin menú"); '' si es adulto con menú de adulto. */
export function etiquetaTipoMenu(c, ninos) {
  const t = tipoDe(c, ninos);
  const m = menuDe(c, ninos);
  return t === '' && m === 'adulto' ? '' : `${TIPO_LABEL[t]} · ${m}`;
}

/**
 * Recuento de una lista de comensales (los SENTADOS; las sillas libres
 * no cuentan): { total, tipos: { adulto, nino, trona, hueco },
 * menus: { adulto, infantil, 'infantil reducido', 'sin menú' } }.
 */
export function recuentoComensales(comensales, ninos) {
  const r = {
    total: 0,
    tipos: { adulto: 0, nino: 0, trona: 0, hueco: 0 },
    menus: Object.fromEntries(MENUS.map((m) => [m, 0])),
  };
  comensales.forEach((c) => {
    r.total += 1;
    const t = tipoDe(c, ninos);
    r.tipos[t === '' ? 'adulto' : t === TIPO_NINO ? 'nino' : t] += 1;
    r.menus[menuDe(c, ninos)] += 1;
  });
  return r;
}

/** Recuento de todas las mesas. */
export function recuentoMesas(mesas, ninos) {
  return recuentoComensales(mesas.flatMap((m) => m.comensales || []), ninos);
}

/** Filas [etiqueta, nº] del recuento, en el orden de siempre (para los PDF). */
export function filasRecuento(r) {
  return {
    tipos: [['Adultos', r.tipos.adulto], ['Niños', r.tipos.nino], ['Tronas', r.tipos.trona], ['Huecos', r.tipos.hueco]],
    menus: [['Menú adulto', r.menus.adulto], ['Menú infantil', r.menus.infantil],
      ['Infantil reducido', r.menus['infantil reducido']], ['Sin menú', r.menus['sin menú']]],
  };
}

/* ---------- Escritura de UN comensal ---------- */

/**
 * Lista de comensales con cambios SOLO en el de `key`; el resto, intacto
 * (preboda, núcleo… de todos se conservan). Campos admitidos:
 *   estrella (false = se quita), nota ('' = se quita, ≤60),
 *   tipo (uno de TIPOS), menu (uno de MENUS), preboda (bool).
 * null si `key` no está en la lista. Lanza si un valor no es válido.
 */
export function conCambiosComensal(lista, key, cambios) {
  if ('tipo' in cambios && !esTipo(cambios.tipo)) throw new Error(`Tipo no válido: ${cambios.tipo}`);
  if ('menu' in cambios && !esMenu(cambios.menu)) throw new Error(`Menú no válido: ${cambios.menu}`);
  let hecho = false;
  const nueva = lista.map((c) => {
    if (hecho || String(c.key || '') !== key) return c;
    hecho = true;
    const r = { ...c };
    if ('estrella' in cambios) {
      delete r.estrella;
      if (cambios.estrella) r.estrella = true;
    }
    if ('nota' in cambios) {
      delete r.nota;
      const n = String(cambios.nota || '').trim().slice(0, NOTA_MAX);
      if (n) r.nota = n;
    }
    if ('tipo' in cambios) r.tipo = cambios.tipo;
    if ('menu' in cambios) r.menu = cambios.menu;
    if ('preboda' in cambios) r.preboda = cambios.preboda === true;
    return r;
  });
  return hecho ? nueva : null;
}

/**
 * Cuerpo de la TRANSACCIÓN que cambia un comensal: lee la mesa DENTRO de
 * la transacción y reescribe la lista con conCambiosComensal (así dos
 * personas editando la misma mesa a la vez no se pisan: si la mesa cambia
 * entre la lectura y la escritura, Firestore repite la transacción con
 * la versión nueva). `extra`: campos a añadir al update (updatedAt).
 * Devuelve la lista nueva o null si el comensal ya no está en la mesa.
 */
export async function cambiaComensalEnTx(tx, ref, key, cambios, extra = {}) {
  const snap = await tx.get(ref);
  const datos = snap.exists() ? snap.data() : {};
  const lista = Array.isArray(datos.comensales) ? datos.comensales : [];
  const nueva = conCambiosComensal(lista, key, cambios);
  if (!nueva) return null;
  tx.update(ref, { comensales: nueva, ...extra });
  return nueva;
}
