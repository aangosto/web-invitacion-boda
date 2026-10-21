/* =================================================================
   CARGA DE INVITADOS ★ en las mesas reales (colección "mesas").

   Uso:  node scripts/estrellas-mesas.mjs            (SOLO LECTURA: comprueba
                                                      y enseña el plan)
         node scripts/estrellas-mesas.mjs --aplicar  (copia en datos/, escribe
                                                      y verifica)

   · Busca cada persona por NOMBRE DE MESA + NOMBRE DE COMENSAL exactos
     (sin mayúsculas ni tildes). Si falta o sale más de una vez, para.
   · ★ y nota solo a esas personas (conDestacado: el resto, intacto).
   · Gira a todos los comensales (como ⟲ ⟳) al giro con las ★ mejor
     orientadas hacia la presidencial (mejorGiroEstrellas). Si aun así
     alguna ★ queda de espaldas, esa mesa NO se gira ni se renumera.
   · Asiento 1 = la ★ con mejor vista.
   ================================================================= */

import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import {
  getFirestore, collection, getDocs, doc, runTransaction, serverTimestamp,
} from 'firebase/firestore';
import { loadEnv, firebaseConfig, norm, ROOT } from './lib/mesas-banquete.mjs';
import {
  FORMAS, numeroValido, completaPosiciones, ordenPuestos, mejorGiroEstrellas,
  anguloSilla, orientacionSilla, numAsiento, conDestacado, ORIENTACION_LABEL,
} from '../src/modules/plano-geom.js';

const tio = (n) => (/^t[ií]a\b/i.test(n) ? 'Tía del novio' : 'Tío del novio');
const CARGA = [
  ['Marinera', [['Irene', 'Mejor amiga de la novia']]],
  ['Paparajote', [['Ana', 'Hermana de la novia']]],
  ['Guardia Civil', [['Yayo', 'Abuelos del novio'], ['Yaya', 'Abuelos del novio']]],
  ['Huevo Gamba', ['Tía Ana Belén', 'Tío Toño', 'Tía Silvita', 'Tía Mariángeles', 'Tía Ana', 'Tío Marcelo']
    .map((n) => [n, tio(n)])],
  ['Vermut', [['Carmen', '']]],
  ['Naranja', [['Jorge', '']]],
  ['Jamón con chorreras', [['Plou', '']]],
  ['Limón', [['Pili', '']]],
  ['Espetos', [['Tía Mamen', '']]],
  ['Ámbar', [['Dani', '']]],
  ['Uvas', [['David', ''], ['María', '']]],
  ['Patatas', [['Marquitos', '']]],
];

const APLICAR = process.argv.includes('--aplicar');
const ahora = new Date();
const hoy = `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}-${String(ahora.getDate()).padStart(2, '0')}`;

/** JSON con las claves ordenadas: Firestore no garantiza el orden de los mapas. */
const canon = (v) => JSON.stringify(v, (_, x) => (x && typeof x === 'object' && !Array.isArray(x)
  ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, x[k]])) : x));

/** Misma forma que fetchMesasPlano (plano-data.js), sin pasar por Vite. */
function mesaPlano(id, m) {
  return {
    id,
    nombre: m.nombre || '',
    capacidad: typeof m.capacidad === 'number' ? m.capacidad : 8,
    comensales: Array.isArray(m.comensales)
      ? m.comensales.map((c) => ({ key: String(c.key || ''), nombre: String(c.nombre || ''), estrella: c.estrella === true }))
      : [],
    presidencial: m.presidencial === true,
    numero: numeroValido(m.numero),
    forma: FORMAS.includes(m.forma) ? m.forma : 'redonda',
    x: typeof m.x === 'number' ? m.x : null,
    y: typeof m.y === 'number' ? m.y : null,
    rot: typeof m.rot === 'number' ? m.rot : 0,
    asientos: Array.isArray(m.asientos) ? m.asientos.map(String) : null,
    asientoInicio: Number.isInteger(m.asientoInicio) && m.asientoInicio >= 0 ? m.asientoInicio : 0,
  };
}

async function leer(db) {
  const snap = await getDocs(collection(db, 'mesas'));
  const crudas = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const salon = (await getDocs(collection(db, 'plano'))).docs.find((d) => d.id === 'salon');
  const s = salon ? salon.data() : {};
  const plano = { ancho: s.ancho ?? 24, largo: s.largo ?? 18 };
  const mesas = completaPosiciones(crudas.map((m) => mesaPlano(m.id, m)), plano);
  return { crudas, mesas, plano };
}

/** Secuencia circular de keys ('' = vacío) por silla física. */
const secuencia = (m) => ordenPuestos(m).map((c) => (c ? c.key : ''));
const esGiro = (a, b) => a.length === b.length && a.some((_, k) => a.every((v, i) => v === b[(i + k) % a.length]));

