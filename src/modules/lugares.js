/* =================================================================
   NUESTROS LUGARES — ilustración interactiva sobre la acuarela.

   Marcadores pulsantes colocados sobre la imagen; al tocarlos se abre
   una tarjeta con el nombre del lugar y su historia.

   ============================================================
   ✏️  CÓMO EDITAR LOS LUGARES (textos y posiciones)
   ============================================================
   Todo se edita en el array LUGARES de aquí abajo. Cada lugar es:

     {
       id:     'un-identificador-corto',   // único, sin espacios
       x: 50,  // ← horizontal, en % sobre la imagen (0 = izquierda, 100 = derecha)
       y: 50,  // ← vertical,   en % sobre la imagen (0 = arriba,    100 = abajo)
       titulo: 'Nombre del lugar',
       texto:  'Explicación del lugar y su importancia para vosotros.',
     }

   · Para MOVER un punto: cambia x/y (son porcentajes, se mantienen
     alineados en cualquier tamaño de pantalla). Truco: abre la web,
     haz clic donde quieras el punto y ajusta a ojo en pasos de 1-2%.
   · Para AÑADIR un lugar: copia un bloque {...}, y cámbialo entero.
   · Para QUITARLO: borra su bloque.
   No hace falta tocar nada más: los marcadores se generan solos.
   ============================================================ */

export const LUGARES = [
  {
    id: 'catedral-murcia',
    x: 14, y: 30,
    titulo: 'Catedral de Murcia',
    texto: '[Aquí irá la explicación de este lugar y por qué es especial para nosotros.]',
  },
  {
    id: 'noria',
    x: 29, y: 28,
    titulo: 'La Noria',
    texto: '[Aquí irá la explicación de este lugar y por qué es especial para nosotros.]',
  },
  {
    id: 'casa',
    x: 56, y: 30,
    titulo: 'La casa',
    texto: '[Aquí irá la explicación de este lugar y por qué es especial para nosotros.]',
  },
  {
    id: 'pilar-zaragoza',
    x: 81, y: 38,
    titulo: 'Basílica del Pilar',
    texto: '[Aquí irá la explicación de este lugar y por qué es especial para nosotros.]',
  },
  {
    id: 'puente',
    x: 5, y: 58,
    titulo: 'El puente',
    texto: '[Aquí irá la explicación de este lugar y por qué es especial para nosotros.]',
  },
  {
    id: 'barca-limones',
    x: 9, y: 78,
    titulo: 'La barca y los limones',
    texto: '[Aquí irá la explicación de este lugar y por qué es especial para nosotros.]',
  },
];

/* ----------------------------------------------------------------
   Lógica (no hace falta tocarla para editar los lugares).
   ---------------------------------------------------------------- */

export function initLugares() {
  const frame = document.getElementById('places-frame');
  const card = document.getElementById('place-card');
  if (!frame || !card) return;

  const titleEl = card.querySelector('.place-card__title');
  const textEl = card.querySelector('.place-card__text');
  const closeBtn = card.querySelector('.place-card__close');

  let activeId = null;

  // --- Crear un marcador por lugar, posicionado en % sobre la imagen ---
  LUGARES.forEach((lugar) => {
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
      // Tocar el marcador ya abierto lo cierra (toggle)
      if (activeId === lugar.id) close();
      else open(lugar, btn);
    });
    frame.appendChild(btn);
  });

  function open(lugar, btn) {
    activeId = lugar.id;
    titleEl.textContent = lugar.titulo;
    textEl.textContent = lugar.texto;
    card.hidden = false;
    // Estado visual/ARIA de los marcadores
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

  // --- Cierres: X, tocar fuera y tecla Escape ---
  closeBtn.addEventListener('click', close);
  document.addEventListener('click', (e) => {
    if (activeId !== null && !card.contains(e.target)) close();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
  });
}
