/* =================================================================
   Editor de una confirmación (rsvp) para el panel.
   Reproduce los mismos campos que rellena el invitado (asiste/no,
   personas con menú/alergias/bus/zapatos, origen y viaje) en un
   formulario compacto. Devuelve el DOM y funciones read()/validate();
   el guardado (y la conservación del `original`) lo hace admin-rsvp.js.
   ================================================================= */

const MENU_OPTIONS = [
  { value: 'ninguno', label: 'Normal' },
  { value: 'vegetariano', label: 'Vegetariano' },
  { value: 'vegano', label: 'Vegano' },
  { value: 'otro', label: 'Otro' },
];
const MODE_OPTIONS = [
  { value: 'bus', label: 'Bus' },
  { value: 'ave', label: 'AVE' },
  { value: 'coche', label: 'Coche' },
  { value: 'otro', label: 'Otro' },
  { value: 'buscando', label: 'Aún no lo sé' },
];

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function blankPerson() {
  return { name: '', allergies: '', menu: 'ninguno', menuOther: '', busIda: null, busVuelta: null, needsShoes: null, shoeSize: '' };
}

/** Normaliza un documento rsvp al estado editable del formulario. */
function normalize(data) {
  const attending = data.attending !== false; // ausente = asiste
  const t = data.travel || {};
  const people = (data.people && data.people.length ? data.people : (attending ? [blankPerson()] : []))
    .map((p) => ({ ...blankPerson(), ...p }));
  return {
    filledBy: data.filledBy || '',
    attending,
    origin: data.origin || '',
    people,
    travel: {
      ida: { mode: '', from: '', arrivalDay: '', arrivalTime: '', departTime: '', canCarry: null, ...(t.ida || {}) },
      vuelta: { day: '', mode: '', departTime: '', canCarry: null, ...(t.vuelta || {}) },
    },
  };
}

/* ---- Controles ---- */
function textField({ label, value, placeholder = '', type = 'text', onInput }) {
  const wrap = el('label', 'field');
  wrap.appendChild(el('span', 'field__label', label));
  const input = el('input', 'field__input');
  input.type = type;
  input.value = value || '';
  input.placeholder = placeholder;
  input.addEventListener('input', () => onInput(input.value));
  wrap.appendChild(input);
  return wrap;
}

function chipGroup({ label, options, value, onSelect }) {
  const wrap = el('fieldset', 'field');
  if (label) wrap.appendChild(el('legend', 'field__label', label));
  const group = el('div', 'chips');
  group.setAttribute('role', 'radiogroup');
  options.forEach((opt) => {
    const b = el('button', 'chip', opt.label);
    b.type = 'button';
    b.setAttribute('aria-pressed', String(opt.value === value));
    b.addEventListener('click', () => onSelect(opt.value));
    group.appendChild(b);
  });
  wrap.appendChild(group);
  return wrap;
}

function yesNo({ label, value, onSelect }) {
  return chipGroup({
    label,
    options: [{ value: 'si', label: 'Sí' }, { value: 'no', label: 'No' }],
    value: value === true ? 'si' : value === false ? 'no' : '',
    onSelect: (v) => onSelect(v === 'si'),
  });
}

/** Construye un payload limpio (mismo formato que el wizard) desde el estado. */
function buildPayload(state) {
  const filledBy = state.filledBy.trim();
  if (!state.attending) return { filledBy, attending: false };

  const payload = {
    filledBy,
    attending: true,
    origin: state.origin,
    people: state.people.map((p) => ({
      name: p.name.trim(),
      allergies: p.allergies.trim(),
      menu: p.menu,
      menuOther: p.menu === 'otro' ? (p.menuOther || '').trim() : '',
      busIda: p.busIda === true,
      busVuelta: p.busVuelta === true,
      needsShoes: p.needsShoes === true,
      shoeSize: p.needsShoes === true ? (p.shoeSize || '').trim() : '',
    })),
  };
  if (state.origin === 'fuera') {
    const { ida, vuelta } = state.travel;
    const conLlegada = ida.mode && ida.mode !== 'buscando';
    payload.travel = {
      ida: {
        mode: ida.mode,
        from: (ida.from || '').trim(),
        arrivalDay: conLlegada ? ida.arrivalDay : '',
        arrivalTime: conLlegada ? ida.arrivalTime : '',
        departTime: ida.mode === 'coche' ? (ida.departTime || '') : '',
        canCarry: ida.mode === 'coche' ? ida.canCarry === true : null,
        seeking: ida.mode === 'buscando',
      },
      vuelta: {
        day: vuelta.day,
        mode: vuelta.mode,
        departTime: vuelta.mode === 'coche' ? (vuelta.departTime || '') : '',
        canCarry: vuelta.mode === 'coche' ? vuelta.canCarry === true : null,
        seeking: vuelta.mode === 'buscando',
      },
    };
  }
  return payload;
}

/**
 * Crea el editor de un rsvp.
 * @param {Object} data documento rsvp (con id)
 * @returns {{ element:HTMLElement, read:()=>Object, validate:()=>string|null }}
 */
