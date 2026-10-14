/* =================================================================
   Botón "PDF para la wedding planner" (plano.html y mesas.html, detrás
   de la contraseña).

   Todo en el cliente y SOLO lectura: lee el salón, las mesas y los
   invitados (estos solo para saber quién es niño/a), dibuja el plano a
   alta resolución (plano-imagen.js) y monta el PDF (pdf-planner.js).
   jsPDF y el generador se importan de forma LAZY al pulsar.

   Descarga pensada para el móvil, igual que "Exportar PDF": se dispara
   sola y queda un enlace "¿No se ha descargado? Toca aquí" por si el
   navegador (iPhone sobre todo) la bloquea.
   ================================================================= */

import { fetchPlano, fetchMesasPlano } from './plano-data.js';
import { fetchNucleos } from './invitados-data.js';
import { completaPosiciones, recortePlano } from './plano-geom.js';

/** Resolución mínima del plano impreso (A4 horizontal). */
const PPP = 320;

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

export function initExportPlanner(container) {
  if (!container || container.childElementCount) return;

  const btn = el('button', 'btn btn--ghost btn--block export-pdf__btn', 'PDF para la wedding planner');
  btn.type = 'button';
  btn.appendChild(el('span', 'export-pdf__sub', 'plano del salón y cómo se sienta cada mesa'));

  const progreso = el('div', 'export-pdf__progreso');
  progreso.hidden = true;
  const barra = el('div', 'wizard__progress');
  const relleno = el('div', 'wizard__progress-bar');
  barra.appendChild(relleno);
  const estado = el('p', 'export-pdf__estado');
  estado.setAttribute('role', 'status');
  estado.setAttribute('aria-live', 'polite');
  progreso.append(barra, estado);

  const resultado = el('p', 'export-pdf__resultado');
  resultado.hidden = true;

  container.append(btn, progreso, resultado);

  let urlAnterior = null;

  btn.addEventListener('click', async () => {
    btn.disabled = true;
    resultado.hidden = true;
    resultado.textContent = '';
    resultado.classList.remove('is-warn');
    progreso.hidden = false;
    if (urlAnterior) { URL.revokeObjectURL(urlAnterior); urlAnterior = null; }

    // Pasos: generador + lectura + imágenes + PDF (portada, plano, mesas…) + guardar
    let total = 20;
    let hechos = 0;
    const avanza = (texto) => {
      hechos = Math.min(hechos + 1, total);
      relleno.style.width = `${Math.round((hechos / total) * 100)}%`;
      if (texto) estado.textContent = `${texto} (${hechos}/${total})`;
    };
    relleno.style.width = '0';
    estado.textContent = 'Preparando…';
    const t0 = performance.now();

    try {
      // Generador y datos a la vez (el import no espera a Firestore)
      const [pdf, img, [salon, crudas, nucleos]] = await Promise.all([
        import('./pdf-planner.js').then((m) => { avanza('Generador cargado'); return m; }),
        import('./plano-imagen.js'),
        Promise.all([fetchPlano(), fetchMesasPlano(), fetchNucleos()]).then((r) => { avanza('Mesas leídas'); return r; }),
      ]);
      const plano = { ancho: salon.ancho, largo: salon.largo };
      const mesas = completaPosiciones(crudas, plano);
      total = 4 + pdf.pasosPdf(mesas.length) + 1;

      // Plano a ≥ 300 ppp en el ancho que ocupará en el A4 horizontal
      estado.textContent = 'Dibujando el plano…';
      const rec = recortePlano(plano);
      const anchoMm = pdf.cajaPlanoMm(plano).w;
      const [imagen, meseros] = await Promise.all([
        img.imagenPlano(mesas, plano, { pxPorMetro: (anchoMm / rec.w / 25.4) * PPP }),
        img.medallonesMeseros(mesas),
      ]);
      avanza('Plano dibujado');

      const generado = new Date();
      const { doc } = await pdf.construirPdfPlanner({ mesas, plano, nucleos }, {
        generado, imagen, meseros, onPaso: (paso) => avanza(paso),
      });

      estado.textContent = 'Guardando el archivo…';
      await new Promise((r) => setTimeout(r, 0));
      const blob = doc.output('blob');
      const nombre = pdf.nombreArchivo(generado);
      const url = URL.createObjectURL(blob);
      urlAnterior = url;
      avanza('Listo');

      // Descarga automática
      const a = el('a');
      a.href = url;
      a.download = nombre;
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      a.remove();

      const segundos = ((performance.now() - t0) / 1000).toLocaleString('es-ES', { maximumFractionDigits: 1 });
      progreso.hidden = true;
      resultado.hidden = false;
      resultado.append(`✓ ${nombre} · ${doc.getNumberOfPages()} páginas · ${segundos} s. `);
      // Enlace manual por si la descarga automática no saltó
      const manual = el('a', 'export-pdf__link', '¿No se ha descargado? Toca aquí');
      manual.href = url;
      manual.download = nombre;
      manual.target = '_blank';
      manual.rel = 'noopener';
      resultado.appendChild(manual);
    } catch (err) {
      console.error('[PDF wedding planner]', err);
      progreso.hidden = true;
      resultado.hidden = false;
      resultado.classList.add('is-warn');
      resultado.textContent = 'No se ha podido generar el PDF. Revisa la conexión e inténtalo de nuevo.';
    } finally {
      btn.disabled = false;
    }
  });
}
