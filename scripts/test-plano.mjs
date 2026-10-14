/* =================================================================
   Pruebas de la geometría del plano del salón (sin Firestore).
   Uso:  node scripts/test-plano.mjs
   ================================================================= */

import assert from 'node:assert/strict';
import {
  numPuestos, tamanoMesa, puestosLocales, semiCaja, limitaDentro,
  haciaMesa, cercania, rumbo, ordenPuestos, colocacionInicial, normAng,
  distribuir, rngSemilla, zonaDespejada, PLANO_DEFAULT,
  colocarFinca, numerosRepetidos, numeroValido, FINCA_MESAS, FINCA_PRESIDENCIAL,
} from '../src/modules/plano-geom.js';

let ok = 0;
function t(nombre, fn) { fn(); ok += 1; console.log(`✓ ${nombre}`); }

const plano = { ancho: 18, largo: 24, rejilla: 0.5, iman: true };
const c = (key, nombre = key) => ({ key, nombre });

t('un puesto por plaza, más si hay sobreaforo', () => {
  assert.equal(numPuestos({ capacidad: 10, comensales: [] }), 10);
  assert.equal(numPuestos({ capacidad: 2, comensales: [c('a'), c('b'), c('c')] }), 3);
});

t('nº de puestos dibujados = n en todas las formas', () => {
  for (const forma of ['redonda', 'cuadrada', 'rectangular']) {
    for (const n of [1, 4, 6, 8, 9, 10, 11, 12, 13, 16]) {
      assert.equal(puestosLocales(forma, n).length, n, `${forma} ${n}`);
    }
  }
});

t('redonda: puestos 1 y 2 simétricos respecto a la cabecera', () => {
  const [p1, p2] = puestosLocales('redonda', 6);
  assert.ok(Math.abs(p1.x + p2.x) < 1e-9 && Math.abs(p1.y - p2.y) < 1e-9 && p1.y < 0);
});

t('los puestos quedan fuera del tablero', () => {
  for (const forma of ['redonda', 'cuadrada', 'rectangular']) {
    const { w, h } = tamanoMesa(forma, 10);
    puestosLocales(forma, 10).forEach((p) => {
      if (forma === 'redonda') assert.ok(Math.hypot(p.x, p.y) > w / 2);
      else assert.ok(Math.abs(p.x) > w / 2 || Math.abs(p.y) > h / 2);
    });
  }
});

t('la caja rotada 90° intercambia ejes en la rectangular', () => {
  const a = semiCaja('rectangular', 12, 0);
  const b = semiCaja('rectangular', 12, 90);
  assert.ok(Math.abs(a.hx - b.hy) < 1e-9 && Math.abs(a.hy - b.hx) < 1e-9);
});

t('las mesas no se salen de las paredes', () => {
  const mesa = { forma: 'redonda', capacidad: 16, comensales: [], rot: 0 };
  const { hx } = semiCaja('redonda', 16, 0);
  const p = limitaDentro(-5, 100, mesa, plano);
  assert.equal(p.x, hx);
  assert.equal(p.y, plano.largo - hx);
});

t('flecha hacia los novios: dirección y distancia', () => {
  const r = haciaMesa({ x: 9, y: 12 }, { x: 9, y: 2 });
  assert.equal(Math.round(r.ang), -90);
  assert.equal(r.dist, 10);
  assert.equal(rumbo(r.ang), 'arriba');
  assert.equal(rumbo(0), 'a la derecha');
  assert.equal(rumbo(135), 'abajo a la izquierda');
  assert.equal(cercania(2, plano), 'cercana');
  assert.equal(cercania(25, plano), 'lejana');
});

t('orden de puestos: respeta asientos, huecos y gente nueva', () => {
  const mesa = {
    capacidad: 4,
    comensales: [c('a'), c('b'), c('c')],
    asientos: ['', 'c', 'zz-ya-no-esta', 'a'],
  };
  const s = ordenPuestos(mesa);
  assert.deepEqual(s.map((x) => (x ? x.key : '')), ['b', 'c', '', 'a']);
});

