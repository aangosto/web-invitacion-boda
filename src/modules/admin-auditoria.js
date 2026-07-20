/* =================================================================
   Panel → pestaña AUDITORÍA.
   Lee la colección "auditoria" (requiere la sesión anónima del panel)
   y pinta los eventos en una tabla ordenada por fecha descendente.
   En móvil la tabla se desplaza en horizontal dentro de su contenedor.
   ================================================================= */

import { db } from '../firebase.js';
import { collection, getDocs, orderBy, query, limit } from 'firebase/firestore';

/* Últimos N eventos: suficiente para vigilar la actividad sin cargar
   la colección entera cuando crezca. */
const MAX_EVENTS = 300;

const TIPO_LABELS = {
  visita: 'Visita',
  envio_formulario: 'Formulario',
  juego: 'Juego',
};
const DEVICE_LABELS = { movil: 'Móvil', tablet: 'Tablet', escritorio: 'Escritorio' };

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

/** Timestamp de Firestore → "20/07/2026 13:45:07" (o 'sin fecha'). */
function formatDateTime(ts) {
  if (!ts || typeof ts.toDate !== 'function') return 'sin fecha';
  const d = ts.toDate();
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/** Columna "Detalle": lo específico de cada tipo de evento. */
function detail(ev) {
  if (ev.tipo === 'envio_formulario') {
    const asiste = ev.attending === false ? 'no asiste' : 'asiste';
    return `${asiste}${ev.rsvpId ? ` · rsvp ${ev.rsvpId}` : ''}`;
  }
  if (ev.tipo === 'juego') {
    return `Team ${ev.team || '¿?'} · ${ev.points ?? '¿?'} pts`;
  }
  return '';
}

export async function initAuditoriaTab(container) {
  container.textContent = 'Cargando auditoría…';

  const snap = await getDocs(query(
    collection(db, 'auditoria'), orderBy('createdAt', 'desc'), limit(MAX_EVENTS),
  ));
  const events = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  container.textContent = '';

  // --- Contadores rápidos por tipo ---
  const counts = { visita: 0, envio_formulario: 0, juego: 0 };
  events.forEach((ev) => { if (ev.tipo in counts) counts[ev.tipo] += 1; });
  const statsEl = el('div', 'res-stats');
  [
    { num: counts.visita, label: 'visitas' },
    { num: counts.envio_formulario, label: 'formularios' },
    { num: counts.juego, label: 'partidas' },
  ].forEach((s) => {
    const box = el('div', 'res-stat');
    box.appendChild(el('span', 'res-stat__num', String(s.num)));
    box.appendChild(el('span', 'res-stat__label', s.label));
    statsEl.appendChild(box);
  });
  container.appendChild(statsEl);
  container.appendChild(el('p', 'adm-hint',
    `Últimos ${Math.min(events.length, MAX_EVENTS)} eventos, el más reciente arriba. Sin IP: solo datos del navegador.`));

  if (events.length === 0) {
    container.appendChild(el('p', 'res-empty', 'Aún no hay eventos registrados.'));
    return;
  }

  // --- Tabla (scroll horizontal en móvil) ---
  const wrap = el('div', 'adm-tablewrap');
  const table = el('table', 'adm-table');

  const columns = [
    'Fecha', 'Evento', 'Página', 'Detalle', 'Dispositivo', 'SO', 'Navegador',
    'Idioma', 'Pantalla', 'Ventana', 'Zona horaria', 'Conexión', 'Origen (referrer)', 'User-agent',
  ];
  const thead = el('thead');
  const headRow = el('tr');
  columns.forEach((c) => headRow.appendChild(el('th', null, c)));
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = el('tbody');
  events.forEach((ev) => {
    const tr = el('tr');
    const cells = [
      formatDateTime(ev.createdAt),
      TIPO_LABELS[ev.tipo] || ev.tipo || '¿?',
      ev.page || '',
      detail(ev),
      DEVICE_LABELS[ev.device] || ev.device || '',
      ev.os || '',
      ev.browser || '',
      [ev.language, ev.languages && ev.languages !== ev.language ? `(${ev.languages})` : ''].filter(Boolean).join(' '),
      [ev.screen, ev.pixelRatio ? `@${ev.pixelRatio}x` : ''].filter(Boolean).join(' '),
      ev.viewport || '',
      ev.timezone || '',
      [ev.connection, ev.memory, ev.cores ? `${ev.cores} núcleos` : ''].filter(Boolean).join(' · '),
      ev.referrer || '—',
      ev.userAgent || '',
    ];
    cells.forEach((c, i) => {
      const td = el('td', i === columns.length - 1 ? 'adm-table__ua' : null, c);
      if (i === columns.length - 1 && c) td.title = c; // UA completo al pasar el ratón
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  wrap.appendChild(table);
  container.appendChild(wrap);
}
