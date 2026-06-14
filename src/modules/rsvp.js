/* =================================================================
   RSVP — formulario de confirmación MULTI-PERSONA (modo demo).
   Quien rellena indica su nombre y añade tantas personas como quiera
   (hijos, familia, acompañantes…). Cada persona es una tarjeta plegable
   con sus propios campos (bus, alergias, menú).
   La lógica de envío está DESACOPLADA en submitRsvp(): cuando haya
   backend, solo hay que rellenar esa función. No se hardcodean secretos.
   ================================================================= */

import { db, isConfigured } from '../firebase.js';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

/**
 * Envía la confirmación a Firestore (colección "rsvp").
 * Estos datos contienen información sensible (nombres, alergias=salud, menús):
 * las reglas de Firestore permiten CREAR pero DENIEGAN la lectura desde el
 * cliente; el organizador los consulta desde la consola de Firebase.
 * Si Firebase no está configurado, se simula el envío (modo desarrollo).
 * @param {Object} data  { filledBy, people: [{name, bus, allergies, menu, menuOther}] }
 * @returns {Promise<{ok: boolean}>}
 */
export async function submitRsvp(data) {
  if (isConfigured) {
    await addDoc(collection(db, 'rsvp'), {
      filledBy: data.filledBy,
      people: data.people,
      createdAt: serverTimestamp(),
    });
    return { ok: true };
  }
  console.info('[RSVP] (sin Firebase) datos capturados:', data);
  await new Promise((r) => setTimeout(r, 600));
  return { ok: true };
}

const BUS_OPTIONS = [
  { value: 'no', label: 'No' },
  { value: 'ida', label: 'Solo ida' },
  { value: 'vuelta', label: 'Solo vuelta' },
  { value: 'ambos', label: 'Ida y vuelta' },
];
const MENU_OPTIONS = [
  { value: 'ninguno', label: 'Ninguno' },
  { value: 'vegetariano', label: 'Vegetariano' },
  { value: 'vegano', label: 'Vegano' },
  { value: 'otro', label: 'Otro' },
];

