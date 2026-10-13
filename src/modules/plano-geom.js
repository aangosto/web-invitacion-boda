/* =================================================================
   PLANO DEL SALÓN — geometría pura (sin DOM ni Firestore, probable en
   Node: scripts/test-plano.mjs).

   Unidades: METROS. Origen en la esquina superior izquierda del salón,
   x hacia la derecha, y hacia abajo (como el SVG). `rot` en grados,
   sentido horario. En coordenadas locales de la mesa el puesto 1 está
   ARRIBA (cabecera) y la mesa "mira" hacia ABAJO: la presidencial con
   rot 0 tiene la cabecera contra la pared de arriba y mira al salón.
   ================================================================= */

export const FORMAS = ['redonda', 'cuadrada', 'rectangular'];
export const FORMA_LABEL = { redonda: 'Redonda', cuadrada: 'Cuadrada', rectangular: 'Rectangular' };

/** Ancho de plaza (m) a lo largo del borde de la mesa. */
const PLAZA = 0.6;
/** Distancia de la silla al borde de la mesa (m). */
export const SILLA_OFFSET = 0.32;
/** Radio de la silla (m). */
export const SILLA_R = 0.2;

export const PLANO_DEFAULT = { ancho: 18, largo: 24, rejilla: 0.5, iman: true };

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
