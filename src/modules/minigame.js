/* =================================================================
   Minijuego "Team novia / Team novio" — JUEGO DE CESTA.
   El jugador elige equipo y mueve una cesta para atrapar los objetos
   que caen. Atrapar los de tu equipo suma; los del contrario restan.
   La caída acelera con el tiempo y aparecen boosters especiales.
   Al terminar, el jugador pone su nombre y guarda la puntuación en el
   ranking (saveScore, desacoplado del backend en src/modules/scores.js).
   ================================================================= */

import { saveScore } from './scores.js';
import { logAudit } from './audit.js';

/* ---------------- Definición de objetos ---------------- */
// Objetos por equipo, con su sprite PNG (transparencia real) en public/.
// Si el sprite no carga, se dibuja el respaldo: círculo de color + emoji.
export const ITEMS = {
  limon:    { team: 'novia', name: 'Limón',              img: '/nov_limon.png',    emoji: '🍋', color: '#e7cf6a' },
  espeto:   { team: 'novia', name: 'Espeto',             img: '/nov_espeto.png',   emoji: '🐟', color: '#8a7b64' },
  biznaga:  { team: 'novia', name: 'Biznaga',            img: '/nov_biznaga.png',  emoji: '💮', color: '#efece3' },
  marinera: { team: 'novia', name: 'Marinera',           img: '/nov_marinera.png', emoji: '🥖', color: '#d9a05b' },
  vermut:   { team: 'novio', name: 'Vermut',             img: '/nio_vermut.png',   emoji: '🍸', color: '#6e2435' },
  ternasco: { team: 'novio', name: 'Ternasco',           img: '/nio_ternasco.png', emoji: '🍗', color: '#b0713a' },
  cartas:   { team: 'novio', name: 'Cartas',             img: '/nio_cartas.png',   emoji: '🃏', color: '#f5f1e9' },
  escudo:   { team: 'novio', name: 'Escudo del Zaragoza', img: '/nio_escudo.png',  emoji: '🛡️', color: '#1f3a6b' },
};
export const BOOSTERS = {
  // El x2 se dibuja como TEXTO "×2" (no emoji): con la ✖️ parecía una
  // penalización. `text` tiene prioridad sobre `emoji` al dibujar.
  x2:     { text: '×2', emoji: '×2', label: '×2 puntos', color: '#6e2435' },
  slow:   { emoji: '🐌', label: 'Caída lenta', color: '#7a6b54' }, // topo (--taupe-deep)
  magnet: { emoji: '🧲', label: 'Imán', color: '#561a28' },
};

// Precarga de sprites: solo los cargados se usan al dibujar (fallback si no).
const sprites = {};
Object.entries(ITEMS).forEach(([key, def]) => {
  const img = new Image();
  img.onload = () => { sprites[key] = img; };
  img.src = def.img;
});