export function initRsvp() {
  const form = document.getElementById('rsvp-form');
  if (!form) return;

  const list = document.getElementById('people-list');
  const addBtn = document.getElementById('add-person');
  const submitBtn = document.getElementById('rsvp-submit');
  const feedback = document.getElementById('rsvp-feedback');
  const filledByInput = form.querySelector('input[name="filledBy"]');

  let counter = 0; // nº de personas creadas (para títulos por defecto)

  // ---- Construye un grupo de "chips" (selección única tipo radio) ----
  function buildChips(field, options, selected) {
    const wrap = document.createElement('div');
    wrap.className = 'chips';
    wrap.dataset.field = field;
    wrap.setAttribute('role', 'radiogroup');
    options.forEach((opt) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip';
      b.dataset.value = opt.value;
      b.textContent = opt.label;
      b.setAttribute('aria-pressed', String(opt.value === selected));
      wrap.appendChild(b);
    });
    return wrap;
  }

  function getChipValue(card, field) {
    const active = card.querySelector(`.chips[data-field="${field}"] .chip[aria-pressed="true"]`);
    return active ? active.dataset.value : '';
  }

  // ---- Crea una tarjeta de persona ----
  function addPerson() {
    counter += 1;
    const idx = counter;

    const card = document.createElement('div');
    card.className = 'person-card';

    // Cabecera: nombre/resumen + plegar + eliminar
    const head = document.createElement('div');
    head.className = 'person-card__head';
    head.innerHTML = `
      <button type="button" class="person-card__toggle" aria-expanded="true">
        <span class="person-card__name">Persona ${idx}</span>
        <span class="person-card__chev" aria-hidden="true">▾</span>
      </button>
      <button type="button" class="person-card__remove" aria-label="Eliminar esta persona">✕</button>
    `;

    // Cuerpo: campos de la persona
    const body = document.createElement('div');
    body.className = 'person-card__body';

    // Nombre
    const nameField = document.createElement('label');
    nameField.className = 'field';
    nameField.innerHTML = `<span class="field__label">Nombre</span>`;
    const nameInput = document.createElement('input');
    nameInput.className = 'field__input';
    nameInput.type = 'text';
    nameInput.dataset.field = 'name';
    nameInput.placeholder = 'Nombre de la persona';
    nameField.appendChild(nameInput);

    // Bus
    const busField = document.createElement('fieldset');
    busField.className = 'field';
    busField.innerHTML = `<legend class="field__label">¿Usará el autobús a la finca?</legend>`;
    busField.appendChild(buildChips('bus', BUS_OPTIONS, 'no'));

    // Alergias
    const allergyField = document.createElement('label');
    allergyField.className = 'field';
    allergyField.innerHTML = `<span class="field__label">Alergias o intolerancias</span>`;
    const allergyInput = document.createElement('input');
    allergyInput.className = 'field__input';
    allergyInput.type = 'text';
    allergyInput.dataset.field = 'allergies';
    allergyInput.placeholder = 'Opcional';
    allergyField.appendChild(allergyInput);

    // Menú
    const menuField = document.createElement('fieldset');
    menuField.className = 'field';
    menuField.innerHTML = `<legend class="field__label">Menú especial</legend>`;
    menuField.appendChild(buildChips('menu', MENU_OPTIONS, 'ninguno'));
    const menuOther = document.createElement('input');
    menuOther.className = 'field__input person-card__menu-other';
    menuOther.type = 'text';
    menuOther.dataset.field = 'menuOther';
    menuOther.placeholder = 'Especifica el menú';
    menuOther.hidden = true;
    menuField.appendChild(menuOther);

    body.append(nameField, busField, allergyField, menuField);
    card.append(head, body);
    list.appendChild(card);

    // --- Interacciones de la tarjeta ---
    const nameLabel = head.querySelector('.person-card__name');
    const toggle = head.querySelector('.person-card__toggle');
    const remove = head.querySelector('.person-card__remove');

    // El título refleja el nombre escrito
    nameInput.addEventListener('input', () => {
      nameLabel.textContent = nameInput.value.trim() || `Persona ${idx}`;
    });

    // Plegar / desplegar
    toggle.addEventListener('click', () => {
      const collapsed = card.classList.toggle('is-collapsed');
      toggle.setAttribute('aria-expanded', String(!collapsed));
    });

    // Eliminar
    remove.addEventListener('click', () => {
      card.classList.add('is-removing');
      setTimeout(() => card.remove(), 200);
    });

    // Chips (selección única por grupo)
    card.querySelectorAll('.chips').forEach((group) => {
      group.addEventListener('click', (e) => {
        const chip = e.target.closest('.chip');
        if (!chip) return;
        group.querySelectorAll('.chip').forEach((c) => c.setAttribute('aria-pressed', 'false'));
        chip.setAttribute('aria-pressed', 'true');
        // Mostrar el campo "Otro" del menú cuando proceda
        if (group.dataset.field === 'menu') {
          menuOther.hidden = chip.dataset.value !== 'otro';
        }
      });
    });

    // Enfocar el nombre al añadir
    nameInput.focus();
    return card;
  }

  // ---- Lectura de datos al enviar ----
  function collectPeople() {
    return Array.from(list.querySelectorAll('.person-card')).map((card) => {
      const menu = getChipValue(card, 'menu');
      return {
        name: card.querySelector('[data-field="name"]').value.trim(),
        bus: getChipValue(card, 'bus'),
        allergies: card.querySelector('[data-field="allergies"]').value.trim(),
        menu,
        menuOther: menu === 'otro' ? card.querySelector('[data-field="menuOther"]').value.trim() : '',
      };
    });
  }

  function setFeedback(msg, type) {
    feedback.textContent = msg;
    feedback.classList.remove('is-ok', 'is-error');
    if (type) feedback.classList.add(type);
  }

  // ---- Eventos ----
  addBtn.addEventListener('click', addPerson);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const filledBy = filledByInput.value.trim();
    if (!filledBy) {
      setFeedback('Dinos quién rellena la confirmación.', 'is-error');
      filledByInput.focus();
      return;
    }

    const people = collectPeople();
    if (people.length === 0) {
      setFeedback('Añade al menos una persona con el botón "+ Añadir persona".', 'is-error');
      return;
    }
    if (people.some((p) => !p.name)) {
      setFeedback('Cada persona necesita un nombre.', 'is-error');
      return;
    }

    const data = { filledBy, people };

    submitBtn.disabled = true;
    addBtn.disabled = true;
    setFeedback('Enviando…', null);

    try {
      await submitRsvp(data);
      // Bloquear el formulario tras confirmar
      form.querySelectorAll('input, button').forEach((el) => (el.disabled = true));
      const firstName = filledBy.split(' ')[0];
      const n = people.length;
      const quien = n === 1 ? '1 persona' : `${n} personas`;
      setFeedback(
        `¡Gracias, ${firstName}! Hemos recibido vuestra confirmación (${quien}). ` +
        `Nos hace muchísima ilusión que forméis parte de nuestro día. — María & Alberto ✿`,
        'is-ok'
      );
    } catch (err) {
      console.error(err);
      submitBtn.disabled = false;
      addBtn.disabled = false;
      setFeedback('No hemos podido enviar la confirmación. Inténtalo de nuevo.', 'is-error');
    }
  });

  // Empezar con una persona ya visible
  addPerson();
}
