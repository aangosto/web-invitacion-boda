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
2. **Volteo CSS 3D** — el sobre gira (`rotateY` 0→180°) de `delante.jpeg` a
   `detras.jpeg`, con `backface-visibility`, leve arqueo (`scale` 1.06 en el
   punto medio) y una sombra que recorre el canto. ~1.9 s.
3. **`apertura.mp4`** — arranca desde su primer frame; reencuadrado con
   `object-fit: cover` + `object-position` para subir la acuarela.

Ambos vídeos se precargan (`preload="auto"` + `.load()`). Botón "Saltar intro"
siempre visible. Con `prefers-reduced-motion` se salta directo al contenido con
`acuarela.jpeg` fija.

## Pendiente (backend)

La captura de datos está **desacoplada**; falta conectar un backend real:

- **RSVP** → `submitRsvp(data)` en `src/modules/rsvp.js`. Hay un `TODO` con un
  ejemplo de Formspree usando `import.meta.env.VITE_RSVP_ENDPOINT` (configúralo
  en un archivo `.env`, sin hardcodear secretos).
- **Minijuego** → `submitVote(team)` en `src/modules/minigame.js`. Ahora mismo
  persiste en `localStorage` con una semilla de votos para que el medidor se vea
  vivo; sustituir por la llamada al mismo backend.
