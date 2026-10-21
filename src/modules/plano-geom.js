/* =================================================================
   PLANO DEL SALÓN — geometría pura (sin DOM ni Firestore, probable en
   Node: scripts/test-plano.mjs).

   Unidades: METROS. Origen en la esquina superior izquierda del salón,
   x hacia la derecha, y hacia abajo (como el SVG). `rot` en grados,
   sentido horario. En coordenadas locales de la mesa la silla 0 está
   ARRIBA (cabecera); el NÚMERO 1 lo lleva la silla `asientoInicio` (0 por
   defecto) y la mesa "mira" hacia ABAJO: la presidencial con
   rot 0 tiene la cabecera contra la pared de arriba y mira al salón.
   ================================================================= */

import { NOTA_MAX, conCambiosComensal } from './comensal.js';

export const FORMAS = ['redonda', 'cuadrada', 'rectangular'];
export const FORMA_LABEL = { redonda: 'Redonda', cuadrada: 'Cuadrada', rectangular: 'Rectangular' };

/** Ancho de plaza (m) a lo largo del borde de la mesa. */
const PLAZA = 0.6;
/** Distancia de la silla al borde de la mesa (m). */
export const SILLA_OFFSET = 0.32;
/** Radio de la silla (m). */
export const SILLA_R = 0.2;

/** Salón por defecto: proporción del plano de la finca (≈1,34:1, más
    ancho que largo) hasta tener las medidas reales. */
export const PLANO_DEFAULT = { ancho: 24, largo: 18, rejilla: 0.5, iman: true };

/* =================================================================
   PLANO OFICIAL DE LA FINCA (plano 15 de La Bastilla, Finca Tierra
   Bella). Todo en FRACCIONES del ancho/alto del salón, desde la esquina
   superior izquierda, así vale para cualquier medida del salón.
   ================================================================= */

/** Línea discontinua vertical: a su izquierda, zona más clara. */
export const FINCA_ZONA_CLARA = 0.31;
/** Salidas (puertas): pared y centro de la puerta en fracción del alto. */
export const FINCA_SALIDAS = [
  { pared: 'izquierda', y: 0.44 },
  { pared: 'derecha', y: 0.63 },
];
/** Ancho de las puertas (m). */
export const SALIDA_ANCHO = 1.8;
/** Centro de la presidencial (se identifica por su flag, no por número). */
export const FINCA_PRESIDENCIAL = { x: 0.478, y: 0.12 };
/** Centro de cada mesa por su NÚMERO (1-15). */
export const FINCA_MESAS = {
  1: { x: 0.165, y: 0.284 },
  2: { x: 0.264, y: 0.19 },
  3: { x: 0.664, y: 0.186 },
  4: { x: 0.752, y: 0.267 },
  5: { x: 0.664, y: 0.409 },
  6: { x: 0.527, y: 0.416 },
  7: { x: 0.388, y: 0.411 },
  8: { x: 0.268, y: 0.416 },
  9: { x: 0.272, y: 0.6 },
  10: { x: 0.393, y: 0.597 },
  11: { x: 0.527, y: 0.597 },
  12: { x: 0.667, y: 0.589 },
  13: { x: 0.672, y: 0.786 },
  14: { x: 0.525, y: 0.783 },
  15: { x: 0.393, y: 0.779 },
};
export const NUMERO_MAX = 15;

/** Número de mesa válido (entero 1-15) o null. */
export function numeroValido(v) {
  return Number.isInteger(v) && v >= 1 && v <= NUMERO_MAX ? v : null;
}

/** Números repetidos: Map(número → [mesas]) solo con los que salen >1 vez.
    La presidencial no lleva número (si lo tuviera, no cuenta). */
export function numerosRepetidos(mesas) {
  const por = new Map();
  mesas.forEach((m) => {
    if (m.presidencial || m.numero == null) return;
    if (!por.has(m.numero)) por.set(m.numero, []);
    por.get(m.numero).push(m);
  });
  return new Map([...por].filter(([, l]) => l.length > 1));
}

/** Puestos que se dibujan: la capacidad o, si hay sobreaforo, uno por comensal. */
export function numPuestos(mesa) {
  return Math.max(1, mesa.capacidad || 0, (mesa.comensales || []).length);
}

/** Tamaño del tablero {w, h} según forma y nº de puestos. */
export function tamanoMesa(forma, n) {
  if (forma === 'cuadrada') {
    const lado = Math.max(0.9, Math.ceil(n / 4) * PLAZA);
    return { w: lado, h: lado };
  }
  if (forma === 'rectangular') {
    const extremos = n >= 6 ? 1 : 0;
    const largo = Math.ceil((n - 2 * extremos) / 2);
    return { w: Math.max(1.2, largo * PLAZA), h: 0.9 };
  }
  const d = Math.min(3.4, Math.max(0.9, (n * PLAZA) / Math.PI));
  return { w: d, h: d };
}

/** Reparte n puestos entre los lados [arriba, derecha, abajo, izquierda]. */
function repartoLados(forma, n) {
  if (forma === 'rectangular') {
    const extremos = n >= 6 ? 1 : 0;
    const resto = n - 2 * extremos;
    return [Math.ceil(resto / 2), extremos, Math.floor(resto / 2), extremos];
  }
  const base = Math.floor(n / 4);
  const extra = n % 4;
  return [0, 1, 2, 3].map((i) => base + (i < extra ? 1 : 0));
}

