/* =================================================================
   Panel → botón EXPORTAR PDF (vuelco completo de los datos).

   Todo en el cliente: lee las colecciones (export-datos.js, SOLO
   lectura) y genera el PDF con jsPDF (export-pdf.js). El generador se
   importa de forma LAZY al pulsar: jsPDF no entra en el bundle del
   panel ni frena su carga.

   Descarga pensada para el móvil: se dispara sola con un enlace
   <a download> sobre un blob y, además, queda visible un enlace para
   tocarlo a mano por si el navegador (iPhone sobre todo) bloquea la
   descarga automática al no venir de un toque directo.
   ================================================================= */

import { leerDatosExport, PASOS_LECTURA } from './export-datos.js';

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

export function initExportButton(container) {
  if (!container || container.childElementCount) return;

  const btn = el('button', 'btn btn--ghost btn--block export-pdf__btn', 'Exportar PDF');
  btn.type = 'button';
  const sub = el('span', 'export-pdf__sub', 'todos los datos para imprimir o pasar al catering');
  btn.appendChild(sub);

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
    progreso.hidden = false;
    if (urlAnterior) { URL.revokeObjectURL(urlAnterior); urlAnterior = null; }

    // Pasos: cargar generador + lecturas + secciones/portada + guardar
    let total = 2 + PASOS_LECTURA + 8;
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
      // Generador (jsPDF) y datos a la vez: el import no espera a Firestore
      const [mod, datos] = await Promise.all([
        import('./export-pdf.js').then((m) => { avanza('Generador cargado'); return m; }),
        leerDatosExport((etiqueta) => avanza(`Leídas ${etiqueta}`)),
      ]);
      total = 2 + PASOS_LECTURA + mod.PASOS_PDF;

      const generado = new Date();
      const doc = await mod.construirPdf(datos, {
        generado,
        onPaso: (seccion) => avanza(`Sección ${seccion}`),
      });

      estado.textContent = 'Guardando el archivo…';
      await new Promise((r) => setTimeout(r, 0));
      const blob = doc.output('blob');
      const nombre = `boda-datos-${mod.fechaArchivo(generado)}.pdf`;
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
      const fallos = Object.entries(datos).filter(([, r]) => !r.ok).map(([k]) => k);
      progreso.hidden = true;
      resultado.hidden = false;
      resultado.classList.toggle('is-warn', fallos.length > 0);
      resultado.append(
        `✓ ${nombre} · ${doc.getNumberOfPages()} páginas · ${segundos} s. `,
      );
      if (fallos.length) {
        resultado.append(el('span', 'export-pdf__aviso',
          `Sin datos de: ${fallos.join(', ')} (no se pudieron leer; el PDF lo indica). `));
      }
      // Enlace manual por si la descarga automática no saltó
      const manual = el('a', 'export-pdf__link', '¿No se ha descargado? Toca aquí');
      manual.href = url;
      manual.download = nombre;
      manual.target = '_blank';
      manual.rel = 'noopener';
      resultado.appendChild(manual);
    } catch (err) {
      console.error('[Exportar PDF]', err);
      progreso.hidden = true;
      resultado.hidden = false;
      resultado.classList.add('is-warn');
      resultado.textContent = 'No se ha podido generar el PDF. Revisa la conexión e inténtalo de nuevo.';
    } finally {
      btn.disabled = false;
    }
  });
}
