/* =================================================================
   DIBUJO DEL PLANO (SVG, unidades en metros) — compartido.

   Lo usan plano.html (plano-page.js, en pantalla) y el PDF para la
   wedding planner (plano-imagen.js, rasterizado a alta resolución):
   así el PDF es exactamente el mismo dibujo que se ve en el plano.
   Solo construye nodos SVG; los colores salen de style.css (pla-*).
   ================================================================= */

import { iconoMesa } from './mesas-iconos.js';
import {
  SILLA_R, numPuestos, tamanoMesa, puestosLocales, semiCaja, ordenPuestos,
  FINCA_ZONA_CLARA, FINCA_SALIDAS, SALIDA_ANCHO,
} from './plano-geom.js';

export const SVGNS = 'http://www.w3.org/2000/svg';
/** Ampliación del dibujo dentro del medallón (recorta el blanco del borde). */
export const ZOOM_DIBUJO = 1.3;

export function sv(tag, attrs, text) {
  const node = document.createElementNS(SVGNS, tag);
  if (attrs) Object.entries(attrs).forEach(([k, v]) => node.setAttribute(k, String(v)));
  if (text != null) node.textContent = text;
  return node;
}
export const fmtM = (v) => `${v.toLocaleString('es-ES', { maximumFractionDigits: 1 })} m`;
export const corto = (s, max = 13) => (s.length > max ? `${s.slice(0, max - 1)}…` : s);
/** "7 · Limón"; la presidencial va sin número y una mesa sin él, "s/n". */
export const rotulo = (m, max) => (m.presidencial ? corto(m.nombre, max)
  : `${m.numero != null ? m.numero : 's/n'} · ${corto(m.nombre, max)}`);

/**
 * Dibujo de la mesa en un medallón circular: recorte redondo algo
 * ampliado (fuera el blanco de los bordes y la firma; la mancha de
 * acuarela hace de fondo) con un aro fino. Sin dibujo, o si la imagen
 * no carga, la inicial en el estilo de la web.
 *   idPre: prefijo de los id de recorte (dos dibujos en la misma página)
 */
export function medallon(mesa, cx, cy, d, { idPre = 'med' } = {}) {
  const ic = iconoMesa(mesa);
  const g = sv('g', { class: 'pla-medallon' });
  const inicial = () => {
    g.innerHTML = '';
    g.appendChild(sv('circle', { cx, cy, r: d / 2, class: 'pla-inicial' }));
    g.appendChild(sv('text', { x: cx, y: cy, class: 'pla-inicial__txt', 'font-size': d * 0.62 }, ic.inicial));
  };
  if (!ic.url) { inicial(); return g; }
  const clipId = `${idPre}-${mesa.id}`;
  const clip = sv('clipPath', { id: clipId });
  clip.appendChild(sv('circle', { cx, cy, r: d / 2 }));
  g.appendChild(clip);
  g.appendChild(sv('circle', { cx, cy, r: d / 2, class: 'pla-medallon__fondo' }));
  const z = d * ZOOM_DIBUJO;
  const img = sv('image', {
    href: ic.url, x: cx - z / 2, y: cy - z / 2, width: z, height: z,
    'clip-path': `url(#${clipId})`, preserveAspectRatio: 'xMidYMid slice',
  });
  img.addEventListener('error', inicial, { once: true });
  g.appendChild(img);
  g.appendChild(sv('circle', { cx, cy, r: d / 2, class: 'pla-medallon__aro' }));
  return g;
}