/**
 * Posición LOCAL (sin rotar) de cada puesto, en el sentido de las agujas
 * del reloj empezando por la cabecera. Devuelve [{x, y, ang}] donde
 * `ang` es la dirección hacia fuera (radianes) para colocar la etiqueta.
 */
export function puestosLocales(forma, n) {
  const { w, h } = tamanoMesa(forma, n);
  if (forma !== 'cuadrada' && forma !== 'rectangular') {
    const r = w / 2 + SILLA_OFFSET;
    // Puestos 1 y 2 simétricos respecto a la cabecera (arriba)
    return Array.from({ length: n }, (_, i) => {
      const a = -Math.PI / 2 - Math.PI / n + (i * 2 * Math.PI) / n;
      return { x: r * Math.cos(a), y: r * Math.sin(a), ang: a };
    });
  }
  const [arriba, dcha, abajo, izq] = repartoLados(forma, n);
  const hw = w / 2;
  const hh = h / 2;
  const o = SILLA_OFFSET;
  const pts = [];
  const tramo = (k, i) => (i + 0.5) / k; // 0..1 centrado en cada plaza
  for (let i = 0; i < arriba; i++) pts.push({ x: -hw + w * tramo(arriba, i), y: -hh - o, ang: -Math.PI / 2 });
  for (let i = 0; i < dcha; i++) pts.push({ x: hw + o, y: -hh + h * tramo(dcha, i), ang: 0 });
  for (let i = 0; i < abajo; i++) pts.push({ x: hw - w * tramo(abajo, i), y: hh + o, ang: Math.PI / 2 });
  for (let i = 0; i < izq; i++) pts.push({ x: -hw - o, y: hh - h * tramo(izq, i), ang: Math.PI });
  return pts;
}

/** Semiejes de la caja (alineada con el salón) de la mesa rotada, sillas incluidas. */
export function semiCaja(forma, n, rot) {
  const { w, h } = tamanoMesa(forma, n);
  const m = SILLA_OFFSET + SILLA_R;
  if (forma !== 'cuadrada' && forma !== 'rectangular') {
    const r = w / 2 + m;
    return { hx: r, hy: r };
  }
  const a = (rot * Math.PI) / 180;
  const c = Math.abs(Math.cos(a));
  const s = Math.abs(Math.sin(a));
  const hw = w / 2 + m;
  const hh = h / 2 + m;
  return { hx: hw * c + hh * s, hy: hw * s + hh * c };
}

/** Mantiene el centro de la mesa dentro de las paredes. */
export function limitaDentro(x, y, mesa, plano) {
  const { hx, hy } = semiCaja(mesa.forma, numPuestos(mesa), mesa.rot || 0);
  const cl = (v, lo, hi) => (lo > hi ? (lo + hi) / 2 : Math.min(hi, Math.max(lo, v)));
  return { x: cl(x, hx, plano.ancho - hx), y: cl(y, hy, plano.largo - hy) };
}

export function imanta(v, paso) {
  return paso > 0 ? Math.round(v / paso) * paso : v;
}

/** Redondeo a cm para guardar números limpios. */
export function cm(v) {
  return Math.round(v * 100) / 100;
}

/** Normaliza un ángulo a (-180, 180]. */
export function normAng(g) {
  let a = ((g % 360) + 360) % 360;
  if (a > 180) a -= 360;
  return a;
}

/**
 * Dirección y distancia de `desde` hacia `hasta` (centros, en metros).
 * `ang` en grados en pantalla: 0 = derecha, 90 = abajo (sentido SVG).
 */
export function haciaMesa(desde, hasta) {
  const dx = hasta.x - desde.x;
  const dy = hasta.y - desde.y;
  return { ang: (Math.atan2(dy, dx) * 180) / Math.PI, dist: Math.hypot(dx, dy) };
}

/** Cercana / media / lejana según la diagonal del salón. */
export function cercania(dist, plano) {
  const diag = Math.hypot(plano.ancho, plano.largo);
  if (dist <= diag / 4) return 'cercana';
  if (dist <= diag / 2) return 'a media distancia';
  return 'lejana';
}

/** Rumbo en palabras (en el plano visto en pantalla) para un ángulo SVG. */
export function rumbo(ang) {
  const nombres = ['a la derecha', 'abajo a la derecha', 'abajo', 'abajo a la izquierda',
    'a la izquierda', 'arriba a la izquierda', 'arriba', 'arriba a la derecha'];
  const i = Math.round((((ang % 360) + 360) % 360) / 45) % 8;
  return nombres[i];
}

/**
 * Orden de puestos: array de longitud numPuestos con el comensal de cada
 * puesto o null (vacío). Parte de `mesa.asientos` (keys o '') y coloca a
 * los comensales que aún no tienen puesto en los primeros huecos.
 */
export function ordenPuestos(mesa) {
  const n = numPuestos(mesa);
  const comensales = mesa.comensales || [];
  const slots = new Array(n).fill(null);
  const usados = new Set();
  (mesa.asientos || []).slice(0, n).forEach((key, i) => {
    if (!key) return;
    const c = comensales.find((x, j) => x.key === key && !usados.has(j));
    if (c) {
      slots[i] = c;
      usados.add(comensales.indexOf(c));
    }
  });
  comensales.forEach((c, j) => {
    if (usados.has(j)) return;
    const hueco = slots.indexOf(null);
    if (hueco >= 0) slots[hueco] = c;
    usados.add(j);
  });
  return slots;
}

