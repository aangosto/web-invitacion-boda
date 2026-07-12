/* =================================================================
   Sección pública "Regalo": muestra la frase y el IBAN leídos de
   Firestore (config/regalo) y ofrece copiar el número al portapapeles.
   Si la lectura falla, usa el respaldo para no quedarse en blanco.
   ================================================================= */

import { fetchRegalo, DEFAULT_REGALO } from './regalo-data.js';

export function initRegalo() {
  const fraseEl = document.getElementById('gift-frase');
  const ibanEl = document.getElementById('gift-iban');
  if (!fraseEl || !ibanEl) return;

  const copyBtn = document.getElementById('gift-copy');
  const copied = document.getElementById('gift-copied');
  const titularEl = document.getElementById('gift-titular');

  function paint({ frase, iban, titular }) {
    fraseEl.textContent = frase;
    ibanEl.textContent = iban;

    // Titular: informativo y opcional; si está vacío no se muestra
    if (titularEl) {
      const t = (titular || '').trim();
      titularEl.textContent = t;
      titularEl.hidden = !t;
    }

    // Botón copiar: solo si el navegador soporta el portapapeles
    if (navigator.clipboard && iban) {
      copyBtn.hidden = false;
      copyBtn.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(iban);
          copied.textContent = '¡Copiado!';
        } catch {
          copied.textContent = 'No se pudo copiar';
        }
        setTimeout(() => { copied.textContent = ''; }, 2000);
      }, { once: false });
    }
  }

  fetchRegalo()
    .then(paint)
    .catch((err) => {
      console.error('[Regalo] No se pudo leer Firestore, uso el respaldo:', err);
      paint(DEFAULT_REGALO);
    });
}
