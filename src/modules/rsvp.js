/* =================================================================
   RSVP — ASISTENTE POR PASOS (wizard) de confirmación de asistencia.

   Cada pregunta (o grupo lógico pequeño) es una pantalla propia con
   botones «Atrás / Siguiente», indicador de progreso y memoria de
   estado: todo lo respondido se guarda en un objeto `state` y se
   respalda en sessionStorage para sobrevivir a una recarga.

   Flujo:
     1. Quién rellena            7. Zapatos de recambio (por persona)
     2. ¿Asistirás? (sí/no)      8. Origen (fuera / Zaragoza)
     3. Acompañantes             9. Viaje de IDA        (solo fuera)
     4. Alergias (por persona)  10. Viaje de VUELTA     (solo fuera)
     5. Menú (por persona)      11. Resumen y confirmación
     6. Autobús (por persona)
   Si NO asiste (paso 2), se salta directo al resumen: no se pregunta
   nada más y se guarda attending: false.

   La lógica de envío sigue desacoplada en submitRsvp(). Los datos son
   sensibles (alergias = salud): las reglas de Firestore permiten CREAR
   pero deniegan la lectura desde el cliente.
   ================================================================= */

import { db, isConfigured } from '../firebase.js';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { logAudit } from './audit.js';

/**
 * Envía la confirmación a Firestore (colección "rsvp").
 * Estructura del documento:
 *   { filledBy, attending: true|false,
 *     origin: 'fuera'|'zaragoza',            // solo si asiste
 *     people: [{ name, allergies, menu, menuOther, busIda, busVuelta,
 *                needsShoes, shoeSize }],    // solo si asiste
 *     travel: { ida: {...}, vuelta: {...} }, // solo si asiste y es de fuera
 *     createdAt }
 * Si Firebase no está configurado, se simula el envío (modo desarrollo).
 * @param {Object} data
 * @returns {Promise<{ok: boolean}>}
 */
export async function submitRsvp(data) {
  if (isConfigured) {
    const ref = await addDoc(collection(db, 'rsvp'), { ...data, createdAt: serverTimestamp() });
    // Auditoría con referencia al doc recién creado (fire-and-forget)
    logAudit('envio_formulario', { rsvpId: ref.id, attending: data.attending });
    return { ok: true };
  }
  console.info('[RSVP] (sin Firebase) datos capturados:', data);
  await new Promise((r) => setTimeout(r, 600));
  return { ok: true };
}

/* ---------------- Estado ---------------- */

/* v3: se añadió `attending` (los respaldos anteriores no encajan) */
const STORAGE_KEY = 'rsvpWizard.v6';

/** Persona con todos sus campos por defecto. */
function blankPerson() {
  return {
    name: '',
    allergies: '',
    menu: 'ninguno',   // ninguno | vegetariano | vegano | otro
    menuOther: '',
    busIda: null,      // true | false | null (sin responder)
    busVuelta: null,
    needsShoes: null,  // true | false | null
    shoeSize: '',
  };
}

/** Estado inicial del asistente.
    people[0] es SIEMPRE quien rellena (su nombre se sincroniza desde el
    paso 1); del people[1] en adelante van los acompañantes (paso 2). */
function blankState() {
  return {
    filledBy: '',
    attending: null,   // true | false | null (sin responder)
    people: [blankPerson()],
    origin: '',        // '' | 'fuera' | 'zaragoza'
    travel: {
      ida:    { mode: '', from: '', arrivalDay: '', arrivalTime: '', canCarry: null, seats: '', departTime: '' },
      vuelta: { day: '', mode: '', departTime: '', canCarry: null, seats: '' },
    },
  };
}

/* ---------------- Opciones ---------------- */

const MENU_OPTIONS = [
  { value: 'ninguno', label: 'Ninguno' },
  { value: 'vegetariano', label: 'Vegetariano' },
  { value: 'vegano', label: 'Vegano' },
  { value: 'otro', label: 'Otro' },
];
const MODE_OPTIONS = [
  { value: 'bus', label: 'Bus' },
  { value: 'ave', label: 'AVE / Tren' },
  { value: 'coche', label: 'Coche' },
  { value: 'avion', label: 'Avión' },
  { value: 'otro', label: 'Otro' },
  { value: 'buscando', label: 'Aún no lo sé' },
];
const MENU_LABELS = { ninguno: 'Sin menú especial', vegetariano: 'Vegetariano', vegano: 'Vegano', otro: 'Otro' };
const MODE_LABELS = { bus: 'Bus', ave: 'AVE/Tren', coche: 'Coche', avion: 'Avión', otro: 'Otro', buscando: 'Aún no lo sé / busca transporte' };

