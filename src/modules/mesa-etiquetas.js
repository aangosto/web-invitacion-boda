/* =================================================================
   DIBUJO DE UNA MESA CON SUS COMENSALES — cálculo compartido.

   Lo usan el detalle de mesa de plano.html (SVG, unidades = px) y las
   fichas del PDF para la wedding planner (jsPDF, unidades = mm). Módulo
   PURO: recibe una función que mide el texto y devuelve la geometría
   ya colocada; cada uno la pinta a su manera.

   Etiquetas como en un gráfico de tarta:
     · Nunca se recorta un nombre. Si no cabe en una línea se parte en
       dos por el espacio más cercano a la mitad; solo si aun así no
       cabe, se reduce un poco la letra (hasta un mínimo legible).
     · Por LADOS: sillas de la mitad derecha → nombre a su derecha,
       alineado a la izquierda; mitad izquierda → a su izquierda,
       alineado a la derecha. Las de arriba/abajo del todo van al lado
       con más sitio.
     · En cada lado se ordenan por altura y se separan en vertical hasta
       que entre dos nombres quede al menos una línea. En horizontal se
       apartan de sillas, mesa, flecha y cabecera de la presidencial.
       Si un nombre queda lejos de su silla, una línea guía los une.
     · La mesa va centrada en el ancho disponible; el alto es el que
       haga falta (o, con `altoMax`, el que quepa).
   ================================================================= */

import {
  numPuestos, tamanoMesa, puestosLocales, semiCaja, haciaMesa,
} from './plano-geom.js';

/* ---------- ★ e icono de orientación en las etiquetas ---------- */
export const ESTRELLA = '★';
export const NBSP = ' ';
/** Icono de "hacia los novios" de cada estrella (pantalla). */
export const ICONO_ORIENT = { cara: '◉', lado: '◑', espaldas: '○' };
const ORIENT_DE_ICONO = Object.fromEntries(Object.entries(ICONO_ORIENT).map(([k, v]) => [v, k]));

/**
 * Texto de la etiqueta de un asiento: "★ Nombre" para las estrellas (con
 * espacio duro: la ★ nunca se queda sola en una línea) y, si se pasa
 * `orient`, el icono pegado al final. Así se mide y se parte el texto
 * real, y cada dibujo pinta la ★ (y el icono) a su manera.
 */
export function etiquetaPuesto(c, orient = null) {
  if (!c) return '';
  if (!c.estrella) return c.nombre;
  return `${ESTRELLA}${NBSP}${c.nombre}${orient && ICONO_ORIENT[orient] ? `${NBSP}${ICONO_ORIENT[orient]}` : ''}`;
}
/** Parte una línea de etiqueta en { estrella, texto, orient }. */
export function trozosEtiqueta(l) {
  let texto = l;
  const estrella = texto.startsWith(`${ESTRELLA}${NBSP}`);
  if (estrella) texto = texto.slice(2);
  let orient = null;
  const ult = texto.slice(-1);
  if (texto.length >= 2 && texto.slice(-2, -1) === NBSP && ORIENT_DE_ICONO[ult]) {
    orient = ORIENT_DE_ICONO[ult];
    texto = texto.slice(0, -2);
  }
  return { estrella, texto, orient };
}

/* ---------- Texto ---------- */
/**
 * Líneas de un nombre: una si cabe en `max`; si no, dos partiendo por el
 * espacio más cercano a la mitad. `forzar` (último recurso) reparte en
 * tantas líneas como haga falta, siempre por espacios.
 */
export function partirNombre(nombre, max, medir, forzar = false) {
  const t = String(nombre).trim();
  if (medir(t) <= max) return [t];
  const espacios = [...t.matchAll(/ /g)].map((m) => m.index);
  if (!espacios.length) return [t];
  // El espacio más cercano a la mitad del ANCHO (las dos líneas lo más
  // parejas posible)
  const ancho = (k) => Math.max(medir(t.slice(0, k)), medir(t.slice(k + 1)));
  const corte = espacios.reduce((a, b) => (ancho(b) < ancho(a) ? b : a));
  const dos = [t.slice(0, corte), t.slice(corte + 1)];
  if (!forzar || dos.every((l) => medir(l) <= max)) return dos;
  // Último recurso: palabra a palabra
  const lineas = [];
  t.split(' ').forEach((p) => {
    const ult = lineas.length ? lineas[lineas.length - 1] : null;
    if (ult != null && medir(`${ult} ${p}`) <= max) lineas[lineas.length - 1] = `${ult} ${p}`;
    else lineas.push(p);
  });
  return lineas;
}

