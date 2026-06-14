/* =================================================================
   Ranking en vivo: TOP 3 de cada equipo (Novia / Novio).
   Lee del ranking mediante watchRanking() y se redibuja en cada cambio.
   ================================================================= */

import { watchRanking } from './scores.js';

function top3(scores, team) {
  return scores
    .filter((s) => s.team === team)
    .sort((a, b) => b.points - a.points)
    .slice(0, 3);
}

function render(listEl, items) {
  if (!items.length) {
    listEl.innerHTML = '<li class="ranking__empty">Aún no hay puntuaciones</li>';
    return;
  }
  const medals = ['🥇', '🥈', '🥉'];
  listEl.innerHTML = items
    .map(
      (s, i) => `
      <li class="ranking__row">
        <span class="ranking__pos" aria-hidden="true">${medals[i] || i + 1}</span>
        <span class="ranking__name">${escapeHtml(s.name)}</span>
        <span class="ranking__pts">${s.points}</span>
      </li>`
    )
    .join('');
}

// Evita inyección de HTML al pintar nombres introducidos por el usuario.
function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}

export function initRanking() {
  const novia = document.getElementById('rank-novia');
  const novio = document.getElementById('rank-novio');
  if (!novia || !novio) return;

  watchRanking((scores) => {
    render(novia, top3(scores, 'novia'));
    render(novio, top3(scores, 'novio'));
  });
}
