/* =================================================================
   Panel → pestaña TOTALES.
   Agregados de la colección "rsvp" calculados en el cliente: lo que
   los novios necesitan de un vistazo (asistentes, catering, tallas
   de alpargatas, autobús y logística de viaje). Solo visualización.

   Tolerante con registros antiguos: si un campo no existe se trata
   como vacío/0 (p. ej. attending ausente = asiste; el formato viejo
   de bus como texto 'ida|vuelta|ambos' también se contabiliza).
   ================================================================= */

import { db } from '../firebase.js';
import { collection, getDocs } from 'firebase/firestore';

const MENU_LABELS = { ninguno: 'Normal', vegetariano: 'Vegetariano', vegano: 'Vegano', otro: 'Otro' };

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

/* ---------- Agregación (recorre las confirmaciones y sus people[]) ---------- */
function aggregate(docs) {
  const t = {
    confirmaciones: docs.length,
    asisten: 0,
    noAsisten: 0,          // respuestas "no podré ir" (1 persona por respuesta)
    menus: { ninguno: 0, vegetariano: 0, vegano: 0, otro: 0 },
    menusOtro: [],         // textos de "Otro: ¿cuál?"
    alergias: [],          // { nombre, texto }
    zapatos: 0,
    tallas: new Map(),     // talla → nº de personas
    busIda: 0,
    busVuelta: 0,
    fuera: 0,
    zaragoza: 0,
    coches: [],            // { quien, desde, ida, vuelta } con plazas libres
  };

  docs.forEach((data) => {
    if (data.attending === false) { t.noAsisten += 1; return; }

    // Origen (solo lo indican los que asisten)
    if (data.origin === 'fuera') t.fuera += 1;
    else if (data.origin === 'zaragoza') t.zaragoza += 1;

    (data.people || []).forEach((p) => {
      t.asisten += 1;

      // Menús
      if (t.menus[p.menu] !== undefined) t.menus[p.menu] += 1;
      if (p.menu === 'otro' && (p.menuOther || '').trim()) t.menusOtro.push(p.menuOther.trim());

      // Alergias (solo las no vacías, con el nombre para el catering)
      if ((p.allergies || '').trim()) t.alergias.push({ nombre: p.name || '—', texto: p.allergies.trim() });

      // Zapatos de recambio, con desglose por talla
      if (p.needsShoes === true) {
        t.zapatos += 1;
        const talla = String(p.shoeSize || '').trim() || 'sin talla';
        t.tallas.set(talla, (t.tallas.get(talla) || 0) + 1);
      }

      // Autobús (formato actual: busIda/busVuelta booleanos;
      // formato antiguo: bus = 'no'|'ida'|'vuelta'|'ambos')
      const ida = p.busIda === true || p.bus === 'ida' || p.bus === 'ambos';
      const vuelta = p.busVuelta === true || p.bus === 'vuelta' || p.bus === 'ambos';
      if (ida) t.busIda += 1;
      if (vuelta) t.busVuelta += 1;
    });

    // Coches con plazas libres (para organizar viajes compartidos)
    const ida = data.travel?.ida || {};
    const vuelta = data.travel?.vuelta || {};
    const plazasIda = ida.mode === 'coche' && ida.canCarry === true;
    const plazasVuelta = vuelta.mode === 'coche' && vuelta.canCarry === true;
    if (plazasIda || plazasVuelta) {
      t.coches.push({
        quien: data.filledBy || '—',
        desde: (ida.from || '').trim(),
        ida: plazasIda,
        vuelta: plazasVuelta,
      });
    }
  });

  return t;
}

/* ---------- Piezas de la vista ---------- */
function statBox(num, label) {
  const box = el('div', 'res-stat');
  box.appendChild(el('span', 'res-stat__num', String(num)));
  box.appendChild(el('span', 'res-stat__label', label));
  return box;
}

function section(title) {
  const s = el('section', 'tot-section');
  s.appendChild(el('h3', 'adm-subtitle', title));
  return s;
}

/** Fila "etiqueta …… número" para desgloses (menús, tallas, etc.). */
function totRow(label, num) {
  const r = el('div', 'tot-row');
  r.appendChild(el('span', 'tot-row__label', label));
  r.appendChild(el('span', 'tot-row__num', String(num)));
  return r;
}

/* ---------- Init de la pestaña ---------- */
export async function initTotalesTab(container) {
  container.textContent = 'Calculando totales…';

  const snap = await getDocs(collection(db, 'rsvp'));
  const docs = snap.docs.map((d) => d.data()).filter((d) => d.deleted !== true);
  const t = aggregate(docs);

  container.textContent = '';

  /* --- 1 · General --- */
  const general = section('General');
  const stats = el('div', 'res-stats');
  stats.append(
    statBox(t.asisten, 'asistentes'),
    statBox(t.confirmaciones, 'confirmaciones'),
    statBox(t.noAsisten, 'no asistirán'),
  );
  general.appendChild(stats);
  container.appendChild(general);

  /* --- 2 · Comida (catering) --- */
  const comida = section('Comida · catering');
  Object.entries(t.menus).forEach(([key, n]) => comida.appendChild(totRow(MENU_LABELS[key], n)));
  if (t.menusOtro.length) {
    const otros = el('p', 'tot-note');
    otros.textContent = `"Otro": ${t.menusOtro.join(' · ')}`;
    comida.appendChild(otros);
  }
  comida.appendChild(el('h4', 'tot-minititle', `Alergias e intolerancias (${t.alergias.length})`));
  if (t.alergias.length === 0) {
    comida.appendChild(el('p', 'tot-note', 'Nadie ha indicado alergias.'));
  } else {
    t.alergias.forEach(({ nombre, texto }) => comida.appendChild(totRow(`${nombre} — ${texto}`, '')));
  }
  container.appendChild(comida);

  /* --- 3 · Zapatos / alpargatas --- */
  const zapatos = section('Zapatos de recambio');
  zapatos.appendChild(totRow('Personas que los necesitan', t.zapatos));
  // Desglose por talla, ordenado numéricamente ("sin talla" al final)
  [...t.tallas.entries()]
    .sort((a, b) => (parseFloat(a[0]) || 999) - (parseFloat(b[0]) || 999))
    .forEach(([talla, n]) => zapatos.appendChild(totRow(`Talla ${talla}`, n)));
  container.appendChild(zapatos);

  /* --- 4 · Autobús --- */
  const bus = section('Autobús');
  const busStats = el('div', 'res-stats res-stats--two');
  busStats.append(statBox(t.busIda, 'bus de ida'), statBox(t.busVuelta, 'bus de vuelta'));
  bus.appendChild(busStats);
  container.appendChild(bus);

  /* --- 5 · Viaje / logística --- */
  const viaje = section('Viaje · los de fuera');
  const viajeStats = el('div', 'res-stats res-stats--two');
  viajeStats.append(statBox(t.fuera, 'vienen de fuera'), statBox(t.zaragoza, 'de Zaragoza'));
  viaje.appendChild(viajeStats);
  viaje.appendChild(el('h4', 'tot-minititle', `Coches con plazas libres (${t.coches.length})`));
  if (t.coches.length === 0) {
    viaje.appendChild(el('p', 'tot-note', 'Nadie ha ofrecido plazas de coche todavía.'));
  } else {
    t.coches.forEach((c) => {
      const tramos = [c.ida && 'ida', c.vuelta && 'vuelta'].filter(Boolean).join(' y ');
      viaje.appendChild(totRow(`${c.quien}${c.desde ? ` · desde ${c.desde}` : ''}`, tramos));
    });
  }
  container.appendChild(viaje);
}
