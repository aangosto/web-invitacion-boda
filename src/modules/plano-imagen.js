/* =================================================================
   PLANO → IMAGEN de alta resolución (para el PDF de la wedding planner).

   Construye el MISMO dibujo SVG que plano.html (plano-dibujo.js) en un
   SVG oculto de la página, con style.css y las fuentes de la web ya
   cargadas, ajusta los rótulos igual que en pantalla y lo pinta en un
   <canvas> a la resolución pedida:
     1. formas (suelo, paredes, salidas, sillas, tableros…): el SVG sin
        textos ni imágenes, con los estilos calculados en línea, como
        imagen;
     2. meseros: las WebP se dibujan directamente en el canvas,
        recortadas en círculo (jsPDF no admite WebP; al final todo sale
        como un JPEG);
     3. textos: con canvas y las fuentes reales (Cormorant y Jost), en la
        posición, tamaño y giro que tienen en el SVG.
   Sin interfaz: ni selección, ni tirador de giro, ni avisos de color.
   ================================================================= */

import { sv, dibujaSalon, dibujaMesa, ajustaRotulos, ZOOM_DIBUJO } from './plano-dibujo.js';
import { iconoMesa } from './mesas-iconos.js';
import { recortePlano } from './plano-geom.js';

/** Nivel de detalle del rótulo como en pantalla con el salón entero
    (px(11) ≈ 30 cm de letra, que impreso son ~8 pt). */
const PX_IMPRESO = 0.3 / 11;
/** Tope de píxeles del canvas (iOS no pasa de ~16,7 M). */
const MAX_PIXELES = 16e6;

const ESTILOS = ['fill', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-dasharray',
  'stroke-linecap', 'stroke-linejoin', 'stroke-opacity', 'opacity'];

