/* =================================================================
   Pruebas de la geometría del plano del salón (sin Firestore).
   Uso:  node scripts/test-plano.mjs
   ================================================================= */

import assert from 'node:assert/strict';
import {
  numPuestos, tamanoMesa, puestosLocales, semiCaja, limitaDentro,
  haciaMesa, cercania, rumbo, ordenPuestos, colocacionInicial, normAng,
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

console.log(`\n${ok} pruebas OK`);
