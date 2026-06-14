/* =================================================================
   RSVP — formulario de confirmación.
   La lógica de envío está DESACOPLADA en submitRsvp(): cuando haya
   backend, solo hay que rellenar esa función (Formspree, Google Sheet,
   Apps Script…). No se hardcodean secretos.
   ================================================================= */

/**
 * Envía la confirmación al backend.
 * TODO(backend): conectar con el servicio elegido. Ejemplo con Formspree:
 *
 *   const ENDPOINT = import.meta.env.VITE_RSVP_ENDPOINT; // configúralo en .env
 *   const res = await fetch(ENDPOINT, {
 *     method: 'POST',
 *     headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
 *     body: JSON.stringify(data),
 *   });
 *   if (!res.ok) throw new Error('Error al enviar');
 *   return res.json();
 *
 * De momento simulamos un envío correcto para poder probar el flujo.
 * @param {Object} data  { name, attending, companions, allergies, song }
 * @returns {Promise<{ok: boolean}>}
 */
export async function submitRsvp(data) {
  console.info('[RSVP] (sin backend) datos capturados:', data);
  // Simulación de latencia de red. Reemplazar por la llamada real.
  await new Promise((r) => setTimeout(r, 600));
  return { ok: true };
}

export function initRsvp() {
  const form = document.getElementById('rsvp-form');
  if (!form) return;

  const pills = form.querySelectorAll('.pill');
  const attendingInput = form.querySelector('input[name="attending"]');
  const submitBtn = document.getElementById('rsvp-submit');
  const feedback = document.getElementById('rsvp-feedback');

  // Botones tipo "pill" para sí/no
  pills.forEach((pill) => {
    pill.addEventListener('click', () => {
      pills.forEach((p) => p.setAttribute('aria-pressed', 'false'));
      pill.setAttribute('aria-pressed', 'true');
      const value = pill.dataset.attend;
      attendingInput.value = value;
      // Mostrar/ocultar campos dependientes de la asistencia
      form.classList.toggle('show-yes', value === 'si');
    });
  });

  function setFeedback(msg, type) {
    feedback.textContent = msg;
    feedback.classList.remove('is-ok', 'is-error');
    if (type) feedback.classList.add(type);
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const fd = new FormData(form);
    const name = (fd.get('name') || '').toString().trim();
    const attending = (fd.get('attending') || '').toString();

    if (!name) {
      setFeedback('Por favor, dinos tu nombre.', 'is-error');
      form.querySelector('input[name="name"]').focus();
      return;
    }
    if (!attending) {
      setFeedback('Indícanos si podrás acompañarnos.', 'is-error');
      return;
    }

    const data = {
      name,
      attending,
      companions: attending === 'si' ? Number(fd.get('companions') || 0) : 0,
      allergies: attending === 'si' ? (fd.get('allergies') || '').toString().trim() : '',
      song: attending === 'si' ? (fd.get('song') || '').toString().trim() : '',
    };

    submitBtn.disabled = true;
    setFeedback('Enviando…', null);

    try {
      await submitRsvp(data);
      form.querySelectorAll('input, button').forEach((el) => (el.disabled = true));
      if (attending === 'si') {
        setFeedback(`¡Gracias, ${name.split(' ')[0]}! Nos hace mucha ilusión que vengas. ✿`, 'is-ok');
      } else {
        setFeedback(`Gracias por avisarnos, ${name.split(' ')[0]}. Te echaremos de menos. ✿`, 'is-ok');
      }
    } catch (err) {
      console.error(err);
      submitBtn.disabled = false;
      setFeedback('No hemos podido enviar tu confirmación. Inténtalo de nuevo.', 'is-error');
    }
  });
}
