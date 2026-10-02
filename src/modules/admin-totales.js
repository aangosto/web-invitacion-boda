/* =================================================================
   Panel → pestaña TOTALES.
   Agregados de la colección "rsvp" calculados en el cliente. Cada
   total es DESPLEGABLE (acordeón): al pulsarlo muestra la lista de
   personas que componen ese número, con quién envió el formulario
   (filledBy) para saber a quién preguntar. Solo visualización.

   Tolerante con registros antiguos: si un campo no existe se trata
   como vacío/0 (p. ej. attending ausente = asiste; el formato viejo
   de bus como texto 'ida|vuelta|ambos' también se contabiliza).
   ================================================================= */

import { db } from '../firebase.js';
import { collection, getDocs } from 'firebase/firestore';
import { splitResubmissions } from './rsvp-dedupe.js';
import { MENU_LABELS, aggregate } from './totales-logic.js';

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

/* ---------- Piezas de acordeón ---------- */

/** Lista de miembros de un total: nombre · contexto — por quién. */
function memberList(members) {
  const list = el('div', 'tot-detail');
  if (members.length === 0) {
    list.appendChild(el('p', 'tot-person tot-person--empty', 'Nadie todavía.'));
    return list;
  }
  members.forEach((m) => {
    const line = el('p', 'tot-person');
    line.appendChild(el('span', null, m.nombre + (m.extra ? ` · ${m.extra}` : '')));
    // "por X" solo si el formulario lo envió otra persona
    if (m.por && m.por !== m.nombre) line.appendChild(el('span', 'tot-person__by', ` — por ${m.por}`));
    list.appendChild(line);
  });
  return list;
}

/** Fila desplegable "etiqueta …… número ▾" con su lista debajo. */
function expandableRow(label, members, numText) {
  const wrap = el('div', 'tot-exp');
  const btn = el('button', 'tot-exp__btn');
  btn.type = 'button';
  btn.setAttribute('aria-expanded', 'false');
  btn.appendChild(el('span', 'tot-row__label', label));
  btn.appendChild(el('span', 'tot-row__num', numText != null ? numText : String(members.length)));
  btn.appendChild(el('span', 'tot-exp__chev', '▾'));
  const detail = memberList(members);
  detail.hidden = true;
  btn.addEventListener('click', () => {
    detail.hidden = !detail.hidden;
    btn.setAttribute('aria-expanded', String(!detail.hidden));
    wrap.classList.toggle('is-open', !detail.hidden);
  });
  wrap.append(btn, detail);
  return wrap;
}

/** Grupo de tarjetas de número grande, también desplegables: al pulsar
    una tarjeta, su lista aparece bajo la rejilla (pulsar de nuevo pliega). */
function statGroup(stats) {
  const group = el('div');
  const grid = el('div', `res-stats${stats.length === 2 ? ' res-stats--two' : ''}`);
  const detailArea = el('div');
  let openIdx = -1;

  stats.forEach((s, i) => {
    const box = el('button', 'res-stat res-stat--btn');
    box.type = 'button';
    box.setAttribute('aria-expanded', 'false');
    box.appendChild(el('span', 'res-stat__num', String(s.members.length)));
    box.appendChild(el('span', 'res-stat__label', s.label));
    box.appendChild(el('span', 'tot-exp__chev', '▾'));
    box.addEventListener('click', () => {
      openIdx = openIdx === i ? -1 : i;
      detailArea.innerHTML = '';
      grid.querySelectorAll('.res-stat--btn').forEach((b, j) => {
        b.classList.toggle('is-open', j === openIdx);
        b.setAttribute('aria-expanded', String(j === openIdx));
      });
      if (openIdx !== -1) detailArea.appendChild(memberList(stats[openIdx].members));
    });
    grid.appendChild(box);
  });

  group.append(grid, detailArea);
  return group;
}

function section(title) {
  const s = el('section', 'tot-section');
  s.appendChild(el('h3', 'adm-subtitle', title));
  return s;
}

