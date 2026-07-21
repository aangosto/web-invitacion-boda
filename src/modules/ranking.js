/* =================================================================
   Ranking en vivo: TOP 3 de cada equipo (Novia / Novio).
   Lee del ranking mediante watchRanking() y se redibuja en cada cambio.
   ================================================================= */

import { watchRanking } from './scores.js';

function top3(scores, team) {
  // Solo partidas CON nombre: las anónimas suman al marcador global
  // (renderGlobal) pero no aparecen en el Top 3.
  return scores
    .filter((s) => s.team === team && String(s.name || '').trim())
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

/** Marcador global: suma de TODOS los puntos de cada equipo, como barra
    repartida (topo = novia, burdeos = novio). Con 0-0 queda al 50%. */
function renderGlobal(scores) {
  const noviaEl = document.getElementById('global-novia');
  const novioEl = document.getElementById('global-novio');
  const fillNovia = document.getElementById('global-fill-novia');
  if (!noviaEl || !novioEl || !fillNovia) return;

  const sum = (team) => scores
    .filter((s) => s.team === team)
    .reduce((acc, s) => acc + (Number(s.points) || 0), 0);
  const novia = sum('novia');
  const novio = sum('novio');
  const total = novia + novio;

  noviaEl.textContent = String(novia);
  novioEl.textContent = String(novio);
  // Nunca al 0%: un mínimo del 6% deja siempre visible al que pierde
  const pct = total === 0 ? 50 : Math.min(94, Math.max(6, (novia / total) * 100));
  fillNovia.style.width = `${pct}%`;
}

export function initRanking() {
  const novia = document.getElementById('rank-novia');
  const novio = document.getElementById('rank-novio');
  if (!novia || !novio) return;

  watchRanking((scores) => {
    render(novia, top3(scores, 'novia'));
    render(novio, top3(scores, 'novio'));
    renderGlobal(scores);
  });
}