t('orden de puestos sin asientos guardados = orden de comensales', () => {
  const s = ordenPuestos({ capacidad: 3, comensales: [c('x'), c('y')] });
  assert.deepEqual(s.map((x) => (x ? x.key : '')), ['x', 'y', '']);
});

t('colocación inicial: presidencial arriba y todas dentro', () => {
  const mesas = Array.from({ length: 16 }, (_, i) => ({
    id: String(i), forma: 'redonda', capacidad: i === 0 ? 6 : 11, comensales: [], rot: 0, presidencial: i === 0,
  }));
  const pos = colocacionInicial(mesas, plano);
  assert.equal(pos.size, 16);
  assert.equal(pos.get('0').x, plano.ancho / 2);
  mesas.forEach((m) => {
    const p = pos.get(m.id);
    const q = limitaDentro(p.x, p.y, m, plano);
    assert.ok(Math.abs(p.x - q.x) < 1e-9 && Math.abs(p.y - q.y) < 1e-9, `mesa ${m.id} fuera`);
  });
});

t('normAng', () => {
  assert.equal(normAng(370), 10);
  assert.equal(normAng(-190), 170);
  assert.equal(normAng(180), 180);
});

/* ---------- Distribución automática (las 16 mesas reales) ---------- */
const REALES = [['Novios', 6, 'redonda', true], ['Ámbar', 9], ['Chuches', 16, 'rectangular'], ['Espetos', 11],
  ['Estrella', 11], ['Guardia Civil', 11], ['Huevo Gamba', 12], ['Jamón', 9], ['Limón', 10], ['Marinera', 9],
  ['Melocotón', 10], ['Naranja', 11], ['Paparajote', 11], ['Patatas', 11], ['Uvas', 9], ['Vermut', 10]]
  .map(([id, cap, forma = 'redonda', pres = false]) => ({
    id, capacidad: cap, comensales: Array.from({ length: cap }, (_, i) => c(`${id}${i}`)), forma, rot: 0, presidencial: pres,
  }));
const caja = (m, p) => ({ ...semiCaja(m.forma, numPuestos(m), p.rot), x: p.x, y: p.y });

t('salón por defecto 24 × 18 (proporción de la finca ≈ 1,34:1)', () => {
  assert.equal(PLANO_DEFAULT.ancho, 24);
  assert.equal(PLANO_DEFAULT.largo, 18);
  assert.ok(Math.abs(PLANO_DEFAULT.ancho / PLANO_DEFAULT.largo - 1.34) < 0.01);
});

t('distribuir: sin solapes, dentro, con pasillo y zona despejada (50 semillas)', () => {
  for (let s = 1; s <= 50; s++) {
    const r = distribuir(REALES, PLANO_DEFAULT, rngSemilla(s));
    assert.ok(r, `semilla ${s}: no cabe`);
    assert.equal(r.pos.size, 16);
    const cajas = REALES.map((m) => ({ m, ...caja(m, r.pos.get(m.id)) }));
    cajas.forEach((a, i) => {
      assert.ok(a.x - a.hx >= -1e-6 && a.x + a.hx <= PLANO_DEFAULT.ancho + 1e-6, `${a.m.id} se sale (x)`);
      assert.ok(a.y - a.hy >= -1e-6 && a.y + a.hy <= PLANO_DEFAULT.largo + 1e-6, `${a.m.id} se sale (y)`);
      cajas.slice(i + 1).forEach((b) => {
        // Pasillo mínimo entre sillas (el más estrecho que admite el algoritmo)
        const sep = Math.max(Math.abs(a.x - b.x) - a.hx - b.hx, Math.abs(a.y - b.y) - a.hy - b.hy);
        const sepCirc = Math.hypot(a.x - b.x, a.y - b.y) - Math.max(a.hx, a.hy) - Math.max(b.hx, b.hy);
        const ambasRedondas = a.m.forma === 'redonda' && b.m.forma === 'redonda';
        assert.ok((ambasRedondas ? sepCirc : sep) >= 0.6, `semilla ${s}: ${a.m.id}/${b.m.id} sin pasillo`);
      });
    });
    const pres = cajas.find((x) => x.m.presidencial);
    assert.equal(pres.x, PLANO_DEFAULT.ancho / 2);
    assert.ok(pres.y - pres.hy < 0.3, 'presidencial pegada a la pared de arriba');
    assert.equal(r.pos.get('Novios').rot, 0, 'presidencial mirando al salón');
    const z = zonaDespejada(pres, PLANO_DEFAULT);
    cajas.filter((x) => x !== pres).forEach((b) => {
      const dentroZona = Math.abs(b.x - z.x) < z.hx + b.hx - 1e-6 && Math.abs(b.y - z.y) < z.hy + b.hy - 1e-6;
      assert.ok(!dentroZona, `semilla ${s}: ${b.m.id} invade la zona despejada`);
    });
  }
});

