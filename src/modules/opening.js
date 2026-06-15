/* =================================================================
   Secuencia de apertura — la pieza central.
   Encadena: Vídeo 1 (lazo) → VOLTEO CSS 3D → Vídeo 2 (apertura).
   El frente del volteo (sobre_frente.jpg) coincide con el último frame
   del lazo; el dorso (detras.jpeg) coincide con el primer frame del
   Vídeo 2. Cuidado en los cortes para que no haya parpadeo.
   ================================================================= */

const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function initOpening({ onFinish } = {}) {
  const opening = document.getElementById('opening');
  const videoLazo = document.getElementById('video-lazo');
  const scene = document.getElementById('flip-scene');
  const flipper = document.getElementById('flipper');
  const videoApertura = document.getElementById('video-apertura');
  const skipBtn = document.getElementById('skip-intro');
  const content = document.getElementById('content');
  const body = document.body;

  let finished = false;

  // --- Finalizar: mostrar contenido y habilitar scroll ---
  function finish() {
    if (finished) return;
    finished = true;

    try { videoLazo.pause(); videoApertura.pause(); } catch (_) {}

    content.hidden = false;
    opening.classList.add('is-finished');
    body.classList.remove('is-locked');

    // Quitar la capa de apertura del árbol tras la transición de salida
    setTimeout(() => { opening.style.display = 'none'; }, 700);

    if (typeof onFinish === 'function') onFinish();
  }

  // --- prefers-reduced-motion: saltar directo al contenido ---
  if (REDUCED) {
    finish();
    return;
  }

  body.classList.add('is-locked');

  // --- Precarga explícita de los vídeos (las imágenes del volteo ya están en
  //     el DOM y el navegador las carga al abrir la página). ---
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
      scene.classList.remove('is-active');
      videoLazo.classList.remove('is-active');
    }, 360);
    videoApertura.addEventListener('ended', finish, { once: true });
  }

  // --- Parte 2: ejecutar el VOLTEO cuando termina el Vídeo 1 ---
  function onFlipEnd(e) {
    // Ignorar animationend de sombras hijas que burbujean hasta el flipper.
    if (e.target !== flipper || e.animationName !== 'envelope-flip') return;
    flipper.removeEventListener('animationend', onFlipEnd);
    startApertura();
  }
  function startFlip() {
    // El Vídeo 1 queda congelado en su último frame (pausado al terminar),
    // visible por debajo. Mostramos la escena: el FRENTE coincide con ese
    // frame, así que el cambio es imperceptible.
    scene.classList.add('is-active');
    flipper.addEventListener('animationend', onFlipEnd);
    // En el frame siguiente lanzamos el giro.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => scene.classList.add('is-flipping'));
    });
  }

  // --- Parte 1: reproducir Vídeo 1 ---
  function startLazo() {
    videoLazo.classList.add('is-active');
    videoLazo.addEventListener('ended', startFlip, { once: true });
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