/* Ventana de fechas de viaje alrededor de la boda (24·10·2026). Con la
   fecha de hoy fuera del rango, el calendario nativo abre directamente
   en octubre de 2026 en vez de en el mes actual: el invitado no tiene
   que ir pasando meses. No pre-rellena nada: el campo sigue vacío. */
const TRAVEL_DATE_MIN = '2026-10-01';
const TRAVEL_DATE_MAX = '2026-11-30';

/* ---------------- Ayudantes de DOM ---------------- */

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

/** Campo de texto con etiqueta. onInput recibe el valor ya recortable. */
function textField({ label, value, placeholder = '', type = 'text', autocomplete, min, max, onInput }) {
  const wrap = el('label', 'field');
  wrap.appendChild(el('span', 'field__label', label));
  const input = el('input', 'field__input');
  input.type = type;
  input.value = value || '';
  input.placeholder = placeholder;
  if (autocomplete) input.autocomplete = autocomplete;
  if (min != null) input.min = min;
  if (max != null) input.max = max;
  input.addEventListener('input', () => onInput(input.value));
  wrap.appendChild(input);
  return wrap;
}

/** Grupo de "chips" de selección única (rol radiogroup). */
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

/** Pregunta Sí / No (value: true | false | null). */
function yesNo({ label, value, onSelect }) {
  return chipGroup({
    label,
    options: [{ value: 'si', label: 'Sí' }, { value: 'no', label: 'No' }],
    value: value === true ? 'si' : value === false ? 'no' : '',
    onSelect: (v) => onSelect(v === 'si'),
  });
}

/** Fecha ISO (aaaa-mm-dd, del input type=date) → dd/mm/aaaa legible. */
function formatDay(iso) {
  const [y, m, d] = String(iso).split('-');
  return y && m && d ? `${d}/${m}/${y}` : iso;
}

/** Bloque con el nombre de una persona (para pasos "por persona"). */
function personBlock(person, idx) {
  const block = el('div', 'pblock');
  block.appendChild(el('p', 'pblock__name', person.name.trim() || `Persona ${idx + 1}`));
  return block;
}

/* ---------------- Definición de pasos ----------------
   Cada paso: { id, when?(state), render(screen, ctx), validate?(state) }.
   `render` pinta la pantalla leyendo del estado; `validate` devuelve un
   mensaje de error o null. `ctx.refresh()` repinta el paso actual (para
   campos condicionales) y `ctx.save()` persiste el estado.            */

