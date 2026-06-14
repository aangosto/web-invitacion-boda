/* =================================================================
   Navegación flotante transparente que aparece al hacer scroll
   y menú desplegable en móvil.
   ================================================================= */

export function initNav() {
  const nav = document.getElementById('floating-nav');
  const toggle = document.getElementById('nav-toggle');
  const links = document.getElementById('nav-links');
  if (!nav) return;

  // Mostrar la nav cuando se ha bajado más de medio viewport.
  const showThreshold = () => window.innerHeight * 0.6;
  let ticking = false;

  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      nav.classList.toggle('is-visible', window.scrollY > showThreshold());
      ticking = false;
    });
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // Menú móvil
  function closeMenu() {
    nav.classList.remove('nav-open');
    toggle.setAttribute('aria-expanded', 'false');
  }
  toggle.addEventListener('click', () => {
    const open = nav.classList.toggle('nav-open');
    toggle.setAttribute('aria-expanded', String(open));
  });
  links.addEventListener('click', (e) => {
    if (e.target.tagName === 'A') closeMenu();
  });
}
