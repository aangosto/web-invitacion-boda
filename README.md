# Invitación de boda · María & Alberto · 24·10·2026

Web de invitación **multipágina**, mobile-first, con una secuencia de apertura
cinematográfica (el sobre se abre) como pieza central. Datos en **Firebase
(Firestore)**.

## Páginas

- **`index.html`** — invitación: apertura, cuenta atrás, historia, ceremonia,
  mapa y accesos a las otras dos páginas.
- **`cuestionario.html`** — confirmación (RSVP): **asistente por pasos** (wizard)
  multi-persona con progreso, Atrás/Siguiente y estado en sessionStorage.
  Escribe en la colección Firestore **`rsvp`**.
- **`juego.html`** — juego de cesta "Team novia / Team novio" + ranking en vivo
  (TOP 3 por equipo). Escribe/lee la colección **`scores`**.

## Arrancar el proyecto

```bash
npm install
npm run dev          # desarrollo
npm run dev -- --host  # accesible desde el móvil en la red local
npm run build        # build de producción (3 páginas) en dist/
npm run preview      # previsualizar el build
```

Requisitos: Node 18+. Sin `.env`, la web funciona en **modo local de respaldo**
(localStorage) para poder desarrollar sin credenciales.

## Configurar Firebase (lo haces tú)

1. Copia `.env.example` a **`.env`** y rellena los valores reales (consola de
   Firebase → ⚙ Configuración del proyecto → Tus apps → app web → Config).
   Las claves `VITE_FIREBASE_*` son identificadores **públicos** del proyecto,
   no secretos; la seguridad la dan las reglas.
2. Publica las reglas de **`firestore.rules`** en la consola: Firestore Database
   → pestaña **Reglas** → pega el contenido → **Publicar**.

## Estructura

```
index.html · cuestionario.html · juego.html
vite.config.js          # Vite multipágina (rollupOptions.input)
firestore.rules         # reglas de seguridad (publicar a mano en la consola)
.env.example            # nombres de las variables VITE_FIREBASE_*
src/
  main.js               # entrada index (apertura + secciones)
  cuestionario.js       # entrada cuestionario (RSVP)
  juego.js              # entrada juego (juego + ranking)
  firebase.js           # init Firebase desde import.meta.env
  style.css             # estilos
  modules/
    opening.js          # apertura: lazo.mp4 → fundido a trasera → apertura.mp4
    countdown.js        # cuenta atrás hasta el 24·10·2026 12:30
    nav.js · reveal.js · parallax.js · calendar.js
    rsvp.js             # asistente RSVP por pasos → colección 'rsvp'
    minigame.js         # juego de cesta (canvas)
    scores.js           # capa de datos del ranking → colección 'scores'
    ranking.js          # pinta el TOP 3 por equipo (en vivo)
public/                 # vídeos comprimidos, imágenes, favicon
```

## Modelo de datos (Firestore)

- **`scores`** → `{ name, team: 'novia'|'novio', points, createdAt }`
- **`rsvp`** →
  ```
  { filledBy, origin: 'fuera'|'zaragoza',
    people: [{ name, allergies, menu, menuOther,
               busIda, busVuelta, needsShoes, shoeSize }],
    travel: {                       // solo si origin === 'fuera'
      ida:    { mode: 'bus'|'ave'|'coche'|'otro', from,
                arrivalDay, arrivalTime,   // solo bus/ave
                canCarry },                // solo coche
      vuelta: { day, mode, canCarry },
    },
    createdAt }
  ```

> Nota: al añadir `origin` y `travel` hay que **volver a publicar**
> `firestore.rules` en la consola (la validación de campos cambió).

## Seguridad

- `scores`: lectura **pública** (el ranking se muestra en la web), solo `create`
  con validación; no editable ni borrable desde el cliente.
- `rsvp`: `create` permitido (para confirmar) pero **lectura DENEGADA** por
  completo desde el cliente. Los formularios contienen datos sensibles
  (alergias = salud) y **solo se consultan desde la consola de Firebase**.

## Ver las confirmaciones (RSVP)

La web **no** tiene página de resultados (a propósito). Para verlas:

1. Entra en la **consola de Firebase** → proyecto **web-invitacion-boda**.
2. Menú lateral → **Build → Firestore Database**.
3. Pestaña **Data** (Datos) → colección **`rsvp`** → cada documento es una
   confirmación.
4. **Exportar**: Firestore no exporta a CSV desde la consola. Opciones:
   - **Google Cloud console** → Firestore → *Import/Export* → *Export* a un
     bucket de Cloud Storage (export nativo).
   - O `gcloud firestore export gs://<bucket>` con la CLI.
   - Para CSV rápido, una pequeña Cloud Function / script con el Admin SDK.
