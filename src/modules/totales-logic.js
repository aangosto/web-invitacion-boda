/* =================================================================
   TOTALES — agregación pura (sin Firebase ni DOM).
   La comparten la pestaña Totales del panel y la exportación a PDF,
   para que ambos cuenten exactamente igual (menús, alergias, bus,
   tallas con la exclusión de "sin talla"…).
   ================================================================= */

export const MENU_LABELS = { ninguno: 'Normal', vegetariano: 'Vegetariano', vegano: 'Vegano', otro: 'Otro' };

/** ¿La talla equivale a "sin talla"? Cubre todas las formas vistas o
    previsibles: campo ausente/null, cadena vacía o solo espacios (lo que
    deja el editor del panel al corregir), y textos tipo "sin talla",
    "-", "—" o "?". Un texto libre con contenido ("37..38") SÍ cuenta. */
export function esSinTalla(shoeSize) {
  const v = String(shoeSize ?? '').trim().toLowerCase();
  return !v || ['sin talla', '-', '—', '?', '¿?'].includes(v);
}

/* ---------- Agregación ----------
   Cada total se guarda como LISTA de miembros { nombre, por, extra? }
   (el recuento es la longitud). `por` = filledBy del formulario.     */
export function aggregate(docs) {
  const t = {
    confirmaciones: [],  // una entrada por formulario enviado
    asisten: [],
    noAsisten: [],
    menus: { ninguno: [], vegetariano: [], vegano: [], otro: [] },
    alergias: [],
    zapatos: [],
    zapatosSinTalla: [], // marcados "sin talla": visibles pero NO cuentan
    tallas: new Map(),   // talla → miembros
    busIda: [],
    busVuelta: [],
    fuera: [],
    zaragoza: [],
    coches: [],
    buscan: [],   // quienes marcaron "Aún no lo sé / busco transporte"
  };

  docs.forEach((data) => {
    const por = data.filledBy || '—';
    const people = data.people || [];
    t.confirmaciones.push({ nombre: por, extra: data.attending === false ? 'no asiste' : `${people.length} persona${people.length === 1 ? '' : 's'}` });

    if (data.attending === false) {
      t.noAsisten.push({ nombre: por, por });
      // Acompañantes añadidos desde el panel a un "no": también cuentan
      // como ausencias (solo nombre; se indica de qué confirmación son).
      (Array.isArray(data.companions) ? data.companions : []).forEach((c) => {
        const nombre = String(c).trim();
        if (nombre) t.noAsisten.push({ nombre, por, extra: 'acompañante' });
      });
      return;
    }

    // Origen: se responde una vez por formulario
    const origenExtra = `${people.length} persona${people.length === 1 ? '' : 's'}`;
    if (data.origin === 'fuera') t.fuera.push({ nombre: por, por, extra: origenExtra });
    else if (data.origin === 'zaragoza') t.zaragoza.push({ nombre: por, por, extra: origenExtra });

    people.forEach((p) => {
      const nombre = p.name || '—';
      const m = { nombre, por };
      t.asisten.push(m);

      // Menús (en "otro", el texto que escribieron como contexto)
      if (t.menus[p.menu]) {
        t.menus[p.menu].push(p.menu === 'otro'
          ? { nombre, por, extra: (p.menuOther || '').trim() || 'sin especificar' }
          : m);
      }

      // Alergias no vacías, con el texto para el catering
      if ((p.allergies || '').trim()) t.alergias.push({ nombre, por, extra: p.allergies.trim() });

      // Zapatos de recambio + desglose por talla. Los "sin talla" (p. ej.
      // marcados sin querer y corregidos desde el panel) se listan aparte
      // y NO suman al total ni al desglose; el dato sigue en su ficha.
      if (p.needsShoes === true) {
        const talla = String(p.shoeSize ?? '').trim();
        if (esSinTalla(talla)) {
          t.zapatosSinTalla.push({ nombre, por, extra: talla ? `«${talla}»` : undefined });
        } else {
          t.zapatos.push({ nombre, por, extra: `talla ${talla}` });
          if (!t.tallas.has(talla)) t.tallas.set(talla, []);
          t.tallas.get(talla).push(m);
        }
      }

      // Autobús (booleanos actuales o texto del formato antiguo)
      if (p.busIda === true || p.bus === 'ida' || p.bus === 'ambos') t.busIda.push(m);
      if (p.busVuelta === true || p.bus === 'vuelta' || p.bus === 'ambos') t.busVuelta.push(m);
    });

    // Coches con plazas libres (viajes compartidos). Mostramos hora de
    // salida y origen para poder cruzarlo con quien busca transporte.
    const ida = data.travel?.ida || {};
    const vuelta = data.travel?.vuelta || {};
    const from = (ida.from || '').trim();
    const plazasIda = ida.mode === 'coche' && ida.canCarry === true;
    const plazasVuelta = vuelta.mode === 'coche' && vuelta.canCarry === true;
    if (plazasIda || plazasVuelta) {
      const tramos = [];
      if (plazasIda) {
        const bits = [];
        if (ida.seats) bits.push(`${ida.seats} plaza${Number(ida.seats) === 1 ? '' : 's'}`);
        if (from) bits.push(`desde ${from}`);
        if (ida.departTime) bits.push(`sale ~${ida.departTime}`);
        tramos.push(`ida${bits.length ? ` (${bits.join(', ')})` : ''}`);
      }
      if (plazasVuelta) {
        const bits = [];
        if (vuelta.seats) bits.push(`${vuelta.seats} plaza${Number(vuelta.seats) === 1 ? '' : 's'}`);
        if (vuelta.departTime) bits.push(`sale ~${vuelta.departTime}`);
        tramos.push(`vuelta${bits.length ? ` (${bits.join(', ')})` : ''}`);
      }
      t.coches.push({ nombre: por, por, extra: tramos.join(' · ') });
    }

    // Quien busca transporte ("Aún no lo sé"): a quién ayudar y desde dónde.
    const buscaIda = ida.seeking === true || ida.mode === 'buscando';
    const buscaVuelta = vuelta.seeking === true || vuelta.mode === 'buscando';
    if (buscaIda || buscaVuelta) {
      const tramos = [buscaIda && 'ida', buscaVuelta && 'vuelta'].filter(Boolean).join(' y ');
      t.buscan.push({
        nombre: por,
        por,
        extra: `${from ? `desde ${from} · ` : ''}busca ${tramos}`,
      });
    }
  });

  return t;
}