/* ---------- Obstáculos: qué hueco horizontal ocupan en una franja ---------- */
/** Círculo: [xmin, xmax] dentro de la franja y0..y1, o null. */
function anchoCirculo(c, y0, y1) {
  const d = c.y >= y0 && c.y <= y1 ? 0 : Math.min(Math.abs(y0 - c.y), Math.abs(y1 - c.y));
  if (d >= c.r) return null;
  const h = Math.sqrt(c.r * c.r - d * d);
  return [c.x - h, c.x + h];
}
/** Polígono convexo [[x, y]…]: [xmin, xmax] dentro de la franja, o null. */
function anchoPoligono(pts, y0, y1) {
  const xs = [];
  pts.forEach(([x, y], k) => {
    if (y >= y0 && y <= y1) xs.push(x);
    const [x2, y2] = pts[(k + 1) % pts.length];
    [y0, y1].forEach((yl) => {
      if ((y - yl) * (y2 - yl) < 0) xs.push(x + ((yl - y) * (x2 - x)) / (y2 - y));
    });
  });
  return xs.length ? [Math.min(...xs), Math.max(...xs)] : null;
}
function anchoObstaculo(o, y0, y1) {
  return o.circ ? anchoCirculo(o.circ, y0, y1) : anchoPoligono(o.pts, y0, y1);
}
/** Segmento grueso como polígono. */
function trazo(x1, y1, x2, y2, grosor) {
  const l = Math.hypot(x2 - x1, y2 - y1) || 1;
  const nx = (-(y2 - y1) / l) * grosor / 2;
  const ny = ((x2 - x1) / l) * grosor / 2;
  return [[x1 + nx, y1 + ny], [x2 + nx, y2 + ny], [x2 - nx, y2 - ny], [x1 - nx, y1 - ny]];
}

/* ---------- Separación vertical (bloques que se empujan) ---------- */
/**
 * items: [{ d (centro deseado), h (alto) }] ya ordenados de arriba abajo.
 * Devuelve los centros: lo más cerca posible de lo deseado y con
 * `hueco` libre entre dos consecutivos.
 */
function separaVertical(items, hueco) {
  const bloques = [];
  items.forEach((it, k) => {
    let b = { ids: [k], offs: [0], alto: it.h, suma: it.d - it.h / 2 };
    b.top = b.suma;
    // Funde con el anterior mientras se pisen
    while (bloques.length) {
      const prev = bloques[bloques.length - 1];
      if (prev.top + prev.alto + hueco <= b.top) break;
      bloques.pop();
      const desp = prev.alto + hueco;
      const n = prev.ids.length + b.ids.length;
      const merged = {
        ids: [...prev.ids, ...b.ids],
        offs: [...prev.offs, ...b.offs.map((o) => o + desp)],
        alto: prev.alto + hueco + b.alto,
        suma: prev.suma + b.suma - b.ids.length * desp,
      };
      merged.top = merged.suma / n;
      b = merged;
    }
    bloques.push(b);
  });
  const centros = new Array(items.length);
  bloques.forEach((b) => b.ids.forEach((id, j) => { centros[id] = b.top + b.offs[j] + items[id].h / 2; }));
  return centros;
}

