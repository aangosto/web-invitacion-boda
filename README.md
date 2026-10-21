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
- **`resultados.html`** — PANEL PRIVADO de los novios (sin enlaces públicos,
  `noindex`): contraseña `VITE_RESULTS_PASSWORD` + `signInAnonymously()`.
  Pestañas: **Confirmaciones** (lista de rsvp con contadores) y **Lugares**
  (CRUD de los puntos de la ilustración; el punto se coloca tocando sobre
  la miniatura). Para añadir pestañas futuras: módulo `admin-*.js` + una
  entrada en el array `TABS` de `src/modules/panel.js`.
  Botón **Exportar PDF**: vuelco de todos los datos (invitados, alergias y
  menús, transporte, alpargatas, mesas, hotel sin importes y comentarios)
  generado en el cliente con jsPDF, cargado de forma lazy
  (`admin-export.js` → `export-datos.js` solo lectura → `export-pdf.js`).
  Prueba con datos sintéticos: `node scripts/test-pdf.mjs <carpeta>`.

- **`mesas.html`** — PRIVADA: reparto de invitados por mesas (colección
  **`mesas`**), por toque.
- **`plano.html`** — PRIVADA: plano del salón sobre la MISMA colección
  `mesas` (solo escribe forma, posición `x`/`y` en metros, `rot`, `icono`,
  orden de `asientos`, capacidad y `presidencial`; nunca los comensales).
  Medidas del salón en `plano/salon`. "Editar posición" pasa el plano a
  pantalla completa con `touch-action:none` (arrastrar no se pelea con el
  scroll). Dibujos de las mesas: **un solo sitio**,
  `src/modules/mesas-iconos.js` (copia el PNG a `public/` y pon su nombre).
  Pruebas de geometría: `node scripts/test-plano.mjs`.
  En el detalle de mesa: «Elegir asiento 1» (`asientoInicio`: solo cambia
  la numeración, nadie se mueve) e invitados ★ con nota (campos
  `estrella`/`nota` del comensal; se escriben con una transacción que no
  toca nada más). Cada ★ dice si queda de cara, de lado o de espaldas a la
  presidencial (mira al centro de su mesa; <60°, 60-120°, >120°). Pruebas:
  `node scripts/test-destacados.mjs`.
  Tipo y menú de cada comensal (`tipo`: '' adulto, niño/a, trona, hueco;
  `menu`: adulto, infantil, infantil reducido, sin menú), editables en
  mesas.html y en el detalle de mesa. Sin guardar se deducen (niño/a si lo
  es en invitados; infantil para niños y tronas). Un único recuento
  (`src/modules/comensal.js`) para mesas.html, el Excel de la finca y los
  dos PDF. Toda escritura de un comensal (preboda, ★, nota, tipo, menú) va
  en transacción (`guardaComensal`). Pruebas: `node scripts/test-menus.mjs`;
  con datos reales (solo lectura): `node scripts/recuento-real.mjs`.
  Reparto definitivo: `scripts/inspeccionar-mesas.mjs` (solo lectura) y
  `scripts/reconciliar-mesas.mjs` (idempotente) sobre
  `datos/mesas-banquete.txt` (no se sube al repo).

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
- **`lugares`** → `{ x: 0-100, y: 0-100, titulo, texto, orden }` (id = id del
  documento). Lectura pública (sección "Nuestros lugares" de la home);
  escritura solo autenticada + validación de forma (pestaña Lugares del panel).
- **`rsvp`** →
  ```
  { filledBy, attending: true|false,   // si false, solo filledBy+createdAt
    origin: 'fuera'|'zaragoza',
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
- `rsvp`: `create` permitido (para confirmar); **lectura solo autenticada**
  (`request.auth != null`), pensada para la página privada `/resultados`
  vía inicio de sesión anónimo. Los formularios contienen datos sensibles
  (alergias = salud).

## Ver las confirmaciones (RSVP)

Página privada **`/resultados.html`** (no enlazada; guárdate la URL):
contraseña → sesión anónima → lista de confirmaciones + contadores.
Para que funcione hace falta (una sola vez):

1. **Firebase console → Authentication → Método de acceso → Anónimo → Habilitar.**
2. **Republicar `firestore.rules`** (Firestore Database → Reglas → Publicar).
3. Definir **`VITE_RESULTS_PASSWORD`** en el `.env` y desplegar.

Nota: la contraseña va incrustada en el bundle (como todo `VITE_*`): disuade
al curioso, no es seguridad fuerte. Alternativa siempre disponible: consola
de Firebase → Firestore Database → colección `rsvp`.