function plan(mesas) {
  const pres = mesas.find((m) => m.presidencial);
  if (!pres) throw new Error('No hay mesa presidencial.');
  const errores = [];
  const res = [];
  CARGA.forEach(([nombreMesa, personas]) => {
    const enc = mesas.filter((m) => norm(m.nombre) === norm(nombreMesa));
    if (enc.length !== 1) { errores.push(`Mesa "${nombreMesa}": ${enc.length} coincidencias`); return; }
    const mesa = enc[0];
    const keys = new Set(mesa.comensales.map((c) => c.key));
    if (keys.has('') || keys.size !== mesa.comensales.length) errores.push(`Mesa "${nombreMesa}": keys vacías o repetidas`);
    const estrellas = [];
    personas.forEach(([persona, nota]) => {
      const cs = mesa.comensales.filter((c) => norm(c.nombre) === norm(persona));
      if (cs.length !== 1) {
        errores.push(`"${persona}" en "${nombreMesa}": ${cs.length} coincidencias (hay: ${mesa.comensales.map((c) => c.nombre).join(', ')})`);
      } else estrellas.push({ persona, nota, key: cs[0].key, nombre: cs[0].nombre });
    });
    const previas = mesa.comensales.filter((c) => c.estrella && !estrellas.some((e) => e.key === c.key)).map((c) => c.nombre);
    if (estrellas.length !== personas.length) return;
    const g = mejorGiroEstrellas(mesa, pres, estrellas.map((e) => e.key));
    if (!g) { errores.push(`Mesa "${nombreMesa}": no se puede calcular la orientación`); return; }
    const espaldas = g.estrellas.some((e) => e.orient === 'espaldas');
    const top = [...g.estrellas].sort((a, b) => a.ang - b.ang)[0];
    res.push({ mesa, estrellas, previas, giro: g, espaldas, inicio: top.i });
  });
  return { pres, errores, res };
}

const fmt = (a) => `${a.toFixed(1)}°`;

function informePlan(p) {
  p.res.forEach((r) => {
    const n = r.mesa.comensales.length;
    const ahora = r.estrellas.map((e) => {
      const i = ordenPuestos(r.mesa).findIndex((c) => c && c.key === e.key);
      return `${e.nombre} ${ORIENTACION_LABEL[orientacionSilla(r.mesa, i, p.pres)]} ${fmt(anguloSilla(r.mesa, i, p.pres))}`;
    }).join('; ');
    const tras = r.giro.estrellas.map((e) => `${e.c.nombre} ${ORIENTACION_LABEL[e.orient]} ${fmt(e.ang)}`).join('; ');
    console.log(`· ${r.mesa.nombre} (${n}/${r.mesa.capacidad}, rot ${r.mesa.rot}°, ${r.mesa.forma})`);
    console.log(`    ahora:  ${ahora}`);
    console.log(`    giro ${r.giro.paso >= 0 ? '+' : ''}${r.giro.paso}: ${tras}${r.espaldas ? '   ⚠ SIGUE DE ESPALDAS → no se aplica' : ''}`);
    if (r.previas.length) console.log(`    ⚠ ya tenía ★ (se conservan): ${r.previas.join(', ')}`);
  });
}

async function aplicar(db, p, crudas) {
  const fichero = resolve(ROOT, 'datos', `backup-mesas-${hoy}-estrellas.json`);
  writeFileSync(fichero, JSON.stringify(crudas, null, 2));
  console.log(`\nCopia: ${fichero} (${crudas.length} mesas)`);
  for (const r of p.res) {
    const antes = crudas.find((c) => c.id === r.mesa.id);
    await runTransaction(db, async (tx) => {
      const ref = doc(db, 'mesas', r.mesa.id);
      const snap = await tx.get(ref);
      const d = snap.data();
      if (canon(d.comensales) !== canon(antes.comensales)
        || canon(d.asientos ?? null) !== canon(antes.asientos ?? null)) {
        throw new Error(`"${r.mesa.nombre}" ha cambiado desde la lectura; no se toca.`);
      }
      let lista = d.comensales;
      r.estrellas.forEach((e) => { lista = conDestacado(lista, e.key, { estrella: true, nota: e.nota }); });
      const cambios = { comensales: lista, updatedAt: serverTimestamp() };
      if (!r.espaldas) {
        if (r.giro.paso !== 0) cambios.asientos = r.giro.asientos;
        cambios.asientoInicio = r.inicio;
      }
      tx.update(ref, cambios);
    });
    console.log(`  ✓ ${r.mesa.nombre}`);
  }
}