/** Margen alrededor de las paredes (m) en la imagen del plano para el
    PDF: SALIDAS a los lados, cota del ancho abajo. */
const MARGEN_DIBUJO = { izq: 1.5, dcha: 1.5, arriba: 0.35, abajo: 0.95 };

/** Zona del dibujo (en metros) que sale en la imagen del plano. */
export function recortePlano(plano) {
  return {
    x: -MARGEN_DIBUJO.izq, y: -MARGEN_DIBUJO.arriba,
    w: plano.ancho + MARGEN_DIBUJO.izq + MARGEN_DIBUJO.dcha,
    h: plano.largo + MARGEN_DIBUJO.arriba + MARGEN_DIBUJO.abajo,
  };
}

/**
 * Copia de las mesas con posición para dibujarlas (lo mismo que hace
 * plano.html al cargar): sin posición guardada → colocación provisional;
 * fuera de las paredes → dentro. No cambia las mesas recibidas.
 */
export function completaPosiciones(mesas, plano) {
  const copia = mesas.map((m) => ({ ...m, rot: m.rot || 0 }));
  if (copia.some((m) => m.x == null || m.y == null)) {
    const ini = colocacionInicial(copia, plano);
    copia.forEach((m) => { if (m.x == null || m.y == null) Object.assign(m, ini.get(m.id)); });
  }
  copia.forEach((m) => Object.assign(m, limitaDentro(m.x, m.y, m, plano)));
  return copia;
}

/**
 * Colocación provisional para las mesas sin posición guardada: la
 * presidencial centrada contra la pared de arriba y el resto en filas.
 */
export function colocacionInicial(mesas, plano) {
  const pos = new Map();
  const pres = mesas.find((m) => m.presidencial);
  let yInicio = 1.5;
  if (pres) {
    const { hy } = semiCaja(pres.forma, numPuestos(pres), pres.rot || 0);
    pos.set(pres.id, { x: plano.ancho / 2, y: hy + 0.3 });
    yInicio = 2 * hy + 1.2;
  }
  const resto = mesas.filter((m) => m !== pres);
  const paso = 4;
  const cols = Math.max(1, Math.floor(plano.ancho / paso));
  const margenX = (plano.ancho - (cols - 1) * paso) / 2;
  resto.forEach((m, i) => {
    const c = i % cols;
    const f = Math.floor(i / cols);
    const p = limitaDentro(margenX + c * paso, yInicio + 1.6 + f * paso, m, plano);
    pos.set(m.id, p);
  });
  return pos;
}

/* =================================================================
   DISTRIBUCIÓN AUTOMÁTICA ("Distribuir mesas")

   · La presidencial, arriba y centrada contra la pared superior, mirando
     al salón (rot 0: cabecera contra la pared).
   · El resto, en una disposición ORGÁNICA: posiciones iniciales al azar
     y una relajación que separa las mesas que se pisan (como bolas que
     se empujan), con un pasillo mínimo entre sillas y holguras distintas
     por mesa, así que las separaciones salen variadas y nunca en
     cuadrícula. Cada llamada (otro `rng`) da una disposición distinta.
   · Delante de la presidencial queda una zona despejada (entrada/paso).
   · Valida el resultado: nada se solapa, nada se sale y hay pasillo. Si
     no lo consigue, prueba otras semillas y pasillos algo más estrechos;
     si aun así no caben, devuelve null (el salón es pequeño).
   ================================================================= */