const STEPS = [

  /* ---- PASO 1 · Quién rellena ---- */
  {
    id: 'quien',
    render(screen, { state, save }) {
      screen.appendChild(el('h2', 'wizard__title', '¿Quién eres?'));
      screen.appendChild(el('p', 'wizard__hint', 'Dinos tu nombre para empezar; el resto va paso a paso.'));
      screen.appendChild(textField({
        label: 'Tu nombre',
        value: state.filledBy,
        placeholder: 'Nombre y apellidos',
        autocomplete: 'name',
        // Quien rellena ES people[0]: su nombre se mantiene sincronizado
        onInput: (v) => { state.filledBy = v; state.people[0].name = v; save(); },
      }));
    },
    validate(state) {
      return state.filledBy.trim() ? null : 'Dinos tu nombre para empezar.';
    },
  },

  /* ---- PASO 2 · ¿Asistirás? ----
     Si NO asiste, el resto de pasos se oculta (when) y se salta directo
     al resumen para enviar attending: false. */
  {
    id: 'asistencia',
    render(screen, { state, save, refresh }) {
      screen.appendChild(el('h2', 'wizard__title', '¿Podrás acompañarnos?'));
      screen.appendChild(el('p', 'wizard__hint', 'Nos encantaría contar contigo el 24 de octubre.'));

      const options = [
        { value: true, title: '¡Sí, allí estaré!', text: 'Cuenta conmigo (y con los míos).' },
        { value: false, title: 'No podré asistir', text: 'Me encantaría, pero no puedo.' },
      ];
      options.forEach((opt) => {
        const card = el('button', 'option-card');
        card.type = 'button';
        card.setAttribute('aria-pressed', String(state.attending === opt.value));
        card.appendChild(el('span', 'option-card__title', opt.title));
        card.appendChild(el('span', 'option-card__text', opt.text));
        card.addEventListener('click', () => { state.attending = opt.value; save(); refresh(); });
        screen.appendChild(card);
      });
    },
    validate(state) {
      return state.attending === null ? 'Dinos si podrás venir.' : null;
    },
  },

  /* ---- PASO 3 · Acompañantes ----
     Quien rellena YA cuenta como asistente (people[0], nombre del paso 1):
     aquí solo se añaden los demás. Las preguntas por persona posteriores
     se aplican a TODOS, incluido quien rellena. */
  {
    id: 'personas',
    when: (state) => state.attending === true,
    render(screen, { state, save, refresh }) {
      screen.appendChild(el('h2', 'wizard__title', '¿Quién te acompaña?'));
      screen.appendChild(el('p', 'wizard__hint', 'Tú ya estás en la lista. Añade solo a tus acompañantes; si vienes por tu cuenta, sigue adelante.'));

      // Quien rellena, como primera "fila" fija (no editable aquí)
      const you = el('p', 'people-editor__you');
      you.appendChild(el('span', 'people-editor__you-check', '✓'));
      you.appendChild(document.createTextNode(` ${state.filledBy.trim() || 'Tú'} (tú)`));
      screen.appendChild(you);

      const list = el('div', 'people-editor');
      // Solo los acompañantes: people[1] en adelante
      state.people.slice(1).forEach((person, i) => {
        const idx = i + 1; // índice real dentro de people[]
        const row = el('div', 'people-editor__row');
        const input = el('input', 'field__input');
        input.type = 'text';
        input.placeholder = `Nombre del acompañante ${i + 1}`;
        input.value = person.name;
        input.setAttribute('aria-label', `Nombre del acompañante ${i + 1}`);
        input.addEventListener('input', () => { person.name = input.value; save(); });
        row.appendChild(input);

        const rm = el('button', 'people-editor__remove', '✕');
        rm.type = 'button';
        rm.setAttribute('aria-label', `Eliminar al acompañante ${i + 1}`);
        rm.addEventListener('click', () => { state.people.splice(idx, 1); save(); refresh(); });
        row.appendChild(rm);
        list.appendChild(row);
      });
      screen.appendChild(list);

      const add = el('button', 'btn btn--ghost btn--block', '+ Añadir acompañante');
      add.type = 'button';
      add.addEventListener('click', () => {
        state.people.push(blankPerson());
        save();
        refresh();
        // Enfocar el nombre recién añadido
        const inputs = screen.querySelectorAll('.people-editor__row input');
        inputs[inputs.length - 1]?.focus();
      });
      screen.appendChild(add);
    },
    validate(state) {
      // Los acompañantes (si los hay) necesitan nombre; ir solo/a es válido
      return state.people.slice(1).some((p) => !p.name.trim())
        ? 'Cada acompañante necesita un nombre.'
        : null;
    },
  },

  /* ---- PASO 3 · Alergias e intolerancias (por persona) ---- */
  {
    id: 'alergias',
    when: (state) => state.attending === true,
    render(screen, { state, save }) {
      screen.appendChild(el('h2', 'wizard__title', 'Alergias e intolerancias'));
      screen.appendChild(el('p', 'wizard__hint', 'Queremos que todo el mundo coma tranquilo. Déjalo en blanco si no hay ninguna.'));
      state.people.forEach((person, idx) => {
        const block = personBlock(person, idx);
        block.appendChild(textField({
          label: 'Alergias o intolerancias',
          value: person.allergies,
          placeholder: 'Opcional (gluten, frutos secos…)',
          onInput: (v) => { person.allergies = v; save(); },
        }));
        screen.appendChild(block);
      });
    },
  },

  /* ---- PASO 4 · Menú especial (por persona) ---- */
  {
    id: 'menu',
    when: (state) => state.attending === true,
    render(screen, { state, save, refresh }) {
      screen.appendChild(el('h2', 'wizard__title', 'Menú especial'));
      screen.appendChild(el('p', 'wizard__hint', 'Si alguien necesita un menú distinto, cuéntanoslo aquí.'));
      state.people.forEach((person, idx) => {
        const block = personBlock(person, idx);
        block.appendChild(chipGroup({
          options: MENU_OPTIONS,
          value: person.menu,
          onSelect: (v) => { person.menu = v; save(); refresh(); },
        }));
        if (person.menu === 'otro') {
          block.appendChild(textField({
            label: '¿Cuál?',
            value: person.menuOther,
            placeholder: 'Especifica el menú',
            onInput: (v) => { person.menuOther = v; save(); },
          }));
        }
        screen.appendChild(block);
      });
    },
    validate(state) {
      const falta = state.people.find((p) => p.menu === 'otro' && !p.menuOther.trim());
      return falta ? `Especifica el menú de ${falta.name.trim() || 'cada persona'}.` : null;
    },
  },

  /* ---- PASO 5 · Autobús a la finca (por persona) ---- */
  {
    id: 'bus',
    when: (state) => state.attending === true,
    render(screen, { state, save, refresh }) {
      screen.appendChild(el('h2', 'wizard__title', 'Autobús a la finca'));
      screen.appendChild(el('p', 'wizard__hint', 'Habrá autobús entre Zaragoza y la finca, a la ida y a la vuelta.'));
      state.people.forEach((person, idx) => {
        const block = personBlock(person, idx);
        block.appendChild(yesNo({
          label: '¿Usará el autobús para IR a la finca?',
          value: person.busIda,
          onSelect: (v) => { person.busIda = v; save(); refresh(); },
        }));
        block.appendChild(yesNo({
          label: '¿Y para VOLVER de la finca?',
          value: person.busVuelta,
          onSelect: (v) => { person.busVuelta = v; save(); refresh(); },
        }));
        screen.appendChild(block);
      });
    },
    validate(state) {
      const falta = state.people.find((p) => p.busIda === null || p.busVuelta === null);
      return falta ? `Responde al autobús de ${falta.name.trim() || 'cada persona'} (ida y vuelta).` : null;
    },
  },

  /* ---- PASO 6 · Zapatos de recambio (por persona) ---- */
  {
    id: 'zapatos',
    when: (state) => state.attending === true,
    render(screen, { state, save, refresh }) {
      screen.appendChild(el('h2', 'wizard__title', 'Zapatos de recambio'));
      screen.appendChild(el('p', 'wizard__hint', 'Pensado sobre todo para ellas: nos encantaría ofrecer alpargatas para bailar cómodas hasta el final. 💃'));
      state.people.forEach((person, idx) => {
        const block = personBlock(person, idx);
        block.appendChild(yesNo({
          label: '¿Querrá zapatos de recambio?',
          value: person.needsShoes,
          onSelect: (v) => { person.needsShoes = v; save(); refresh(); },
        }));
        if (person.needsShoes === true) {
          block.appendChild(textField({
            label: 'Talla',
            value: person.shoeSize,
            placeholder: 'Ej.: 38',
            onInput: (v) => { person.shoeSize = v; save(); },
          }));
        }
        screen.appendChild(block);
      });
    },
    validate(state) {
      const sinResponder = state.people.find((p) => p.needsShoes === null);
      if (sinResponder) return `Responde a los zapatos de ${sinResponder.name.trim() || 'cada persona'}.`;
      const sinTalla = state.people.find((p) => p.needsShoes === true && !p.shoeSize.trim());
      return sinTalla ? `Indica la talla de ${sinTalla.name.trim() || 'cada persona'}.` : null;
    },
  },

  /* ---- PASO 7 · Origen: ¿de fuera o de Zaragoza? ---- */
  {
    id: 'origen',
    when: (state) => state.attending === true,
    render(screen, { state, save, refresh }) {
      screen.appendChild(el('h2', 'wizard__title', '¿Vienes de fuera?'));
      screen.appendChild(el('p', 'wizard__hint', 'Si vienes de fuera nos gustaría echarte una mano con el viaje.'));

      const options = [
        { value: 'fuera', title: 'Vengo de fuera', text: 'Me vendría bien ayuda con transporte y alojamiento.' },
        { value: 'zaragoza', title: 'Soy de Zaragoza', text: 'Controlo la ciudad, no necesito nada más.' },
      ];
      options.forEach((opt) => {
        const card = el('button', 'option-card');
        card.type = 'button';
        card.setAttribute('aria-pressed', String(state.origin === opt.value));
        card.appendChild(el('span', 'option-card__title', opt.title));
        card.appendChild(el('span', 'option-card__text', opt.text));
        card.addEventListener('click', () => { state.origin = opt.value; save(); refresh(); });
        screen.appendChild(card);
      });
    },
    validate(state) {
      return state.origin ? null : 'Elige una de las dos opciones.';
    },
  },

  /* ---- PASO 8 · Viaje de IDA (solo si viene de fuera) ---- */
  {
    id: 'ida',
    when: (state) => state.attending === true && state.origin === 'fuera',
    render(screen, { state, save, refresh }) {
      const ida = state.travel.ida;
      screen.appendChild(el('h2', 'wizard__title', 'Tu viaje de ida'));
      screen.appendChild(el('p', 'wizard__hint', 'Cuéntanos cómo llegarás a Zaragoza para poder organizarnos mejor.'));

      screen.appendChild(chipGroup({
        label: '¿Cómo vas a llegar a Zaragoza?',
        options: MODE_OPTIONS,
        value: ida.mode,
        onSelect: (v) => { ida.mode = v; save(); refresh(); },
      }));

      // "De dónde vienes" tiene sentido para todos, también para quien aún no
      // sabe cómo vendrá (nos ayuda a buscarle transporte desde su zona).
      screen.appendChild(textField({
        label: '¿De dónde vienes?',
        value: ida.from,
        placeholder: 'Madrid, Murcia…',
        onInput: (v) => { ida.from = v; save(); },
      }));

      if (ida.mode === 'buscando') {
        // Quien aún no lo sabe / busca transporte: no pedimos ni hora ni coche.
        screen.appendChild(el('p', 'wizard__hint',
          'Perfecto, lo dejamos anotado. Intentaremos ayudarte a cuadrar transporte con quien tenga plazas libres.'));
      } else if (ida.mode) {
        // Día y hora de llegada para TODOS los modos salvo "aún no lo sé".
        screen.appendChild(textField({
          label: 'Día de llegada',
          value: ida.arrivalDay,
          type: 'date',
          min: TRAVEL_DATE_MIN,
          max: TRAVEL_DATE_MAX,
          onInput: (v) => { ida.arrivalDay = v; save(); },
        }));
        screen.appendChild(textField({
          label: 'Hora aproximada de llegada',
          value: ida.arrivalTime,
          type: 'time',
          onInput: (v) => { ida.arrivalTime = v; save(); },
        }));
      }

      // Coche → ¿llevaría a alguien? Solo si dice que SÍ pedimos plazas y hora.
      if (ida.mode === 'coche') {
        screen.appendChild(yesNo({
          label: '¿Estarías dispuesto a llevar a algún invitado más en tu coche?',
          value: ida.canCarry,
          onSelect: (v) => { ida.canCarry = v; save(); refresh(); },
        }));

        if (ida.canCarry === true) {
          screen.appendChild(textField({
            label: '¿Cuántas plazas?',
            value: ida.seats,
            type: 'number',
            placeholder: 'Ej.: 2',
            onInput: (v) => { ida.seats = v; save(); },
          }));
          screen.appendChild(textField({
            label: '¿A qué hora sales?',
            value: ida.departTime,
            type: 'time',
            onInput: (v) => { ida.departTime = v; save(); },
          }));
        }
      }
    },
    validate(state) {
      return state.travel.ida.mode ? null : 'Dinos cómo vas a venir.';
    },
  },

  /* ---- PASO 9 · Viaje de VUELTA (solo si viene de fuera) ---- */
  {
    id: 'vuelta',
    when: (state) => state.attending === true && state.origin === 'fuera',
    render(screen, { state, save, refresh }) {
      const vuelta = state.travel.vuelta;
      screen.appendChild(el('h2', 'wizard__title', 'Tu viaje de vuelta'));
      screen.appendChild(el('p', 'wizard__hint', 'Para cuadrar despedidas (y algún viaje compartido).'));

      screen.appendChild(chipGroup({
        label: '¿Cómo te vas?',
        options: MODE_OPTIONS,
        value: vuelta.mode,
        onSelect: (v) => { vuelta.mode = v; save(); refresh(); },
      }));

      if (vuelta.mode === 'buscando') {
        screen.appendChild(el('p', 'wizard__hint',
          'Anotado. Intentaremos cuadrarte la vuelta con quien tenga sitio en el coche.'));
      } else if (vuelta.mode) {
        // Día y hora de salida para TODOS los modos salvo "aún no lo sé".
        screen.appendChild(textField({
          label: 'Día de salida',
          value: vuelta.day,
          type: 'date',
          min: TRAVEL_DATE_MIN,
          max: TRAVEL_DATE_MAX,
          onInput: (v) => { vuelta.day = v; save(); },
        }));
        screen.appendChild(textField({
          label: 'Hora aproximada de salida',
          value: vuelta.departTime,
          type: 'time',
          onInput: (v) => { vuelta.departTime = v; save(); },
        }));
      }

      // Coche → ¿plazas libres de vuelta? Igual que en la ida: si dice
      // que SÍ pedimos cuántas. La hora de salida ya se pregunta arriba
      // ("Hora aproximada de salida"): no se duplica.
      if (vuelta.mode === 'coche') {
        screen.appendChild(yesNo({
          label: '¿Estarías dispuesto a llevar a algún invitado más en tu coche?',
          value: vuelta.canCarry,
          onSelect: (v) => { vuelta.canCarry = v; save(); refresh(); },
        }));

        if (vuelta.canCarry === true) {
          screen.appendChild(textField({
            label: '¿Cuántas plazas?',
            value: vuelta.seats,
            type: 'number',
            placeholder: 'Ej.: 2',
            onInput: (v) => { vuelta.seats = v; save(); },
          }));
          screen.appendChild(el('p', 'wizard__hint',
            'Usaremos tu hora de salida de arriba para cuadrarte con quien busque vuelta. ¡Gracias!'));
        }
      }
    },
    validate(state) {
      return state.travel.vuelta.mode ? null : 'Dinos cómo te vas.';
    },
  },

  /* ---- PASO FINAL · Resumen y confirmación ---- */
  {
    id: 'resumen',
    isFinal: true,
    render(screen, { state }) {
      // --- Rama "no asisto": despedida cálida, sin más preguntas ---
      if (state.attending === false) {
        screen.appendChild(el('h2', 'wizard__title', 'Te echaremos de menos'));
        screen.appendChild(el('p', 'wizard__hint',
          `Qué pena no poder verte ese día, ${state.filledBy.trim().split(' ')[0]}. ` +
          'Gracias de corazón por avisarnos; brindaremos por ti.'));
        const summary = el('dl', 'summary');
        summary.appendChild(el('dt', 'summary__label', 'Respuesta'));
        summary.appendChild(el('dd', 'summary__value', `${state.filledBy.trim()} · No podrá asistir`));
        screen.appendChild(summary);
        screen.appendChild(el('p', 'wizard__closing', 'Un abrazo enorme. — María & Alberto ✿'));
        return;
      }

      screen.appendChild(el('h2', 'wizard__title', 'Un último vistazo'));
      screen.appendChild(el('p', 'wizard__hint', 'Revisa que esté todo bien y confirma. ¡Ya casi está!'));

      const summary = el('dl', 'summary');
      const row = (dt, dd) => {
        summary.appendChild(el('dt', 'summary__label', dt));
        summary.appendChild(el('dd', 'summary__value', dd));
      };

      row('Rellena', state.filledBy.trim());

      state.people.forEach((p) => {
        const partes = [];
        partes.push(MENU_LABELS[p.menu] + (p.menu === 'otro' && p.menuOther.trim() ? ` (${p.menuOther.trim()})` : ''));
        if (p.allergies.trim()) partes.push(`Alergias: ${p.allergies.trim()}`);
        partes.push(`Bus ida: ${p.busIda ? 'sí' : 'no'} · vuelta: ${p.busVuelta ? 'sí' : 'no'}`);
        partes.push(p.needsShoes ? `Zapatos de recambio: talla ${p.shoeSize.trim()}` : 'Sin zapatos de recambio');
        row(p.name.trim(), partes.join(' · '));
      });

      if (state.origin === 'zaragoza') {
        row('Origen', 'De Zaragoza, controla la ciudad');
      } else {
        const ida = state.travel.ida;
        const vuelta = state.travel.vuelta;
        const idaParts = [MODE_LABELS[ida.mode] || '—'];
        if (ida.from.trim()) idaParts.push(`desde ${ida.from.trim()}`);
        // Día y hora de llegada para todos los modos salvo "aún no lo sé"
        if (ida.mode && ida.mode !== 'buscando' && (ida.arrivalDay || ida.arrivalTime)) {
          const cuando = [ida.arrivalDay && formatDay(ida.arrivalDay), ida.arrivalTime && `~${ida.arrivalTime}`].filter(Boolean).join(' ');
          idaParts.push(`llegada ${cuando}`);
        }
        if (ida.mode === 'coche' && ida.canCarry === true) {
          idaParts.push(ida.seats ? `${ida.seats} plaza${Number(ida.seats) === 1 ? '' : 's'} libre${Number(ida.seats) === 1 ? '' : 's'}` : 'con plazas libres');
          if (ida.departTime) idaParts.push(`salida ~${ida.departTime}`);
        } else if (ida.mode === 'coche' && ida.canCarry === false) {
          idaParts.push('sin plazas libres');
        }
        row('Ida', idaParts.join(' · '));

        const vueltaParts = [MODE_LABELS[vuelta.mode] || '—'];
        if (vuelta.mode && vuelta.mode !== 'buscando' && (vuelta.day || vuelta.departTime)) {
          const cuando = [vuelta.day && formatDay(vuelta.day), vuelta.departTime && `~${vuelta.departTime}`].filter(Boolean).join(' ');
          vueltaParts.push(`salida ${cuando}`);
        }
        if (vuelta.mode === 'coche' && vuelta.canCarry === true) {
          vueltaParts.push(vuelta.seats ? `${vuelta.seats} plaza${Number(vuelta.seats) === 1 ? '' : 's'} libre${Number(vuelta.seats) === 1 ? '' : 's'}` : 'con plazas libres');
        } else if (vuelta.mode === 'coche' && vuelta.canCarry === false) {
          vueltaParts.push('sin plazas libres');
        }
        row('Vuelta', vueltaParts.join(' · '));
      }

      screen.appendChild(summary);
      screen.appendChild(el('p', 'wizard__closing', 'Gracias por tomarte este ratico. Nos hace muchísima ilusión contar contigo. — María & Alberto ✿'));
    },
  },
];

