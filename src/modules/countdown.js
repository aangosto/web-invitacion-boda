/* =================================================================
   Cuenta atrás en tiempo real hasta el 24·10·2026 a las 12:30.
   ================================================================= */

// Fecha objetivo. Mes 9 = octubre (0-indexado). Hora local de España.
const TARGET = new Date(2026, 9, 24, 12, 30, 0).getTime();

export function initCountdown() {
  const root = document.getElementById('countdown');
  const done = document.getElementById('countdown-done');
  if (!root) return;

  const nums = {
    days: root.querySelector('[data-unit="days"]'),
    hours: root.querySelector('[data-unit="hours"]'),
    minutes: root.querySelector('[data-unit="minutes"]'),
    seconds: root.querySelector('[data-unit="seconds"]'),
  };

  const pad = (n) => String(n).padStart(2, '0');

  function tick() {
    const diff = TARGET - Date.now();

    if (diff <= 0) {
      root.hidden = true;
      done.hidden = false;
      return; // dejamos de actualizar
    }

    const totalSeconds = Math.floor(diff / 1000);
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    nums.days.textContent = days;
    nums.hours.textContent = pad(hours);
    nums.minutes.textContent = pad(minutes);
    nums.seconds.textContent = pad(seconds);

    requestAnimationFrame(() => setTimeout(tick, 1000));
  }

  tick();
}