/** Generador pseudoaleatorio con semilla (para pruebas reproducibles). */
export function rngSemilla(semilla) {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Pasillo mínimo entre sillas de mesas vecinas (m), de más a menos holgado. */
const PASILLOS = [1.1, 0.95, 0.8, 0.65];
/** Distancia mínima de las sillas a la pared (m). */
const PASO_PARED = 0.6;

/** Zona despejada delante de la presidencial (o null si no hay). */
export function zonaDespejada(pres, plano) {
  if (!pres) return null;
  const mitad = Math.max(2.4, plano.ancho * 0.12);
  return {
    x: pres.x, y: pres.y + pres.hy + Math.max(2.4, plano.largo * 0.18) / 2,
    hx: mitad, hy: Math.max(2.4, plano.largo * 0.18) / 2,
  };
}

/**
 * "Colocar como el plano de la finca": centro de cada mesa según su
 * NÚMERO (FINCA_MESAS) y la presidencial (por su flag) en su sitio,
 * redonda y mirando al salón (rot 0). No bloquea nunca:
 *   · las mesas sin número NO se mueven (lista `sinNumero`);
 *   · si una mesa colocada se solapa con otra o se sale de las paredes
 *     por su tamaño, se coloca igualmente y se marca en `conflictos`.
 * Devuelve { pos: Map(id → {x, y, rot, forma?}), sinNumero: [mesa],
 *            conflictos: [{ mesa, motivos: [texto] }] }.
 */
export function colocarFinca(mesas, plano) {
  const pos = new Map();
  const sinNumero = [];
  mesas.forEach((m) => {
    if (m.presidencial) {
      const f = FINCA_PRESIDENCIAL;
      pos.set(m.id, { x: f.x * plano.ancho, y: f.y * plano.largo, rot: 0, forma: 'redonda' });
      return;
    }
    const f = m.numero != null ? FINCA_MESAS[m.numero] : null;
    if (!f) { sinNumero.push(m); return; }
    pos.set(m.id, { x: f.x * plano.ancho, y: f.y * plano.largo, rot: m.rot || 0 });
  });
  // Cuerpos finales: las que se mueven en su sitio nuevo y las que no,
  // donde están (también pueden pisarse con una colocada)
  const cuerpos = mesas.filter((m) => m.x != null || pos.has(m.id)).map((m) => {
    const p = pos.get(m.id);
    const mm = p ? { ...m, rot: p.rot, forma: p.forma || m.forma } : m;
    return { ...cuerpo(mm, p ? p.x : m.x, p ? p.y : m.y), mesa: m, movida: !!p };
  });
  const conflictos = new Map();
  const marca = (m, motivo) => {
    if (!conflictos.has(m.id)) conflictos.set(m.id, { mesa: m, motivos: [] });
    conflictos.get(m.id).motivos.push(motivo);
  };
  const tol = 0.005;
  cuerpos.forEach((a, i) => {
    if (a.movida && (a.x - a.hx < -tol || a.y - a.hy < -tol
      || a.x + a.hx > plano.ancho + tol || a.y + a.hy > plano.largo + tol)) {
      marca(a.mesa, 'se sale de las paredes');
    }
    cuerpos.slice(i + 1).forEach((b) => {
      if (!(a.movida || b.movida) || !solape(a, b, -tol)) return;
      if (a.movida) marca(a.mesa, `se solapa con ${b.mesa.nombre}`);
      if (b.movida) marca(b.mesa, `se solapa con ${a.mesa.nombre}`);
    });
  });
  return { pos, sinNumero, conflictos: [...conflictos.values()] };
}

/* =================================================================
   SEPARACIÓN SIN SOLAPES ("Colocar como la finca" e "Intercambiar")

   Parte de unas posiciones OBJETIVO (las del plano de la finca, o las
   actuales tras un intercambio) y mueve cada mesa lo mínimo para que:
   · ninguna se pise con otra contando las sillas, con el pasillo mínimo
     de "Distribuir mesas" entre sillas de mesas vecinas;
   · ninguna se salga de las paredes (sillas a PASO_PARED de la pared) ni
     tape las SALIDAS;
   · se conserve la ESTRUCTURA: si en el objetivo una mesa estaba a la
     izquierda (o encima) de otra con holgura, lo sigue estando.
   La presidencial (si está) queda FIJA: arriba, centrada contra la pared.

   Método: proyección iterativa de restricciones (como un sistema de
   muelles rígidos) con un tirón suave hacia el objetivo, quedándose con
   la solución válida que menos desplaza las mesas. Determinista.
   ================================================================= */

/** Pasillo mínimo entre sillas: el más estrecho que admite "Distribuir mesas". */
export const PASILLO_MIN = PASILLOS[PASILLOS.length - 1];
/** Diferencia mínima (m) en el objetivo para exigir que se conserve el orden. */
const ORDEN_TOL = 0.6;
/** Fondo de la zona libre delante de cada salida (m, desde la pared). */
const SALIDA_FONDO = 1.4;

/** Zonas que deben quedar libres delante de las salidas. */
export function zonasSalida(plano) {
  return FINCA_SALIDAS.map((s) => ({
    x: s.pared === 'izquierda' ? SALIDA_FONDO / 2 : plano.ancho - SALIDA_FONDO / 2,
    y: s.y * plano.largo,
    hx: SALIDA_FONDO / 2,
    hy: SALIDA_ANCHO / 2 + 0.3,
  }));
}

/** Posición de la presidencial: arriba, centrada, contra la pared (rot 0). */
export function sitioPresidencial(pres, plano) {
  const { hy } = semiCaja('redonda', numPuestos(pres), 0);
  return { x: plano.ancho / 2, y: hy + 0.15, rot: 0, forma: 'redonda' };
}

/** Empuje mínimo (a lo largo de un eje o de la normal) para separar a y b. */
function empuje(a, b, hueco, ox, oy) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (a.redonda && b.redonda) {
    const d = Math.hypot(dx, dy);
    const falta = a.r + b.r + hueco - d;
    if (falta <= 0) return null;
    if (d > 1e-6) return { nx: dx / d, ny: dy / d, falta };
    const n = Math.hypot(ox, oy) || 1;
    return { nx: (ox || (oy ? 0 : 1)) / n, ny: oy / n, falta };
  }
  const sepX = a.hx + b.hx + hueco;
  const sepY = a.hy + b.hy + hueco;
  if (Math.abs(dx) >= sepX || Math.abs(dy) >= sepY) return null;
  // Eje y sentido que respetan el orden del objetivo; el que menos mueve
  const sx = ox || Math.sign(dx) || 1;
  const sy = oy || Math.sign(dy) || 1;
  const fx = sepX - sx * dx;
  const fy = sepY - sy * dy;
  return fx <= fy ? { nx: sx, ny: 0, falta: fx } : { nx: 0, ny: sy, falta: fy };
}

/**
 * Separa las mesas. `items`: [{ id, mesa, x, y, rot, forma, fijo }] con la
 * posición OBJETIVO. Devuelve { ok, pos: Map(id → {x, y}), max } (max =
 * mayor desplazamiento respecto al objetivo, en m).
 */