t('distribuir: cada vez distinta y no en cuadrícula', () => {
  const a = distribuir(REALES, PLANO_DEFAULT, rngSemilla(1)).pos;
  const b = distribuir(REALES, PLANO_DEFAULT, rngSemilla(2)).pos;
  assert.ok(REALES.some((m) => Math.hypot(a.get(m.id).x - b.get(m.id).x, a.get(m.id).y - b.get(m.id).y) > 1));
  // En una cuadrícula muchas mesas comparten x o y; aquí casi ninguna
  const xs = [...a.values()].map((p) => Math.round(p.x * 2) / 2);
  assert.ok(new Set(xs).size >= 12, `x repetidas: ${xs}`);
});

t('distribuir: devuelve null si el salón es demasiado pequeño', () => {
  assert.equal(distribuir(REALES, { ...PLANO_DEFAULT, ancho: 8, largo: 6 }, rngSemilla(1)), null);
});

/* ---------- Colocar como el plano de la finca (datos sintéticos) ---------- */
// Numeradas 1..15 en el orden de REALES (la presidencial sin número)
const conNumero = (lista, quitar = []) => lista.map((m, i) => ({
  ...m, nombre: m.id, x: 1, y: 1, numero: m.presidencial || quitar.includes(i) ? null : i,
}));

t('número de mesa: solo enteros 1-15', () => {
  assert.equal(numeroValido(7), 7);
  [0, 16, 2.5, '3', null, undefined, -1].forEach((v) => assert.equal(numeroValido(v), null, String(v)));
  assert.equal(Object.keys(FINCA_MESAS).length, 15);
});

t('números repetidos (la presidencial no cuenta)', () => {
  const l = [{ id: 'a', numero: 3 }, { id: 'b', numero: 3 }, { id: 'c', numero: 4 },
    { id: 'p', numero: 4, presidencial: true }, { id: 'd', numero: null }, { id: 'e', numero: null }];
  const r = numerosRepetidos(l);
  assert.deepEqual([...r.keys()], [3]);
  assert.deepEqual(r.get(3).map((m) => m.id), ['a', 'b']);
});

t('finca: cada mesa a su porcentaje; presidencial redonda, rot 0', () => {
  const mesas = conNumero(REALES).map((m) => ({ ...m, rot: 30, forma: m.presidencial ? 'rectangular' : m.forma }));
  const r = colocarFinca(mesas, PLANO_DEFAULT);
  assert.equal(r.pos.size, 16);
  assert.equal(r.sinNumero.length, 0);
  const pres = r.pos.get('Novios');
  assert.ok(Math.abs(pres.x - FINCA_PRESIDENCIAL.x * 24) < 1e-9 && Math.abs(pres.y - 0.12 * 18) < 1e-9);
  assert.equal(pres.rot, 0);
  assert.equal(pres.forma, 'redonda');
  const m7 = mesas.find((m) => m.numero === 7);
  const p7 = r.pos.get(m7.id);
  assert.ok(Math.abs(p7.x - 0.388 * 24) < 1e-9 && Math.abs(p7.y - 0.411 * 18) < 1e-9);
  assert.equal(p7.rot, 30, 'el giro de las demás se conserva');
  assert.equal(p7.forma, undefined, 'la forma de las demás no se toca');
  // Coordenadas proporcionales: en otro salón, mismos porcentajes
  const r2 = colocarFinca(mesas, { ancho: 30, largo: 22 });
  assert.ok(Math.abs(r2.pos.get(m7.id).x - 0.388 * 30) < 1e-9);
});

