/* =================================================================
   Reveals al scroll con IntersectionObserver (fade + leve translateY).
   Discreto y elegante: solo aparece una vez por elemento.
   ================================================================= */

export function initReveal() {
  const items = document.querySelectorAll('.reveal');
  if (!items.length) return;

  // Si no hay soporte (o reduced-motion ya lo neutraliza), mostrar todo.
  if (!('IntersectionObserver' in window)) {
    items.forEach((el) => el.classList.add('is-in'));
    return;
  }

  const observer = new IntersectionObserver(
    (entries, obs) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-in');
          obs.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.15, rootMargin: '0px 0px -8% 0px' }
  );

  items.forEach((el) => observer.observe(el));
}