function verificar(antes, despues, p) {
  const ok = [];
  const mal = [];
  const quita = (o, campos) => Object.fromEntries(Object.entries(o).filter(([k]) => !campos.includes(k)));
  const objetivo = new Map(p.res.map((r) => [r.mesa.id, r]));
  antes.crudas.forEach((a) => {
    const d = despues.crudas.find((x) => x.id === a.id);
    if (!d) { mal.push(`falta la mesa ${a.nombre}`); return; }
    const r = objetivo.get(a.id);
    const libres = r ? ['comensales', 'asientos', 'asientoInicio', 'updatedAt'] : [];
    if (canon(quita(a, libres)) !== canon(quita(d, libres))) mal.push(`${a.nombre}: cambió algún campo fuera de los previstos`);
    // Comensales: mismas personas, mismo orden en la lista, mismos campos salvo ★/nota de las previstas
    const ca = a.comensales || [];
    const cd = d.comensales || [];
    if (ca.length !== cd.length) mal.push(`${a.nombre}: cambió el nº de comensales`);
    ca.forEach((c, i) => {
      const e = r && r.estrellas.find((x) => x.key === c.key);
      const esperado = e ? conDestacado([c], c.key, { estrella: true, nota: e.nota })[0] : c;
      if (canon(esperado) !== canon(cd[i])) mal.push(`${a.nombre}: comensal ${c.nombre} distinto de lo esperado`);
    });
    const ma = antes.mesas.find((m) => m.id === a.id);
    const md = despues.mesas.find((m) => m.id === a.id);
    if (!esGiro(secuencia(ma), secuencia(md))) mal.push(`${a.nombre}: el orden relativo NO es un giro del anterior`);
    if (ma.x !== md.x || ma.y !== md.y || ma.rot !== md.rot) mal.push(`${a.nombre}: la mesa se ha movido`);
  });
  if (!mal.length) ok.push('Todo intacto salvo ★, notas, giro de comensales y asiento 1 en las mesas previstas.');
  return { ok, mal };
}

async function main() {
  const app = initializeApp(firebaseConfig(loadEnv()));
  await signInAnonymously(getAuth(app));
  const db = getFirestore(app);
  const antes = await leer(db);
  console.log(`Leídas ${antes.crudas.length} mesas. Salón ${antes.plano.ancho}×${antes.plano.largo} m.`);
  const p = plan(antes.mesas);
  const otras = antes.mesas.filter((m) => !p.res.some((r) => r.mesa.id === m.id))
    .flatMap((m) => m.comensales.filter((c) => c.estrella).map((c) => `${c.nombre} (${m.nombre})`));
  if (otras.length) console.log(`★ ya existentes en otras mesas (no se tocan): ${otras.join(', ')}`);
  if (p.errores.length) {
    console.log('\n✗ PARO, hay que revisar:');
    p.errores.forEach((e) => console.log(`  - ${e}`));
    process.exit(2);
  }
  console.log(`✓ ${p.res.reduce((s, r) => s + r.estrellas.length, 0)} personas encontradas, una vez cada una, en ${p.res.length} mesas.\n`);
  informePlan(p);
  if (!APLICAR) { console.log('\n(solo lectura: no se ha escrito nada)'); process.exit(0); }

  await aplicar(db, p, antes.crudas);
  const despues = await leer(db);
  const v = verificar(antes, despues, p);
  console.log('\nVERIFICACIÓN (releído de Firestore):');
  console.log('| Mesa | ★ | Asiento | Orientación | Ángulo | Aplicado |');
  p.res.forEach((r) => {
    const m = despues.mesas.find((x) => x.id === r.mesa.id);
    const slots = ordenPuestos(m);
    r.estrellas.forEach((e) => {
      const i = slots.findIndex((c) => c && c.key === e.key);
      const c = despues.crudas.find((x) => x.id === m.id).comensales.find((x) => x.key === e.key);
      console.log(`| ${m.nombre} | ${e.nombre}${c.estrella ? ' ★' : ' (sin ★!)'}${c.nota ? ` «${c.nota}»` : ''} | ${numAsiento(m, i)} | `
        + `${ORIENTACION_LABEL[orientacionSilla(m, i, p.pres)]} | ${fmt(anguloSilla(m, i, p.pres))} | `
        + `${r.espaldas ? 'NO (de espaldas)' : `giro ${r.giro.paso}, asiento 1 = silla ${r.inicio}`} |`);
    });
  });
  v.ok.forEach((t) => console.log(`✓ ${t}`));
  v.mal.forEach((t) => console.log(`✗ ${t}`));
  process.exit(v.mal.length ? 1 : 0);
}

main().catch((err) => { console.error('Error:', err.message || err); process.exit(1); });