/* ---------- Geometría de la mesa a escala s ---------- */
function geometriaMesa(mesa, pres, s, o) {
  const n = numPuestos(mesa);
  const { w, h } = tamanoMesa(mesa.forma, n);
  const rad = ((mesa.rot || 0) * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const gira = (x, y) => [(x * cos - y * sin) * s, (x * sin + y * cos) * s];
  // Radio de silla: mínimo legible, pero sin tocar a la de al lado (0,6 m)
  const rS = Math.min(Math.max(o.sillaMin, 0.22 * s), 0.28 * s);
  const sillas = puestosLocales(mesa.forma, n).map((p, i) => {
    const [x, y] = gira(p.x, p.y);
    return { i, x, y, r: rS };
  });
  const obst = sillas.map((c) => ({ circ: c, silla: c.i }));
  let tablero;
  if (mesa.forma === 'redonda') {
    tablero = { circ: { x: 0, y: 0, r: (w / 2) * s } };
  } else {
    tablero = { pts: [gira(-w / 2, -h / 2), gira(w / 2, -h / 2), gira(w / 2, h / 2), gira(-w / 2, h / 2)] };
  }
  obst.push(tablero);

  // Flecha hacia los novios (atraviesa la mesa) o, en la presidencial,
  // cabecera (pared) y triángulo "mira hacia" como en el plano
  let flecha = null;
  let cabecera = null;
  if (mesa.presidencial) {
    const { hy } = semiCaja('redonda', n, 0);
    const yc = (mesa.forma === 'redonda' ? -hy : -(h / 2 + 0.52)) - 0.08;
    const yf = (mesa.forma === 'redonda' ? w / 2 : h / 2) + 0.62;
    const grosor = Math.max(o.trazoMin * 2, 0.14 * s);
    const linea = [...gira(-w / 2, yc), ...gira(w / 2, yc)];
    const tri = [gira(-0.22, yf), gira(0.22, yf), gira(0, yf + 0.32)];
    cabecera = { linea, grosor, tri };
    obst.push({ pts: trazo(...linea, grosor) }, { pts: tri });
  } else if (pres) {
    const { ang } = haciaMesa(mesa, pres);
    const a = (ang * Math.PI) / 180;
    const r0 = (Math.min(w, h) / 2 - 0.15) * s;
    const ux = Math.cos(a); const uy = Math.sin(a); const vx = -uy; const vy = ux;
    const pt = (t, v = 0) => [ux * t + vx * v, uy * t + vy * v];
    const grosor = Math.max(o.trazoMin, 0.05 * s);
    flecha = {
      linea: [...pt(-r0 + 0.2 * s), ...pt(r0 - 0.05 * s)],
      punta: [pt(r0 - 0.3 * s, 0.2 * s), pt(r0, 0), pt(r0 - 0.3 * s, -0.2 * s)],
      grosor,
    };
    obst.push({ pts: trazo(...flecha.linea, grosor * 2) }, { pts: flecha.punta });
  }
  return { s, rS, sillas, tablero, flecha, cabecera, obst };
}

/* ---------- Colocación de las etiquetas para una escala y una letra ---------- */
function colocaEtiquetas(geo, nombres, fs, o, anchoDisp, forzar = false) {
  const lh = o.altoLinea(fs);
  const hueco = lh;                       // una línea libre entre dos nombres
  const medir = (t) => o.medir(t, fs) * 1.03 + 0.5 * o.unidad;
  const pad = o.separacion;
  const mitad = anchoDisp / 2;

  // Lado de cada silla ocupada; las centradas (arriba/abajo), al lado con más sitio
  const items = [];
  geo.sillas.forEach((c) => {
    if (!nombres[c.i]) return;
    items.push({ c, nombre: nombres[c.i], centrada: Math.abs(c.x) <= c.r * 0.5 });
  });

  // Ancho disponible desde la silla hasta el borde (para partir en líneas)
  const dispDe = (it, lado) => (lado === 'dcha' ? mitad - (it.c.x + it.c.r + pad) : (it.c.x - it.c.r - pad) + mitad);
  const lineasDe = (it, lado) => partirNombre(it.nombre, dispDe(it, lado), medir, forzar);

  const lados = { izq: [], dcha: [] };
  const altoLado = { izq: 0, dcha: 0 };
  items.filter((it) => !it.centrada).forEach((it) => {
    it.lado = it.c.x > 0 ? 'dcha' : 'izq';
    lados[it.lado].push(it);
  });
  items.forEach((it) => { if (!it.centrada) { it.lineas = lineasDe(it, it.lado); altoLado[it.lado] += it.lineas.length * lh + hueco; } });
  items.filter((it) => it.centrada).forEach((it) => {
    const opciones = ['izq', 'dcha'].map((lado) => {
      const lineas = lineasDe(it, lado);
      const cabe = lineas.every((l) => medir(l) <= dispDe(it, lado));
      return { lado, lineas, cabe, alto: altoLado[lado] };
    });
    // Primero donde cabe; a igualdad, el lado menos cargado
    opciones.sort((a, b) => (b.cabe - a.cabe) || (a.alto - b.alto) || (a.lado === 'dcha' ? -1 : 1));
    it.lado = opciones[0].lado;
    it.lineas = opciones[0].lineas;
    altoLado[it.lado] += it.lineas.length * lh + hueco;
    lados[it.lado].push(it);
  });

  const etiquetas = [];
  for (const lado of ['izq', 'dcha']) {
    const lista = lados[lado];
    // Orden de arriba abajo; en la fila de arriba la silla más interior
    // va más alta y en la de abajo más baja (las guías no se cruzan)
    lista.sort((a, b) => (a.c.y - b.c.y)
      || (a.c.y < 0 ? Math.abs(a.c.x) - Math.abs(b.c.x) : Math.abs(b.c.x) - Math.abs(a.c.x)));
    // Hasta 3 vueltas: si al apartarse de los obstáculos un nombre ya no
    // cabe en una línea, se parte y se vuelve a separar
    for (let vuelta = 0; vuelta < 3; vuelta++) {
      const centros = separaVertical(lista.map((it) => ({ d: it.c.y, h: it.lineas.length * lh })), hueco);
      let cambio = false;
      lista.forEach((it, k) => {
        const alto = it.lineas.length * lh;
        it.y0 = centros[k] - alto / 2;
        it.y1 = it.y0 + alto;
        it.ancho = Math.max(...it.lineas.map(medir));
        // Borde interior: junto a su silla y fuera de todo lo que ocupe su franja
        const base = lado === 'dcha' ? it.c.x + it.c.r + pad : it.c.x - it.c.r - pad;
        let borde = base;
        for (let rep = 0; rep < 20; rep++) {
          let mueve = false;
          geo.obst.forEach((ob) => {
            const ext = anchoObstaculo(ob, it.y0 - pad, it.y1 + pad);
            if (!ext) return;
            if (lado === 'dcha') {
              if (ext[1] + pad > borde && ext[0] - pad < borde + it.ancho) { borde = ext[1] + pad; mueve = true; }
            } else if (ext[0] - pad < borde && ext[1] + pad > borde - it.ancho) { borde = ext[0] - pad; mueve = true; }
          });
          if (!mueve) break;
        }
        it.borde = borde;
        const libre = lado === 'dcha' ? mitad - borde : borde + mitad;
        if (it.ancho > libre && vuelta < 2) {
          const nuevas = partirNombre(it.nombre, libre, medir, forzar);
          if (nuevas.length !== it.lineas.length) { it.lineas = nuevas; cambio = true; }
        }
      });
      if (!cambio) break;
    }
    lista.forEach((it) => {
      const x0 = lado === 'dcha' ? it.borde : it.borde - it.ancho;
      const x1 = lado === 'dcha' ? it.borde + it.ancho : it.borde;
      const yc = (it.y0 + it.y1) / 2;
      // Línea guía si el nombre ha quedado lejos de su silla
      const lejos = Math.abs(yc - it.c.y) > it.c.r * 0.8
        || Math.abs(it.borde - (lado === 'dcha' ? it.c.x + it.c.r + pad : it.c.x - it.c.r - pad)) > pad * 1.5;
      let guia = null;
      if (lejos) {
        const tx = lado === 'dcha' ? it.borde - pad * 0.35 : it.borde + pad * 0.35;
        const ty = it.y0 + lh / 2;
        const d = Math.hypot(tx - it.c.x, ty - it.c.y) || 1;
        guia = [it.c.x + ((tx - it.c.x) / d) * it.c.r, it.c.y + ((ty - it.c.y) / d) * it.c.r, tx, ty];
      }
      etiquetas.push({
        i: it.c.i, lado, lineas: it.lineas, fs, lh,
        x: it.borde, align: lado === 'dcha' ? 'left' : 'right',
        caja: { x0, y0: it.y0, x1, y1: it.y1 }, guia,
      });
    });
  }
  return etiquetas;
}

/** Caja que lo engloba todo (relativa al centro de la mesa). */
function englobante(geo, etiquetas) {
  let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
  const mete = (x, y) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); };
  geo.obst.forEach((ob) => {
    if (ob.circ) { mete(ob.circ.x - ob.circ.r, ob.circ.y - ob.circ.r); mete(ob.circ.x + ob.circ.r, ob.circ.y + ob.circ.r); } else ob.pts.forEach(([x, y]) => mete(x, y));
  });
  etiquetas.forEach((e) => { mete(e.caja.x0, e.caja.y0); mete(e.caja.x1, e.caja.y1); });
  return { x0, y0, x1, y1 };
}