export function separar(items, plano, hueco = PASILLO_MIN) {
  const cs = items.map((it) => {
    const m = { ...it.mesa, rot: it.rot ?? it.mesa.rot ?? 0, forma: it.forma || it.mesa.forma };
    const c = cuerpo(m, it.x, it.y);
    return { ...c, tx: it.x, ty: it.y, fijo: !!it.fijo };
  });
  const zonas = zonasSalida(plano).map((z) => ({ ...z, redonda: false, fijo: true, r: Math.max(z.hx, z.hy) }));
  const pares = [];
  cs.forEach((a, i) => cs.slice(i + 1).forEach((b) => {
    if (a.fijo && b.fijo) return;
    const tdx = b.tx - a.tx;
    const tdy = b.ty - a.ty;
    pares.push({ a, b, ox: Math.abs(tdx) >= ORDEN_TOL ? Math.sign(tdx) : 0, oy: Math.abs(tdy) >= ORDEN_TOL ? Math.sign(tdy) : 0 });
  }));
  const mueve = (a, b, nx, ny, d) => {
    const wa = a.fijo ? 0 : 1;
    const wb = b.fijo ? 0 : 1;
    if (!wa && !wb) return;
    const ka = (d * wa) / (wa + wb);
    const kb = (d * wb) / (wa + wb);
    a.x -= nx * ka; a.y -= ny * ka;
    b.x += nx * kb; b.y += ny * kb;
  };
  const pared = (c) => {
    if (c.fijo) return;
    const lx = c.hx + PASO_PARED;
    const ly = c.hy + PASO_PARED;
    c.x = Math.min(Math.max(c.x, lx), Math.max(lx, plano.ancho - lx));
    c.y = Math.min(Math.max(c.y, ly), Math.max(ly, plano.largo - ly));
  };
  const proyecta = () => {
    let max = 0;
    pares.forEach(({ a, b, ox, oy }) => {
      const e = empuje(a, b, hueco, ox, oy);
      if (e) { mueve(a, b, e.nx, e.ny, e.falta + 1e-4); max = Math.max(max, e.falta); }
      // Orden relativo del objetivo
      if (ox && ox * (b.x - a.x) < 0) { const f = -ox * (b.x - a.x); mueve(a, b, ox, 0, f); max = Math.max(max, f); }
      if (oy && oy * (b.y - a.y) < 0) { const f = -oy * (b.y - a.y); mueve(a, b, 0, oy, f); max = Math.max(max, f); }
    });
    cs.forEach((c) => {
      if (c.fijo) return;
      zonas.forEach((z) => {
        const e = empuje(z, c, 0, 0, 0);
        if (e) { mueve(z, c, e.nx, e.ny, e.falta + 1e-4); max = Math.max(max, e.falta); }
      });
      pared(c);
    });
    return max;
  };
  const valido = () => {
    const tol = 0.01;
    return pares.every(({ a, b, ox, oy }) => !empuje(a, b, hueco - tol, ox, oy)
        && !(ox && ox * (b.x - a.x) < -tol) && !(oy && oy * (b.y - a.y) < -tol))
      && cs.every((c) => c.fijo || (zonas.every((z) => !empuje(z, c, -tol, 0, 0))
        && c.x - c.hx >= PASO_PARED - tol && c.x + c.hx <= plano.ancho - PASO_PARED + tol
        && c.y - c.hy >= PASO_PARED - tol && c.y + c.hy <= plano.largo - PASO_PARED + tol));
  };
  const coste = () => cs.reduce((s, c) => s + (c.x - c.tx) ** 2 + (c.y - c.ty) ** 2, 0);

  cs.forEach(pared);
  let mejor = null;
  const ITER = 260;
  for (let it = 0; it < ITER; it++) {
    // Tirón suave hacia el objetivo (las últimas vueltas, sin tirón: asentar)
    const k = it < ITER - 40 ? 0.12 : 0;
    if (k) cs.forEach((c) => { if (!c.fijo) { c.x += k * (c.tx - c.x); c.y += k * (c.ty - c.y); } });
    for (let s = 0; s < 25; s++) if (proyecta() < 1e-4) break;
    if (valido()) {
      const v = coste();
      if (!mejor || v < mejor.v - 1e-9) mejor = { v, pos: new Map(cs.map((c) => [c.id, { x: c.x, y: c.y }])) };
    }
  }
  if (!mejor) return { ok: false, pos: null, max: null };
  const max = Math.max(0, ...cs.map((c) => { const p = mejor.pos.get(c.id); return Math.hypot(p.x - c.tx, p.y - c.ty); }));
  return { ok: true, pos: mejor.pos, max };
}

/** Objetivos de "Colocar como la finca" (presidencial fija; sin número, donde están). */
function objetivosFinca(mesas, plano, escalaSinNumero = 1) {
  const base = colocarFinca(mesas, plano);
  const items = [];
  mesas.forEach((m) => {
    if (m.presidencial) {
      const p = sitioPresidencial(m, plano);
      items.push({ id: m.id, mesa: m, ...p, fijo: true });
    } else if (base.pos.has(m.id)) {
      const p = base.pos.get(m.id);
      items.push({ id: m.id, mesa: m, x: p.x, y: p.y, rot: p.rot, forma: p.forma });
    } else if (m.x != null && m.y != null) {
      items.push({ id: m.id, mesa: m, x: m.x * escalaSinNumero, y: m.y * escalaSinNumero, rot: m.rot || 0, sinNumero: true });
    }
  });
  return { items, sinNumero: base.sinNumero };
}

