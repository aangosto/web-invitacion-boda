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
  colocarFincaSinSolapes, separarActual, mesasQueSePisan, intercambio, giraPuestos,
  medidasMinimasFinca, zonasSalida, PASILLO_MIN,
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

/* ---------- Colocar como la finca SIN SOLAPES (datos sintéticos) ---------- */
const PARED = 0.6;
/** Comprobación independiente: sin solapes con pasillo, dentro, salidas libres. */
function compruebaColocacion(mesas, pos, plano, etiqueta) {
  const cajas = mesas.filter((m) => pos.has(m.id)).map((m) => {
    const p = pos.get(m.id);
    const forma = p.forma || m.forma;
    return { m, forma, x: p.x, y: p.y, ...semiCaja(forma, numPuestos(m), p.rot ?? m.rot ?? 0) };
  });
  cajas.forEach((a, i) => {
    if (!a.m.presidencial) {
      assert.ok(a.x - a.hx >= PARED - 0.011 && a.x + a.hx <= plano.ancho - PARED + 0.011, `${etiqueta}: ${a.m.id} se sale (x)`);
      assert.ok(a.y - a.hy >= PARED - 0.011 && a.y + a.hy <= plano.largo - PARED + 0.011, `${etiqueta}: ${a.m.id} se sale (y)`);
      zonasSalida(plano).forEach((z) => {
        const tapa = Math.abs(a.x - z.x) < a.hx + z.hx - 0.011 && Math.abs(a.y - z.y) < a.hy + z.hy - 0.011;
        assert.ok(!tapa, `${etiqueta}: ${a.m.id} tapa una salida`);
      });
    }
    cajas.slice(i + 1).forEach((b) => {
      const sep = a.forma === 'redonda' && b.forma === 'redonda'
        ? Math.hypot(a.x - b.x, a.y - b.y) - a.hx - b.hx
        : Math.max(Math.abs(a.x - b.x) - a.hx - b.hx, Math.abs(a.y - b.y) - a.hy - b.hy);
      assert.ok(sep >= PASILLO_MIN - 0.011, `${etiqueta}: ${a.m.id}/${b.m.id} sin pasillo (${sep.toFixed(2)} m)`);
    });
  });
}
/** Orden relativo del plano de la finca: izquierda/derecha y arriba/abajo. */
function compruebaOrden(mesas, pos, plano, etiqueta) {
  const num = mesas.filter((m) => m.numero != null && !m.presidencial);
  num.forEach((a, i) => num.slice(i + 1).forEach((b) => {
    const fa = FINCA_MESAS[a.numero];
    const fb = FINCA_MESAS[b.numero];
    const tdx = (fb.x - fa.x) * plano.ancho;
    const tdy = (fb.y - fa.y) * plano.largo;
    const pa = pos.get(a.id);
    const pb = pos.get(b.id);
    if (Math.abs(tdx) >= 0.6) assert.ok(Math.sign(tdx) * (pb.x - pa.x) >= -0.011, `${etiqueta}: ${a.numero}/${b.numero} cambia izquierda-derecha`);
    if (Math.abs(tdy) >= 0.6) assert.ok(Math.sign(tdy) * (pb.y - pa.y) >= -0.011, `${etiqueta}: ${a.numero}/${b.numero} cambia arriba-abajo`);
  }));
}
// Las 16 mesas de prueba numeradas 1..15 (orden alfabético; Chuches = 2)
const numeradas = conNumero(REALES);

t('finca sin solapes: 24 × 18, con la rectangular y mesas de 12', () => {
  const r = colocarFincaSinSolapes(numeradas, PLANO_DEFAULT);
  assert.ok(r.ok);
  assert.equal(r.pos.size, 16);
  assert.ok(numeradas.some((m) => m.forma === 'rectangular') && numeradas.some((m) => m.capacidad === 12));
  compruebaColocacion(numeradas, r.pos, PLANO_DEFAULT, '24×18');
  compruebaOrden(numeradas, r.pos, PLANO_DEFAULT, '24×18');
  // Presidencial arriba, centrada, contra la pared, redonda y mirando al salón
  const p = r.pos.get('Novios');
  const { hy } = semiCaja('redonda', 6, 0);
  assert.equal(p.x, PLANO_DEFAULT.ancho / 2);
  assert.ok(p.y - hy < 0.3);
  assert.equal(p.rot, 0);
  assert.equal(p.forma, 'redonda');
});