/** Suelo, zona clara, rejilla, línea discontinua, paredes, SALIDAS y cotas. */
export function dibujaSalon(svg, plano) {
  const { ancho, largo } = plano;
  // Suelo, rejilla y paredes (la cota del ancho va abajo: arriba está
  // la presidencial pegada a la pared)
  svg.appendChild(sv('rect', { x: 0, y: 0, width: ancho, height: largo, class: 'pla-suelo', 'data-suelo': '' }));
  // Como el plano de la finca: zona más clara a la izquierda de una
  // línea discontinua vertical
  const xZona = ancho * FINCA_ZONA_CLARA;
  svg.appendChild(sv('rect', { x: 0, y: 0, width: xZona, height: largo, class: 'pla-suelo-claro' }));
  const rej = sv('g', { class: 'pla-rejilla' });
  for (let x = 1; x < ancho; x += 1) rej.appendChild(sv('line', { x1: x, y1: 0, x2: x, y2: largo }));
  for (let y = 1; y < largo; y += 1) rej.appendChild(sv('line', { x1: 0, y1: y, x2: ancho, y2: y }));
  svg.appendChild(rej);
  svg.appendChild(sv('line', { x1: xZona, y1: 0, x2: xZona, y2: largo, class: 'pla-linea-zona' }));
  svg.appendChild(sv('rect', { x: 0, y: 0, width: ancho, height: largo, class: 'pla-paredes' }));
  // Salidas: hueco en la pared, flecha hacia fuera y rótulo
  FINCA_SALIDAS.forEach((sa) => {
    const izq = sa.pared === 'izquierda';
    const xp = izq ? 0 : ancho;
    const yc = sa.y * largo;
    const y1 = yc - SALIDA_ANCHO / 2;
    const y2 = yc + SALIDA_ANCHO / 2;
    const s = izq ? -1 : 1;  // hacia fuera
    const g = sv('g', { class: 'pla-salida' });
    g.appendChild(sv('line', { x1: xp, y1, x2: xp, y2, class: 'pla-salida__hueco' }));
    g.appendChild(sv('line', { x1: xp - 0.2, y1, x2: xp + 0.2, y2: y1, class: 'pla-salida__jamba' }));
    g.appendChild(sv('line', { x1: xp - 0.2, y1: y2, x2: xp + 0.2, y2, class: 'pla-salida__jamba' }));
    g.appendChild(sv('path', {
      d: `M ${xp + s * 0.2} ${yc} L ${xp + s * 0.75} ${yc} M ${xp + s * 0.55} ${yc - 0.2} L ${xp + s * 0.8} ${yc} L ${xp + s * 0.55} ${yc + 0.2}`,
      class: 'pla-salida__flecha',
    }));
    const xt = xp + s * 1.15;
    g.appendChild(sv('text', {
      x: xt, y: yc, class: 'pla-salida__txt', 'font-size': 0.4,
      transform: `rotate(${izq ? -90 : 90} ${xt} ${yc})`,
    }, 'SALIDA'));
    svg.appendChild(g);
  });
  svg.appendChild(sv('text', { x: ancho / 2, y: largo + 0.6, class: 'pla-cota', 'font-size': 0.42 }, fmtM(ancho)));
  // Cota del largo arriba a la derecha (en mitad de las paredes laterales van las salidas)
  svg.appendChild(sv('text', {
    x: ancho + 0.55, y: largo * 0.22, class: 'pla-cota', 'font-size': 0.42,
    transform: `rotate(90 ${ancho + 0.55} ${largo * 0.22})`,
  }, fmtM(largo)));
}

/**
 * Una mesa: sillas, tablero, cabecera y flecha de la presidencial,
 * medallón, rótulo "7 · Limón" y ocupación.
 *   px(n):     metros que ocupan n píxeles de pantalla (nivel de detalle)
 *   clase:     clases extra del grupo (selección, provisional…)
 *   avisos:    colorear "s/n", números repetidos y sobreaforo (en pantalla sí)
 *   repetidos: Map de numerosRepetidos()
 *   extra(giro, {w, h, n}): añade elementos al grupo girado (tirador)
 */