/**
 * Medidas mínimas (misma proporción que `plano`, de 0,5 en 0,5 m, desde
 * `desde` m de ancho) con las que `intenta(planoPrueba, escala)` sale
 * bien. null si ni al triple.
 */
function medidasMinimas(plano, intenta, desde = plano.ancho) {
  const prop = plano.largo / plano.ancho;
  const redondea = (v) => Math.ceil(v * 2 - 1e-9) / 2;
  for (let ancho = redondea(desde); ancho <= plano.ancho * 3; ancho += 0.5) {
    const p = { ...plano, ancho, largo: redondea(ancho * prop) };
    if (intenta(p, ancho / plano.ancho)) return { ancho: p.ancho, largo: p.largo };
  }
  return null;
}

/**
 * "Colocar como el plano de la finca" SIN solapes. Devuelve
 *   { ok: true, pos: Map(id → {x, y, rot, forma?}), sinNumero: [mesa],
 *     apartadas: [mesa] (sin número que se han tenido que mover), max }
 * o, si no caben, { ok: false, minimo: { ancho, largo } | null }.
 */
export function medidasMinimasFinca(mesas, plano, desde = 6) {
  return medidasMinimas(plano, (p, s) => separar(objetivosFinca(mesas, p, s).items, p).ok, desde);
}

export function colocarFincaSinSolapes(mesas, plano) {
  const { items, sinNumero } = objetivosFinca(mesas, plano);
  const r = separar(items, plano);
  if (!r.ok) {
    return { ok: false, minimo: medidasMinimasFinca(mesas, plano, plano.ancho + 0.5) };
  }
  const pos = new Map();
  const apartadas = [];
  items.forEach((it) => {
    const p = r.pos.get(it.id);
    if (it.sinNumero) {
      if (Math.hypot(p.x - it.x, p.y - it.y) < 0.01) return;
      apartadas.push(it.mesa);
    }
    pos.set(it.id, { x: p.x, y: p.y, rot: it.rot ?? 0, ...(it.forma && it.mesa.presidencial ? { forma: it.forma } : {}) });
  });
  return { ok: true, pos, sinNumero, apartadas, max: r.max };
}

/**
 * Separa la colocación ACTUAL (p. ej. tras un intercambio): cada mesa
 * parte de donde está; la presidencial no se mueve. Mismo resultado que
 * colocarFincaSinSolapes, con `pos` solo de las mesas que se mueven.
 */
export function separarActual(mesas, plano) {
  const items = mesas.filter((m) => m.x != null && m.y != null)
    .map((m) => ({ id: m.id, mesa: m, x: m.x, y: m.y, rot: m.rot || 0, fijo: m.presidencial }));
  const r = separar(items, plano);
  if (!r.ok) {
    const minimo = medidasMinimas(plano, (p, s) => separar(items.map((it) => ({ ...it, x: it.x * s, y: it.y * s })), p).ok,
      plano.ancho + 0.5);
    return { ok: false, minimo };
  }
  const pos = new Map();
  items.forEach((it) => {
    const p = r.pos.get(it.id);
    if (Math.hypot(p.x - it.x, p.y - it.y) >= 0.01) pos.set(it.id, { x: p.x, y: p.y, rot: it.rot });
  });
  return { ok: true, pos, max: r.max };
}

/** Mesas que se pisan (sillas contra sillas, sin pasillo) en la colocación actual. */
export function mesasQueSePisan(mesas) {
  const cs = mesas.filter((m) => m.x != null && m.y != null).map((m) => ({ ...cuerpo(m, m.x, m.y), mesa: m }));
  const pisan = new Set();
  cs.forEach((a, i) => cs.slice(i + 1).forEach((b) => {
    if (solape(a, b, -0.01)) { pisan.add(a.mesa); pisan.add(b.mesa); }
  }));
  return [...pisan];
}

/* =================================================================
   INTERCAMBIO Y GIRO
   ================================================================= */

/**
 * Intercambia dos mesas: cambian de SITIO (x, y) y de NÚMERO (el número
 * va ligado al sitio). Cada una conserva su giro, forma, comensales…
 * Devuelve los cambios a guardar: [{ id, x, y, rot, numero }].
 */
export function intercambio(a, b) {
  return [
    { id: a.id, x: b.x, y: b.y, rot: a.rot || 0, numero: b.numero ?? null },
    { id: b.id, x: a.x, y: a.y, rot: b.rot || 0, numero: a.numero ?? null },
  ];
}

/**
 * Gira a TODOS los comensales `paso` puestos alrededor de la mesa (+1 =
 * cada uno al puesto siguiente en el sentido en que se numeran/dibujan,
 * el de las agujas del reloj; −1 al contrario). Los puestos vacíos giran
 * con el resto. Devuelve el nuevo `asientos` (keys o '').
 */
export function giraPuestos(mesa, paso) {
  const slots = ordenPuestos(mesa);
  const n = slots.length;
  const k = ((paso % n) + n) % n;
  const nuevo = new Array(n);
  slots.forEach((c, i) => { nuevo[(i + k) % n] = c ? c.key : ''; });
  return nuevo;
}

/* =================================================================
   ASIENTO 1 Y ORIENTACIÓN HACIA LA PRESIDENCIAL
   ================================================================= */

/** Silla (índice físico, 0 = cabecera) que lleva el número 1. Se guarda
    en la mesa como `asientoInicio`; fuera de rango, la que toque módulo n. */
