/* =================================================================
   Minijuego "Team novio / Team novia" — JUEGO DE CESTA.
   El jugador elige equipo y mueve una cesta para atrapar los objetos
   que caen. Atrapar los de tu equipo suma; los del contrario restan.
   La caída acelera con el tiempo y aparecen boosters especiales.
   Al terminar, la puntuación se suma al contador global del equipo
   mediante submitVote(), desacoplado del backend (localStorage por ahora).
   ================================================================= */

const STORE_KEY = 'ma-team-score';

// Semilla de puntos para que el marcador global "respire" desde el principio.
// Cuando haya backend, estos números vendrán del servidor.
const SEED = { groom: 1240, bride: 1310 };

/* ---------------- Backend desacoplado ---------------- */
/**
 * Suma la puntuación obtenida al contador global del equipo.
 * TODO(backend): conectar con el servicio elegido (mismo backend que el RSVP).
 * @param {'groom'|'bride'} team
 * @param {number} points
 * @returns {Promise<{groom:number, bride:number}>} totales (con semilla)
 */
export async function submitVote(team, points = 0) {
  console.info('[Minijuego] (sin backend) equipo:', team, '+', points, 'pts');
  const local = readLocal();
  local[team] = (local[team] || 0) + Math.max(0, Math.round(points));
  writeLocal(local);
  await new Promise((r) => setTimeout(r, 200));
  return tallies();
}

function readLocal() {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY)) || { groom: 0, bride: 0 };
  } catch (_) {
    return { groom: 0, bride: 0 };
  }
}
function writeLocal(obj) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(obj)); } catch (_) {}
}
function tallies() {
  const local = readLocal();
  return { groom: SEED.groom + (local.groom || 0), bride: SEED.bride + (local.bride || 0) };
}

/* ---------------- Definición de objetos ---------------- */
// Objetos por equipo. Los boosters son neutrales (siempre conviene cogerlos).
const ITEMS = {
  lemon:  { team: 'bride', emoji: '🍋' },
  vermut: { team: 'groom', emoji: '🍸' },
  shield: { team: 'groom', shield: true }, // escudo Real Zaragoza (dibujado)
};
const BOOSTERS = {
  x2:     { emoji: '✖️', label: '×2 puntos', color: '#6e2435' },
  slow:   { emoji: '🐌', label: 'Caída lenta', color: '#6f7d62' },
  magnet: { emoji: '🧲', label: 'Imán', color: '#561a28' },
};

/* ---------------- Helpers de pantalla ---------------- */
function renderStandings(totals) {
  const total = totals.groom + totals.bride || 1;
  const g = Math.round((totals.groom / total) * 100);
  const b = 100 - g;
  document.querySelectorAll('[data-standings]').forEach((el) => {
    el.innerHTML = `
      <div class="meter__bar">
        <div class="meter__fill meter__fill--groom" style="width:${g}%"></div>
        <div class="meter__fill meter__fill--bride" style="width:${b}%"></div>
      </div>
      <div class="meter__legend">
        <span><b>${g}%</b> Team Novio</span>
        <span><b>${b}%</b> Team Novia</span>
      </div>`;
  });
}