/**
 * Diseña el dibujo de una mesa.
 *   mesa, pres (presidencial o null), nombres: [nombre | ''] por asiento
 *   opts:
 *     ancho        ancho disponible (unidades)
 *     altoMax      alto máximo (opcional; si no, el que haga falta)
 *     medir(t, fs) ancho del texto a ese tamaño de letra
 *     fuentes      tamaños de letra, de mayor a menor (el último es el mínimo)
 *     altoLinea(fs) alto de una línea
 *     unidad       1 px (pantalla) o 0,35 mm (PDF): márgenes y redondeos
 *     separacion   hueco entre silla y nombre
 *     sillaMin     radio mínimo de silla
 *     trazoMin     grosor mínimo de la flecha
 *     escala       { min, max } en unidades por metro
 *     fraccionMesa parte del ancho que puede ocupar la mesa (0,5)
 * Devuelve { ancho, alto, ox, oy, s, rS, fs, sillas, tablero, flecha,
 * cabecera, etiquetas, cabe, forzado } con todo ya en coordenadas del área
 * (0,0 = esquina superior izquierda). `forzado`: algún nombre muy largo
 * no cabía ni en dos líneas con la letra mínima y va en tres o más.
 * `cabe` = false si ni así cabe (se devuelve igualmente lo mejor).
 */