export function createRsvpEditor(data) {
  const state = normalize(data);
  const root = el('div', 'rsvp-editor');

  function refresh() {
    root.innerHTML = '';

    // Quién rellena
    root.appendChild(textField({
      label: 'Quién rellena', value: state.filledBy, placeholder: 'Nombre',
      onInput: (v) => { state.filledBy = v; },
    }));

    // ¿Asiste?
    root.appendChild(yesNo({
      label: '¿Asiste?', value: state.attending,
      onSelect: (v) => {
        state.attending = v;
        if (v && state.people.length === 0) state.people = [blankPerson()];
        refresh();
      },
    }));

    if (!state.attending) return; // no asiste → nada más que editar

    // Origen
    root.appendChild(chipGroup({
      label: 'Origen',
      options: [{ value: 'fuera', label: 'De fuera' }, { value: 'zaragoza', label: 'De Zaragoza' }],
      value: state.origin,
      onSelect: (v) => { state.origin = v; refresh(); },
    }));

    // Personas
    const peopleWrap = el('div', 'rsvp-editor__people');
    state.people.forEach((p, idx) => {
      const block = el('div', 'pblock');
      const head = el('div', 'rsvp-editor__phead');
      head.appendChild(el('span', 'pblock__name', p.name.trim() || `Persona ${idx + 1}`));
      if (state.people.length > 1) {
        const rm = el('button', 'people-editor__remove', '✕');
        rm.type = 'button';
        rm.setAttribute('aria-label', `Quitar persona ${idx + 1}`);
        rm.addEventListener('click', () => { state.people.splice(idx, 1); refresh(); });
        head.appendChild(rm);
      }
      block.appendChild(head);

      block.appendChild(textField({ label: 'Nombre', value: p.name, onInput: (v) => { p.name = v; } }));
      block.appendChild(textField({ label: 'Alergias / intolerancias', value: p.allergies, placeholder: 'Opcional', onInput: (v) => { p.allergies = v; } }));
      block.appendChild(chipGroup({ label: 'Menú', options: MENU_OPTIONS, value: p.menu, onSelect: (v) => { p.menu = v; refresh(); } }));
      if (p.menu === 'otro') block.appendChild(textField({ label: '¿Cuál?', value: p.menuOther, onInput: (v) => { p.menuOther = v; } }));
      block.appendChild(yesNo({ label: 'Bus de ida', value: p.busIda, onSelect: (v) => { p.busIda = v; } }));
      block.appendChild(yesNo({ label: 'Bus de vuelta', value: p.busVuelta, onSelect: (v) => { p.busVuelta = v; } }));
      block.appendChild(yesNo({ label: 'Zapatos de recambio', value: p.needsShoes, onSelect: (v) => { p.needsShoes = v; refresh(); } }));
      if (p.needsShoes === true) block.appendChild(textField({ label: 'Talla', value: p.shoeSize, placeholder: 'Ej.: 38', onInput: (v) => { p.shoeSize = v; } }));

      peopleWrap.appendChild(block);
    });
    root.appendChild(peopleWrap);

    const add = el('button', 'btn btn--ghost btn--block', '+ Añadir persona');
    add.type = 'button';
    add.addEventListener('click', () => { state.people.push(blankPerson()); refresh(); });
    root.appendChild(add);

    // Viaje (solo si viene de fuera)
    if (state.origin === 'fuera') {
      const ida = state.travel.ida;
      const vuelta = state.travel.vuelta;
      root.appendChild(el('h4', 'tot-minititle', 'Viaje de ida'));
      root.appendChild(chipGroup({ label: 'Cómo viene', options: MODE_OPTIONS, value: ida.mode, onSelect: (v) => { ida.mode = v; refresh(); } }));
      root.appendChild(textField({ label: 'Desde dónde', value: ida.from, placeholder: 'Madrid, Murcia…', onInput: (v) => { ida.from = v; } }));
      if (ida.mode && ida.mode !== 'buscando') {
        root.appendChild(textField({ label: 'Día de llegada', value: ida.arrivalDay, type: 'date', onInput: (v) => { ida.arrivalDay = v; } }));
        root.appendChild(textField({ label: 'Hora de llegada', value: ida.arrivalTime, type: 'time', onInput: (v) => { ida.arrivalTime = v; } }));
      }
      if (ida.mode === 'coche') {
        root.appendChild(textField({ label: 'Hora aprox. de salida', value: ida.departTime, type: 'time', onInput: (v) => { ida.departTime = v; } }));
        root.appendChild(yesNo({ label: '¿Plazas libres a la ida?', value: ida.canCarry, onSelect: (v) => { ida.canCarry = v; } }));
      }

      root.appendChild(el('h4', 'tot-minititle', 'Viaje de vuelta'));
      root.appendChild(textField({ label: 'Día de vuelta', value: vuelta.day, type: 'date', onInput: (v) => { vuelta.day = v; } }));
      root.appendChild(chipGroup({ label: 'Cómo se va', options: MODE_OPTIONS, value: vuelta.mode, onSelect: (v) => { vuelta.mode = v; refresh(); } }));
      if (vuelta.mode === 'coche') {
        root.appendChild(textField({ label: 'Hora aprox. de salida', value: vuelta.departTime, type: 'time', onInput: (v) => { vuelta.departTime = v; } }));
        root.appendChild(yesNo({ label: '¿Plazas libres a la vuelta?', value: vuelta.canCarry, onSelect: (v) => { vuelta.canCarry = v; } }));
      }
    }
  }

  refresh();

  return {
    element: root,
    read: () => buildPayload(state),
    validate: () => {
      if (!state.filledBy.trim()) return 'Indica quién rellena la confirmación.';
      if (state.attending) {
        if (!state.origin) return 'Indica el origen (de fuera / de Zaragoza).';
        if (state.people.length === 0) return 'Debe haber al menos una persona.';
        if (state.people.some((p) => !p.name.trim())) return 'Cada persona necesita un nombre.';
      }
      return null;
    },
  };
}