t('finca sin solapes: la rectangular en cada uno de los 15 sitios', () => {
  for (let n = 1; n <= 15; n++) {
    const ms = numeradas.map((m) => ({ ...m }));
    const ch = ms.find((m) => m.id === 'Chuches');
    const otra = ms.find((m) => m.numero === n);
    [ch.numero, otra.numero] = [n, ch.numero];
    const r = colocarFincaSinSolapes(ms, PLANO_DEFAULT);
    assert.ok(r.ok, `Chuches en el ${n}`);
    compruebaColocacion(ms, r.pos, PLANO_DEFAULT, `Chuches en el ${n}`);
    compruebaOrden(ms, r.pos, PLANO_DEFAULT, `Chuches en el ${n}`);
  }
});

t('finca sin solapes: todas de 12 (y la rectangular girada 90°)', () => {
  const ms = numeradas.map((m) => (m.presidencial ? m : m.forma === 'rectangular'
    ? { ...m, rot: 90 } : { ...m, capacidad: 12, comensales: [] }));
  const r = colocarFincaSinSolapes(ms, PLANO_DEFAULT);
  assert.ok(r.ok);
  compruebaColocacion(ms, r.pos, PLANO_DEFAULT, 'todas de 12');
  compruebaOrden(ms, r.pos, PLANO_DEFAULT, 'todas de 12');
  assert.equal(r.pos.get('Chuches').rot, 90, 'cada mesa conserva su giro');
});

t('finca sin solapes: se mueve lo mínimo (salón holgado → casi nada)', () => {
  // 60 × 45: en el plano de la finca ya no se pisa ninguna
  const grande = { ...PLANO_DEFAULT, ancho: 60, largo: 45 };
  const r = colocarFincaSinSolapes(numeradas, grande);
  assert.ok(r.ok);
  numeradas.filter((m) => !m.presidencial).forEach((m) => {
    const f = FINCA_MESAS[m.numero];
    const p = r.pos.get(m.id);
    assert.ok(Math.hypot(p.x - f.x * 60, p.y - f.y * 45) < 0.05, `${m.id} se ha movido sin necesidad`);
  });
  // En 24 × 18 nadie se aleja más de 1,5 m de su sitio
  assert.ok(colocarFincaSinSolapes(numeradas, PLANO_DEFAULT).max < 1.5);
});

t('finca: salón pequeño → no coloca nada y da las medidas mínimas', () => {
  const peque = { ...PLANO_DEFAULT, ancho: 14, largo: 10.5 };
  const r = colocarFincaSinSolapes(numeradas, peque);
  assert.equal(r.ok, false);
  assert.equal(r.pos, undefined, 'no devuelve posiciones a medias');
  const { ancho, largo } = r.minimo;
  assert.ok(ancho > 14 && Math.abs(largo / ancho - 0.75) < 0.03, `${ancho} × ${largo}`);
  // Con las mínimas, sí cabe; medio metro menos, no
  const ok = colocarFincaSinSolapes(numeradas, { ...peque, ancho, largo });
  assert.ok(ok.ok);
  compruebaColocacion(numeradas, ok.pos, { ...peque, ancho, largo }, 'mínimas');
  assert.equal(colocarFincaSinSolapes(numeradas, { ...peque, ancho: ancho - 0.5, largo: Math.ceil((ancho - 0.5) * 0.75 * 2) / 2 }).ok, false);
});

t('finca sin solapes: sin número no se mueven salvo para no pisarse', () => {
  const ms = conNumero(REALES, [5]).map((m) => (m.numero == null && !m.presidencial ? { ...m, x: 3, y: 15 } : m));
  const r = colocarFincaSinSolapes(ms, PLANO_DEFAULT);
  assert.ok(r.ok);
  assert.deepEqual(r.sinNumero.map((m) => m.id), [REALES[5].id]);
  const quieta = ms.find((m) => m.id === REALES[5].id);
  const p = r.pos.get(quieta.id);
  if (p) assert.ok(r.apartadas.includes(quieta));
  else assert.deepEqual(r.apartadas, []);
});

/* ---------- Intercambiar dos mesas ---------- */
t('intercambio: cambian sitio y número; cada una conserva su giro', () => {
  const a = { id: 'a', x: 2, y: 3, rot: 15, numero: 1, forma: 'redonda', capacidad: 10, comensales: [c('x')] };
  const b = { id: 'b', x: 9, y: 7, rot: 90, numero: 14, forma: 'rectangular', capacidad: 16, comensales: [] };
  const [ca, cb] = intercambio(a, b);
  assert.deepEqual(ca, { id: 'a', x: 9, y: 7, rot: 15, numero: 14 });
  assert.deepEqual(cb, { id: 'b', x: 2, y: 3, rot: 90, numero: 1 });
  // Solo devuelve sitio, giro y número: nada de comensales, forma, etc.
  [ca, cb].forEach((x) => assert.deepEqual(Object.keys(x).sort(), ['id', 'numero', 'rot', 'x', 'y']));
  // Con una sin número: el número va con el sitio
  const [cs] = intercambio({ ...a, numero: null }, b);
  assert.equal(cs.numero, 14);
  assert.equal(intercambio({ ...a, numero: null }, b)[1].numero, null);
});

