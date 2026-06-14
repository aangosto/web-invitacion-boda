/* =================================================================
   Parallax muy sutil en la acuarela del hero.
   Solo transform (no provoca layout). Se desactiva con reduced-motion.
   ================================================================= */

export function initParallax() {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced) return;

  const img = document.getElementById('hero-img');
  const hero = document.getElementById('hero');
  if (!img || !hero) return;

  let ticking = false;

  function update() {
    const rect = hero.getBoundingClientRect();
    // Solo mientras el hero está en pantalla
    if (rect.bottom < 0 || rect.top > window.innerHeight) {
      ticking = false;
      return;
    }
    // Desplazamiento muy contenido (máx ~24px)
    const shift = Math.max(-24, Math.min(0, rect.top * 0.08));
    img.style.transform = `translate3d(0, ${shift}px, 0) scale(1.06)`;
    ticking = false;
  }

  window.addEventListener('scroll', () => {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(update);
    }
  }, { passive: true });

  update();
}