export function dibujaMesa(mesa, { px, clase = '', avisos = true, repetidos = new Map(), idPre, extra } = {}) {
  const n = numPuestos(mesa);
  const { w, h } = tamanoMesa(mesa.forma, n);
  const ocupadas = mesa.comensales.length;
  const sobre = ocupadas > mesa.capacidad;
  const g = sv('g', {
    class: `pla-mesa${mesa.presidencial ? ' is-pres' : ''}${clase}`,
    'data-mesa': mesa.id,
    transform: `translate(${mesa.x} ${mesa.y})`,
  });
  const giro = sv('g', { transform: `rotate(${mesa.rot})`, 'data-giro': '' });

  // Sillas (ocupadas según el orden de puestos)
  const slots = ordenPuestos(mesa);
  puestosLocales(mesa.forma, n).forEach((p, i) => {
    const exceso = i >= mesa.capacidad;
    giro.appendChild(sv('circle', {
      cx: p.x, cy: p.y, r: SILLA_R,
      class: `pla-silla${slots[i] ? ' is-ocupada' : ''}${exceso ? ' is-exceso' : ''}`,
    }));
  });
  // Tablero
  if (mesa.forma === 'redonda') {
    giro.appendChild(sv('circle', { cx: 0, cy: 0, r: w / 2, class: 'pla-tablero' }));
  } else {
    giro.appendChild(sv('rect', {
      x: -w / 2, y: -h / 2, width: w, height: h, rx: 0.06, class: 'pla-tablero',
    }));
  }
  // Presidencial: cabecera (espalda a la pared) y flecha "mira hacia"
  if (mesa.presidencial) {
    const { hy } = semiCaja('redonda', n, 0);
    const yc = mesa.forma === 'redonda' ? -hy : -(h / 2 + 0.52);
    giro.appendChild(sv('line', { x1: -w / 2, y1: yc - 0.08, x2: w / 2, y2: yc - 0.08, class: 'pla-pared-pres' }));
    const yf = (mesa.forma === 'redonda' ? w / 2 : h / 2) + 0.62;
    giro.appendChild(sv('path', { d: `M -0.22 ${yf} L 0.22 ${yf} L 0 ${yf + 0.32} Z`, class: 'pla-mira' }));
  }
  if (extra) extra(giro, { w, h, n });
  g.appendChild(giro);

  // Etiquetas (sin rotar, siempre legibles). Nivel de detalle según el
  // zoom: si el dibujo se ve lo bastante grande va centrado sobre el
  // nombre; si no se leería, manda el NOMBRE (a tamaño legible en
  // pantalla) y el dibujo queda como acento pequeño en el borde.
  const lado = Math.min(w, h);
  const fNombre = Math.max(0.3, px(11));
  const fOcupa = Math.max(0.26, px(10));
  const altoTexto = (fNombre + fOcupa) * 1.15;
  const dMed = Math.min(1.25, lado * 0.62, lado * 0.92 - altoTexto);
  const ocupa = `${ocupadas}/${mesa.capacidad}${sobre && avisos ? ' ⚠' : ''}`;
  const claseOcupa = `pla-ocupa${sobre && avisos ? ' is-sobre' : ''}`;
  const repe = avisos && repetidos.has(mesa.numero) && !mesa.presidencial;
  const sinNum = avisos && !mesa.presidencial && mesa.numero == null;
  const claseNombre = `pla-nombre${sinNum ? ' is-sinnum' : ''}${repe ? ' is-repe' : ''}`;
  // Ancho para el rótulo: el del tablero en horizontal (sin rotar el
  // texto). Al no salirse de su propia mesa, nunca pisa a otra mesa ni
  // a otro rótulo (las mesas no se solapan). Lo ajusta ajustaRotulos().
  const a = (mesa.rot * Math.PI) / 180;
  const anchoRotulo = mesa.forma === 'redonda' ? w * 0.9
    : (Math.abs(w * Math.cos(a)) + Math.abs(h * Math.sin(a))) * 0.95;
  const rotuloAttrs = (yN) => ({
    x: 0, y: yN, class: claseNombre, 'font-size': fNombre, 'data-rotulo': '',
    'data-pre': mesa.presidencial ? '' : `${mesa.numero != null ? mesa.numero : 's/n'} · `,
    'data-nombre': mesa.nombre, 'data-max': anchoRotulo,
  });
  const grande = dMed >= px(34);
  // Grande: dibujo centrado sobre el nombre. Si no, pila centrada con
  // acento pequeño, nombre corto y ocupación.
  const dM = grande ? dMed : px(18);
  const sep = grande ? 0.06 : px(2);
  const top = -(dM + sep + altoTexto) / 2;
  g.appendChild(medallon(mesa, 0, top + dM / 2, dM, { idPre }));
  const yN = top + dM + sep + fNombre * 0.6;
  g.appendChild(sv('text', rotuloAttrs(yN), rotulo(mesa, 40)));
  g.appendChild(sv('text', {
    x: 0, y: yN + fNombre * 0.55 + fOcupa * 0.6, class: claseOcupa, 'font-size': fOcupa, 'data-ajusta': anchoRotulo,
  }, ocupa));
  return g;
}

/**
 * Cada rótulo cabe en el ancho de su mesa: primero se reduce la letra
 * (hasta el 60 %) y, si aún no cabe, se recorta el NOMBRE con «…». El
 * número de mesa se ve siempre (en el peor caso queda solo el número).
 */
export function ajustaRotulos(svg) {
  // Ocupación (8/10): solo se reduce la letra
  svg.querySelectorAll('[data-ajusta]').forEach((t) => {
    const max = Number(t.dataset.ajusta);
    const f0 = Number(t.getAttribute('font-size'));
    let ancho = t.getComputedTextLength();
    let f = f0;
    while (ancho > max && f > f0 * 0.5) {
      f *= 0.9;
      t.setAttribute('font-size', f);
      ancho = t.getComputedTextLength();
    }
  });
  svg.querySelectorAll('[data-rotulo]').forEach((t) => {
    const max = Number(t.dataset.max);
    const pre = t.dataset.pre;
    const f0 = Number(t.getAttribute('font-size'));
    const pon = (txt) => { t.textContent = txt; return t.getComputedTextLength(); };
    let ancho = pon(pre + t.dataset.nombre);
    if (!ancho) return; // no visible: nada que medir
    let f = f0;
    while (ancho > max && f > f0 * 0.6) {
      f *= 0.9;
      t.setAttribute('font-size', f);
      ancho = t.getComputedTextLength();
    }
    let nombre = t.dataset.nombre;
    while (ancho > max && nombre.length) {
      nombre = nombre.slice(0, -1).trimEnd();
      ancho = pon(nombre ? `${pre}${nombre}…` : (pre ? pre.replace(/ · $/, '') : '…'));
    }
  });
}
