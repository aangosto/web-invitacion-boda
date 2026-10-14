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