t('finca: las mesas sin número no se mueven y se listan', () => {
  const mesas = conNumero(REALES, [3, 8]);
  const r = colocarFinca(mesas, PLANO_DEFAULT);
  assert.equal(r.pos.size, 14);
  assert.deepEqual(r.sinNumero.map((m) => m.id).sort(), [REALES[3].id, REALES[8].id].sort());
  r.sinNumero.forEach((m) => assert.ok(!r.pos.has(m.id)));
});

t('finca: no toca comensales, asientos ni preboda (solo x, y, rot y forma)', () => {
  const mesas = conNumero(REALES).map((m) => ({ ...m, asientos: ['x'] }));
  const antes = JSON.stringify(mesas);
  const r = colocarFinca(mesas, PLANO_DEFAULT);
  assert.equal(JSON.stringify(mesas), antes, 'no muta las mesas');
  [...r.pos.values()].forEach((p) => {
    Object.keys(p).forEach((k) => assert.ok(['x', 'y', 'rot', 'forma'].includes(k), k));
  });
});

t('finca: solapes y salidas de pared se marcan sin bloquear', () => {
  // Salón pequeño: las mesas grandes se pisan y se salen
  const r = colocarFinca(conNumero(REALES), { ancho: 12, largo: 9 });
  assert.equal(r.pos.size, 16, 'se colocan igualmente');
  assert.ok(r.conflictos.some((c) => c.motivos.some((t) => t.startsWith('se solapa con'))));
  assert.ok(r.conflictos.some((c) => c.motivos.includes('se sale de las paredes')));
  // Número repetido: las dos en el mismo sitio → solape marcado en ambas
  const dup = conNumero(REALES).map((m) => (m.numero === 5 ? { ...m, numero: 6 } : m));
  const rd = colocarFinca(dup, { ancho: 60, largo: 45 });
  const seis = dup.filter((m) => m.numero === 6).map((m) => m.id);
  assert.equal(seis.length, 2);
  seis.forEach((id) => assert.ok(rd.conflictos.some((c) => c.mesa.id === id)));
  // Una sin número que se queda donde estaba también puede pisarse
  const quieta = conNumero(REALES, [1]).map((m, i) => (i === 1 ? { ...m, x: 0.388 * 60, y: 0.411 * 45 } : m));
  const rq = colocarFinca(quieta, { ancho: 60, largo: 45 });
  const m7 = quieta.find((m) => m.numero === 7);
  assert.ok(rq.conflictos.some((c) => c.mesa.id === m7.id && c.motivos[0].includes(REALES[1].id)));
  assert.ok(!rq.conflictos.some((c) => c.mesa.id === REALES[1].id), 'la que no se mueve no se marca');
});

t('finca: salón grande, sin conflictos', () => {
  const r = colocarFinca(conNumero(REALES), { ancho: 60, largo: 45 });
  assert.deepEqual(r.conflictos, []);
});

/* Informativo: con el tamaño real de las mesas, ¿qué pasa en 24 × 18? */
const real = colocarFinca(conNumero(REALES), PLANO_DEFAULT);
console.log(`  (24 × 18 con mesas de prueba: ${real.conflictos.length} con aviso${real.conflictos.length ? `: ${real.conflictos.map((c) => `${c.mesa.id} → ${[...new Set(c.motivos)].join(', ')}`).join(' | ')}` : ''})`);

console.log(`\n${ok} pruebas OK`);
