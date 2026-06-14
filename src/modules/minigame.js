/* =================================================================
   Minijuego "Team novio / Team novia".
   Cuestionario breve y ligero; al final se asigna equipo y se muestra
   un medidor EN VIVO del reparto de votos (burdeos vs salvia).
   El voto está DESACOPLADO en submitVote() igual que el RSVP.
   ================================================================= */

const STORE_KEY = 'ma-team-votes';

// Semilla de votos para que el medidor "respire" desde el principio.
// Cuando haya backend, estos números vendrán del servidor.
const SEED = { groom: 38, bride: 41 };

const QUESTIONS = [
  {
    q: 'Plan de domingo perfecto…',
    options: [
      { text: 'Ruta en bici y vermú al sol', team: 'groom' },
      { text: 'Brunch largo y mercadillo', team: 'bride' },
    ],
  },
  {
    q: 'En la boda no puede faltar…',
    options: [
      { text: 'Que suene rock en la pista', team: 'groom' },
      { text: 'Las fotos y los detalles', team: 'bride' },
    ],
  },
  {
    q: 'Murcia ↔ Zaragoza: ¿con qué te quedas?',
    options: [
      { text: 'El cierzo y las tapas del Tubo', team: 'groom' },
      { text: 'La huerta y el sol de levante', team: 'bride' },
    ],
  },
];

/**
 * Registra el voto en el backend.
 * TODO(backend): conectar con el servicio elegido (mismo backend que el RSVP).
 * Mientras tanto persistimos en localStorage para que el medidor sea coherente.
 * @param {'groom'|'bride'} team
 * @returns {Promise<{groom:number, bride:number}>} recuento total
 */
export async function submitVote(team) {
  console.info('[Minijuego] (sin backend) voto:', team);
  const local = readLocal();
  local[team] = (local[team] || 0) + 1;
  writeLocal(local);
  await new Promise((r) => setTimeout(r, 300));
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
  return {
    groom: SEED.groom + (local.groom || 0),
    bride: SEED.bride + (local.bride || 0),
  };
}

export function initMinigame() {
  const quiz = document.getElementById('quiz');
  const result = document.getElementById('quiz-result');
  const teamEl = document.getElementById('quiz-team');
  const fillGroom = document.getElementById('meter-groom');
  const fillBride = document.getElementById('meter-bride');
  const pctGroom = document.getElementById('pct-groom');
  const pctBride = document.getElementById('pct-bride');
  const replay = document.getElementById('quiz-replay');
  if (!quiz) return;

  let step = 0;
  const score = { groom: 0, bride: 0 };

  function renderQuestion() {
    const item = QUESTIONS[step];
    quiz.innerHTML = `
      <p class="quiz__progress">Pregunta ${step + 1} de ${QUESTIONS.length}</p>
      <p class="quiz__q">${item.q}</p>
      <div class="quiz__options"></div>
    `;
    const opts = quiz.querySelector('.quiz__options');
    item.options.forEach((opt) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'quiz__option';
      btn.textContent = opt.text;
      btn.addEventListener('click', () => choose(opt.team));
      opts.appendChild(btn);
    });
  }

  function choose(team) {
    score[team] += 1;
    step += 1;
    if (step < QUESTIONS.length) {
      renderQuestion();
    } else {
      finishQuiz();
    }
  }

  async function finishQuiz() {
    const team = score.groom >= score.bride ? 'groom' : 'bride';
    teamEl.textContent = team === 'groom' ? 'Team Novio' : 'Team Novia';
    teamEl.style.color = team === 'groom' ? 'var(--burgundy)' : 'var(--sage-deep)';

    quiz.hidden = true;
    result.hidden = false;

    // Registrar voto y pintar el medidor en vivo
    const totals = await submitVote(team);
    paintMeter(totals);
  }

  function paintMeter({ groom, bride }) {
    const total = groom + bride || 1;
    const gPct = Math.round((groom / total) * 100);
    const bPct = 100 - gPct;
    // Forzar reflow antes de animar el ancho
    requestAnimationFrame(() => {
      fillGroom.style.width = gPct + '%';
      fillBride.style.width = bPct + '%';
    });
    pctGroom.textContent = gPct + '%';
    pctBride.textContent = bPct + '%';
  }

  replay.addEventListener('click', () => {
    step = 0;
    score.groom = 0;
    score.bride = 0;
    result.hidden = true;
    quiz.hidden = false;
    fillGroom.style.width = '0%';
    fillBride.style.width = '0%';
    renderQuestion();
  });

  renderQuestion();
}