/* ---------------- Motor del asistente ---------------- */

export function initRsvp() {
  const wizard = document.getElementById('wizard');
  if (!wizard) return;

  const screen = document.getElementById('wizard-screen');
  const bar = document.getElementById('wizard-bar');
  const progress = wizard.querySelector('.wizard__progress');
  const count = document.getElementById('wizard-count');
  const backBtn = document.getElementById('wizard-back');
  const nextBtn = document.getElementById('wizard-next');
  const feedback = document.getElementById('wizard-feedback');

  let state = blankState();
  let stepId = STEPS[0].id;
  let sending = false;

  // --- Restaurar estado de sessionStorage (si hay una sesión a medias) ---
  try {
    const saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY));
    if (saved && saved.state && Array.isArray(saved.state.people)) {
      state = { ...blankState(), ...saved.state };
      state.people = saved.state.people.map((p) => ({ ...blankPerson(), ...p }));
      state.travel = {
        ida: { ...blankState().travel.ida, ...(saved.state.travel?.ida || {}) },
        vuelta: { ...blankState().travel.vuelta, ...(saved.state.travel?.vuelta || {}) },
      };
      if (STEPS.some((s) => s.id === saved.stepId)) stepId = saved.stepId;
      // people[0] es quien rellena: mantener el nombre sincronizado
      if (state.people.length === 0) state.people.push(blankPerson());
      state.people[0].name = state.filledBy;
    }
  } catch { /* respaldo corrupto o sessionStorage no disponible: se ignora */ }

  function save() {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ state, stepId }));
    } catch { /* sin sessionStorage (modo privado): la memoria JS basta */ }
  }

  /** Pasos visibles según el estado (p. ej. viaje solo si viene de fuera). */
  function visibleSteps() {
    return STEPS.filter((s) => !s.when || s.when(state));
  }

  function setFeedback(msg, type) {
    feedback.textContent = msg || '';
    feedback.classList.remove('is-ok', 'is-error');
    if (type) feedback.classList.add(type);
  }

  /** Pinta el paso actual y actualiza progreso y botones. */
  function render() {
    const steps = visibleSteps();
    let index = steps.findIndex((s) => s.id === stepId);
    if (index === -1) { index = 0; stepId = steps[0].id; }
    const step = steps[index];

    // Progreso (el paso actual cuenta como en curso)
    const pct = Math.round(((index + 1) / steps.length) * 100);
    bar.style.width = `${pct}%`;
    progress.setAttribute('aria-valuenow', String(pct));
    count.textContent = `Paso ${index + 1} de ${steps.length}`;

    // Pantalla
    screen.innerHTML = '';
    step.render(screen, { state, save, refresh: render });

    // Botones (en la rama "no asisto" el cierre no es una confirmación)
    backBtn.hidden = index === 0;
    nextBtn.textContent = step.isFinal
      ? (state.attending === false ? 'Enviar respuesta' : 'Confirmar asistencia')
      : 'Siguiente →';

    // Subir al inicio del asistente al cambiar de paso (móvil)
    setFeedback('');
  }

  function goTo(id) {
    stepId = id;
    save();
    render();
    wizard.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /* ---- Construcción del documento que se envía a Firestore ---- */
  function buildPayload() {
    // Si NO asiste, basta con quién responde y su negativa
    if (state.attending === false) {
      return { filledBy: state.filledBy.trim(), attending: false };
    }

    const payload = {
      filledBy: state.filledBy.trim(),
      attending: true,
      origin: state.origin,
      people: state.people.map((p) => ({
        name: p.name.trim(),
        allergies: p.allergies.trim(),
        menu: p.menu,
        menuOther: p.menu === 'otro' ? p.menuOther.trim() : '',
        busIda: p.busIda === true,
        busVuelta: p.busVuelta === true,
        needsShoes: p.needsShoes === true,
        shoeSize: p.needsShoes === true ? p.shoeSize.trim() : '',
      })),
    };
    // Los datos de viaje solo tienen sentido si viene de fuera
    if (state.origin === 'fuera') {
      const ida = state.travel.ida;
      const vuelta = state.travel.vuelta;
      const idaAsksArrival = ida.mode && ida.mode !== 'buscando';
      const idaOfrece = ida.mode === 'coche' && ida.canCarry === true;
      const vueltaAsks = vuelta.mode && vuelta.mode !== 'buscando';
      const vueltaOfrece = vuelta.mode === 'coche' && vuelta.canCarry === true;
      payload.travel = {
        ida: {
          mode: ida.mode,
          from: ida.from.trim(),
          arrivalDay: idaAsksArrival ? ida.arrivalDay : '',
          arrivalTime: idaAsksArrival ? ida.arrivalTime : '',
          canCarry: ida.mode === 'coche' ? ida.canCarry === true : null,
          // Plazas y hora de salida solo si ofrece coche (para cruzar con quien busca)
          seats: idaOfrece ? (parseInt(ida.seats, 10) || 0) : null,
          departTime: idaOfrece ? ida.departTime : '',
          // Bandera clara para el panel: quién necesita ayuda con el transporte
          seeking: ida.mode === 'buscando',
        },
        vuelta: {
          mode: vuelta.mode,
          // Día y hora de salida para todos los modos salvo "aún no lo sé"
          day: vueltaAsks ? vuelta.day : '',
          departTime: vueltaAsks ? vuelta.departTime : '',
          canCarry: vuelta.mode === 'coche' ? vuelta.canCarry === true : null,
          // Plazas solo si ofrece coche de vuelta; la hora de salida de
          // vuelta ya viaja en departTime (se pregunta para todos)
          seats: vueltaOfrece ? (parseInt(vuelta.seats, 10) || 0) : null,
          seeking: vuelta.mode === 'buscando',
        },
      };
    }
    return payload;
  }

  /** Pantalla de éxito: sustituye el asistente entero. */
  function renderSuccess() {
    const firstName = state.filledBy.trim().split(' ')[0];
    const n = state.people.length;
    const quien = n === 1 ? 'tu confirmación' : `vuestra confirmación (${n} personas)`;

    screen.innerHTML = '';
    const done = el('div', 'wizard-success');
    done.appendChild(el('p', 'wizard-success__icon', '✿'));
    done.appendChild(el('h2', 'wizard__title', `¡Gracias, ${firstName}!`));
    done.appendChild(el('p', 'wizard-success__text',
      state.attending === false
        ? 'Hemos recibido tu respuesta. Sentimos mucho que no puedas acompañarnos: te tendremos presente ese día.'
        : `Hemos recibido ${quien}. Nos hace muchísima ilusión que forméis parte de nuestro día. ¡Nos vemos el 24 de octubre!`));
    done.appendChild(el('p', 'wizard-success__names', 'María & Alberto'));
    const home = el('a', 'btn btn--ghost btn--block', '← Volver a la invitación');
    home.href = './index.html';
    done.appendChild(home);
    screen.appendChild(done);

    bar.style.width = '100%';
    progress.setAttribute('aria-valuenow', '100');
    count.textContent = state.attending === false ? 'Enviado' : 'Confirmado';
    backBtn.hidden = true;
    nextBtn.hidden = true;
    setFeedback('');
  }

  async function submit() {
    if (sending) return;
    sending = true;
    nextBtn.disabled = true;
    backBtn.disabled = true;
    setFeedback('Enviando…');
    try {
      await submitRsvp(buildPayload());
      // Limpiar el respaldo: la confirmación ya está enviada
      try { sessionStorage.removeItem(STORAGE_KEY); } catch { /* sin storage */ }
      renderSuccess();
    } catch (err) {
      console.error(err);
      setFeedback('No hemos podido enviar la confirmación. Inténtalo de nuevo.', 'is-error');
      nextBtn.disabled = false;
      backBtn.disabled = false;
    } finally {
      sending = false;
    }
  }

  /* ---- Navegación ---- */
  backBtn.addEventListener('click', () => {
    const steps = visibleSteps();
    const index = steps.findIndex((s) => s.id === stepId);
    if (index > 0) goTo(steps[index - 1].id);
  });

  nextBtn.addEventListener('click', () => {
    const steps = visibleSteps();
    const index = steps.findIndex((s) => s.id === stepId);
    const step = steps[index];

    // Validar el paso actual antes de avanzar
    const error = step.validate ? step.validate(state) : null;
    if (error) { setFeedback(error, 'is-error'); return; }

    if (step.isFinal) { submit(); return; }

    // OJO: recalcular los visibles DESPUÉS de validar (elegir "Zaragoza"
    // en el paso de origen oculta los pasos de viaje y salta al resumen).
    const nextSteps = visibleSteps();
    const nextIndex = nextSteps.findIndex((s) => s.id === stepId) + 1;
    if (nextIndex < nextSteps.length) goTo(nextSteps[nextIndex].id);
  });

  render();
}