t('intercambio: la rectangular en el hueco de una redonda se pisa → separar lo arregla', () => {
  const base = colocarFincaSinSolapes(numeradas, PLANO_DEFAULT);
  const ms = numeradas.map((m) => ({ ...m, ...base.pos.get(m.id) }));
  const ch = ms.find((m) => m.id === 'Chuches');
  const otra = ms.find((m) => m.numero === 7);
  intercambio(ch, otra).forEach((cambio) => Object.assign(ms.find((m) => m.id === cambio.id), cambio));
  assert.equal(ch.numero, 7);
  assert.ok(mesasQueSePisan(ms).includes(ch), 'tras el intercambio se pisa');
  const r = separarActual(ms, PLANO_DEFAULT);
  assert.ok(r.ok);
  const fin = new Map(ms.map((m) => [m.id, r.pos.get(m.id) || { x: m.x, y: m.y, rot: m.rot }]));
  compruebaColocacion(ms, fin, PLANO_DEFAULT, 'tras intercambio');
  assert.ok(!r.pos.has('Novios'), 'la presidencial no se mueve');
  assert.deepEqual(mesasQueSePisan(ms.map((m) => ({ ...m, ...fin.get(m.id) }))), []);
});

/* ---------- Girar a todos los comensales ---------- */
t('giro: cada comensal pasa al puesto de al lado; los vacíos giran con el resto', () => {
  const mesa = { capacidad: 5, comensales: [c('a'), c('b'), c('c')], asientos: ['a', '', 'b', 'c', ''] };
  assert.deepEqual(giraPuestos(mesa, 1), ['', 'a', '', 'b', 'c']);
  assert.deepEqual(giraPuestos(mesa, -1), ['', 'b', 'c', '', 'a']);
  assert.deepEqual(giraPuestos({ ...mesa, asientos: giraPuestos(mesa, 1) }, -1), mesa.asientos);
});

t('giro completo: tantas vueltas como puestos deja la mesa igual (las 3 formas)', () => {
  for (const forma of ['redonda', 'cuadrada', 'rectangular']) {
    for (const cap of [6, 9, 12, 16]) {
      const com = Array.from({ length: cap - 2 }, (_, i) => c(`p${i}`));
      const mesa = { forma, capacidad: cap, comensales: com, asientos: null };
      const inicial = ordenPuestos(mesa).map((x) => (x ? x.key : ''));
      let m = mesa;
      for (const sentido of [1, -1]) {
        m = mesa;
        for (let i = 0; i < numPuestos(mesa); i++) {
          const antes = ordenPuestos(m).map((x) => (x ? x.key : ''));
          m = { ...m, asientos: giraPuestos(m, sentido) };
          const despues = ordenPuestos(m).map((x) => (x ? x.key : ''));
          assert.notDeepEqual(despues, antes, `${forma} ${cap}: el giro no cambia nada`);
          // Orden entre ellos conservado (rotación pura)
          assert.deepEqual(despues, antes.map((_, j) => antes[(j - sentido + antes.length) % antes.length]));
        }
        assert.deepEqual(ordenPuestos(m).map((x) => (x ? x.key : '')), inicial, `${forma} ${cap}`);
      }
      // Los comensales son los mismos (no se pierde ni se duplica nadie)
      assert.deepEqual(ordenPuestos(m).filter(Boolean).map((x) => x.key).sort(), com.map((x) => x.key).sort());
    }
  }
});

t('giro: el sentido ⟳ sigue el orden en que se dibujan los puestos (agujas del reloj)', () => {
  // Puestos 1 → 2 en redonda: del 1 (arriba-izquierda) al 2 (arriba-derecha)
  const [p1, p2] = puestosLocales('redonda', 8);
  assert.ok(p2.x > p1.x && Math.abs(p1.y - p2.y) < 1e-9);
  // Rectangular: los puestos recorren el perímetro sin saltos (cada uno al lado del anterior)
  const pts = puestosLocales('rectangular', 12);
  const ang = pts.map((p) => Math.atan2(p.y, p.x));
  const giros = ang.map((a, i) => ((ang[(i + 1) % ang.length] - a + 3 * Math.PI) % (2 * Math.PI)) - Math.PI);
  assert.ok(giros.every((g) => g > 0), 'siempre en el mismo sentido (horario en pantalla)');
});

const minimas = medidasMinimasFinca(numeradas, PLANO_DEFAULT);
console.log(`  (medidas mínimas para las 16 mesas de prueba, Chuches de nº 2: ${minimas.ancho} × ${minimas.largo} m)`);

console.log(`\n${ok} pruebas OK`);
