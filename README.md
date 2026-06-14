# Invitación de boda · María & Alberto · 24·10·2026

Web de invitación de una sola página, mobile-first, con una secuencia de
apertura cinematográfica (el sobre se abre) como pieza central.

## Arrancar el proyecto

```bash
npm install
npm run dev      # servidor de desarrollo (http://localhost:5173)
npm run build    # build de producción en dist/
npm run preview  # previsualizar el build
```

Requisitos: Node 18+.

## Estructura

```
índex.html              # marcado de todas las secciones
src/
  main.js               # punto de entrada; orquesta la carga
  style.css             # estilos (paleta, tipografías, animaciones)
  modules/
    opening.js          # secuencia de apertura: vídeo → volteo CSS → vídeo
    countdown.js        # cuenta atrás hasta el 24·10·2026 12:30
    nav.js              # navegación flotante + menú móvil
    reveal.js           # reveals al scroll (IntersectionObserver)
    parallax.js         # parallax sutil de la acuarela del hero
    rsvp.js             # formulario de confirmación (submitRsvp)
    minigame.js         # minijuego Team novio/novia (submitVote)
    calendar.js         # generación de .ics "añadir al calendario"
public/                 # assets servidos en la raíz
  lazo.mp4, apertura.mp4 (comprimidos, H.264 CRF 26, sin audio, faststart)
  delante.jpeg, detras.jpeg, acuarela.jpeg, favicon.svg
assets/                 # originales sin comprimir (no se sirven)
```

## La secuencia de apertura

Tres partes encadenadas sin cortes visibles (`src/modules/opening.js`):

1. **`lazo.mp4`** — autoplay muted playsinline, sin controles. Al terminar se
   congela en su último frame.
2. **Fundido a la cara trasera** — `detras.jpeg` (sello A&M) aparece por fundido
   (~0.8 s) sobre el último frame, con un levísimo asentado de escala. Sin
   rotación 3D (más fiable: evita enganchar un frame que no corresponde).
3. **`apertura.mp4`** — arranca desde su primer frame y enlaza con el fundido.

Las tres capas usan `object-fit: contain` con bandas de color papel, de modo
que en móvil vertical se ve el sobre completo sin necesidad de rotar. Los vídeos
se precargan (`preload="auto"` + `.load()`). Botón "Saltar intro" siempre
visible. Con `prefers-reduced-motion` se salta directo al contenido.

## Pendiente (backend)

La captura de datos está **desacoplada**; falta conectar un backend real:

- **RSVP** (multi-persona) → `submitRsvp({ filledBy, people: [...] })` en
  `src/modules/rsvp.js`. Cada persona lleva `{ name, bus, allergies, menu,
  menuOther }`. Hay un `TODO` con un ejemplo de Formspree usando
  `import.meta.env.VITE_RSVP_ENDPOINT` (configúralo en `.env`, sin secretos).
- **Minijuego** (juego de cesta) → `submitVote(team, points)` en
  `src/modules/minigame.js`. Suma la puntuación al contador global del equipo;
  ahora persiste en `localStorage` con una semilla para que el marcador se vea
  vivo. Sustituir por la llamada al mismo backend.