export function disenaMesa(mesa, pres, nombres, opts) {
  const o = { unidad: 1, ...opts };
  const W = o.ancho;
  const margen = 2 * o.unidad;
  const n = numPuestos(mesa);
  const { hx, hy } = semiCaja(mesa.forma, n, mesa.rot || 0);
  // La mesa (con sillas) no pasa de una fracción del ancho (la mitad, por defecto)
  const sMax = Math.max(o.escala.min, Math.min(o.escala.max, (W * (o.fraccionMesa ?? 0.5)) / (2 * Math.max(hx, hy))));
  const intenta = (s, fs, forzar = false) => {
    const geo = geometriaMesa(mesa, pres, s, o);
    const etiquetas = colocaEtiquetas(geo, nombres, fs, o, W - 2 * margen, forzar);
    const bb = englobante(geo, etiquetas);
    const anchoOk = bb.x0 >= -(W / 2 - margen) - 1e-6 && bb.x1 <= W / 2 - margen + 1e-6;
    const alto = bb.y1 - bb.y0 + 2 * margen;
    const altoOk = o.altoMax == null || alto <= o.altoMax + 1e-6;
    return { geo, etiquetas, bb, alto, cabe: anchoOk && altoOk, s, fs, forzado: forzar };
  };

  let mejor = null;
  const fuentes = o.fuentes;
  // Letra de mayor a menor; con cada letra, la mayor escala que quepa
  for (const fs of fuentes) {
    for (let s = sMax; s >= o.escala.min - 1e-9; s = s > o.escala.min ? Math.max(o.escala.min, s * 0.96) : -1) {
      const r = intenta(s, fs);
      if (r.cabe) { mejor = r; break; }
    }
    if (mejor) break;
  }
  if (!mejor) {
    // Último recurso (nombres muy largos en poco ancho): mesa algo más
    // pequeña y, si aun así no cabe, el nombre en más de dos líneas.
    // Nunca se recorta.
    const fs = fuentes[fuentes.length - 1];
    for (const forzar of [false, true]) {
      for (let s = o.escala.min; s >= o.escala.min * 0.6; s *= 0.95) {
        const r = intenta(s, fs, forzar);
        if (!mejor || r.cabe) mejor = r;
        if (r.cabe) break;
      }
      if (mejor.cabe) break;
    }
  }

  // A coordenadas del área: mesa centrada en horizontal, arriba el margen
  const { geo, etiquetas, bb } = mejor;
  const ox = W / 2;
  const oy = margen - bb.y0;
  const P = ([x, y]) => [x + ox, y + oy];
  const tablero = geo.tablero.circ
    ? { circ: { x: ox, y: oy, r: geo.tablero.circ.r } }
    : { pts: geo.tablero.pts.map(P) };
  const flecha = geo.flecha && {
    linea: [geo.flecha.linea[0] + ox, geo.flecha.linea[1] + oy, geo.flecha.linea[2] + ox, geo.flecha.linea[3] + oy],
    punta: geo.flecha.punta.map(P), grosor: geo.flecha.grosor,
  };
  const cabecera = geo.cabecera && {
    linea: [geo.cabecera.linea[0] + ox, geo.cabecera.linea[1] + oy, geo.cabecera.linea[2] + ox, geo.cabecera.linea[3] + oy],
    grosor: geo.cabecera.grosor, tri: geo.cabecera.tri.map(P),
  };
  return {
    ancho: W, alto: mejor.alto, ox, oy, s: geo.s, rS: geo.rS, fs: mejor.fs, cabe: mejor.cabe,
    forzado: mejor.forzado,
    sillas: geo.sillas.map((c) => ({ ...c, x: c.x + ox, y: c.y + oy })),
    tablero, flecha, cabecera,
    etiquetas: etiquetas.map((e) => ({
      ...e, x: e.x + ox,
      caja: { x0: e.caja.x0 + ox, y0: e.caja.y0 + oy, x1: e.caja.x1 + ox, y1: e.caja.y1 + oy },
      guia: e.guia && [e.guia[0] + ox, e.guia[1] + oy, e.guia[2] + ox, e.guia[3] + oy],
    })),
  };
}
