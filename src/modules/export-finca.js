/* =================================================================
   Botón "Exportar Excel para la finca" (mesas.html y plano.html,
   detrás de la puerta de contraseña).

   SOLO LECTURA: lee "mesas" e "invitados" al pulsar (datos frescos) y
   no escribe nada en Firestore. Rellena la plantilla oficial
   (public/plantillas/INVITADOS_BASE.xlsx) con excel-finca.js, editando
   solo las celdas del reparto (el resto del archivo sale intacto).

   JSZip se importa de forma LAZY: no entra en la carga de la página.

   Flujo pensado para el móvil:
   1) Toque → se leen los datos y se muestra un RESUMEN previo (mesas,
      comensales, niños y avisos). Los avisos no bloquean; una mesa de
      más de 26 personas, sí (no cabe en el bloque de la finca).
   2) Mientras se lee el resumen, el Excel se genera en segundo plano.
   3) "Descargar Excel" dispara la descarga en el MISMO toque (el
      archivo ya está hecho: iPhone no bloquea la descarga) y deja un
      enlace "¿No se ha descargado? Toca aquí" de respaldo.
   ================================================================= */

import { fetchMesasPlano } from './plano-data.js';
import { fetchNucleos } from './invitados-data.js';
import { planificar, rellenarXlsx, nombreArchivo } from './excel-finca.js';

const PLANTILLA = `${import.meta.env.BASE_URL}plantillas/INVITADOS_BASE.xlsx`;
const MIME_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

/** Carga la plantilla, la rellena y devuelve el .xlsx como Blob. */
async function generarExcel(plan) {
  const [JSZip, plantilla] = await Promise.all([
    import('jszip').then((m) => m.default || m),
    fetch(PLANTILLA, { cache: 'no-cache' }).then((r) => {
      if (!r.ok) throw new Error(`Plantilla no disponible (${r.status})`);
      return r.arrayBuffer();
    }),
  ]);
  const bytes = await rellenarXlsx(JSZip, plantilla, plan);
  return new Blob([bytes], { type: MIME_XLSX });
}

export function initExportFinca(container) {
  if (!container || container.childElementCount) return;

  const btn = el('button', 'btn btn--ghost btn--block export-pdf__btn', 'Exportar Excel para la finca');
  btn.type = 'button';
  btn.appendChild(el('span', 'export-pdf__sub', 'su plantilla de mesas, rellena con el reparto'));
  const panel = el('div', 'exf-panel');
  panel.hidden = true;
  container.append(btn, panel);

  let url = null;
  let ronda = 0; // descarta resultados de una pulsación anterior

  function limpia() {
    if (url) { URL.revokeObjectURL(url); url = null; }
    panel.innerHTML = '';
  }
  function cierra() {
    ronda += 1;
    limpia();
    panel.hidden = true;
    btn.disabled = false;
  }

  btn.addEventListener('click', async () => {
    const mia = ++ronda;
    btn.disabled = true;
    limpia();
    panel.hidden = false;
    const estado = el('p', 'export-pdf__estado', 'Leyendo mesas e invitados…');
    estado.setAttribute('role', 'status');
    estado.setAttribute('aria-live', 'polite');
    panel.appendChild(estado);

    let plan;
    try {
      const [mesas, nucleos] = await Promise.all([fetchMesasPlano(), fetchNucleos()]);
      if (mia !== ronda) return;
      plan = planificar(mesas, nucleos);
    } catch (err) {
      console.error('[Excel finca]', err);
      if (mia !== ronda) return;
      estado.textContent = 'No se han podido leer las mesas. Revisa la conexión e inténtalo de nuevo.';
      estado.classList.add('is-warn');
      btn.disabled = false;
      return;
    }

    // Resumen previo
    panel.innerHTML = '';
    panel.appendChild(el('h4', 'adm-subtitle', 'Antes de descargar'));
    const stats = el('div', 'res-stats');
    [
      { num: plan.resumen.mesas, label: 'mesas' },
      { num: plan.resumen.comensales, label: 'comensales' },
      { num: plan.resumen.ninos, label: plan.resumen.ninos === 1 ? 'niño/a' : 'niños/as' },
    ].forEach((s) => {
      const card = el('div', 'res-stat');
      card.append(el('span', 'res-stat__num', String(s.num)), el('span', 'res-stat__label', s.label));
      stats.appendChild(card);
    });
    panel.appendChild(stats);
    plan.errores.forEach((t) => panel.appendChild(el('p', 'mes-aviso mes-aviso--error', `⛔ ${t}`)));
    plan.avisos.forEach((t) => panel.appendChild(el('p', 'mes-aviso mes-aviso--warn', `⚠ ${t}`)));
    if (!plan.errores.length && !plan.avisos.length) {
      panel.appendChild(el('p', 'exf-ok', '✓ Todo en orden: cada mesa tiene su número.'));
    }

    const acciones = el('div', 'exf-acciones');
    const descargar = el('button', 'btn btn--solid exf-descargar', 'Preparando el Excel…');
    descargar.type = 'button';
    descargar.disabled = true;
    const cancelar = el('button', 'btn btn--ghost exf-cancelar', plan.errores.length ? 'Cerrar' : 'Cancelar');
    cancelar.type = 'button';
    cancelar.addEventListener('click', cierra);
    const resultado = el('p', 'export-pdf__resultado');
    resultado.hidden = true;

    if (plan.errores.length) {
      panel.appendChild(el('p', 'adm-hint',
        'No se genera el archivo: el bloque de cada mesa en el Excel de la finca tiene 26 sitios. Reparte a esa gente en Mesas del banquete y vuelve a exportar.'));
      acciones.appendChild(cancelar);
      panel.appendChild(acciones);
      btn.disabled = false;
      return;
    }
    acciones.append(descargar, cancelar);
    panel.append(acciones, resultado);

    const nombre = nombreArchivo(new Date());
    try {
      const blob = await generarExcel(plan);
      if (mia !== ronda) return;
      url = URL.createObjectURL(blob);
      descargar.textContent = 'Descargar Excel';
      descargar.disabled = false;
    } catch (err) {
      console.error('[Excel finca]', err);
      if (mia !== ronda) return;
      descargar.remove();
      resultado.hidden = false;
      resultado.classList.add('is-warn');
      resultado.textContent = `No se ha podido preparar el Excel (${err.message}). Inténtalo de nuevo.`;
      btn.disabled = false;
      return;
    }

    descargar.addEventListener('click', () => {
      // Mismo toque → descarga (el archivo ya está generado)
      const a = el('a');
      a.href = url;
      a.download = nombre;
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      a.remove();
      resultado.hidden = false;
      resultado.innerHTML = '';
      resultado.append(`✓ ${nombre} · ${plan.resumen.mesas} mesas · ${plan.resumen.comensales} comensales. `);
      const manual = el('a', 'export-pdf__link', '¿No se ha descargado? Toca aquí');
      manual.href = url;
      manual.download = nombre;
      manual.target = '_blank';
      manual.rel = 'noopener';
      resultado.appendChild(manual);
      cancelar.textContent = 'Cerrar';
    });
    btn.disabled = false;
  });
}