/* ---------- Init de la pestaña ---------- */
export async function initTotalesTab(container) {
  container.textContent = 'Calculando totales…';

  const snap = await getDocs(collection(db, 'rsvp'));
  const docs = snap.docs.map((d) => d.data()).filter((d) => d.deleted !== true);
  // Reenvíos: si alguien envió el formulario varias veces, solo el
  // ÚLTIMO envío cuenta en los totales; los anteriores se listan aparte.
  const { activos, antiguos } = splitResubmissions(docs);
  const t = aggregate(activos);

  container.textContent = '';
  container.appendChild(el('p', 'adm-hint', 'Pulsa cualquier total para ver quiénes lo componen.'));

  /* --- 1 · General --- */
  const general = section('General');
  general.appendChild(statGroup([
    { label: 'asistentes', members: t.asisten },
    { label: 'confirmaciones', members: t.confirmaciones },
    { label: 'no asistirán', members: t.noAsisten },
  ]));
  if (antiguos.length) {
    const fecha = (d) => {
      const dt = d.createdAt && typeof d.createdAt.toDate === 'function' ? d.createdAt.toDate() : null;
      return dt ? `enviado el ${String(dt.getDate()).padStart(2, '0')}/${String(dt.getMonth() + 1).padStart(2, '0')}/${dt.getFullYear()}` : 'sin fecha';
    };
    general.appendChild(expandableRow(
      'Reenvíos descartados (se cuenta solo el último envío de cada persona)',
      antiguos.map((d) => ({ nombre: d.filledBy || '—', extra: fecha(d) })),
    ));
  }
  container.appendChild(general);

  /* --- 2 · Comida (catering) --- */
  const comida = section('Comida · catering');
  Object.entries(t.menus).forEach(([key, members]) => {
    comida.appendChild(expandableRow(MENU_LABELS[key], members));
  });
  comida.appendChild(el('h4', 'tot-minititle', 'Alergias e intolerancias'));
  comida.appendChild(expandableRow('Personas con alergias', t.alergias));
  container.appendChild(comida);

  /* --- 3 · Zapatos / alpargatas --- */
  const zapatos = section('Zapatos de recambio');
  zapatos.appendChild(expandableRow('Personas que los necesitan', t.zapatos));
  [...t.tallas.entries()]
    .sort((a, b) => (parseFloat(a[0]) || 999) - (parseFloat(b[0]) || 999))
    .forEach(([talla, members]) => zapatos.appendChild(expandableRow(`Talla ${talla}`, members)));
  if (t.zapatosSinTalla.length) {
    zapatos.appendChild(expandableRow('Sin talla — no contabilizadas', t.zapatosSinTalla));
    zapatos.appendChild(el('p', 'adm-hint',
      `${t.zapatosSinTalla.length} marcada${t.zapatosSinTalla.length === 1 ? '' : 's'} «sin talla»: `
      + 'se ven en su confirmación pero no suman al total ni al desglose por tallas.'));
  }
  container.appendChild(zapatos);

  /* --- 4 · Autobús --- */
  const bus = section('Autobús');
  bus.appendChild(statGroup([
    { label: 'bus de ida', members: t.busIda },
    { label: 'bus de vuelta', members: t.busVuelta },
  ]));
  container.appendChild(bus);

  /* --- 5 · Viaje / logística --- */
  const viaje = section('Viaje · los de fuera');
  viaje.appendChild(statGroup([
    { label: 'vienen de fuera', members: t.fuera },
    { label: 'de Zaragoza', members: t.zaragoza },
  ]));
  viaje.appendChild(expandableRow('Coches con plazas libres', t.coches));
  viaje.appendChild(el('h4', 'tot-minititle', 'Buscan transporte'));
  viaje.appendChild(expandableRow('Aún no lo saben / buscan transporte', t.buscan));
  container.appendChild(viaje);
}
