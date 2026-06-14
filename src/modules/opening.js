/* =================================================================
   Secuencia de apertura — la pieza central.
   Encadena: Vídeo 1 (lazo) → volteo CSS 3D → Vídeo 2 (apertura).
   Cuidado especial en los cortes vídeo→código→vídeo (sin parpadeo).
   ================================================================= */

const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function initOpening({ onFinish } = {}) {
  const opening = document.getElementById('opening');
  const videoLazo = document.getElementById('video-lazo');
  const flipStage = document.getElementById('flip-stage');
  const flipCard = document.getElementById('flip-card');
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
    // No bloqueamos el scroll; mostramos el contenido directamente.
    finish();
    return;
  }

  body.classList.add('is-locked');

  // --- Precarga explícita de ambos vídeos (refuerza el <link rel=preload>) ---
  videoLazo.load();
  videoApertura.load();

  // --- Parte 3: arrancar Vídeo 2 desde su primer frame ---
  function startApertura() {
    videoApertura.currentTime = 0;
    videoApertura.classList.add('is-active');
    // El volteo deja de ser necesario una vez el vídeo cubre la pantalla
    const play = videoApertura.play();
    if (play && play.catch) play.catch(() => {});
    // Ocultamos las capas inferiores cuando el vídeo ya está encima
    setTimeout(() => {
      flipStage.classList.remove('is-active');
      videoLazo.classList.remove('is-active');
    }, 360);
    videoApertura.addEventListener('ended', finish, { once: true });
  }

  // --- Parte 2: ejecutar el volteo CSS cuando termina el Vídeo 1 ---
  function startFlip() {
    // El Vídeo 1 queda congelado en su último frame por debajo.
    // Mostramos la tarjeta (cara delantera) que coincide con ese frame.
    flipStage.classList.add('is-active');
    // En el frame siguiente, lanzamos la animación de giro.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => flipCard.classList.add('is-flipping'));
    });
    flipCard.addEventListener('animationend', startApertura, { once: true });
  }

  // --- Parte 1: reproducir Vídeo 1 ---
  function startLazo() {
    videoLazo.classList.add('is-active');
    videoLazo.addEventListener('ended', startFlip, { once: true });
    const play = videoLazo.play();
    if (play && play.catch) {
      play.catch(() => {
        // Autoplay bloqueado: ofrecer arranque por toque.
        showTapToStart();
      });
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