export function initMinigame() {
  const root = document.getElementById('game');
  if (!root) return;

  const screenStart = document.getElementById('game-start');
  const screenHelp = document.getElementById('game-help');
  const screenPlay = document.getElementById('game-play');
  const screenOver = document.getElementById('game-over');
  const canvas = document.getElementById('game-canvas');
  const ctx = canvas.getContext('2d');

  const scoreEl = document.getElementById('game-score');
  const livesEl = document.getElementById('game-lives');
  const boosterEl = document.getElementById('game-booster');
  const overTeamEl = document.getElementById('game-over-team');
  const finalEl = document.getElementById('game-final');
  const nameInput = document.getElementById('game-name');
  const saveBtn = document.getElementById('game-save');
  const saveFeedback = document.getElementById('game-save-feedback');

  /* ---------- Estado del juego ---------- */
  let team = 'novia';
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

  /* Altura REAL visible del móvil → --game-vh. En Safari iOS 100vh incluye
     las barras del navegador y el canvas quedaría cortado por arriba;
     visualViewport.height (o innerHeight) mide solo lo visible. Se
     re-mide si las barras aparecen/desaparecen o al girar el móvil. */
  function syncViewport() {
    const h = window.visualViewport ? window.visualViewport.height : window.innerHeight;
    document.documentElement.style.setProperty('--game-vh', `${Math.round(h)}px`);
    if (running) resize();
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
    // burdeos (novio) / topo (novia), a juego con la paleta de la web
    ctx.fillStyle = team === 'novio' ? '#6e2435' : '#7a6b54';
    ctx.fill();
    // borde superior
    ctx.fillStyle = team === 'novio' ? '#561a28' : '#655741';
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
    if (o.isBooster) {
      // Los boosters se dibujan SIN rotar (legibles): halo + símbolo
      ctx.save();
      ctx.beginPath();
      ctx.arc(o.x, o.y, o.r + 4, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(245,241,233,0.85)';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = o.def.color;
      ctx.stroke();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      if (o.def.text) {
        // "×2" en grande y burdeos: claramente un bonus, no un aspa
        ctx.font = `700 ${Math.round(o.r * 1.5)}px Jost, system-ui, sans-serif`;
        ctx.fillStyle = o.def.color;
        ctx.fillText(o.def.text, o.x, o.y + 1);
      } else {
        ctx.font = `${o.r * 1.8}px serif`;
        ctx.fillText(o.def.emoji, o.x, o.y + 1);
      }
      ctx.restore();
      return;
    }

    ctx.save();
    ctx.translate(o.x, o.y);
    ctx.rotate(o.rot);

    // Sprite del artículo (tamaño uniforme para todos)
    const img = !o.isBooster && sprites[o.type];
    if (img) {
      const s = o.r * 2.6; // caja de dibujo (los PNG vienen ya cuadrados)
      ctx.drawImage(img, -s / 2, -s / 2, s, s);
    } else {
      // Respaldo si el sprite no ha cargado: círculo de color + emoji
      if (!o.isBooster) {
        ctx.beginPath();
        ctx.arc(0, 0, o.r, 0, Math.PI * 2);
        ctx.fillStyle = o.def.color || '#f5f1e9';
        ctx.globalAlpha = 0.35;
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      ctx.font = `${o.r * 1.8}px serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(o.def.emoji, 0, 1);
    }
    ctx.restore();

    // Etiqueta pequeña con el NOMBRE bajo el objeto (sin rotar, con un
    // trazo claro debajo para que se lea sobre cualquier fondo)
    if (o.def.name) {
      ctx.save();
      ctx.font = '500 10px Jost, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      const ly = o.y + o.r * 1.35;
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(245,241,233,0.85)';
      ctx.strokeText(o.def.name, o.x, ly);
      ctx.fillStyle = 'rgba(63,58,50,0.85)';
      ctx.fillText(o.def.name, o.x, ly);
      ctx.restore();
    }
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
    if (o.isBooster) { activateBooster(o.type); return; }
    if (o.def.team === team) {
      const mult = effects.x2 > 0 ? 2 : 1;
      score += 10 * mult;
    } else {
      score = Math.max(0, score - 5); // objeto contrario: resta
    }
    scoreEl.textContent = score;
  }

  function activateBooster(type) {
    if (type === 'x2') effects.x2 = 6;
    if (type === 'slow') effects.slow = 5;
    if (type === 'magnet') effects.magnet = 5;
    updateBoosterHud();
  }
  function updateBoosterHud() {
    const active = Object.keys(effects).filter((k) => effects[k] > 0);
    boosterEl.textContent = active.length
      ? active.map((k) => {
          const b = BOOSTERS[k];
          return b.text ? b.label : `${b.emoji} ${b.label}`;
        }).join('  ')
      : '';
  }

  function loseLife() {
    lives -= 1;
    livesEl.textContent = '●'.repeat(Math.max(0, lives)) + '○'.repeat(Math.max(0, 3 - lives));
    if (lives <= 0) endGame();
  }

  let hudTimer = 0;

  /* ---------- Arranque / fin ---------- */
  function startGame() {
    score = 0; lives = 3; objects = []; elapsed = 0; spawnTimer = 0; lastT = 0;
    effects.x2 = effects.slow = effects.magnet = 0;
    scoreEl.textContent = '0';
    livesEl.textContent = '●●●';
    boosterEl.textContent = '';
    show(screenPlay);
    syncViewport();
    resize();
    basket.x = W / 2;
    running = true;
    raf = requestAnimationFrame(step);
    clearInterval(hudTimer);
    hudTimer = setInterval(updateBoosterHud, 500);
  }

  function endGame() {
    running = false;
    cancelAnimationFrame(raf);
    clearInterval(hudTimer);
    logAudit('juego', { team, points: score });
    overTeamEl.textContent = team === 'novio' ? 'Team Novio' : 'Team Novia';
    overTeamEl.style.color = team === 'novio' ? 'var(--burgundy)' : 'var(--taupe-deep)';
    finalEl.textContent = score;
    // Reiniciar el formulario de guardado
    saveBtn.disabled = false;
    nameInput.disabled = false;
    nameInput.value = '';
    setSaveFeedback('', null);
    show(screenOver);
    nameInput.focus();
  }

  function setSaveFeedback(msg, type) {
    saveFeedback.textContent = msg;
    saveFeedback.classList.remove('is-ok', 'is-error');
    if (type) saveFeedback.classList.add(type);
  }

  async function saveCurrentScore() {
    const name = nameInput.value.trim();
    if (!name) {
      setSaveFeedback('Escribe tu nombre para entrar en el ranking.', 'is-error');
      nameInput.focus();
      return;
    }
    saveBtn.disabled = true;
    nameInput.disabled = true;
    setSaveFeedback('Guardando…', null);
    try {
      await saveScore({ name, team, points: score });
      const equipo = team === 'novio' ? 'Novio' : 'Novia';
      setSaveFeedback(`¡Guardado! Has sumado ${score} puntos al Team ${equipo}. ✿`, 'is-ok');
    } catch (err) {
      console.error(err);
      saveBtn.disabled = false;
      nameInput.disabled = false;
      setSaveFeedback('No se pudo guardar. Inténtalo de nuevo.', 'is-error');
    }
  }

  function show(screen) {
    [screenStart, screenHelp, screenPlay, screenOver].forEach((s) => (s.hidden = s !== screen));
    // Durante la partida el juego es un overlay fijo a pantalla completa
    // (móvil): se bloquea el scroll de la página por debajo.
    document.body.classList.toggle('is-playing', screen === screenPlay);
  }

  /* ---------- Pantalla de instrucciones ---------- */
  // Rellena las partes que dependen del equipo: nombre, artículos que
  // suman (los tuyos) y los que restan (los contrarios), y los boosters.
  function renderHelp() {
    const teamEl = document.getElementById('game-help-team');
    teamEl.textContent = team === 'novio' ? 'Team Novio' : 'Team Novia';
    teamEl.style.color = team === 'novio' ? 'var(--burgundy)' : 'var(--taupe-deep)';

    const fillItems = (elId, wanted) => {
      const box = document.getElementById(elId);
      box.innerHTML = '';
      Object.values(ITEMS).filter((d) => (d.team === team) === wanted).forEach((d) => {
        const img = document.createElement('img');
        img.src = d.img;
        img.alt = '';
        img.className = 'game-help__item';
        box.appendChild(img);
      });
    };
    fillItems('game-help-catch', true);
    fillItems('game-help-avoid', false);

    const boostersBox = document.getElementById('game-help-boosters');
    boostersBox.innerHTML = '';
    const DESC = { x2: 'puntos dobles', slow: 'la caída se frena', magnet: 'atrae los tuyos' };
    Object.entries(BOOSTERS).forEach(([key, b]) => {
      const span = document.createElement('span');
      span.className = 'game-help__booster';
      span.textContent = b.text
        ? `${b.label} (${DESC[key]})`
        : `${b.emoji} ${b.label} (${DESC[key]})`;
      boostersBox.appendChild(span);
    });
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
  window.addEventListener('keydown', (e) => {
    if (!running) return;
    if (e.key === 'ArrowLeft') basket.x = Math.max(basket.w / 2, basket.x - 28);
    if (e.key === 'ArrowRight') basket.x = Math.min(W - basket.w / 2, basket.x + 28);
  });
  // Reajustar SIEMPRE que cambie el viewport visible: resize clásico,
  // giro del móvil y barras de Safari que aparecen/desaparecen.
  window.addEventListener('resize', syncViewport);
  window.addEventListener('orientationchange', syncViewport);
  window.visualViewport?.addEventListener('resize', syncViewport);

  /* ---------- Botones ----------
     Elegir equipo → instrucciones → ¡Empezar! → partida.
     "Jugar otra vez" salta las instrucciones (ya las ha visto). */
  root.querySelectorAll('.team-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      team = btn.dataset.team;
      renderHelp();
      show(screenHelp);
    });
  });
  document.getElementById('game-begin').addEventListener('click', startGame);
  document.getElementById('game-help-back').addEventListener('click', () => show(screenStart));
  // La partida es un overlay sin scroll: la ✕ permite salir (termina la
  // partida y lleva a la pantalla de fin, donde se puede guardar o repetir)
  document.getElementById('game-quit').addEventListener('click', () => { if (running) endGame(); });
  saveBtn.addEventListener('click', saveCurrentScore);
  document.getElementById('game-again').addEventListener('click', startGame);
  document.getElementById('game-switch').addEventListener('click', () => show(screenStart));
}
