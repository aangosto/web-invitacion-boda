/* =================================================================
   Panel → pestaña REGALO.
   Edita la frase y el IBAN de la sección pública "Regalo" (documento
   config/regalo). Guardar escribe en Firestore y se refleja en la home
   al momento (la home lo lee al cargar).
   ================================================================= */

import { fetchRegalo, saveRegalo } from './regalo-data.js';

export async function initRegaloTab(container) {
  container.innerHTML = `
    <p class="adm-hint">Esto es lo que se ve en la sección «Un detalle» de la
      portada. Los cambios aparecen la próxima vez que se cargue la web.</p>
    <label class="field">
      <span class="field__label">Frase</span>
      <textarea id="adm-regalo-frase" class="field__input adm-editor__textarea" maxlength="2000"
        placeholder="Una frase cálida sobre el regalo"></textarea>
    </label>
    <label class="field">
      <span class="field__label">Número de cuenta (IBAN)</span>
      <input id="adm-regalo-iban" class="field__input" type="text" maxlength="60"
        placeholder="ESXX XXXX XXXX XXXX XXXX XXXX" />
    </label>
    <label class="field">
      <span class="field__label">Titular de la cuenta</span>
      <input id="adm-regalo-titular" class="field__input" type="text" maxlength="120"
        placeholder="Nombre y apellidos (opcional)" />
    </label>
    <div class="adm-editor__actions">
      <button type="button" id="adm-regalo-save" class="btn btn--solid btn--block">Guardar</button>
    </div>
    <p id="adm-regalo-feedback" class="form-feedback" role="status" aria-live="polite"></p>
  `;

  const fraseEl = container.querySelector('#adm-regalo-frase');
  const ibanEl = container.querySelector('#adm-regalo-iban');
  const titularEl = container.querySelector('#adm-regalo-titular');
  const saveBtn = container.querySelector('#adm-regalo-save');
  const feedback = container.querySelector('#adm-regalo-feedback');

  function setFeedback(msg, type) {
    feedback.textContent = msg || '';
    feedback.classList.remove('is-ok', 'is-error');
    if (type) feedback.classList.add(type);
  }

  // Cargar los valores actuales
  const { frase, iban, titular } = await fetchRegalo();
  fraseEl.value = frase;
  ibanEl.value = iban;
  titularEl.value = titular;

  saveBtn.addEventListener('click', async () => {
    saveBtn.disabled = true;
    setFeedback('Guardando…');
    try {
      await saveRegalo({ frase: fraseEl.value, iban: ibanEl.value, titular: titularEl.value });
      setFeedback('Guardado ✓ (ya se ve en la portada)', 'is-ok');
    } catch (err) {
      console.error(err);
      setFeedback('No se ha podido guardar. Inténtalo de nuevo.', 'is-error');
    } finally {
      saveBtn.disabled = false;
    }
  });
}