export function initMinigame() {
  const root = document.getElementById('game');
  if (!root) return;

  const screenStart = document.getElementById('game-start');
  const screenPlay = document.getElementById('game-play');
  const screenOver = document.getElementById('game-over');
  const canvas = document.getElementById('game-canvas');
  const ctx = canvas.getContext('2d');

  const scoreEl = document.getElementById('game-score');
  const livesEl = document.getElementById('game-lives');
  const boosterEl = document.getElementById('game-booster');
  const overTeamEl = document.getElementById('game-over-team');
  const finalEl = document.getElementById('game-final');

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Marcador global inicial
  renderStandings(tallies());

  /* ---------- Estado del juego ---------- */
  let team = 'bride';
  let running = false;
  let raf = 0;
  let lastT = 0;
  let elapsed = 0;       // segundos jugados
  let spawnTimer = 0;
  let score = 0;
  let lives = 3;
  let objects = [];      // objetos cayendo
  let basket = { x: 0, w: 70 };
  let dragging = false;
  const effects = { x2: 0, slow: 0, magnet: 0 }; // segundos restantes

  // Dimensiones lógicas (CSS px). Se ajustan en resize().
  let W = 320, H = 440, dpr = 1;

  function resize() {
    const rect = canvas.getBoundingClientRect();
    W = rect.width || 320;
    H = rect.height || 440;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    basket.w = Math.max(60, Math.min(90, W * 0.2));
    basket.x = Math.min(Math.max(basket.x || W / 2, basket.w / 2), W - basket.w / 2);
  }

  /* ---------- Generación de objetos ---------- */
  function spawn() {
    // ~9% de probabilidad de booster a partir de los 4s
    const boosterChance = elapsed > 4 ? 0.09 : 0;
    let type, def, isBooster = false;
    if (Math.random() < boosterChance) {
      const keys = Object.keys(BOOSTERS);
      type = keys[(Math.random() * keys.length) | 0];
      def = BOOSTERS[type];
      isBooster = true;
    } else {
      const keys = Object.keys(ITEMS);
      type = keys[(Math.random() * keys.length) | 0];
      def = ITEMS[type];
    }
    const r = 20;
    objects.push({
      type, def, isBooster, r,
      x: r + Math.random() * (W - 2 * r),
      y: -r,
      rot: (Math.random() - 0.5) * 0.5,
    });
  }

  /* ---------- Dibujo ---------- */
  function drawShield(x, y, s) {
    // Escudo blanquillo del Real Zaragoza (estilizado): blanco con perfil azul.
    ctx.save();
    ctx.translate(x, y);
    ctx.beginPath();
    ctx.moveTo(-s, -s);
    ctx.lineTo(s, -s);
    ctx.lineTo(s, s * 0.35);
    ctx.quadraticCurveTo(s, s, 0, s * 1.15);
    ctx.quadraticCurveTo(-s, s, -s, s * 0.35);
    ctx.closePath();
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#1f3a6b';
    ctx.stroke();
    // Barra vertical azul + letra
    ctx.fillStyle = '#1f3a6b';
    ctx.fillRect(-s * 0.18, -s * 0.7, s * 0.36, s * 1.5);
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${Math.round(s)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Z', 0, s * 0.05);
    ctx.restore();
  }

  function drawBasket() {
    const x = basket.x, w = basket.w, y = H - 26, h = 30;
    ctx.save();
    // cuerpo
    ctx.beginPath();
    ctx.moveTo(x - w / 2, y);
    ctx.lineTo(x + w / 2, y);
    ctx.lineTo(x + w / 2 - 8, y + h);
    ctx.lineTo(x - w / 2 + 8, y + h);
    ctx.closePath();
    ctx.fillStyle = team === 'groom' ? '#6e2435' : '#6f7d62';
    ctx.fill();
    // borde superior
    ctx.fillStyle = team === 'groom' ? '#561a28' : '#5b6650';
    ctx.fillRect(x - w / 2 - 3, y - 7, w + 6, 9);
    // trama
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 1.5;
    for (let i = 1; i < 4; i++) {
      const xx = x - w / 2 + (w / 4) * i;
      ctx.beginPath(); ctx.moveTo(xx, y + 2); ctx.lineTo(xx - 3, y + h - 2); ctx.stroke();
    }
    ctx.restore();
  }

  function drawObject(o) {
    if (o.def.shield) {
      drawShield(o.x, o.y, o.r * 0.95);
      return;
    }
    if (o.isBooster) {
      // halo del booster
      ctx.save();
      ctx.beginPath();
      ctx.arc(o.x, o.y, o.r + 4, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(245,241,233,0.85)';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = o.def.color;
      ctx.stroke();
      ctx.restore();
    }
    ctx.save();
    ctx.translate(o.x, o.y);
    ctx.rotate(o.rot);
    ctx.font = `${o.r * 1.8}px serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(o.def.emoji, 0, 1);
    ctx.restore();
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    objects.forEach(drawObject);
    drawBasket();
  }

  /* ---------- Bucle ---------- */
  function step(t) {
    if (!running) return;
    if (!lastT) lastT = t;
    let dt = (t - lastT) / 1000;
    lastT = t;
    if (dt > 0.05) dt = 0.05; // evitar saltos si la pestaña se congela
    elapsed += dt;

    // Decaer efectos
    for (const k in effects) effects[k] = Math.max(0, effects[k] - dt);

    // Velocidad de caída: acelera con el tiempo (y se reduce con "slow")
    const slowF = effects.slow > 0 ? 0.5 : 1;
    const fallSpeed = (95 + elapsed * 9) * slowF;

    // Spawns: cada vez más frecuentes
    const spawnEvery = Math.max(0.45, 0.95 - elapsed * 0.012);
    spawnTimer += dt;
    if (spawnTimer >= spawnEvery) { spawnTimer = 0; spawn(); }

    const catchY = H - 30; // altura de la boca de la cesta
    for (let i = objects.length - 1; i >= 0; i--) {
      const o = objects[i];
      o.y += fallSpeed * dt;

      // Imán: atrae objetos de TU equipo hacia la cesta
      if (effects.magnet > 0 && !o.isBooster && o.def.team === team) {
        o.x += (basket.x - o.x) * Math.min(1, dt * 3);
      }

      // ¿Atrapado?
      if (o.y >= catchY && o.y <= catchY + 34 && Math.abs(o.x - basket.x) < basket.w / 2 + o.r * 0.6) {
        objects.splice(i, 1);
        onCatch(o);
        continue;
      }
      // ¿Caído fuera?
      if (o.y - o.r > H) {
        objects.splice(i, 1);
        // Fallar un objeto propio cuesta una vida
        if (!o.isBooster && o.def.team === team) loseLife();
      }
    }

    draw();
    raf = requestAnimationFrame(step);
  }

  function onCatch(o) {
    if (o.isBooster) {
      activateBooster(o.type);
      return;
    }
    if (o.def.team === team) {
      const mult = effects.x2 > 0 ? 2 : 1;
      score += 10 * mult;
      flash('+', o.x, o.y);
    } else {
      score = Math.max(0, score - 5); // objeto contrario: resta
      flash('-', o.x, o.y);
    }
    scoreEl.textContent = score;
  }

  // El marcador en vivo ya da feedback suficiente al atrapar.
  function flash() {}

  function activateBooster(type) {
    if (type === 'x2') effects.x2 = 6;
    if (type === 'slow') effects.slow = 5;
    if (type === 'magnet') effects.magnet = 5;
    updateBoosterHud();
  }
  function updateBoosterHud() {
    const active = Object.keys(effects).filter((k) => effects[k] > 0);
    if (!active.length) { boosterEl.textContent = ''; return; }
    boosterEl.textContent = active.map((k) => `${BOOSTERS[k].emoji} ${BOOSTERS[k].label}`).join('  ');
  }

  function loseLife() {
    lives -= 1;
    livesEl.textContent = '●'.repeat(Math.max(0, lives)) + '○'.repeat(Math.max(0, 3 - lives));
    if (lives <= 0) endGame();
  }

  // Refrescar el HUD de boosters periódicamente (para que desaparezca al caducar)
  let hudTimer = 0;

  /* ---------- Arranque / fin ---------- */
  function startGame() {
    score = 0; lives = 3; objects = []; elapsed = 0; spawnTimer = 0; lastT = 0;
    effects.x2 = effects.slow = effects.magnet = 0;
    scoreEl.textContent = '0';
    livesEl.textContent = '●●●';
    boosterEl.textContent = '';
    show(screenPlay);
    resize();
    basket.x = W / 2;
    running = true;
    raf = requestAnimationFrame(step);
    clearInterval(hudTimer);
    hudTimer = setInterval(updateBoosterHud, 500);
  }

  async function endGame() {
    running = false;
    cancelAnimationFrame(raf);
    clearInterval(hudTimer);
    overTeamEl.textContent = team === 'groom' ? 'Team Novio' : 'Team Novia';
    overTeamEl.style.color = team === 'groom' ? 'var(--burgundy)' : 'var(--sage-deep)';
    finalEl.textContent = score;
    show(screenOver);
    const totals = await submitVote(team, score);
    renderStandings(totals);
  }

  function show(screen) {
    [screenStart, screenPlay, screenOver].forEach((s) => (s.hidden = s !== screen));
  }

  /* ---------- Entrada (puntero + teclado) ---------- */
  function pointerX(e) {
    const rect = canvas.getBoundingClientRect();
    const cx = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
    return Math.min(Math.max(cx, basket.w / 2), W - basket.w / 2);
  }
  canvas.addEventListener('pointerdown', (e) => { dragging = true; basket.x = pointerX(e); e.preventDefault(); });
  canvas.addEventListener('pointermove', (e) => { if (dragging) { basket.x = pointerX(e); e.preventDefault(); } });
  window.addEventListener('pointerup', () => { dragging = false; });
  // Teclado (accesibilidad / escritorio)
  window.addEventListener('keydown', (e) => {
    if (!running) return;
    if (e.key === 'ArrowLeft') basket.x = Math.max(basket.w / 2, basket.x - 28);
    if (e.key === 'ArrowRight') basket.x = Math.min(W - basket.w / 2, basket.x + 28);
  });

  window.addEventListener('resize', () => { if (running) resize(); });

  /* ---------- Botones ---------- */
  root.querySelectorAll('.team-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      team = btn.dataset.team;
      startGame();
    });
  });
  document.getElementById('game-again').addEventListener('click', startGame);
  document.getElementById('game-switch').addEventListener('click', () => {
    renderStandings(tallies());
    show(screenStart);
  });
}
