/* =================================================================
   NUESTROS LUGARES — ilustración interactiva sobre la acuarela.

   Marcadores pulsantes colocados sobre la imagen; al tocarlos se abre
   una tarjeta con el nombre del lugar y su historia.

   ✏️ El CONTENIDO (títulos, textos y posiciones) ya NO vive aquí:
   se gestiona desde el panel privado /resultados → pestaña "Lugares",
   que guarda en la colección "lugares" de Firestore. Esta sección solo
   LEE. Si Firestore falla o está vacío, usa los lugares de ejemplo
   (SEED_LUGARES de lugares-data.js) para no quedarse en blanco.
   ================================================================= */

import { fetchLugares, SEED_LUGARES } from './lugares-data.js';

export function initLugares() {
  const frame = document.getElementById('places-frame');
  const card = document.getElementById('place-card');
  if (!frame || !card) return;

  const titleEl = card.querySelector('.place-card__title');
  const textEl = card.querySelector('.place-card__text');
  const closeBtn = card.querySelector('.place-card__close');

  let activeId = null;

  function open(lugar) {
    activeId = lugar.id;
    titleEl.textContent = lugar.titulo;
    textEl.textContent = lugar.texto;
    card.hidden = false;
    frame.querySelectorAll('.place-marker').forEach((m) => {
      const isActive = m.dataset.id === lugar.id;
      m.classList.toggle('is-active', isActive);
      m.setAttribute('aria-expanded', String(isActive));
    });
  }

  function close() {
    if (activeId === null) return;
    activeId = null;
    card.hidden = true;
    frame.querySelectorAll('.place-marker').forEach((m) => {
      m.classList.remove('is-active');
      m.setAttribute('aria-expanded', 'false');
    });
  }

  /** Pinta un marcador por lugar, posicionado en % sobre la imagen. */
  function renderMarkers(lugares) {
    lugares.forEach((lugar) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'place-marker';
      btn.style.left = `${lugar.x}%`;
      btn.style.top = `${lugar.y}%`;
      btn.dataset.id = lugar.id;
      btn.setAttribute('aria-label', lugar.titulo);
      btn.setAttribute('aria-expanded', 'false');
      btn.innerHTML = '<span class="place-marker__dot" aria-hidden="true"></span>';
      btn.addEventListener('click', (e) => {
        e.stopPropagation(); // que no lo capture el "cerrar al tocar fuera"
        if (activeId === lugar.id) close(); // re-tocar el abierto = cerrar
        else open(lugar);
      });
      frame.appendChild(btn);
    });
  }

  // --- Cierres: X, tocar fuera y tecla Escape ---
  closeBtn.addEventListener('click', close);
  document.addEventListener('click', (e) => {
    if (activeId !== null && !card.contains(e.target)) close();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
  });

  initArtViewer();

  // --- Cargar los lugares (Firestore → respaldo con los de ejemplo) ---
  fetchLugares()
    .then((lugares) => renderMarkers(lugares.length ? lugares : SEED_LUGARES))
    .catch((err) => {
      console.error('[Lugares] No se pudo leer Firestore, uso el respaldo:', err);
      renderMarkers(SEED_LUGARES);
    });
}

/* ---------------- Visor de la ilustración a pantalla completa ----------------
   "Ver la ilustración completa" abre la acuarela en un overlay oscuro con
   botones de cerrar y descargar. Se cierra con la X, tocando el fondo
   (fuera de la imagen) o con Escape. Mientras está abierto se bloquea el
   scroll de la página. */
function initArtViewer() {
  const openBtn = document.getElementById('art-open');
  const overlay = document.getElementById('art-overlay');
  if (!openBtn || !overlay) return;

  const closeBtn = document.getElementById('art-close');

  function openViewer() {
    overlay.hidden = false;
    document.body.style.overflow = 'hidden';
    closeBtn.focus();
  }

  function closeViewer() {
    if (overlay.hidden) return;
    overlay.hidden = true;
    document.body.style.overflow = '';
    openBtn.focus();
  }

  openBtn.addEventListener('click', openViewer);
  closeBtn.addEventListener('click', closeViewer);
  // Tocar el fondo cierra; tocar la imagen o los botones, no
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeViewer();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeViewer();
  });
}
