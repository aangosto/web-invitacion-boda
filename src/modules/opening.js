/* =================================================================
   Secuencia de apertura — la pieza central.
   Encadena: Vídeo 1 (lazo) → FUNDIDO a la cara trasera → Vídeo 2.
   Sin rotación 3D: la trasera (detras.jpeg) aparece por fundido sobre
   el último frame congelado del Vídeo 1, lo que es más fiable y evita
   enganchar un frame que no corresponde.
   Cuidado especial en los cortes para que no haya parpadeo.
   ================================================================= */

const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Tiempos de la transición de la cara trasera (deben casar con el CSS).
const FADE_MS = 800; // duración del fundido (= transition de .opening__envelope)
const HOLD_MS = 250; // breve pausa antes de arrancar el Vídeo 2

export function initOpening({ onFinish } = {}) {
  const opening = document.getElementById('opening');
  const videoLazo = document.getElementById('video-lazo');
  const envelopeBack = document.getElementById('envelope-back');
  const videoApertura = document.getElementById('video-apertura');
  const skipBtn = document.getElementById('skip-intro');
  const content = document.getElementById('content');
  const body = document.body;

  let finished = false;

  // --- Finalizar: mostrar contenido y habilitar scroll ---
  function finish() {
    if (finished) return;
    finished = true;

    // Parar y liberar los vídeos
    try { videoLazo.pause(); videoApertura.pause(); } catch (_) {}

    content.hidden = false;
    opening.classList.add('is-finished');
    body.classList.remove('is-locked');

    // Quitar la capa de apertura del árbol tras la transición de salida
    setTimeout(() => { opening.style.display = 'none'; }, 700);

    if (typeof onFinish === 'function') onFinish();
  }

  // --- prefers-reduced-motion: saltar directo al contenido con acuarela fija ---
  if (REDUCED) {
    finish();
    return;
  }

  body.classList.add('is-locked');

  // --- Precarga explícita de los vídeos (la imagen trasera la precarga el navegador) ---
  videoLazo.load();
  videoApertura.load();

  // --- Parte 3: arrancar Vídeo 2 desde su primer frame ---
  function startApertura() {
    if (finished) return;
    videoApertura.currentTime = 0;
    videoApertura.classList.add('is-active');
    const play = videoApertura.play();
    if (play && play.catch) play.catch(() => {});
    // Ocultar las capas inferiores cuando el vídeo ya las cubre
    setTimeout(() => {
      envelopeBack.classList.remove('is-active');
      videoLazo.classList.remove('is-active');
    }, 360);
    videoApertura.addEventListener('ended', finish, { once: true });
  }

  // --- Parte 2: fundir la cara trasera sobre el último frame del Vídeo 1 ---
  function startBackFade() {
    // El Vídeo 1 queda congelado en su último frame (pausado al terminar),
    // visible por debajo. Fundimos encima la cara trasera (detras.jpeg).
    requestAnimationFrame(() => {
      requestAnimationFrame(() => envelopeBack.classList.add('is-active'));
    });
    // Al terminar el fundido (+ breve pausa) enlazamos con el Vídeo 2.
    setTimeout(startApertura, FADE_MS + HOLD_MS);
  }

  // --- Parte 1: reproducir Vídeo 1 ---
  function startLazo() {
    videoLazo.classList.add('is-active');
    videoLazo.addEventListener('ended', startBackFade, { once: true });
    const play = videoLazo.play();
    if (play && play.catch) {
      play.catch(() => showTapToStart());
    }
  }

  // --- Fallback: si el navegador bloquea el autoplay, arrancar al tocar ---
  let tapArmed = false;
  function showTapToStart() {
    if (tapArmed) return;
    tapArmed = true;
    opening.style.cursor = 'pointer';
    const onTap = () => {
      opening.removeEventListener('pointerdown', onTap);
      opening.style.cursor = '';
      videoLazo.play().catch(() => finish());
    };
    opening.addEventListener('pointerdown', onTap);
  }

  // --- Botón saltar intro ---
  skipBtn.addEventListener('click', finish);

  // Arrancar la secuencia
  startLazo();
}
