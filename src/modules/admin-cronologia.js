/* =================================================================
   Panel → pestaña CRONOLOGÍA.
   Quién llega y quién se va, ordenado por día y hora, agrupado por
   día para ver el flujo del fin de semana de un vistazo. Dos vistas
   (Llegadas / Salidas) con un conmutador, pensado para móvil.
   Solo visualización de la colección rsvp; la lógica de agrupado y
   orden vive en crono-logic.js (probada aparte).
   ================================================================= */

import { db } from '../firebase.js';
import { collection, getDocs } from 'firebase/firestore';
import { splitResubmissions } from './rsvp-dedupe.js';
import { buildCronologia, formatDia, describeEntrada } from './crono-logic.js';

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function filaEntrada(entrada, tipo) {
  const row = el('div', 'crono-item');
  row.appendChild(el('span', 'crono-item__hora', entrada.time ? `~${entrada.time}` : 'sin hora'));
  const info = el('div', 'crono-item__info');
  info.appendChild(el('p', 'crono-item__nombre',
    `${entrada.nombre} (${entrada.personas} pers.)`));
  const meta = describeEntrada(entrada, tipo);
  if (meta) info.appendChild(el('p', 'crono-item__meta', meta));
  row.appendChild(info);
  return row;
}

export async function initCronologiaTab(container) {
  container.textContent = 'Cargando cronología…';

  const snap = await getDocs(collection(db, 'rsvp'));
  const docs = snap.docs.map((d) => d.data()).filter((d) => d.deleted !== true);
  // Igual que en Totales: si alguien reenvió el formulario, cuenta solo
  // su último envío.
  const { activos } = splitResubmissions(docs);

  const llegadas = buildCronologia(activos, 'llegadas');
  const salidas = buildCronologia(activos, 'salidas');

  container.textContent = '';
  container.appendChild(el('p', 'adm-hint',
    'Flujo del fin de semana según las confirmaciones: cada entrada es un '
    + 'formulario (con sus personas). Hora aproximada, la que indicaron.'));

  // Conmutador Llegadas / Salidas
  const toggle = el('div', 'crono-toggle');
  const vista = el('div');
  const botones = [];

  function pintaVista(tipo) {
    const datos = tipo === 'llegadas' ? llegadas : salidas;
    vista.innerHTML = '';

    if (datos.dias.length === 0 && datos.sinFecha.length === 0) {
      vista.appendChild(el('p', 'adm-hint', 'Nada que mostrar todavía.'));
      return;
    }

    datos.dias.forEach((dia) => {
      const bloque = el('section', 'crono-dia');
      const head = el('h3', 'adm-subtitle crono-dia__titulo');
      head.appendChild(el('span', null, formatDia(dia.iso)));
      head.appendChild(el('span', 'crono-dia__n', `${dia.personas} pers.`));
      bloque.appendChild(head);
      dia.entradas.forEach((e) => bloque.appendChild(filaEntrada(e, tipo)));
      vista.appendChild(bloque);
    });

    if (datos.sinFecha.length) {
      const bloque = el('section', 'crono-dia');
      const head = el('h3', 'adm-subtitle crono-dia__titulo');
      head.appendChild(el('span', null, 'Sin fecha/hora indicada'));
      head.appendChild(el('span', 'crono-dia__n',
        `${datos.sinFecha.reduce((s, e) => s + e.personas, 0)} pers.`));
      bloque.appendChild(head);
      datos.sinFecha.forEach((e) => {
        const row = el('div', 'crono-item crono-item--sinfecha');
        const info = el('div', 'crono-item__info');
        info.appendChild(el('p', 'crono-item__nombre', `${e.nombre} (${e.personas} pers.)`));
        info.appendChild(el('p', 'crono-item__meta', describeEntrada(e, tipo)));
        row.appendChild(info);
        bloque.appendChild(row);
      });
      vista.appendChild(bloque);
    }
  }

  [['llegadas', 'Llegadas'], ['salidas', 'Salidas']].forEach(([tipo, label], i) => {
    const btn = el('button', 'chip crono-toggle__btn', label);
    btn.type = 'button';
    btn.setAttribute('aria-pressed', String(i === 0));
    btn.addEventListener('click', () => {
      botones.forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
      pintaVista(tipo);
    });
    botones.push(btn);
    toggle.appendChild(btn);
  });

  container.appendChild(toggle);
  container.appendChild(vista);
  pintaVista('llegadas');
}