export function inicioAsientos(mesa) {
  const n = numPuestos(mesa);
  const s = Number.isInteger(mesa.asientoInicio) ? mesa.asientoInicio : 0;
  return ((s % n) + n) % n;
}

/** Número (1..n) del asiento de la silla física i. La numeración sigue
    el sentido de siempre (agujas del reloj) a partir del asiento 1. */
export function numAsiento(mesa, i) {
  const n = numPuestos(mesa);
  return ((i - inicioAsientos(mesa) + n) % n) + 1;
}

/** Puestos en orden de NÚMERO: [{ i (silla física), n (nº), c (comensal|null) }]. */
export function puestosNumerados(mesa) {
  const slots = ordenPuestos(mesa);
  const s = inicioAsientos(mesa);
  return slots.map((_, k) => {
    const i = (s + k) % slots.length;
    return { i, n: k + 1, c: slots[i] };
  });
}

/** Largo máximo de la nota (comensal.js). */
export { NOTA_MAX };

/**
 * Lista de comensales con ★/nota cambiados SOLO en el de `key` (estrella
 * false o nota vacía = el campo se quita); el resto, intacto. null si no
 * está en la lista.
 */
export function conDestacado(lista, key, { estrella, nota }) {
  return conCambiosComensal(lista, key, { estrella, nota });
}

export const ORIENTACION_LABEL ={ cara: 'de cara', lado: 'de lado', espaldas: 'de espaldas' };

/** Posición real (m) en el salón de la silla física i (con giro de la mesa). */
export function posSilla(mesa, i) {
  const p = puestosLocales(mesa.forma, numPuestos(mesa))[i];
  const a = ((mesa.rot || 0) * Math.PI) / 180;
  return {
    x: mesa.x + p.x * Math.cos(a) - p.y * Math.sin(a),
    y: mesa.y + p.x * Math.sin(a) + p.y * Math.cos(a),
  };
}

/**
 * Hacia dónde queda la presidencial para quien se sienta en la silla i:
 * mira hacia el centro de su mesa; ángulo entre esa dirección y la de su
 * silla → centro de la presidencial: < 60° 'cara', 60-120° 'lado',
 * > 120° 'espaldas'. null si no aplica (sin presidencial, es la propia
 * presidencial o falta la posición).
 */
export function orientacionSilla(mesa, i, pres) {
  const ang = anguloSilla(mesa, i, pres);
  if (ang == null) return null;
  return ang < 60 ? 'cara' : ang <= 120 ? 'lado' : 'espaldas';
}

/** Ángulo (0-180°) de orientacionSilla: 0 = la presidencial justo enfrente. */
export function anguloSilla(mesa, i, pres) {
  if (!pres || mesa.presidencial || pres.id === mesa.id) return null;
  if (![mesa.x, mesa.y, pres.x, pres.y].every((v) => typeof v === 'number')) return null;
  const s = posSilla(mesa, i);
  const mx = mesa.x - s.x; const my = mesa.y - s.y;
  const px = pres.x - s.x; const py = pres.y - s.y;
  const d = Math.hypot(mx, my) * Math.hypot(px, py);
  if (!d) return null;
  return (Math.acos(Math.max(-1, Math.min(1, (mx * px + my * py) / d))) * 180) / Math.PI;
}

/**
 * Mejor giro de los comensales para las ★ (sin cambiar a nadie de silla
 * relativa): prueba los n giros de giraPuestos y elige el de más ★ de
 * cara; empate → menos de espaldas; empate → menor suma de ángulos (y,
 * a igualdad, el giro más pequeño). `keys`: las ★ a considerar (por
 * defecto, las marcadas en la mesa). Devuelve { paso, asientos,
 * estrellas: [{ i, c, ang, orient }] } o null si no se puede calcular.
 */
export function mejorGiroEstrellas(mesa, pres, keys = null) {
  const n = numPuestos(mesa);
  const esEstrella = (c) => c && (keys ? keys.includes(c.key) : c.estrella);
  let mejor = null;
  for (let paso = 0; paso < n; paso++) {
    const asientos = giraPuestos(mesa, paso);
    const girada = { ...mesa, asientos };
    const estrellas = [];
    ordenPuestos(girada).forEach((c, i) => {
      if (!esEstrella(c)) return;
      const ang = anguloSilla(girada, i, pres);
      if (ang == null) return;
      estrellas.push({ i, c, ang, orient: ang < 60 ? 'cara' : ang <= 120 ? 'lado' : 'espaldas' });
    });
    if (!estrellas.length) return null;
    const p = {
      cara: estrellas.filter((e) => e.orient === 'cara').length,
      espaldas: estrellas.filter((e) => e.orient === 'espaldas').length,
      suma: estrellas.reduce((s, e) => s + e.ang, 0),
    };
    const dist = Math.min(paso, n - paso);
    const gana = !mejor || p.cara > mejor.p.cara
      || (p.cara === mejor.p.cara && (p.espaldas < mejor.p.espaldas
        || (p.espaldas === mejor.p.espaldas && (p.suma < mejor.p.suma - 1e-9
          || (Math.abs(p.suma - mejor.p.suma) <= 1e-9 && dist < mejor.dist)))));
    if (gana) mejor = { paso, asientos, estrellas, p, dist };
  }
  return mejor && { paso: mejor.paso, asientos: mejor.asientos, estrellas: mejor.estrellas };
}

