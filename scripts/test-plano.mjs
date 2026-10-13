/* =================================================================
   Pruebas de la geometría del plano del salón (sin Firestore).
   Uso:  node scripts/test-plano.mjs
   ================================================================= */

import assert from 'node:assert/strict';
import {
  numPuestos, tamanoMesa, puestosLocales, semiCaja, limitaDentro,
  haciaMesa, cercania, rumbo, ordenPuestos, colocacionInicial, normAng,
  distribuir, rngSemilla, zonaDespejada, PLANO_DEFAULT,
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

t('salón por defecto apaisado tipo folio (√2:1)', () => {
  assert.ok(PLANO_DEFAULT.ancho > PLANO_DEFAULT.largo);
  assert.ok(Math.abs(PLANO_DEFAULT.ancho / PLANO_DEFAULT.largo - Math.SQRT2) < 0.02);
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

console.log(`\n${ok} pruebas OK`);