function cargaImagen(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

/** Imágenes de los meseros (url → Image o null si no carga). */
async function cargaMeseros(mesas) {
  const urls = [...new Set(mesas.map((m) => iconoMesa(m).url).filter(Boolean))];
  const imgs = await Promise.all(urls.map(cargaImagen));
  return new Map(urls.map((u, i) => [u, imgs[i]]));
}

/** Espera a las fuentes de los rótulos (sin colgarse si no llegan). */
async function cargaFuentes() {
  if (!document.fonts) return;
  const specs = ['600 20px "Cormorant Garamond"', 'italic 600 20px "Cormorant Garamond"',
    '400 20px Jost', '700 20px Jost', '400 20px Parisienne'];
  await Promise.race([
    Promise.all(specs.map((s) => document.fonts.load(s).catch(() => null))),
    new Promise((r) => setTimeout(r, 4000)),
  ]);
}

/**
 * Pinta el plano completo.
 *   pxPorMetro: resolución (p. ej. 300 ppp × mm por metro impreso / 25,4)
 * Devuelve { dataUrl (JPEG), ancho, alto } en píxeles.
 */
export async function imagenPlano(mesas, plano, { pxPorMetro }) {
  const caja = recortePlano(plano);
  let k = pxPorMetro;
  if (caja.w * caja.h * k * k > MAX_PIXELES) k = Math.sqrt(MAX_PIXELES / (caja.w * caja.h));
  const W = Math.round(caja.w * k);
  const H = Math.round(caja.h * k);

  const [meseros] = await Promise.all([cargaMeseros(mesas), cargaFuentes()]);

  // SVG oculto dentro de la página (hereda style.css y las fuentes)
  const host = document.createElement('div');
  host.setAttribute('aria-hidden', 'true');
  host.style.cssText = 'position:fixed;left:0;top:0;width:10px;height:10px;overflow:hidden;opacity:0;pointer-events:none;z-index:-1;';
  const svg = sv('svg', { width: W, height: H, viewBox: `${caja.x} ${caja.y} ${caja.w} ${caja.h}` });
  svg.style.cssText = 'position:absolute;left:0;top:0;';
  host.appendChild(svg);
  document.body.appendChild(host);

  try {
    dibujaSalon(svg, plano);
    const px = (n) => n * PX_IMPRESO;
    mesas.forEach((m) => svg.appendChild(dibujaMesa(m, { px, avisos: false, idPre: 'pdf' })));
    // Dibujo que no ha cargado → la inicial (lo mismo que en pantalla)
    svg.querySelectorAll('image').forEach((im) => {
      if (!meseros.get(im.getAttribute('href'))) im.dispatchEvent(new Event('error'));
    });
    ajustaRotulos(svg);

    // Matriz de cada elemento → píxeles del canvas
    const raiz = svg.getScreenCTM().inverse();
    const base = new DOMMatrix().scale(k, k).translate(-caja.x, -caja.y);
    const matriz = (el) => base.multiply(raiz.multiply(el.getScreenCTM()));

    const textos = [...svg.querySelectorAll('text')].map((t) => {
      const cs = getComputedStyle(t);
      return {
        texto: t.textContent, m: matriz(t),
        x: Number(t.getAttribute('x')) || 0, y: Number(t.getAttribute('y')) || 0,
        size: Number(t.getAttribute('font-size')) || parseFloat(cs.fontSize),
        familia: cs.fontFamily, peso: cs.fontWeight, estilo: cs.fontStyle,
        fill: cs.fill, stroke: cs.stroke, strokeW: parseFloat(cs.strokeWidth) || 0,
        ancla: cs.textAnchor, espacio: parseFloat(cs.letterSpacing) || 0,
      };
    });
    const imagenes = [...svg.querySelectorAll('image')].map((im) => {
      const g = im.parentNode;
      const fondo = g.querySelector('.pla-medallon__fondo');
      const aro = g.querySelector('.pla-medallon__aro');
      const cs = aro ? getComputedStyle(aro) : null;
      const num = (n, a) => Number(n.getAttribute(a));
      return {
        img: meseros.get(im.getAttribute('href')), m: matriz(im),
        x: num(im, 'x'), y: num(im, 'y'), w: num(im, 'width'), h: num(im, 'height'),
        cx: num(fondo, 'cx'), cy: num(fondo, 'cy'), r: num(fondo, 'r'),
        aro: cs ? { color: cs.stroke, ancho: parseFloat(cs.strokeWidth) || 0 } : null,
      };
    });

    // Formas: copia con los estilos calculados en línea, sin textos ni imágenes
    const copia = svg.cloneNode(true);
    const orig = svg.querySelectorAll('*');
    copia.querySelectorAll('*').forEach((el, i) => {
      const cs = getComputedStyle(orig[i]);
      el.setAttribute('style', ESTILOS.map((p) => `${p}:${cs.getPropertyValue(p)}`).join(';'));
      el.removeAttribute('class');
    });
    copia.querySelectorAll('text, image, clipPath').forEach((el) => el.remove());
    copia.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    copia.removeAttribute('style');
    const blob = new Blob([new XMLSerializer().serializeToString(copia)], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const formas = await cargaImagen(url);
    URL.revokeObjectURL(url);
    if (!formas) throw new Error('No se ha podido dibujar el plano.');

    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);
    ctx.drawImage(formas, 0, 0, W, H);

    const pon = (m) => ctx.setTransform(m.a, m.b, m.c, m.d, m.e, m.f);
    imagenes.forEach((d) => {
      if (!d.img) return;
      ctx.save();
      pon(d.m);
      ctx.beginPath();
      ctx.arc(d.cx, d.cy, d.r, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(d.img, d.x, d.y, d.w, d.h);
      ctx.restore();
      if (d.aro && d.aro.ancho) {
        ctx.save();
        pon(d.m);
        ctx.beginPath();
        ctx.arc(d.cx, d.cy, d.r, 0, Math.PI * 2);
        ctx.lineWidth = d.aro.ancho;
        ctx.strokeStyle = d.aro.color;
        ctx.stroke();
        ctx.restore();
      }
    });

    // Textos: la escala se pasa al tamaño de letra (sin letras diminutas)
    textos.forEach((t) => {
      if (!t.texto) return;
      const s = Math.hypot(t.m.a, t.m.b);
      ctx.save();
      ctx.setTransform(t.m.a / s, t.m.b / s, t.m.c / s, t.m.d / s, t.m.e, t.m.f);
      ctx.font = `${t.estilo} ${t.peso} ${t.size * s}px ${t.familia}`;
      ctx.textAlign = t.ancla === 'middle' ? 'center' : t.ancla === 'end' ? 'right' : 'left';
      ctx.textBaseline = 'middle';
      if ('letterSpacing' in ctx) ctx.letterSpacing = `${t.espacio * s}px`;
      const x = t.x * s;
      const y = t.y * s;
      if (t.stroke && t.stroke !== 'none' && t.strokeW > 0) {
        ctx.lineJoin = 'round';
        ctx.lineWidth = t.strokeW * s;
        ctx.strokeStyle = t.stroke;
        ctx.strokeText(t.texto, x, y);
      }
      ctx.fillStyle = t.fill && t.fill !== 'none' ? t.fill : '#3f3a32';
      ctx.fillText(t.texto, x, y);
      ctx.restore();
    });

    return { dataUrl: canvas.toDataURL('image/jpeg', 0.92), ancho: W, alto: H };
  } finally {
    host.remove();
  }
}

/**
 * Mesero de cada mesa como PNG redondo (para las fichas del PDF), con el
 * mismo recorte y aro que en el plano. Map(id → dataUrl); sin dibujo, no
 * hay entrada (el PDF pinta la inicial).
 */
export async function medallonesMeseros(mesas, lado = 240) {
  const meseros = await cargaMeseros(mesas);
  const res = new Map();
  mesas.forEach((m) => {
    const img = meseros.get(iconoMesa(m).url);
    if (!img) return;
    const c = document.createElement('canvas');
    c.width = lado;
    c.height = lado;
    const ctx = c.getContext('2d');
    const r = lado / 2;
    ctx.save();
    ctx.beginPath();
    ctx.arc(r, r, r - 1, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.clip();
    const z = lado * ZOOM_DIBUJO;
    ctx.drawImage(img, (lado - z) / 2, (lado - z) / 2, z, z);
    ctx.restore();
    ctx.beginPath();
    ctx.arc(r, r, r - lado * 0.02, 0, Math.PI * 2);
    ctx.lineWidth = lado * 0.035;
    ctx.strokeStyle = 'rgba(110,36,53,0.4)';
    ctx.stroke();
    res.set(m.id, c.toDataURL('image/png'));
  });
  return res;
}