/** Comensales ★ de una mesa: [{ i, n, c, orient }] en orden de número. */
export function estrellasMesa(mesa, pres) {
  return puestosNumerados(mesa).filter((p) => p.c && p.c.estrella)
    .map((p) => ({ ...p, orient: orientacionSilla(mesa, p.i, pres) }));
}

/** ¿Alguna estrella de la mesa queda de espaldas a la presidencial? */
export function hayEstrellaDeEspaldas(mesa, pres) {
  return estrellasMesa(mesa, pres).some((p) => p.orient === 'espaldas');
}

/** Cuerpo de colisión de una mesa: centro, semiejes y si es circular. */
function cuerpo(m, x, y) {
  const { hx, hy } = semiCaja(m.forma, numPuestos(m), m.rot || 0);
  return { id: m.id, x, y, hx, hy, r: Math.max(hx, hy), redonda: m.forma === 'redonda' };
}

/** Lo que falta de separación entre dos cuerpos (>0 = se pisan). */
function solape(a, b, hueco) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (a.redonda && b.redonda) {
    const d = Math.hypot(dx, dy) || 1e-6;
    const falta = a.r + b.r + hueco - d;
    return falta > 0 ? { falta, nx: dx / d, ny: dy / d } : null;
  }
  const ox = a.hx + b.hx + hueco - Math.abs(dx);
  const oy = a.hy + b.hy + hueco - Math.abs(dy);
  if (ox <= 0 || oy <= 0) return null;
  return ox < oy
    ? { falta: ox, nx: Math.sign(dx) || 1, ny: 0 }
    : { falta: oy, nx: 0, ny: Math.sign(dy) || 1 };
}

function intento(cuerpos, fijos, plano, pasillo, rng) {
  const extra = new Map(cuerpos.map((c) => [c.id, rng() * pasillo * 0.6]));
  const pared = new Map(cuerpos.map((c) => [c.id, PASO_PARED + rng() * 0.7]));
  const dentro = (c) => {
    const p = pared.get(c.id);
    c.x = Math.min(plano.ancho - c.hx - p, Math.max(c.hx + p, c.x));
    c.y = Math.min(plano.largo - c.hy - p, Math.max(c.hy + p, c.y));
  };
  cuerpos.forEach((c) => {
    c.x = c.hx + rng() * (plano.ancho - 2 * c.hx);
    c.y = c.hy + rng() * (plano.largo - 2 * c.hy);
    dentro(c);
  });
  for (let it = 0; it < 500; it++) {
    let movido = false;
    const orden = [...cuerpos].sort(() => rng() - 0.5);
    for (let i = 0; i < orden.length; i++) {
      const a = orden[i];
      for (let j = i + 1; j < orden.length; j++) {
        const b = orden[j];
        const s = solape(a, b, pasillo + extra.get(a.id) + extra.get(b.id));
        if (!s) continue;
        movido = true;
        const k = s.falta / 2 + 0.01;
        a.x -= s.nx * k; a.y -= s.ny * k;
        b.x += s.nx * k; b.y += s.ny * k;
      }
      fijos.forEach((f) => {
        const s = solape(f, a, f.zona ? 0 : pasillo + extra.get(a.id));
        if (!s) return;
        movido = true;
        a.x += s.nx * (s.falta + 0.01);
        a.y += s.ny * (s.falta + 0.01);
      });
      dentro(a);
    }
    if (!movido) break;
  }
  // Validación estricta con el pasillo mínimo (sin las holguras extra)
  const ok = cuerpos.every((a, i) => cuerpos.slice(i + 1).every((b) => !solape(a, b, pasillo - 0.02))
    && fijos.every((f) => !solape(f, a, f.zona ? -0.02 : pasillo - 0.02))
    && a.x - a.hx >= PASO_PARED - 0.02 && a.x + a.hx <= plano.ancho - PASO_PARED + 0.02
    && a.y - a.hy >= PASO_PARED - 0.02 && a.y + a.hy <= plano.largo - PASO_PARED + 0.02);
  return ok;
}

/**
 * Coloca todas las mesas. Devuelve { pos: Map(id → {x, y, rot}), pasillo }
 * o null si no caben con pasillos. `rng` = Math.random por defecto.
 */
export function distribuir(mesas, plano, rng = Math.random) {
  const pres = mesas.find((m) => m.presidencial) || null;
  const pos = new Map();
  const fijos = [];
  if (pres) {
    const p = { ...pres, rot: 0 };
    const { hx, hy } = semiCaja(p.forma, numPuestos(p), 0);
    const c = { id: p.id, x: plano.ancho / 2, y: hy + 0.15, hx, hy, r: Math.max(hx, hy), redonda: p.forma === 'redonda' };
    pos.set(p.id, { x: c.x, y: c.y, rot: 0 });
    fijos.push(c);
    const z = zonaDespejada(c, plano);
    fijos.push({ ...z, r: Math.max(z.hx, z.hy), redonda: false, zona: true });
  }
  const resto = mesas.filter((m) => m !== pres);
  for (const pasillo of PASILLOS) {
    for (let s = 0; s < 30; s++) {
      const cuerpos = resto.map((m) => cuerpo(m, 0, 0));
      if (intento(cuerpos, fijos, plano, pasillo, rng)) {
        cuerpos.forEach((c) => {
          const m = resto.find((x) => x.id === c.id);
          pos.set(c.id, { x: c.x, y: c.y, rot: m.rot || 0 });
        });
        return { pos, pasillo };
      }
    }
  }
  return null;
}
