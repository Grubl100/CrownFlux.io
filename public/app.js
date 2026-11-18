'use strict';

let N = 16;
const ORTH = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const DIAG = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
const KN = [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]];
const VAL = { P: 1, N: 3, B: 3, R: 5, Q: 9, K: 10 };
const BASE = { P: 0.9, N: 1.4, B: 1.6, R: 1.8, Q: 2.2, K: 1.1 };
const GLYPH = { K: '♚', Q: '♛', R: '♜', B: '♝', N: '♞', P: '♟' };
const NOME = { P: 'Peão', N: 'Cavalo', B: 'Bispo', R: 'Torre', Q: 'Rainha', K: 'Rei' };
const GROW = ['P', 'P', 'N', 'B', 'R', 'N', 'B', 'R', 'Q', 'Q'];
const AVATARS = ['♟', '♞', '♝', '♜', '♛', '♚', '⚔', '🛡', '👑', '⚡', '🔥', '💎'];

const FAC = [
  { name: 'Você', col: '#6f9daf', fwd: [0, -1], base: [8, 14] },
  { name: 'Rival Rubi', col: '#bd7778', fwd: [0, 1], base: [8, 1] },
  { name: 'Oráculo', col: '#84a58c', fwd: [1, 0], base: [1, 8] },
  { name: 'Faísca', col: '#c4a66f', fwd: [-1, 0], base: [14, 8] }
];
const LAYOUT = [[-2, 'R'], [-1, 'B'], [0, 'K'], [1, 'Q'], [2, 'N']];

const CPU_LEVELS = [
  {
    level: 1,
    name: 'Iniciante',
    recommended: true,
    interval: 1.45,
    desc: 'Para quem está aprendendo. Faz movimentos simples, avança peões com calma e comete erros frequentes.',
    challenge: 'Desafio leve · Ideal para começar'
  },
  {
    level: 2,
    name: 'Fácil',
    recommended: false,
    interval: 1.12,
    desc: 'Reconhece oportunidades diretas de captura e coleta fragmentos próximos, mas ainda deixa brechas.',
    challenge: 'Desafio moderado-baixo'
  },
  {
    level: 3,
    name: 'Normal',
    recommended: false,
    interval: 0.86,
    desc: 'Estratégia equilibrada: protege suas peças valiosas, disputa os Fragmentos Flux e usa o Surto.',
    challenge: 'Desafio equilibrado'
  },
  {
    level: 4,
    name: 'Difícil',
    recommended: false,
    interval: 0.68,
    desc: 'Antecipa ameaças, evita trocas desfavoráveis, coordena ataques ao Rei e usa o Surto ofensivamente.',
    challenge: 'Desafio alto · Exige atenção'
  },
  {
    level: 5,
    name: 'Especialista',
    recommended: false,
    interval: 0.54,
    desc: 'Análise tática de 2 lances: avalia contra-ataques imediatos, protege o Rei com escolta e pune erros.',
    challenge: 'Desafio máximo da arena'
  }
];

const MODE_INFO = {
  arena: {
    tag: 'ARENA · 4 FACÇÕES',
    players: '4 FACÇÕES',
    desc: 'Quatro exércitos disputam o mesmo tabuleiro. Capture peças, evolua e converta o exército dos reis derrotados.',
    record: 'cf_best_arena'
  },
  duel: {
    tag: 'DUELO · 1V1 LOCAL',
    players: '2 JOGADORES',
    desc: 'Dois jogadores no mesmo dispositivo. Azul joga embaixo e Rubi em cima; ambos movem em tempo real.',
    record: 'cf_best_duel'
  },
  cpu: {
    tag: 'DUELO · VS CPU',
    players: '1V1 CPU',
    desc: 'Enfrente o computador em 5 níveis de dificuldade com comportamentos e estratégias reais distintas.',
    record: 'cf_best_cpu'
  },
  classic: {
    tag: 'XADREZ CLÁSSICO',
    players: '1V1 · XADREZ',
    desc: 'Xadrez 8×8 com regras oficiais. Escolha um bot com dificuldade ajustável ou jogue online com relógio e rating.',
    record: 'cf_best_classic'
  },
  classic_cpu: {
    tag: 'XADREZ CLÁSSICO · VS BOT',
    players: '1V1 · XADREZ',
    desc: 'Partida de xadrez clássico contra um bot com dificuldade ajustável.',
    record: 'cf_best_classic'
  },
  tactical_draft: {
    tag: 'CERCO TÁTICO · CARTAS',
    players: '1V1 TURNOS',
    desc: 'Modo por turnos com 3 PA, Draft de cartas a cada 3 rodadas, Coroa com risco/recompensa e salas privadas de 4 letras.',
    record: 'cf_best_online'
  },
  online: {
    tag: 'DUELO · ONLINE',
    players: '2 JOGADORES',
    desc: 'Dispute partidas 1v1 pela internet na fila pública, em salas privadas ou desafiando seus amigos.',
    record: 'cf_best_online'
  },
  tutorial: {
    tag: 'TUTORIAL PRÁTICO · 1V1',
    players: 'TREINO GUIADO',
    desc: 'Aprenda jogando passo a passo contra um bot cooperativo.',
    record: 'cf_best_cpu'
  }
};

const TUTORIAL_STEPS = [
  {
    step: 1,
    title: 'Conhecendo o jogo',
    text: 'Bem-vindo ao Crownflux.io! Você comanda o Exército Azul na base inferior (seu Rei ♚ está destacado com um anel dourado). No topo do tabuleiro 16×16 está o seu adversário: o Mentor Rubi (Bot), com todas as peças dele posicionadas. Para vencer uma partida 1v1, você deve evoluir seu exército e capturar o Rei adversário (♚) enquanto protege o seu.',
    hint: 'Próxima ação: observe os dois exércitos no tabuleiro e clique em "Avançar →" (ou toque em uma peça Azul) para conhecer as peças.',
    hudHighlight: 'scoreCard'
  },
  {
    step: 2,
    title: 'Conhecendo as peças',
    text: 'Cada exército começa com 10 peças: 5 Peões (♟) na fileira da frente e, atrás deles, Torre (♜), Bispo (♝), Rei (♚), Rainha (♛) e Cavalo (♞). Cada tipo de peça se move de um jeito próprio: Peões avançam 1 casa e capturam na diagonal; Cavalos saltam em "L"; Bispos usam diagonais; Torres andam em linha reta; e a Rainha combina linha reta e diagonal.',
    hint: 'Próxima ação: toque em qualquer peça Azul do seu exército (destacada na parte inferior) para ver o alcance dela.',
    hudHighlight: null
  },
  {
    step: 3,
    title: 'Primeira movimentação',
    text: 'Ao selecionar uma peça sua, o tabuleiro mostra pontos escuros nas casas vazias disponíveis e círculos nas peças que podem ser capturadas. Para confirmar um movimento, basta tocar em uma dessas casas marcadas. Repare também no cronômetro da jogada no painel lateral: ele registra o tempo de decisão de cada lance.',
    hint: 'Próxima ação: toque em um dos pontos válidos no tabuleiro para realizar seu primeiro movimento.',
    hudHighlight: null
  },
  {
    step: 4,
    title: 'Entendendo o turno do adversário',
    text: 'Você realizou sua primeira jogada! Veja agora o Mentor Rubi (Bot) responder movimentando uma peça dele no topo do tabuleiro (destacada com moldura Rubi). O adversário analisa o tabuleiro no turno dele e avança suas peças — acompanhar para onde o inimigo se move é essencial para defender seu território e preparar contra-ataques.',
    hint: 'Próxima ação: aguarde o movimento do Mentor Rubi e, quando voltar a ser a sua vez, realize mais 1 movimento com qualquer peça Azul.',
    hudHighlight: 'scoreCard'
  },
  {
    step: 5,
    title: 'Capturas',
    text: 'Destacamos uma oportunidade de captura próxima ao seu exército (com um anel dourado pulsante)! Para capturar, selecione uma peça Azul que alcance aquela casa e mova para cima dela. Capturar peças inimigas ou neutras dá pontos, acumula XP para subir de nível (fazendo nascer reforços perto do seu Rei) e carrega sua habilidade Surto.',
    hint: 'Próxima ação: selecione uma peça Azul e capture a peça destacada com anel dourado no tabuleiro.',
    hudHighlight: 'progressCard'
  },
  {
    step: 6,
    title: 'Estratégia',
    text: 'Excelente captura! No Crownflux.io, peças isoladas são alvos fáceis. Procure avançar suas peças em conjunto para que uma proteja a outra e fique atento ao seu Rei (♚): se ele ficar na mira de uma peça adversária, um círculo vermelho de alerta aparecerá ao redor dele.',
    hint: 'Próxima ação: faça 2 movimentos estratégicos com suas peças observando a resposta do Mentor Rubi a cada turno.',
    hudHighlight: null
  },
  {
    step: 7,
    title: 'Mecânicas especiais',
    text: 'Durante a batalha surgem Fragmentos Flux (losangos dourados no mapa): coletá-los concede +3 XP imediatos e +24% de energia. Quando a barra chega a 100%, você pode ativar a habilidade SURTO (botão "⚡ ATIVAR SURTO" ou tecla ESPAÇO), que reduz quase pela metade o tempo de recarga de todas as suas peças por 6 segundos!',
    hint: 'Próxima ação: colete o Fragmento Flux dourado próximo a você ou clique em "⚡ ATIVAR SURTO" no painel lateral.',
    hudHighlight: 'progressCard'
  },
  {
    step: 8,
    title: 'Conclusão',
    text: 'Parabéns! Você concluiu todas as orientações e já conhece movimentação, turnos do adversário, capturas, evolução e Surto. Agora continue a partida livremente contra o Mentor Rubi para praticar: capture o Rei Rubi (♚) no topo do tabuleiro (ou alcance 15 pontos) para vencer!',
    hint: 'Próxima ação: continue jogando até capturar o Rei do Mentor Rubi (♚) ou clique em "Avançar →" para concluir o tutorial.',
    hudHighlight: null
  }
];

let selectedMode = 'arena';
let cpuDifficulty = 1;
let classicTimeControl = 'blitz3';
const CLASSIC_CONTROLS = {
  bullet1: { seconds: 60, increment: 0, label: 'Bullet · 1+0' },
  bullet2: { seconds: 120, increment: 1, label: 'Bullet · 2+1' },
  blitz3: { seconds: 180, increment: 0, label: 'Blitz · 3+0' },
  blitz5: { seconds: 300, increment: 0, label: 'Blitz · 5+0' },
  rapid10: { seconds: 600, increment: 0, label: 'Rapid · 10+0' },
  rapid15: { seconds: 900, increment: 10, label: 'Rapid · 15+10' },
  classic30: { seconds: 1800, increment: 0, label: 'Clássico · 30+0' },
  classic60: { seconds: 3600, increment: 0, label: 'Clássico · 60+0' }
};
let S = null;
let best = 0;
let cell = 40;
let dpr = 1;
let last = performance.now();
let hudTimer = 0;

let onlineSide = 0;
let onlineOpponent = 'Adversário';
let onlineToken = localStorage.getItem('cf_token') || '';
let onlineUser = null;
let ws = null;
let wsReady = false;
let matchmaking = false;
let challengeInbox = new Map();
let friendCache = [];
let incomingReqCache = [];
let outgoingReqCache = [];
let historyCache = [];
let reconnectTimer = null;
let explicitLogout = false;
let pendingChallengeTargetId = null;
let selectedAvatarEdit = '♟';

let prefs = {
  boardTheme: 'classic',
  showCoords: true,
  highlightMoves: true,
  autoQueueMove: true,
  confirmResign: true,
  soundEffects: true,
  reducedMotion: false
};

let tut = {
  active: false,
  step: 1,
  paused: false,
  movesInStep5: 0,
  targetPieceId: null
};

const cv = document.getElementById('cv');
const ctx = cv.getContext('2d');
const $ = id => document.getElementById(id);

/* Web Audio Subtle Synthesizer */
let audioCtx = null;
function playTone(kind) {
  if (!prefs.soundEffects) return;
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    if (kind === 'move') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(320, now);
      osc.frequency.exponentialRampToValueAtTime(420, now + 0.06);
      gain.gain.setValueAtTime(0.06, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);
      osc.start(now);
      osc.stop(now + 0.07);
    } else if (kind === 'capture') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(480, now);
      osc.frequency.exponentialRampToValueAtTime(220, now + 0.11);
      gain.gain.setValueAtTime(0.09, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
      osc.start(now);
      osc.stop(now + 0.12);
    } else if (kind === 'orb' || kind === 'boost') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(520, now);
      osc.frequency.exponentialRampToValueAtTime(780, now + 0.16);
      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
      osc.start(now);
      osc.stop(now + 0.18);
    } else if (kind === 'win') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.setValueAtTime(554, now + 0.09);
      osc.frequency.setValueAtTime(659, now + 0.18);
      gain.gain.setValueAtTime(0.09, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.32);
      osc.start(now);
      osc.stop(now + 0.32);
    }
  } catch (_) {}
}

function safeGet(k) { try { return Number(localStorage.getItem(k)) || 0; } catch (_) { return 0; } }
function safeSet(k, v) { try { localStorage.setItem(k, String(v)); } catch (_) {} }
function fmt(t) { t = Math.floor(t); return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0'); }
function fmtChessClock(t) {
  const seconds = Math.max(0, Number(t) || 0);
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
}
function rand(n) { return Math.floor(Math.random() * n); }
function activeTeams() { return S.mode === 'arena' ? [0, 1, 2, 3] : [0, 1]; }
function isBot(i) { return S.mode === 'arena' ? i !== 0 : ((S.mode === 'cpu' || S.mode === 'tutorial' || S.mode === 'classic_cpu') && i === 1); }
function teamName(i) {
  if (S?.mode === 'online') return i === onlineSide ? (onlineUser?.displayName || onlineUser?.username || 'Você') : onlineOpponent;
  if (S?.mode === 'classic_cpu' && i === 1) return `Bot · ${CPU_LEVELS.find(c => c.level === cpuDifficulty)?.name || 'Iniciante'}`;
  if (S?.mode === 'cpu' && i === 1) {
    const info = CPU_LEVELS.find(c => c.level === cpuDifficulty);
    return 'CPU ' + (info ? info.name : '');
  }
  if (S?.mode === 'tutorial' && i === 1) return 'Mentor Rubi (Bot)';
  if (i === 0) return onlineUser?.displayName || onlineUser?.username || 'Você (Azul)';
  return FAC[i].name;
}
function need(f) { return 4 + f.lvl * 3; }

function feed(msg) {
  if (!S) return;
  S.events.unshift({ msg, t: S.T });
  S.events = S.events.slice(0, 5);
}

/* Navigation between Pages */
let currentNav = 'play';
function switchNav(navId) {
  currentNav = navId;
  document.querySelectorAll('.view-page').forEach(el => {
    el.classList.toggle('active', el.id === 'view-' + navId);
  });
  document.querySelectorAll('[data-nav]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.nav === navId);
  });
  if (navId === 'play') {
    setTimeout(resize, 20);
  } else if (navId === 'guide') {
    setTimeout(drawDemoBoard, 30);
  } else if (navId === 'friends') {
    renderFriendsPage();
    if (wsReady) sendSocket('friends:refresh');
  } else if (navId === 'profile') {
    renderAccount();
  } else if (navId === 'history') {
    renderGameHistory(historyCache);
    if (wsReady) sendSocket('games:history');
  } else if (navId === 'settings') {
    renderSettingsPage();
  }
}

document.querySelectorAll('[data-nav]').forEach(btn => {
  btn.addEventListener('click', () => switchNav(btn.dataset.nav));
});
document.querySelectorAll('[data-goto]').forEach(btn => {
  btn.addEventListener('click', () => switchNav(btn.dataset.goto));
});
$('brandHomeBtn').addEventListener('click', () => switchNav('play'));
$('headerAccountBtn').addEventListener('click', () => switchNav('profile'));
$('hudGuideBtn').addEventListener('click', () => switchNav('guide'));
$('hudMenuBtn').addEventListener('click', () => openMenu());

/* Preferences Management */
function loadLocalPreferences() {
  try {
    const raw = localStorage.getItem('cf_prefs');
    if (raw) {
      const parsed = JSON.parse(raw);
      prefs = { ...prefs, ...parsed };
    }
  } catch (_) {}
  applyPreferencesToDom();
}

function applyPreferencesToDom() {
  document.body.dataset.boardTheme = prefs.boardTheme || 'classic';
  $('prefBoardTheme').value = prefs.boardTheme || 'classic';
  $('prefShowCoords').checked = prefs.showCoords !== false;
  $('prefHighlightMoves').checked = prefs.highlightMoves !== false;
  $('prefAutoQueue').checked = prefs.autoQueueMove !== false;
  $('prefSound').checked = prefs.soundEffects !== false;
  $('prefConfirmResign').checked = prefs.confirmResign !== false;
  draw();
  drawDemoBoard();
}

async function savePreferences(partial = {}) {
  prefs = { ...prefs, ...partial };
  try { localStorage.setItem('cf_prefs', JSON.stringify(prefs)); } catch (_) {}
  applyPreferencesToDom();
  if (onlineToken && onlineUser) {
    try {
      const res = await apiRequest('/api/profile/preferences', { preferences: prefs });
      if (res.user) onlineUser = res.user;
    } catch (_) {}
  }
}

$('prefBoardTheme').addEventListener('change', e => savePreferences({ boardTheme: e.target.value }));
$('prefShowCoords').addEventListener('change', e => savePreferences({ showCoords: e.target.checked }));
$('prefHighlightMoves').addEventListener('change', e => savePreferences({ highlightMoves: e.target.checked }));
$('prefAutoQueue').addEventListener('change', e => savePreferences({ autoQueueMove: e.target.checked }));
$('prefSound').addEventListener('change', e => savePreferences({ soundEffects: e.target.checked }));
$('prefConfirmResign').addEventListener('change', e => savePreferences({ confirmResign: e.target.checked }));

function renderSettingsPage() {
  applyPreferencesToDom();
  const box = $('blockedUsersList');
  const blocked = onlineUser?.blocked || [];
  if (!blocked.length) {
    box.textContent = 'Nenhum jogador bloqueado.';
    return;
  }
  box.replaceChildren();
  for (const b of blocked) {
    const row = document.createElement('div');
    row.className = 'friend-item';
    row.innerHTML = `<div class="friend-ident"><span class="avatar-badge">${b.avatar || '♟'}</span><div class="friend-names"><strong>@${b.username}</strong></div></div>`;
    const btn = document.createElement('button');
    btn.className = 'mini-btn';
    btn.textContent = 'Desbloquear';
    btn.addEventListener('click', () => sendSocket('friend:unblock', { userId: b.id }));
    row.appendChild(btn);
    box.appendChild(row);
  }
}

/* First-Visit Tutorial Welcome Prompt */
function checkFirstVisitPrompt() {
  const localChoice = localStorage.getItem('cf_tutorial_prompt');
  const acctChoice = onlineUser?.tutorialPromptState;
  const completed = onlineUser?.tutorialCompleted || localStorage.getItem('cf_tutorial_completed') === '1';
  if (completed || localChoice === 'dismissed' || localChoice === 'accepted' || localChoice === 'later' ||
      acctChoice === 'dismissed' || acctChoice === 'completed' || acctChoice === 'accepted') {
    $('welcomePrompt').classList.add('hidden');
    return;
  }
  $('welcomePrompt').classList.remove('hidden');
}

async function setTutorialPromptChoice(state) {
  try { localStorage.setItem('cf_tutorial_prompt', state); } catch (_) {}
  $('welcomePrompt').classList.add('hidden');
  if (onlineToken && onlineUser) {
    try {
      const res = await apiRequest('/api/profile/preferences', {
        tutorialPromptState: state,
        tutorialCompleted: state === 'completed' ? true : undefined
      });
      if (res.user) onlineUser = res.user;
    } catch (_) {}
  }
}

$('welcomeAcceptBtn').addEventListener('click', () => {
  setTutorialPromptChoice('accepted');
  startInteractiveTutorial();
});
$('welcomeKnowBtn').addEventListener('click', () => {
  setTutorialPromptChoice('dismissed');
  showToast('Tudo pronto! Bom jogo na arena.');
});
$('welcomeLaterBtn').addEventListener('click', () => {
  setTutorialPromptChoice('later');
  showToast('Sem problemas! Você pode iniciar o tutorial em "Como jogar" quando quiser.');
});

/* Individual Move Timer Controller */
let confirmModalOpen = false;

function createTurnTimer() {
  const now = performance.now();
  return {
    activeOwner: 0,
    startedAtMs: now,
    accumulatedMs: 0,
    paused: false,
    animLockUntilMs: 0,
    lastMove: null,
    history: []
  };
}

function syncTurnTimerPauseState() {
  if (!S || !S.turnTimer) return;
  const shouldPause = !S.started || S.over || (S.mode === 'tutorial' && tut.paused) || confirmModalOpen;
  const tt = S.turnTimer;
  const now = performance.now();
  if (shouldPause && !tt.paused) {
    if (now > tt.animLockUntilMs) {
      tt.accumulatedMs += Math.max(0, now - Math.max(tt.startedAtMs, tt.animLockUntilMs));
    }
    tt.paused = true;
  } else if (!shouldPause && tt.paused) {
    tt.startedAtMs = now;
    tt.paused = false;
  }
}

function getCurrentTurnElapsedSec() {
  if (!S || !S.turnTimer) return 0;
  syncTurnTimerPauseState();
  const tt = S.turnTimer;
  let totalMs = tt.accumulatedMs;
  if (!tt.paused && S.started && !S.over) {
    const now = performance.now();
    if (now > tt.animLockUntilMs) {
      totalMs += Math.max(0, now - Math.max(tt.startedAtMs, tt.animLockUntilMs));
    }
  }
  return totalMs / 1000;
}

function recordMoveAndSwitchTurn(moverOwner, pieceType, fromX, fromY, toX, toY) {
  if (!S || !S.turnTimer || moverOwner < 0) return;
  const elapsedSec = Math.max(0.1, getCurrentTurnElapsedSec());
  const tt = S.turnTimer;
  const actorName = teamName(moverOwner);
  const pieceName = NOME[pieceType] || pieceType;
  const entry = {
    owner: moverOwner,
    actorName,
    pieceName,
    from: `${fromX},${fromY}`,
    to: `${toX},${toY}`,
    durationSec: elapsedSec,
    at: S.T
  };
  tt.lastMove = entry;
  tt.history.unshift(entry);
  tt.history = tt.history.slice(0, 6);

  const nextOwner = S.mode === 'arena' ? 0 : (moverOwner === 0 ? 1 : 0);
  S.turnOwner = nextOwner;
  const now = performance.now();
  tt.activeOwner = nextOwner;
  tt.accumulatedMs = 0;
  tt.animLockUntilMs = now + 220; // Ignora transição visual pós-jogada
  tt.startedAtMs = now + 220;
}

/* Core Game Setup & Mechanics */
function reset(mode = selectedMode) {
  selectedMode = mode;
  N = mode === 'classic_cpu' ? 8 : 16;
  const classic = mode === 'classic_cpu';
  const control = CLASSIC_CONTROLS[classicTimeControl] || CLASSIC_CONTROLS.blitz3;
  const teamIds = mode === 'arena' ? [0, 1, 2, 3] : [0, 1];
  S = {
    mode,
    classic,
    T: 0,
    turnOwner: 0,
    turnTimer: createTurnTimer(),
    lastBotMove: null,
    grid: Array.from({ length: N }, () => Array(N).fill(null)),
    pieces: [],
    orbs: [],
    f: FAC.map((d, i) => ({
      id: i, score: 0, xp: 0, lvl: 0, alive: teamIds.includes(i),
      respawn: 0, next: mode === 'tutorial' ? 9999 : (1.2 + i * 0.25), kings: 0, energy: 18, boostUntil: 0, captures: 0
    })),
    sel: null,
    over: false,
    started: false,
    checkmatedKingOwner: null,
    nid: 1,
    foodT: 0,
    orbT: 5,
    attT: 0,
    att: null,
    fx: [],
    events: [],
    lastMove: null,
    winner: null,
    turn: 0,
    castle: classic ? [{ king: true, queen: true }, { king: true, queen: true }] : null,
    enPassant: null,
    halfMoves: 0,
    chessClock: classic ? [control.seconds, control.seconds] : null,
    chessIncrement: classic ? control.increment : 0,
    repetition: classic ? new Map() : null,
    clockControlLabel: classic ? control.label : '',
    nextBotAt: 0
  };
  if (classic) {
    const backRank = ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R'];
    for (let x = 0; x < 8; x++) {
      add(backRank[x], 1, x, 0);
      add('P', 1, x, 1);
      add('P', 0, x, 6);
      add(backRank[x], 0, x, 7);
    }
  } else {
    for (const i of teamIds) spawnArmy(i);
    const initialFoodCount = mode === 'arena' ? 24 : mode === 'tutorial' ? 6 : 18;
    for (let i = 0; i < initialFoodCount; i++) spawnFood(mode === 'tutorial');
  }
  calcAtt();
  if (classic) S.repetition.set(classicPositionKey(), 1);
  $('classicMateBanner').classList.add('hidden');

  if (mode === 'tutorial') {
    feed('Partida 1v1 iniciada: Você (Azul) contra Mentor Rubi (Bot).');
  } else if (mode === 'cpu') {
    const info = CPU_LEVELS.find(c => c.level === cpuDifficulty) || CPU_LEVELS[0];
    feed(`Duelo contra CPU (${info.name}) preparado.`);
  } else if (mode === 'duel') {
    feed('Duelo local preparado: Azul contra Rubi.');
  } else if (classic) {
    feed(`Xadrez Clássico · ${control.label}.`);
  } else {
    feed('Quatro facções entraram na arena.');
  }

  const info = MODE_INFO[mode] || MODE_INFO.arena;
  best = safeGet(info.record);
  $('recordPill').textContent = 'Recorde: ' + best;
  if (mode === 'cpu') {
    const lv = CPU_LEVELS.find(c => c.level === cpuDifficulty) || CPU_LEVELS[0];
    $('modeTag').textContent = `DUELO · VS CPU (${lv.name.toUpperCase()})`;
  } else {
    $('modeTag').textContent = info.tag;
  }
  $('footerHint').textContent = classic
    ? 'Selecione uma peça e a casa de destino. Xeque-mate vence; o relógio controla o tempo da partida.'
    : 'Toque em uma peça da sua cor e depois na casa de destino. ESC cancela a seleção · ESPAÇO ativa o Surto em 100%.';
  $('progressCard').classList.toggle('hidden', classic);
  $('playersLabel').textContent = info.players;
}

function add(t, o, x, y) {
  const p = { id: S.nid++, t, o, x, y, ready: S.T + 0.8, cd0: 0.8, q: null, shield: 0 };
  S.grid[y][x] = p;
  S.pieces.push(p);
  return p;
}

function rm(p) {
  if (S.grid[p.y]?.[p.x] === p) S.grid[p.y][p.x] = null;
  const i = S.pieces.indexOf(p);
  if (i >= 0) S.pieces.splice(i, 1);
  if (S.sel === p) S.sel = null;
}

function spawnArmy(i) {
  const d = FAC[i], [bx, by] = d.base, [fx, fy] = d.fwd;
  const rx = fy !== 0 ? 1 : 0, ry = fx !== 0 ? 1 : 0;
  const cells = [];
  for (const [off, t] of LAYOUT) cells.push([bx + rx * off, by + ry * off, t]);
  for (let off = -2; off <= 2; off++) cells.push([bx + rx * off + fx, by + ry * off + fy, 'P']);
  const king = cells[2];
  if (S.grid[king[1]]?.[king[0]]) return false;
  let count = 0;
  for (const [x, y, t] of cells) {
    if (x >= 0 && y >= 0 && x < N && y < N && !S.grid[y][x]) {
      const p = add(t, i, x, y);
      if (S.mode === 'tutorial') p.ready = 0;
      count++;
    }
  }
  S.f[i].alive = true;
  return count >= 1;
}

function spawnFood(centerOnly = false) {
  for (let k = 0; k < 40; k++) {
    const x = centerOnly ? (3 + rand(N - 6)) : rand(N);
    const y = centerOnly ? (6 + rand(4)) : rand(N);
    if (S.grid[y][x]) continue;
    const r = Math.random(), t = r < 0.78 ? 'P' : r < 0.88 ? 'N' : r < 0.95 ? 'B' : 'R';
    add(t, -1, x, y).ready = 0;
    return true;
  }
  return false;
}

function spawnOrb() {
  if (S.orbs.length >= 5) return;
  for (let k = 0; k < 80; k++) {
    const x = rand(N), y = rand(N);
    if (S.grid[y][x] || S.orbs.some(o => o.x === x && o.y === y)) continue;
    S.orbs.push({ x, y, t: S.T });
    return;
  }
}

function moves(p, att = false, grid = S.grid) {
  if (S?.classic) return att ? classicPseudoMoves(p, grid) : classicLegalMoves(p, grid);
  const r = [], { x, y, t, o } = p;
  const ok = (a, b) => a >= 0 && b >= 0 && a < N && b < N;
  const tryAdd = (a, b) => {
    if (!ok(a, b)) return false;
    const q = grid[b][a];
    if (q && q.o === o && !att) return false;
    r.push([a, b]);
    return !q;
  };
  const slide = ds => {
    for (const [dx, dy] of ds) {
      let a = x + dx, b = y + dy;
      while (tryAdd(a, b)) { a += dx; b += dy; }
    }
  };
  if (t === 'R' || t === 'Q') slide(ORTH);
  if (t === 'B' || t === 'Q') slide(DIAG);
  if (t === 'N') for (const [dx, dy] of KN) tryAdd(x + dx, y + dy);
  if (t === 'K') for (const [dx, dy] of ORTH.concat(DIAG)) tryAdd(x + dx, y + dy);
  if (t === 'P' && o >= 0) {
    const [fx, fy] = FAC[o].fwd, a = x + fx, b = y + fy;
    if (!att && ok(a, b) && !grid[b][a]) r.push([a, b]);
    for (const s of [-1, 1]) {
      const c = x + (fx ? fx : s), d = y + (fy ? fy : s);
      if (!ok(c, d)) continue;
      if (att) r.push([c, d]);
      else {
        const q = grid[d][c];
        if (q && q.o !== o) r.push([c, d]);
      }
    }
  }
  return r;
}

function classicIsAttacked(x, y, bySide, grid = S.grid) {
  for (const p of S.pieces) {
    if (p.o !== bySide || grid[p.y]?.[p.x] !== p) continue;
    const dx = x - p.x, dy = y - p.y, ax = Math.abs(dx), ay = Math.abs(dy);
    if (p.t === 'P' && dy === (bySide === 0 ? -1 : 1) && ax === 1) return true;
    if (p.t === 'N' && ax * ay === 2) return true;
    if (p.t === 'K' && Math.max(ax, ay) === 1) return true;
    const diagonal = ax === ay && ax > 0;
    const straight = (dx === 0) !== (dy === 0);
    if ((p.t === 'B' && diagonal) || (p.t === 'R' && straight) || (p.t === 'Q' && (diagonal || straight))) {
      const sx = Math.sign(dx), sy = Math.sign(dy);
      let cx = p.x + sx, cy = p.y + sy, blocked = false;
      while (cx !== x || cy !== y) {
        if (grid[cy][cx]) { blocked = true; break; }
        cx += sx; cy += sy;
      }
      if (!blocked) return true;
    }
  }
  return false;
}

function classicPseudoMoves(p, grid = S.grid) {
  const result = [], { x, y, t, o } = p;
  const add = (a, b) => {
    if (a < 0 || b < 0 || a >= 8 || b >= 8 || grid[b][a]?.o === o) return;
    if (grid[b][a]?.t !== 'K') result.push([a, b]);
  };
  const slide = dirs => {
    for (const [dx, dy] of dirs) {
      let a = x + dx, b = y + dy;
      while (a >= 0 && b >= 0 && a < 8 && b < 8) {
        if (grid[b][a]?.o === o) break;
        if (grid[b][a]?.t !== 'K') result.push([a, b]);
        if (grid[b][a]) break;
        a += dx; b += dy;
      }
    }
  };
  if (t === 'P') {
    const dir = o === 0 ? -1 : 1, start = o === 0 ? 6 : 1;
    if (!grid[y + dir]?.[x]) {
      result.push([x, y + dir]);
      if (y === start && !grid[y + dir * 2][x]) result.push([x, y + dir * 2]);
    }
    for (const dx of [-1, 1]) {
      const a = x + dx, b = y + dir;
      if (a >= 0 && a < 8 && ((grid[b][a]?.o === 1 - o && grid[b][a]?.t !== 'K') || (S.enPassant?.x === a && S.enPassant?.y === b))) {
        result.push([a, b]);
      }
    }
  } else if (t === 'N') {
    for (const [dx, dy] of KN) add(x + dx, y + dy);
  } else if (t === 'B') slide(DIAG);
  else if (t === 'R') slide(ORTH);
  else if (t === 'Q') slide(ORTH.concat(DIAG));
  else if (t === 'K') {
    for (const [dx, dy] of ORTH.concat(DIAG)) add(x + dx, y + dy);
    const row = o === 0 ? 7 : 0, rights = S.castle?.[o];
    if (rights && y === row && x === 4 && !classicIsAttacked(4, row, 1 - o, grid)) {
      if (rights.king && !grid[row][5] && !grid[row][6] &&
        grid[row][7]?.t === 'R' && grid[row][7]?.o === o &&
        !classicIsAttacked(5, row, 1 - o, grid) && !classicIsAttacked(6, row, 1 - o, grid)) result.push([6, row]);
      if (rights.queen && !grid[row][1] && !grid[row][2] && !grid[row][3] &&
        grid[row][0]?.t === 'R' && grid[row][0]?.o === o &&
        !classicIsAttacked(3, row, 1 - o, grid) && !classicIsAttacked(2, row, 1 - o, grid)) result.push([2, row]);
    }
  }
  return result;
}

function classicLegalMoves(p, grid = S.grid) {
  return classicPseudoMoves(p, grid).filter(([x, y]) => {
    const fromX = p.x, fromY = p.y, target = grid[y][x];
    const ep = p.t === 'P' && x !== fromX && !target;
    const epPiece = ep ? grid[y + (p.o === 0 ? 1 : -1)][x] : null;
    grid[fromY][fromX] = null;
    if (epPiece) grid[epPiece.y][epPiece.x] = null;
    grid[y][x] = p;
    p.x = x; p.y = y;
    const king = S.pieces.find(piece => piece.o === p.o && piece.t === 'K' && grid[piece.y]?.[piece.x] === piece);
    const safe = king && !classicIsAttacked(king.x, king.y, 1 - p.o, grid);
    p.x = fromX; p.y = fromY;
    grid[fromY][fromX] = p;
    grid[y][x] = target;
    if (epPiece) grid[epPiece.y][epPiece.x] = epPiece;
    return safe;
  });
}

function calcAtt() {
  const a = Array.from({ length: N }, () => Array(N).fill(0));
  for (const p of S.pieces) {
    if (p.o < 0) continue;
    for (const [x, y] of moves(p, true)) a[y][x] |= 1 << p.o;
  }
  S.att = a;
}

function gain(o, v) {
  if (o < 0) return;
  const f = S.f[o];
  f.score += v;
  f.xp += v;
  f.energy = Math.min(100, f.energy + v * 9);
  f.captures++;
  while (f.xp >= need(f)) {
    f.xp -= need(f);
    f.lvl++;
    growPiece(o);
    feed('<b>' + teamName(o) + '</b> subiu para o nível ' + f.lvl + ' e ganhou ' + NOME[GROW[Math.min(f.lvl - 1, GROW.length - 1)]] + '.');
  }
}

function growPiece(o) {
  const k = S.pieces.find(p => p.o === o && p.t === 'K');
  if (!k) return;
  const t = GROW[Math.min(S.f[o].lvl - 1, GROW.length - 1)];
  for (let r = 1; r <= 6; r++) {
    const c = [];
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = k.x + dx, y = k.y + dy;
        if (x >= 0 && y >= 0 && x < N && y < N && !S.grid[y][x]) c.push([x, y]);
      }
    }
    if (c.length) {
      const [x, y] = c[rand(c.length)];
      add(t, o, x, y).ready = S.T + 0.6;
      S.fx.push({ x, y, t: S.T, col: FAC[o].col, big: 1 });
      return;
    }
  }
}

function collectOrb(p) {
  const i = S.orbs.findIndex(o => o.x === p.x && o.y === p.y);
  if (i < 0 || p.o < 0) return false;
  S.orbs.splice(i, 1);
  const f = S.f[p.o];
  gain(p.o, 3);
  f.energy = Math.min(100, f.energy + 24);
  S.fx.push({ x: p.x, y: p.y, t: S.T, col: '#cfaf72', big: 1 });
  feed('<b>' + teamName(p.o) + '</b> coletou um Fragmento Flux (+3 XP e +24% Surto).');
  playTone('orb');
  if (S.mode === 'tutorial' && p.o === 0 && tut.step === 7) {
    f.energy = 100;
    setTutorialHint('Fragmento Flux coletado! Sua energia chegou a 100%. Clique em "⚡ ATIVAR SURTO" (ou pressione ESPAÇO) para concluir a Etapa 7!');
  }
  return true;
}

async function recordOfflineMatchToBackend(winner, reason) {
  const f0 = S.f[0], f1 = S.f[1];
  const entry = {
    id: 'local-' + Date.now(),
    mode: S.mode,
    difficulty: S.mode === 'cpu' ? cpuDifficulty : null,
    opponent: S.mode === 'cpu' ? teamName(1) : S.mode === 'tutorial' ? 'Mentor Rubi (Bot)' : S.mode === 'duel' ? 'Duelo Local' : 'Arena 4 Facções',
    result: winner === null ? 'Empate' : winner === 0 ? 'Vitória' : 'Derrota',
    reason,
    duration: Math.max(1, Math.floor(S.T)),
    createdAt: new Date().toISOString(),
    scores: [f0?.score || 0, f1?.score || 0]
  };
  historyCache.unshift(entry);
  historyCache = historyCache.slice(0, 30);
  try { localStorage.setItem('cf_local_history', JSON.stringify(historyCache.slice(0, 20))); } catch (_) {}

  if (onlineToken && onlineUser) {
    try {
      const res = await apiRequest('/api/matches/record', {
        mode: S.mode,
        difficulty: cpuDifficulty,
        result: winner === null ? 'draw' : winner === 0 ? 'win' : 'loss',
        score: f0?.score || 0,
        opponentScore: f1?.score || 0,
        duration: Math.max(1, Math.floor(S.T)),
        reason
      });
      if (res.user) onlineUser = res.user;
      if (res.games) historyCache = res.games;
      renderAccount();
    } catch (_) {}
  }
}

function gameOver(winner, reason = '') {
  if (S.over) return;
  S.over = true;
  S.winner = winner;
  const classicCheckmate = S.classic && Number.isInteger(winner) && reason === 'Xeque-mate.';
  S.checkmatedKingOwner = classicCheckmate ? 1 - winner : null;
  syncTurnTimerPauseState();
  if (winner === 0) playTone('win');

  const mode = S.mode;
  const f0 = S.f[0], f1 = S.f[1];
  const recordScore = mode === 'duel' ? (winner === 0 ? f0.score : 0) : f0.score;
  const recKey = (MODE_INFO[mode] || MODE_INFO.arena).record;
  if (recordScore > best) {
    best = recordScore;
    safeSet(recKey, best);
  }
  $('recordPill').textContent = 'Recorde: ' + best;

  if (mode === 'tutorial' && winner === 0) {
    tut.active = false;
    $('tutorialBanner').classList.add('hidden');
    $('hudTutorialCard').classList.add('hidden');
    clearHudHighlights();
    try { localStorage.setItem('cf_tutorial_completed', '1'); } catch (_) {}
    setTutorialPromptChoice('completed');
    $('overEyebrow').textContent = 'Treinamento concluído';
    $('resultTitle').textContent = 'TUTORIAL CONCLUÍDO!';
    $('winnerText').textContent = 'Você está pronto para a arena!';
    $('res').innerHTML = `Você completou todas as 8 etapas do tutorial prático contra o Mentor Rubi!<br>Tempo total: <b>${fmt(S.T)}</b> · Seu placar: <b>${f0.score}</b> · Mentor Rubi: <b>${f1.score}</b><br>Agora experimente desafiar a CPU nos 5 níveis ou jogar online com amigos.`;
    $('again').textContent = 'REPETIR TUTORIAL';
    $('changeCpuDiffBtn').classList.remove('hidden');
    $('changeCpuDiffBtn').textContent = 'DESAFIAR A CPU';
  } else {
    if (mode === 'tutorial') {
      tut.active = false;
      $('tutorialBanner').classList.add('hidden');
      $('hudTutorialCard').classList.add('hidden');
      clearHudHighlights();
    }
    $('overEyebrow').textContent = 'Fim de partida';
    const winName = winner === 0
      ? 'VOCÊ VENCEU!'
      : winner === 1
        ? (mode === 'duel' ? 'RUBI VENCEU!' : teamName(1).toUpperCase() + ' VENCEU!')
        : winner >= 0
          ? FAC[winner].name.toUpperCase() + ' VENCEU!'
          : 'EMPATE';
    $('resultTitle').textContent = winner === 0 ? 'VITÓRIA' : winner >= 0 ? 'DERROTA' : 'PARTIDA ENCERRADA';
    $('winnerText').textContent = winName;
    let details = `Tempo: <b>${fmt(S.T)}</b><br>Seu placar: <b>${f0.score}</b> · Nível <b>${f0.lvl}</b>`;
    if (mode !== 'arena') details += `<br>${teamName(1)}: <b>${f1.score}</b>`;
    if (reason) details += `<br>${reason}`;
    details += `<br>Recorde no modo: <b>${best}</b>`;
    $('res').innerHTML = details;
    $('again').textContent = mode === 'tutorial' ? 'REPETIR TUTORIAL' : 'JOGAR NOVAMENTE';
    $('changeCpuDiffBtn').classList.toggle('hidden', mode !== 'cpu' && mode !== 'classic_cpu' && mode !== 'tutorial');
    $('changeCpuDiffBtn').textContent = mode === 'tutorial' ? 'DESAFIAR A CPU' : 'MUDAR DIFICULDADE';
  }

  $('rematch').classList.add('hidden');
  $('over').classList.toggle('hidden', classicCheckmate);
  $('statusText').textContent = classicCheckmate ? 'XEQUE-MATE · #' : 'PARTIDA ENCERRADA';
  renderClassicCheckmateBanner();
  recordOfflineMatchToBackend(winner, reason);
}

function renderClassicCheckmateBanner() {
  const visible = Boolean(S?.classic && S.over && Number.isInteger(S.checkmatedKingOwner));
  $('classicMateBanner').classList.toggle('hidden', !visible);
  if (!visible) return;

  const viewerSide = S.mode === 'online' ? onlineSide : 0;
  $('classicMateText').textContent = S.winner === viewerSide
    ? 'XEQUE-MATE · VOCÊ VENCEU'
    : 'XEQUE-MATE · VOCÊ PERDEU';
  $('classicMateAgain').classList.toggle('hidden', S.mode === 'online');
  $('classicMateRematch').classList.toggle('hidden', S.mode !== 'online');
  $('classicMateRematch').textContent = 'PEDIR REVANCHE';
  $('classicMateRematch').disabled = false;
}

function capture(p, q) {
  const owner = q.o, v = VAL[q.t] || 1;
  if (q.shield > 0) {
    q.shield--;
    S.fx.push({ x: q.x, y: q.y, t: S.T, col: '#a6e9ff' });
    feed('<b>Escudo!</b> Um golpe foi bloqueado.');
    return false;
  }
  if (p.o >= 0) {
    gain(p.o, v);
    S.fx.push({ x: q.x, y: q.y, t: S.T, col: FAC[p.o].col });
  }
  playTone('capture');
  rm(q);
  if (q.t === 'K' && owner >= 0) {
    if (S.mode === 'tutorial' && owner === 0) {
      add('K', 0, 8, 14).ready = 0;
      setTutorialHint('Cuidado! O Mentor Rubi alcançou seu Rei, mas no tutorial seu Rei foi reposicionado em segurança na base para você continuar praticando.');
      return true;
    }
    S.f[p.o >= 0 ? p.o : 0].kings++;
    if (S.mode !== 'arena') {
      S.f[owner].alive = false;
      gameOver(p.o, 'O Rei adversário foi capturado.');
      return true;
    }
    const f = S.f[owner];
    f.alive = false;
    f.respawn = S.T + 7;
    for (const z of S.pieces) if (z.o === owner) z.o = p.o;
    feed('<b>' + teamName(p.o) + '</b> capturou o Rei de <b>' + teamName(owner) + '</b> e converteu seu exército!');
    if (owner === 0) gameOver(p.o, 'Seu Rei foi capturado.');
  } else if (owner >= 0) {
    feed('<b>' + teamName(p.o) + '</b> capturou ' + NOME[q.t] + ' de ' + teamName(owner) + '.');
  }
  return true;
}

function doMove(p, a, b) {
  if (!p || S.grid[p.y]?.[p.x] !== p) return false;
  const fromX = p.x, fromY = p.y, q = S.grid[b][a], d = Math.max(Math.abs(a - p.x), Math.abs(b - p.y));
  const hadCapture = Boolean(q);
  if (q && q.shield > 0) {
    q.shield--;
    p.ready = S.T + Math.max(0.35, BASE[p.t]);
    p.cd0 = p.ready - S.T;
    S.fx.push({ x: q.x, y: q.y, t: S.T, col: '#a6e9ff', big: 1 });
    feed('<b>Escudo!</b> A peça resistiu ao ataque.');
    calcAtt();
    return false;
  }
  S.grid[p.y][p.x] = null;
  if (q) capture(p, q);
  if (S.over) {
    recordMoveAndSwitchTurn(p.o, p.t, fromX, fromY, a, b);
    return true;
  }

  S.grid[b][a] = p;
  p.x = a;
  p.y = b;
  let cd = BASE[p.t] + (p.t === 'N' ? 0.25 : d * 0.12);
  if (p.o >= 0 && S.f[p.o].boostUntil > S.T) cd *= 0.58;
  p.cd0 = cd;
  p.ready = S.mode === 'tutorial' ? S.T + Math.min(0.65, cd) : S.T + cd;
  p.q = null;
  S.lastMove = { x0: fromX, y0: fromY, x1: a, y1: b, t: S.T, owner: p.o };
  if (p.o === 1) {
    S.lastBotMove = { x0: fromX, y0: fromY, x1: a, y1: b, t: S.T, pieceType: p.t };
  }
  if (!hadCapture) playTone('move');
  if (p.t === 'P' && p.o >= 0) {
    const [fx, fy] = FAC[p.o].fwd, na = a + fx, nb = b + fy;
    if (na < 0 || nb < 0 || na >= N || nb >= N) {
      p.t = 'Q';
      S.fx.push({ x: a, y: b, t: S.T, col: FAC[p.o].col, big: 1 });
      feed('<b>Promoção!</b> Um Peão chegou ao fim do tabuleiro e virou Rainha.');
    }
  }
  collectOrb(p);
  calcAtt();

  if (p.o >= 0) {
    recordMoveAndSwitchTurn(p.o, p.t, fromX, fromY, a, b);
  }

  if (S.mode === 'tutorial') {
    if (p.o === 0) {
      onTutorialPlayerMoved(p, hadCapture);
      if (!S.over) {
        S.turnOwner = 1;
        S.f[1].next = S.T + 1.05; // Agendar resposta natural do Mentor Rubi
      }
    } else if (p.o === 1) {
      S.turnOwner = 0;
      S.f[1].next = S.T + 9999; // Aguarda o próximo lance do jogador
      onTutorialBotMoved(p, hadCapture);
    }
  }
  return true;
}

function classicPositionKey() {
  const board = S.grid.map(row => row.map(p => p ? `${p.o}${p.t}` : '--').join('')).join('/');
  return `${board}|${S.turnOwner}|${S.castle.map(c => `${c.king ? 'K' : ''}${c.queen ? 'Q' : ''}`).join('')}|${S.enPassant ? `${S.enPassant.x},${S.enPassant.y}` : '-'}`;
}

function classicInsufficientMaterial() {
  const material = S.pieces.filter(p => p.t !== 'K');
  if (!material.length) return true;
  if (material.some(p => ['P', 'R', 'Q'].includes(p.t))) return false;
  if (material.length === 1) return true;
  if (material.every(p => p.t === 'B') && new Set(material.map(p => (p.x + p.y) % 2)).size === 1) return true;
  return material.length === 2 && material.every(p => p.t === 'N' && p.o === material[0].o);
}

function classicCanMate(side) {
  const material = S.pieces.filter(p => p.o === side && p.t !== 'K');
  if (material.some(p => ['P', 'R', 'Q'].includes(p.t))) return true;
  if (material.some(p => p.t === 'B') && material.some(p => p.t === 'N')) return true;
  if (material.filter(p => p.t === 'B').length >= 2 &&
      new Set(material.filter(p => p.t === 'B').map(p => (p.x + p.y) % 2)).size > 1) return true;
  if (material.filter(p => p.t === 'N').length >= 3) return true;
  return material.length >= 2 && S.pieces.some(p => p.o !== side && p.t !== 'K');
}

function doClassicMove(p, x, y) {
  const side = S.turnOwner, fromX = p.x, fromY = p.y, target = S.grid[y][x];
  const pawnMove = p.t === 'P';
  const enPassantCapture = pawnMove && x !== fromX && !target;
  const captured = target || (enPassantCapture ? S.grid[y + (side === 0 ? 1 : -1)][x] : null);
  if (captured) {
    rm(captured);
    S.f[side].score += VAL[captured.t] || 1;
    S.f[side].captures++;
    playTone('capture');
  }
  S.grid[fromY][fromX] = null;
  p.x = x; p.y = y;
  S.grid[y][x] = p;
  if (p.t === 'K' && Math.abs(x - fromX) === 2) {
    const rookX = x === 6 ? 7 : 0, rook = S.grid[y][rookX];
    S.grid[y][rookX] = null;
    rook.x = x === 6 ? 5 : 3;
    S.grid[y][rook.x] = rook;
  }
  if (p.t === 'K') S.castle[side] = { king: false, queen: false };
  if (p.t === 'R' && fromY === (side === 0 ? 7 : 0)) {
    if (fromX === 0) S.castle[side].queen = false;
    if (fromX === 7) S.castle[side].king = false;
  }
  if (captured?.t === 'R' && captured.y === (captured.o === 0 ? 7 : 0)) {
    if (captured.x === 0) S.castle[captured.o].queen = false;
    if (captured.x === 7) S.castle[captured.o].king = false;
  }
  S.enPassant = pawnMove && Math.abs(y - fromY) === 2 ? { x, y: (fromY + y) / 2 } : null;
  if (pawnMove && (y === 0 || y === 7)) {
    p.t = 'Q';
    feed('Promoção: peão convertido em rainha.');
  }
  S.halfMoves = pawnMove || captured ? 0 : S.halfMoves + 1;
  S.chessClock[side] += S.chessIncrement;
  S.turnOwner = 1 - side;
  S.turn = S.turnOwner;
  S.lastMove = { x0: fromX, y0: fromY, x1: x, y1: y, t: S.T };
  if (!captured) playTone('move');
  calcAtt();

  const replyExists = S.pieces.some(piece => piece.o === S.turnOwner && moves(piece).length > 0);
  const king = S.pieces.find(piece => piece.o === S.turnOwner && piece.t === 'K');
  const checked = king && classicIsAttacked(king.x, king.y, side);
  if (!replyExists) gameOver(checked ? side : null, checked ? 'Xeque-mate.' : 'Afogamento: empate.');
  else if (classicInsufficientMaterial()) gameOver(null, 'Material insuficiente: empate.');
  else if (S.halfMoves >= 100) gameOver(null, 'Regra dos 50 lances: empate.');
  const key = classicPositionKey();
  S.repetition.set(key, (S.repetition.get(key) || 0) + 1);
  if (!S.over && S.repetition.get(key) >= 3) gameOver(null, 'Repetição tripla: empate.');
  if (S.mode === 'classic_cpu' && S.turnOwner === 1 && !S.over) S.nextBotAt = S.T + 0.45;
  hud();
  return true;
}

function classicBotMove() {
  const candidates = [];
  for (const p of S.pieces.filter(piece => piece.o === 1)) {
    for (const [x, y] of moves(p)) {
      const target = S.grid[y][x];
      let score = target ? (VAL[target.t] || 0) * 3 : 0;
      score += (3.5 - Math.abs(3.5 - x) - Math.abs(3.5 - y)) * 0.22;
      if (p.t === 'P') score += (y - p.y) * 0.35;
      if ((p.t === 'N' || p.t === 'B') && (p.x === 1 || p.x === 6) && p.y === 0) score += 0.8;
      candidates.push({ p, x, y, score: score + Math.random() * (6 - cpuDifficulty) * 0.9 });
    }
  }
  if (!candidates.length) return;
  candidates.sort((a, b) => b.score - a.score);
  const pool = Math.max(1, 6 - cpuDifficulty);
  const choice = candidates[Math.floor(Math.random() * Math.min(pool, candidates.length))];
  doClassicMove(choice.p, choice.x, choice.y);
}

function cheb(a, b, c, d) { return Math.max(Math.abs(a - c), Math.abs(b - d)); }

/* 5 Distinct CPU AI Difficulty Levels + Tutorial Cooperative Bot */
function botThink(i) {
  let ps = S.pieces.filter(p => p.o === i && p.ready <= S.T);
  if (!ps.length && S.mode === 'tutorial') {
    for (const p of S.pieces) if (p.o === i) p.ready = 0;
    ps = S.pieces.filter(p => p.o === i);
  }
  if (!ps.length) return;
  const enemies = S.pieces.filter(p => p.o !== i);
  const me = 1 << i;
  const level = S.mode === 'tutorial' ? 1 : (S.mode === 'cpu' ? cpuDifficulty : 3);

  // Tutorial bot (Mentor Rubi — IA Iniciante real, avança para o centro e responde a cada turno)
  if (S.mode === 'tutorial') {
    if (tut.paused || S.turnOwner !== 1) return;
    let bestMove = null, bs = -1e9;
    for (const p of ps) {
      const ms = moves(p);
      for (const [a, b] of ms) {
        const target = S.grid[b][a];
        // Não captura o Rei do jogador nem a peça reservada da Etapa 5
        if (target && target.o === 0 && (target.t === 'K' || tut.step < 6)) continue;
        if (target && target.id === tut.targetPieceId) continue;

        let score = Math.random() * 2.5;
        // Incentiva avançar na direção do centro do tabuleiro (y maior)
        score += (b - p.y) * (p.t === 'P' ? 3.2 : p.t === 'N' || p.t === 'B' ? 2.4 : 1.0);
        // Incentiva aproximar-se das colunas centrais (x entre 5 e 10)
        score -= Math.abs(a - 7.5) * 0.25;
        if (p.t === 'K') score -= 6;
        if (target && target.o < 0) score += VAL[target.t] * 3.5;
        else if (target && target.o === 0 && tut.step >= 6) score += VAL[target.t] * 4.0;
        if (score > bs) { bs = score; bestMove = [p, a, b]; }
      }
    }
    if (bestMove) {
      doMove(bestMove[0], bestMove[1], bestMove[2]);
    }
    return;
  }

  // Level 1: Iniciante — Picks a random subset of pieces, ignores threat maps, makes simple moves and frequent blunders
  if (level === 1) {
    const sample = ps.filter(() => Math.random() < 0.55);
    const candidates = sample.length ? sample : [ps[rand(ps.length)]];
    let bestMove = null, bs = -1e9;
    for (const p of candidates) {
      const ms = moves(p);
      for (const [a, b] of ms) {
        const q = S.grid[b][a];
        let score = Math.random() * 6;
        if (q && q.o < 0) score += VAL[q.t] * 4;
        else if (q && q.o >= 0 && Math.random() < 0.45) score += VAL[q.t] * 5;
        if (p.t === 'P') score += 1.5;
        if (score > bs) { bs = score; bestMove = [p, a, b]; }
      }
    }
    if (bestMove) doMove(bestMove[0], bestMove[1], bestMove[2]);
    return;
  }

  // Level 2: Fácil — Recognizes basic captures and nearby orbs, but weak threat awareness
  if (level === 2) {
    let bestMove = null, bs = -1e9;
    for (const p of ps) {
      const ms = moves(p);
      for (const [a, b] of ms) {
        const q = S.grid[b][a];
        let score = Math.random() * 3.5;
        if (q) score += q.t === 'K' ? 180 : VAL[q.t] * 8;
        if ((S.att[b][a] & ~me) !== 0) score -= VAL[p.t] * 2.2;
        if (S.orbs.some(o => o.x === a && o.y === b)) score += 9;
        if (score > bs) { bs = score; bestMove = [p, a, b]; }
      }
    }
    if (bestMove) doMove(bestMove[0], bestMove[1], bestMove[2]);
    return;
  }

  // Level 3 (Normal), Level 4 (Difícil), Level 5 (Especialista)
  const enemyKing = S.pieces.find(p => p.o === 0 && p.t === 'K');
  const myKing = S.pieces.find(p => p.o === i && p.t === 'K');

  if (level >= 3 && S.f[i].energy >= 100) {
    const recovering = S.pieces.filter(p => p.o === i && p.ready > S.T).length;
    if (level === 3 && Math.random() < 0.35) activateBoost(i);
    else if (level >= 4 && (recovering >= 2 || (enemyKing && S.pieces.some(p => p.o === i && cheb(p.x, p.y, enemyKing.x, enemyKing.y) <= 4)))) {
      activateBoost(i);
    }
  }

  let bestMove = null, bs = -1e9;
  for (const p of ps) {
    const ms = moves(p);
    if (!ms.length) continue;
    let target = null, td = 1e9;
    for (const e of enemies) {
      const d = cheb(p.x, p.y, e.x, e.y) - (e.o >= 0 ? 1.3 : 0) + (e.t === 'K' ? -2.5 : 0);
      if (d < td) { td = d; target = e; }
    }
    const pv = VAL[p.t] * (p.t === 'K' ? 3.0 : 1);
    const inDanger = (S.att[p.y][p.x] & ~me) !== 0;
    const d0 = target ? cheb(p.x, p.y, target.x, target.y) : 0;

    for (const [a, b] of ms) {
      const q = S.grid[b][a];
      let score = level === 5 ? Math.random() * 0.35 : level === 4 ? Math.random() * 0.8 : Math.random() * 1.6;

      if (q) {
        if (q.t === 'K' && q.o >= 0) score += 500;
        else score += (VAL[q.t] + 0.5) * (q.o >= 0 ? 11.5 : 8.5);
      }

      const destAttacked = (S.att[b][a] & ~me) !== 0;
      const destDefended = (S.att[b][a] & me) !== 0;

      if (destAttacked) {
        const penaltyMult = level >= 4 ? (destDefended ? 5.2 : 8.5) : 6.5;
        score -= pv * penaltyMult;
      } else if (destDefended && level >= 4) {
        score += 1.8;
      }

      if (inDanger && !destAttacked) score += pv * (level >= 4 ? 5.0 : 3.3);
      if (target) score += (d0 - cheb(a, b, target.x, target.y)) * (p.t === 'P' ? 1.8 : 1.2);
      if (p.t === 'K' && destAttacked) score -= 40;
      if (S.orbs.some(o => o.x === a && o.y === b)) score += level >= 4 ? 18 : 13;

      // Level 4 & 5: King Escort & Pressure on Player King
      if (level >= 4) {
        if (enemyKing) {
          const distToEnemyKing = cheb(a, b, enemyKing.x, enemyKing.y);
          score += Math.max(0, 8 - distToEnemyKing) * (p.t === 'Q' || p.t === 'R' || p.t === 'N' ? 1.4 : 0.6);
        }
        if (myKing && (S.att[myKing.y][myKing.x] & ~me) !== 0 && p.t !== 'K') {
          if (cheb(a, b, myKing.x, myKing.y) <= 2) score += 9;
        }
      }

      // Level 5 (Especialista): 2-ply lookahead simulation (evaluates direct threats created by this move and avoids traps)
      if (level === 5) {
        const origX = p.x, origY = p.y;
        const prevTarget = S.grid[b][a];
        S.grid[origY][origX] = null;
        S.grid[b][a] = p;
        p.x = a; p.y = b;

        const nextMoves = moves(p, true);
        for (const [nx, ny] of nextMoves) {
          const threatened = S.grid[ny][nx];
          if (threatened && threatened.o === 0) {
            score += threatened.t === 'K' ? 22 : VAL[threatened.t] * 1.9;
          }
        }

        // Check if an enemy piece Ready right now can immediately capture us on (a,b) for a net gain
        const readyEnemyCanCapture = S.pieces.some(ep =>
          ep.o === 0 && ep !== prevTarget && ep.ready <= S.T + 0.25 &&
          moves(ep, true).some(([ex, ey]) => ex === a && ey === b)
        );
        if (readyEnemyCanCapture) {
          const gainVal = prevTarget ? VAL[prevTarget.t] : 0;
          if (pv > gainVal) score -= (pv - gainVal) * 11;
        }

        p.x = origX; p.y = origY;
        S.grid[origY][origX] = p;
        S.grid[b][a] = prevTarget;
      }

      if (score > bs) { bs = score; bestMove = [p, a, b]; }
    }
  }
  if (bestMove && bs > -35) doMove(bestMove[0], bestMove[1], bestMove[2]);
}

function activateBoost(i) {
  if (!S || S.over || i < 0 || !S.f[i] || S.f[i].energy < 100) return false;
  if (S.mode === 'online') {
    sendSocket('game:boost');
    return true;
  }
  const f = S.f[i];
  f.energy = 0;
  f.boostUntil = S.T + 6;
  for (const p of S.pieces) {
    if (p.o === i && p.ready > S.T) p.ready = S.T + (p.ready - S.T) * 0.48;
  }
  S.fx.push({ x: 8, y: 8, t: S.T, col: FAC[i].col, big: 1 });
  feed('<b>' + teamName(i) + '</b> ativou SURTO! Exército acelerado por 6 segundos.');
  playTone('boost');
  if (S.mode === 'tutorial' && i === 0 && tut.step === 7) {
    advanceTutorialStep(8);
  }
  return true;
}

function abilityOwner() {
  if (S.mode === 'online') return onlineSide;
  if (S.mode === 'arena' || S.mode === 'cpu' || S.mode === 'tutorial') return 0;
  return S.sel && S.sel.o >= 0 ? S.sel.o : 0;
}

/* Interactive 8-Step Tutorial System */
function startInteractiveTutorial() {
  switchNav('play');
  tut = {
    active: true,
    step: 1,
    maxUnlockedStep: 1,
    paused: false,
    botMovedInStep4: false,
    movesInStep6: 0,
    targetPieceId: null,
    attackerPieceId: null
  };
  reset('tutorial');
  S.started = true;
  S.turnOwner = 0;
  S.turnTimer = createTurnTimer();
  $('start').classList.add('hidden');
  $('cpuDiffOverlay').classList.add('hidden');
  $('onlineLobbyOverlay').classList.add('hidden');
  $('over').classList.add('hidden');
  $('tutorialBanner').classList.remove('hidden');
  $('hudTutorialCard').classList.remove('hidden');
  $('hudTutProgressRow').style.display = 'flex';
  $('statusText').textContent = 'TUTORIAL PRÁTICO · 1V1';
  renderTutorialStep();
  hud();
  setTimeout(resize, 20);
}

function clearHudHighlights() {
  $('scoreCard').classList.remove('highlight-ring');
  $('progressCard').classList.remove('highlight-ring');
  $('hudTutorialCard')?.classList.remove('highlight-ring');
}

function setTutorialHint(msg) {
  const el = $('tutHint');
  if (!msg) {
    el.classList.add('hidden');
    el.textContent = '';
  } else {
    el.textContent = msg;
    el.classList.remove('hidden');
  }
  if ($('hudTutExpected')) {
    $('hudTutExpected').textContent = msg || 'Siga a orientação da etapa atual no tabuleiro.';
  }
}

function ensureCapturableTargetForStep5() {
  const myPieces = S.pieces.filter(p => p.o === 0 && p.t !== 'K');
  for (const mp of myPieces) {
    for (const [mx, my] of moves(mp)) {
      const q = S.grid[my][mx];
      if (q && q.o !== 0) {
        tut.targetPieceId = q.id;
        tut.attackerPieceId = mp.id;
        return;
      }
    }
  }
  const pawn = myPieces.find(p => p.t === 'P') || myPieces[0];
  if (pawn) {
    const candidates = [[pawn.x - 1, pawn.y - 1], [pawn.x + 1, pawn.y - 1]];
    for (const [cx, cy] of candidates) {
      if (cx >= 0 && cy >= 0 && cx < N && cy < N && !S.grid[cy][cx]) {
        const np = add('P', -1, cx, cy);
        np.ready = 0;
        tut.targetPieceId = np.id;
        tut.attackerPieceId = pawn.id;
        calcAtt();
        return;
      }
    }
  }
}

function ensureOrbForStep7() {
  const myPiece = S.pieces.find(p => p.o === 0 && p.t !== 'K') || S.pieces.find(p => p.o === 0);
  if (myPiece) {
    const ms = moves(myPiece).filter(([x, y]) => !S.grid[y][x]);
    if (ms.length) {
      const [ox, oy] = ms[0];
      if (!S.orbs.some(o => o.x === ox && o.y === oy)) {
        S.orbs.unshift({ x: ox, y: oy, t: S.T });
      }
    }
  }
  S.f[0].energy = 100;
  hud();
}

function renderTutorialStep() {
  if (!tut.active) return;
  const total = TUTORIAL_STEPS.length;
  const info = TUTORIAL_STEPS.find(s => s.step === tut.step) || TUTORIAL_STEPS[0];
  $('tutStepBadge').textContent = `Etapa ${info.step} de ${total}`;
  $('tutProgressFill').style.width = `${Math.round((info.step / total) * 100)}%`;
  $('tutTitle').textContent = `${info.step}. ${info.title}`;
  $('tutText').textContent = info.text;
  $('tutPrevBtn').disabled = info.step <= 1;

  $('hudTutorialCard').classList.remove('hidden');
  $('hudTutProgressRow').style.display = 'flex';
  $('hudTutProgressText').textContent = `Etapa ${info.step} de ${total}`;
  $('hudTutBadge').textContent = `ETAPA ${info.step}/${total}`;
  $('hudTutTitle').textContent = `${info.step}. ${info.title}`;
  $('hudTutDesc').textContent = info.text;
  $('hudTutPrevBtn').disabled = info.step <= 1;

  setTutorialHint(info.hint);
  clearHudHighlights();
  if (info.hudHighlight && $(info.hudHighlight)) {
    $(info.hudHighlight).classList.add('highlight-ring');
  }
  if (tut.step === 5) ensureCapturableTargetForStep5();
  if (tut.step === 7) ensureOrbForStep7();
}

function advanceTutorialStep(nextStep) {
  if (!tut.active) return;
  const total = TUTORIAL_STEPS.length;
  tut.step = Math.min(total, Math.max(1, nextStep));
  tut.maxUnlockedStep = Math.max(tut.maxUnlockedStep || 1, tut.step);
  renderTutorialStep();
  hud();
}

function onTutorialPlayerMoved(piece, hadCapture) {
  if (!tut.active) return;
  if (tut.step <= 3) {
    tut.botMovedInStep4 = false;
    advanceTutorialStep(4);
    setTutorialHint(`Boa jogada com ${NOME[piece.t]}! Agora observe o Mentor Rubi (Bot) pensando e realizando o movimento dele no topo do tabuleiro...`);
    return;
  }
  if (tut.step === 4) {
    advanceTutorialStep(5);
    setTutorialHint('Excelente! Você já entendeu a alternância de jogadas. Agora na Etapa 5, selecione sua peça Azul e capture a peça destacada com anel dourado!');
    return;
  }
  if (tut.step === 5) {
    if (hadCapture) {
      tut.movesInStep6 = 0;
      advanceTutorialStep(6);
      setTutorialHint('Captura perfeita! Você ganhou pontos, XP e energia de Surto. Agora na Etapa 6, realize 2 movimentos estratégicos mantendo seu Rei protegido.');
    } else {
      ensureCapturableTargetForStep5();
      setTutorialHint('Bom movimento! Para concluir a Etapa 5, selecione uma peça Azul que alcance a peça marcada com anel dourado e capture-a.');
    }
    return;
  }
  if (tut.step === 6) {
    tut.movesInStep6 = (tut.movesInStep6 || 0) + 1;
    if (tut.movesInStep6 >= 2) {
      advanceTutorialStep(7);
    } else {
      setTutorialHint('Ótimo posicionamento! Aguarde a resposta do Mentor Rubi e faça mais 1 movimento estratégico para ir à Etapa 7.');
    }
    return;
  }
  if (tut.step === 8 && S.f[0].score >= 15 && !S.over) {
    gameOver(0, 'Objetivo de pontuação do tutorial concluído com sucesso!');
  }
}

function onTutorialBotMoved(piece, hadCapture) {
  if (!tut.active) return;
  const moveDesc = `${NOME[piece.t]} (${GLYPH[piece.t]})`;
  if (tut.step === 4) {
    tut.botMovedInStep4 = true;
    setTutorialHint(`O Mentor Rubi respondeu movendo ${moveDesc} (destacado em Rubi no tabuleiro)! Agora voltou a ser a sua vez: faça mais 1 movimento para ir à Etapa 5.`);
  }
}

function openTutorialReviewModal() {
  const modal = $('tutorialReviewModal');
  const list = $('tutorialReviewList');
  list.replaceChildren();
  for (const s of TUTORIAL_STEPS) {
    const item = document.createElement('div');
    item.className = 'review-step-item' + (tut.step === s.step ? ' current' : '');
    item.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
        <strong style="font-size:12.5px;color:var(--gold)">Etapa ${s.step} de ${TUTORIAL_STEPS.length} — ${s.title}</strong>
        <button class="mini-btn" type="button">Ir para etapa</button>
      </div>
      <div class="muted" style="font-size:11.5px;line-height:1.45">${s.text}</div>
    `;
    item.querySelector('button').addEventListener('click', () => {
      modal.classList.add('hidden');
      if (tut.active) advanceTutorialStep(s.step);
    });
    list.appendChild(item);
  }
  modal.classList.remove('hidden');
}

$('tutorialReviewCloseBtn').addEventListener('click', () => $('tutorialReviewModal').classList.add('hidden'));
$('tutorialReviewOkBtn').addEventListener('click', () => $('tutorialReviewModal').classList.add('hidden'));
$('tutReviewBtn').addEventListener('click', openTutorialReviewModal);
$('hudTutReviewBtn').addEventListener('click', openTutorialReviewModal);

$('tutPrevBtn').addEventListener('click', () => {
  if (tut.active && tut.step > 1) advanceTutorialStep(tut.step - 1);
});
$('hudTutPrevBtn').addEventListener('click', () => {
  if (tut.active && tut.step > 1) advanceTutorialStep(tut.step - 1);
});

$('tutPauseBtn').addEventListener('click', () => {
  if (!tut.active) return;
  tut.paused = !tut.paused;
  syncTurnTimerPauseState();
  $('tutPauseBtn').textContent = tut.paused ? 'Continuar' : 'Pausar';
  $('statusText').textContent = tut.paused ? 'TUTORIAL PAUSADO' : 'TUTORIAL PRÁTICO · 1V1';
});
$('tutNextBtn').addEventListener('click', () => {
  if (!tut.active) return;
  if (tut.step < TUTORIAL_STEPS.length) advanceTutorialStep(tut.step + 1);
  else gameOver(0, 'Tutorial finalizado pelo jogador.');
});
$('hudTutNextBtn').addEventListener('click', () => {
  if (!tut.active) return;
  if (tut.step < TUTORIAL_STEPS.length) advanceTutorialStep(tut.step + 1);
  else gameOver(0, 'Tutorial finalizado pelo jogador.');
});
$('tutExitBtn').addEventListener('click', () => requestReturnToMenu());

$('startTutorialFromMenuBtn').addEventListener('click', startInteractiveTutorial);
$('guideStartTutorialBtn').addEventListener('click', startInteractiveTutorial);
$('settingsStartTutorialBtn').addEventListener('click', startInteractiveTutorial);

/* Game Loop Update */
function update(dt) {
  if (!S || !S.started || S.over || S.mode === 'online') return;
  if ((S.mode === 'tutorial' && tut.paused) || confirmModalOpen) {
    syncTurnTimerPauseState();
    return;
  }

  S.T += dt;
  if (S.classic) {
    S.chessClock[S.turnOwner] = Math.max(0, S.chessClock[S.turnOwner] - dt);
    if (S.chessClock[S.turnOwner] <= 0) {
      const winner = classicCanMate(1 - S.turnOwner) ? 1 - S.turnOwner : null;
      gameOver(winner, winner === null ? 'Tempo esgotado, mas não há material para dar mate: empate.' : 'Tempo esgotado.');
    } else if (S.mode === 'classic_cpu' && S.turnOwner === 1 && S.T >= S.nextBotAt) {
      classicBotMove();
    }
    return;
  }
  S.attT -= dt;
  if (S.attT <= 0) { calcAtt(); S.attT = 0.22; }

  const lvlBoost = Math.min(0.35, S.T / 500);
  for (const i of activeTeams()) {
    if (!isBot(i)) continue;
    const f = S.f[i];
    if (!f.alive) {
      if (S.mode === 'arena' && S.T >= f.respawn) {
        if (!spawnArmy(i)) f.respawn = S.T + 2;
      }
      continue;
    }
    if (S.T >= f.next) {
      if (S.mode === 'tutorial') {
        if (S.turnOwner === 1) {
          botThink(i);
          calcAtt();
        }
        f.next = S.T + 1.1;
      } else {
        botThink(i);
        calcAtt();
        const baseInt = S.mode === 'cpu'
          ? (CPU_LEVELS.find(c => c.level === cpuDifficulty)?.interval || 0.9)
          : Math.max(0.38, 0.95 - lvlBoost);
        f.next = S.T + baseInt * (0.78 + Math.random() * 0.44);
      }
    }
  }

  for (const p of S.pieces.slice()) {
    if (p.q && p.ready <= S.T && (p.o === 0 || S.mode === 'duel') && S.grid[p.y][p.x] === p) {
      if (S.mode === 'tutorial' && S.turnOwner !== 0) continue;
      const [a, b] = p.q;
      p.q = null;
      if (moves(p).some(m => m[0] === a && m[1] === b)) doMove(p, a, b);
    }
  }

  S.foodT -= dt;
  if (S.foodT <= 0) {
    S.foodT = S.mode === 'tutorial' ? 3.2 : 1.05;
    const maxNeutral = S.mode === 'arena' ? 45 : S.mode === 'tutorial' ? 10 : 34;
    if (S.pieces.filter(p => p.o < 0).length < maxNeutral) spawnFood(S.mode === 'tutorial');
  }
  S.orbT -= dt;
  if (S.orbT <= 0) {
    S.orbT = 6.8 + Math.random() * 2.4;
    spawnOrb();
  }
  S.fx = S.fx.filter(e => S.T - e.t < 0.65);
}

const PIECE_RULE_SUMMARY = {
  P: 'O Peão (♟) avança 1 casa para frente (se vazia) e captura 1 casa na diagonal frontal.',
  N: 'O Cavalo (♞) salta em formato de "L" (2×1) e pode pular sobre outras peças.',
  B: 'O Bispo (♝) desliza pelas diagonais livres quantas casas quiser.',
  R: 'A Torre (♜) desliza em linha reta (horizontal ou vertical) por casas livres.',
  Q: 'A Rainha (♛) combina Torre e Bispo: move-se em linha reta ou diagonal.',
  K: 'O Rei (♚) move-se 1 casa em qualquer direção. Proteja-o a todo custo!'
};

function explainInvalidMoveInTutorial(piece, targetX, targetY) {
  setTutorialHint(`Movimento inválido para ${NOME[piece.t]}: ${PIECE_RULE_SUMMARY[piece.t] || ''} Toque em um dos pontos ou círculos destacados no tabuleiro.`);
}

function handleClick(a, b) {
  if (!S || !S.started || S.over || a < 0 || b < 0 || a >= N || b >= N) return;
  if ((S.mode === 'tutorial' && tut.paused) || confirmModalOpen) return;

  if (S.mode === 'tutorial' && S.turnOwner === 1) {
    setTutorialHint('Aguarde um instante: é a vez do Mentor Rubi (Bot) responder à sua jogada...');
    return;
  }

  const q = S.grid[b][a], s = S.sel;

  if (S.mode === 'online') {
    if (S.classic && S.turn !== onlineSide) return;
    if (s && moves(s).some(m => m[0] === a && m[1] === b)) {
      if (S.classic) {
        sendSocket('game:move', { pieceId: s.id, x: a, y: b });
        S.sel = null;
        return;
      }
      if (s.ready <= S.T) {
        recordMoveAndSwitchTurn(onlineSide, s.t, s.x, s.y, a, b);
        sendSocket('game:move', { pieceId: s.id, x: a, y: b });
        S.sel = null;
      } else {
        showToast('Essa peça ainda está se recuperando.');
      }
      return;
    }
    S.sel = q && q.o === onlineSide ? q : null;
    return;
  }

  if (S.classic && S.turnOwner !== 0) return;
  if (S.classic && s && moves(s).some(m => m[0] === a && m[1] === b)) {
    doClassicMove(s, a, b);
    S.sel = null;
    return;
  }
  if (s) {
    if (moves(s).some(m => m[0] === a && m[1] === b)) {
      if (s.ready <= S.T) {
        doMove(s, a, b);
        s.q = null;
      } else if (prefs.autoQueueMove !== false && (s.o === 0 || S.mode === 'duel')) {
        s.q = [a, b];
        if (S.mode === 'tutorial') {
          setTutorialHint('Movimento agendado! A peça irá para lá assim que terminar a recarga.');
        }
      }
      return;
    }
    if (S.mode === 'tutorial' && (!q || q.o !== 0)) {
      explainInvalidMoveInTutorial(s, a, b);
      return;
    }
  }

  const selectable = q && q.o >= 0 && (S.mode === 'duel' ? true : S.classic ? q.o === S.turnOwner : q.o === 0);
  if (selectable) {
    S.sel = q;
    if (S.mode === 'tutorial') {
      if (tut.step === 1 || tut.step === 2) {
        advanceTutorialStep(3);
      }
      setTutorialHint(`${NOME[q.t]} selecionado(a)! ${PIECE_RULE_SUMMARY[q.t] || ''} Toque em uma casa destacada para mover.`);
    }
  } else {
    S.sel = null;
    if (S.mode === 'tutorial' && tut.step === 2) {
      setTutorialHint('Toque em uma peça AZUL (na parte inferior do tabuleiro) para selecioná-la e ver seus movimentos.');
    } else if (S.mode === 'tutorial' && q && q.o === 1) {
      setTutorialHint(`Essa peça pertence ao Mentor Rubi (${NOME[q.t]}). Selecione uma peça AZUL sua na parte inferior.`);
    }
  }
}

cv.addEventListener('pointerdown', e => {
  const r = cv.getBoundingClientRect();
  const x = e.clientX - r.left, y = e.clientY - r.top;
  handleClick(Math.floor(x / cell), Math.floor(y / cell));
});

function resize() {
  const wide = innerWidth > 860;
  const tutHeight = !$('tutorialBanner').classList.contains('hidden') ? ($('tutorialBanner').offsetHeight + 10) : 0;
  let availableWidth = wide ? Math.min(720, innerWidth - 330) : innerWidth - 22;
  let availableHeight = wide ? innerHeight - 130 - tutHeight : Math.min(innerHeight * 0.64, 540);
  let size = Math.max(224, Math.min(688, availableWidth, availableHeight));
  dpr = Math.min(2, window.devicePixelRatio || 1);
  cell = Math.max(14, Math.floor(size / N));
  const px = cell * N;
  cv.style.width = cv.style.height = px + 'px';
  cv.width = cv.height = Math.floor(px * dpr);
  $('wrap').style.width = (px + 12) + 'px';
  draw();
}

function getThemeColors() {
  if (prefs.boardTheme === 'slate') return { light: '#c5ccd1', dark: '#637482' };
  if (prefs.boardTheme === 'wood') return { light: '#dcc9ab', dark: '#967253' };
  return { light: '#d2cbb8', dark: '#788a7a' };
}

function draw() {
  if (!S) return;
  const W = cell * N;
  const theme = getThemeColors();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, W);

  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      ctx.fillStyle = (x + y) % 2 ? theme.dark : theme.light;
      ctx.fillRect(x * cell, y * cell, cell, cell);
      if (prefs.showCoords !== false && x === 0) {
        ctx.fillStyle = 'rgba(24, 30, 26, 0.45)';
        ctx.font = Math.max(8, Math.floor(cell * 0.21)) + 'px system-ui';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(String(N - y), x * cell + 2, y * cell + 2);
      }
    }
  }

  ctx.strokeStyle = 'rgba(79, 98, 87, 0.65)';
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, W - 1, W - 1);

  // Flux Orbs
  for (const o of S.orbs) {
    const x = o.x * cell + cell / 2, y = o.y * cell + cell / 2;
    const pulse = 0.85 + Math.sin(S.T * 4 + o.x) * 0.15;
    ctx.save();
    ctx.fillStyle = '#b9935a';
    ctx.beginPath();
    ctx.moveTo(x, y - cell * 0.27 * pulse);
    ctx.lineTo(x + cell * 0.22 * pulse, y);
    ctx.lineTo(x, y + cell * 0.27 * pulse);
    ctx.lineTo(x - cell * 0.22 * pulse, y);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#f3e5c8';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    if (S.mode === 'tutorial' && tut.step === 7) {
      ctx.strokeStyle = '#ffdf7e';
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.arc(x, y, cell * 0.44 * pulse, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  // Highlight last Bot move so player sees opponent action clearly
  if (S.lastBotMove && S.T - S.lastBotMove.t < 3.2) {
    ctx.save();
    ctx.fillStyle = 'rgba(189, 119, 120, 0.26)';
    ctx.strokeStyle = '#e07a7c';
    ctx.lineWidth = 2;
    for (const [bx, by] of [[S.lastBotMove.x0, S.lastBotMove.y0], [S.lastBotMove.x1, S.lastBotMove.y1]]) {
      ctx.fillRect(bx * cell, by * cell, cell, cell);
      ctx.strokeRect(bx * cell + 1.5, by * cell + 1.5, cell - 3, cell - 3);
    }
    ctx.restore();
  }

  // Tutorial Visual Guides on the Board
  if (S.mode === 'tutorial' && tut.active) {
    const pulse = 0.42 + Math.sin(S.T * 5) * 0.05;
    ctx.save();
    if (tut.step === 1) {
      // Highlight both Kings (Player & Mentor Bot)
      for (const p of S.pieces) {
        if (p.t === 'K') {
          ctx.strokeStyle = p.o === 0 ? '#f0c869' : '#e07a7c';
          ctx.lineWidth = 2.6;
          ctx.beginPath();
          ctx.arc(p.x * cell + cell / 2, p.y * cell + cell / 2, cell * (pulse + 0.05), 0, Math.PI * 2);
          ctx.stroke();
        }
      }
    } else if ((tut.step === 2 || tut.step === 3) && !S.sel) {
      ctx.strokeStyle = '#f0c869';
      ctx.lineWidth = 2.2;
      for (const p of S.pieces) {
        if (p.o === 0) {
          ctx.beginPath();
          ctx.arc(p.x * cell + cell / 2, p.y * cell + cell / 2, cell * pulse, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
    } else if (tut.step === 5) {
      const targetP = S.pieces.find(p => p.id === tut.targetPieceId);
      if (targetP) {
        ctx.strokeStyle = '#f0c869';
        ctx.lineWidth = 2.8;
        ctx.beginPath();
        ctx.arc(targetP.x * cell + cell / 2, targetP.y * cell + cell / 2, cell * (pulse + 0.04), 0, Math.PI * 2);
        ctx.stroke();
      }
      const attP = S.pieces.find(p => p.id === tut.attackerPieceId);
      if (attP && !S.sel) {
        ctx.strokeStyle = '#6f9daf';
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.arc(attP.x * cell + cell / 2, attP.y * cell + cell / 2, cell * pulse, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  const sel = S.sel, ms = sel ? moves(sel) : [];
  if (sel) {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.fillRect(sel.x * cell, sel.y * cell, cell, cell);
    ctx.strokeStyle = '#eff8ff';
    ctx.lineWidth = 2;
    ctx.strokeRect(sel.x * cell + 1, sel.y * cell + 1, cell - 2, cell - 2);
  }
  if (prefs.highlightMoves !== false) {
    for (const [a, b] of ms) {
      const q = S.grid[b][a], cx = a * cell + cell / 2, cy = b * cell + cell / 2;
      ctx.beginPath();
      if (q) {
        ctx.strokeStyle = q.shield > 0 ? '#a4c1bf' : '#c96b6b';
        ctx.lineWidth = 2.5;
        ctx.arc(cx, cy, cell * 0.39, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.fillStyle = 'rgba(30, 44, 34, 0.45)';
        ctx.arc(cx, cy, cell * 0.14, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    if (S.lastMove && S.T - S.lastMove.t < 0.9) {
      ctx.fillStyle = 'rgba(76, 94, 77, 0.22)';
      for (const [x, y] of [[S.lastMove.x0, S.lastMove.y0], [S.lastMove.x1, S.lastMove.y1]]) {
        ctx.fillRect(x * cell, y * cell, cell, cell);
      }
    }
  }

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = Math.floor(cell * 0.76) + 'px "Segoe UI Symbol","Noto Sans Symbols 2","DejaVu Sans",serif';

  for (const p of S.pieces) {
    const col = p.o >= 0 ? FAC[p.o].col : '#9aa6b2', cx = p.x * cell + cell / 2, cy = p.y * cell + cell / 2;
    ctx.fillStyle = p.o >= 0 ? col + '24' : '#3f474024';
    ctx.beginPath();
    ctx.arc(cx, cy, cell * 0.41, 0, Math.PI * 2);
    ctx.fill();

    if (p.o >= 0 && p.t === 'K') {
      ctx.strokeStyle = col;
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.arc(cx, cy, cell * 0.43, 0, Math.PI * 2);
      ctx.stroke();
      if (S.att && (S.att[p.y][p.x] & ~(1 << p.o)) !== 0) {
        ctx.strokeStyle = '#e05263';
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.arc(cx, cy, cell * 0.48, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    if (p.shield > 0) {
      ctx.strokeStyle = '#a6e9ff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, cell * 0.35, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.lineWidth = Math.max(2, cell * 0.065);
    ctx.strokeStyle = '#222622';
    ctx.strokeText(GLYPH[p.t], cx, cy + cell * 0.025);
    ctx.fillStyle = col;
    ctx.fillText(GLYPH[p.t], cx, cy + cell * 0.025);

    const rem = p.ready - S.T;
    if (rem > 0 && p.o >= 0) {
      ctx.fillStyle = 'rgba(28, 34, 30, 0.56)';
      ctx.fillRect(p.x * cell, p.y * cell, cell, cell * Math.min(1, rem / (p.cd0 || 1)));
    }
    if (p.q) {
      ctx.strokeStyle = '#cfaf72';
      ctx.lineWidth = 2;
      ctx.strokeRect(p.q[0] * cell + 3, p.q[1] * cell + 3, cell - 6, cell - 6);
    }
    if (p.o >= 0 && S.f[p.o].boostUntil > S.T) {
      ctx.strokeStyle = col + 'cc';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(cx, cy, cell * 0.47, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  if (Number.isInteger(S.checkmatedKingOwner)) {
    const king = S.pieces.find(p => p.o === S.checkmatedKingOwner && p.t === 'K');
    if (king) {
      const markerX = (king.x + 0.79) * cell;
      const markerY = (king.y + 0.21) * cell;
      ctx.save();
      ctx.fillStyle = '#c94250';
      ctx.beginPath();
      ctx.arc(markerX, markerY, cell * 0.19, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = `700 ${Math.max(9, Math.floor(cell * 0.3))}px system-ui`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('#', markerX, markerY);
      ctx.restore();
    }
  }

  for (const e of S.fx) {
    const k = (S.T - e.t) / 0.65;
    ctx.strokeStyle = e.col;
    ctx.globalAlpha = Math.max(0, 1 - k);
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(e.x * cell + cell / 2, e.y * cell + cell / 2, cell * (0.25 + k * (e.big ? 1 : 0.7)), 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
}

function hud() {
  if (!S) return;
  const teams = activeTeams();
  const rows = teams.map(i => ({ f: S.f[i], n: S.pieces.filter(p => p.o === i).length })).sort((a, b) => a.f.id - b.f.id);
  if (S.classic) {
    $('progressCard').classList.add('hidden');
    const category = S.options?.category || CLASSIC_CONTROLS[classicTimeControl]?.category || 'blitz';
    const ratings = onlineUser?.stats?.classicRatings || {};
    $('lb').innerHTML = rows.map(({ f }) => {
      const mine = S.mode === 'online' ? f.id === onlineSide : f.id === 0;
      const rating = mine ? (ratings[category] || 1200) : (S.opponent?.stats?.classicRatings?.[category] || 1200);
      return `<div class="player-row${mine ? ' me' : ''}"><span class="dot" style="background:${FAC[f.id].col}"></span><span class="name">${teamName(f.id)} · ${rating}</span><strong class="score">${fmtChessClock(S.chessClock[f.id])}</strong></div>`;
    }).join('');
    const active = S.turnOwner ?? S.turn ?? 0;
    $('turnBannerBox').classList.toggle('my-turn', active === (S.mode === 'online' ? onlineSide : 0));
    $('turnBannerBox').classList.toggle('bot-turn', active !== (S.mode === 'online' ? onlineSide : 0));
    $('turnOwnerDot').style.background = FAC[active]?.col || '#6f9daf';
    $('turnOwnerText').textContent = S.over ? 'Partida encerrada' : `Vez: ${teamName(active)}`;
    $('currentMoveTimer').textContent = fmtChessClock(S.chessClock[active]);
    $('lastMoveTimeText').textContent = S.clockControlLabel || S.options?.label || 'Xadrez Clássico';
    $('lastMoveTimeText').parentElement.firstElementChild.textContent = 'Controle de tempo:';
    $('moveHistoryList').innerHTML = '';
    $('feed').innerHTML = S.events.slice(0, 4).map(e => `<div class="feed-item"><i class="feed-mark"></i><span>${e.msg}</span></div>`).join('');
    $('statusText').textContent = S.over ? 'PARTIDA ENCERRADA' : (S.mode === 'online' ? 'XADREZ · AO VIVO' : 'XADREZ · EM ANDAMENTO');
    return;
  }
  $('progressCard').classList.remove('hidden');
  $('lastMoveTimeText').parentElement.firstElementChild.textContent = 'Jogada anterior:';
  $('lb').innerHTML = rows.map(({ f, n }) => {
    const isMe = f.id === (S.mode === 'online' ? onlineSide : 0), down = !f.alive;
    const isActiveTurn = (S.turnTimer?.activeOwner ?? 0) === f.id && S.started && !S.over;
    return `<div class="player-row${isMe ? ' me' : ''}"><span class="dot" style="background:${FAC[f.id].col}"></span><span class="name">${teamName(f.id)}${isActiveTurn ? ' · jogando' : ''}</span>${down ? '<span class="dead">☠ fora</span>' : `<span class="count">${n} peças</span>`}<span class="score">${f.score} pts</span></div>`;
  }).join('');

  // Individual Turn Timer & Previous Move Display
  if (S.turnTimer) {
    const activeOwner = S.turnTimer.activeOwner ?? 0;
    const isMyTurn = activeOwner === (S.mode === 'online' ? onlineSide : 0);
    const turnBox = $('turnBannerBox');
    if (turnBox) {
      turnBox.classList.toggle('my-turn', isMyTurn);
      turnBox.classList.toggle('bot-turn', !isMyTurn);
      $('turnOwnerDot').style.background = FAC[activeOwner]?.col || '#6f9daf';
      $('turnOwnerText').textContent = !S.started
        ? 'Aguardando início'
        : S.over
          ? 'Partida encerrada'
          : isMyTurn
            ? `Vez: ${teamName(activeOwner)}`
            : `Vez: ${teamName(activeOwner)}`;
      $('currentMoveTimer').textContent = getCurrentTurnElapsedSec().toFixed(1) + 's';
    }
    const lastM = S.turnTimer.lastMove;
    if ($('lastMoveTimeText')) {
      $('lastMoveTimeText').textContent = lastM
        ? `${lastM.durationSec.toFixed(1)}s · ${lastM.actorName} (${lastM.pieceName})`
        : '—';
    }
    const histEl = $('moveHistoryList');
    if (histEl) {
      histEl.innerHTML = S.turnTimer.history.slice(0, 4).map(h =>
        `<div class="move-history-item"><span>${h.actorName} · ${h.pieceName}</span><strong>${h.durationSec.toFixed(1)}s</strong></div>`
      ).join('');
    }
  }

  if (!tut.active) {
    $('hudTutorialCard')?.classList.add('hidden');
    if ($('hudTutProgressRow')) $('hudTutProgressRow').style.display = 'none';
  }

  const owner = abilityOwner(), f = S.f[owner], selectedTeam = S.sel ? S.sel.o : -1;
  $('progressTitle').textContent = (S.mode === 'online' || owner === 0) ? 'Sua Evolução' : FAC[owner].name;
  $('lvl').textContent = 'Nível ' + f.lvl;
  $('tm').textContent = fmt(S.T);
  $('xpText').textContent = f.xp + ' / ' + need(f) + ' XP';
  $('xp').style.width = Math.min(100, (f.xp / need(f)) * 100) + '%';
  $('nx').textContent = 'Próximo reforço: ' + NOME[GROW[Math.min(f.lvl, GROW.length - 1)]];
  $('energyText').textContent = Math.floor(f.energy) + '%';
  $('energy').style.width = f.energy + '%';
  $('energyLabel').textContent = (S.mode === 'online' || owner === 0) ? 'Habilidade Surto' : ('Surto · ' + (owner === 1 && S.mode === 'duel' ? 'Rubi' : FAC[owner].name));

  const boost = $('boost');
  if (f.boostUntil > S.T) {
    boost.textContent = 'SURTO ATIVO · ' + (f.boostUntil - S.T).toFixed(1) + 's';
    boost.disabled = true;
    boost.classList.remove('ready');
  } else {
    boost.textContent = f.energy >= 100 ? '⚡ ATIVAR SURTO' : 'SURTO · ' + Math.floor(f.energy) + '%';
    boost.disabled = f.energy < 100 || !f.alive;
    boost.classList.toggle('ready', !boost.disabled);
  }
  if (S.mode === 'duel' && selectedTeam === 1) $('progressTitle').textContent = 'Evolução · Rubi';

  $('feed').innerHTML = S.events.slice(0, 4).map(e => `<div class="feed-item"><i class="feed-mark"></i><span>${e.msg}</span></div>`).join('') || '<div class="feed-item"><i class="feed-mark"></i><span>Aguardando o primeiro movimento...</span></div>';
  if (!tut.active) {
    $('statusText').textContent = S.over ? 'PARTIDA ENCERRADA' : (S.started ? (S.mode === 'online' ? 'ONLINE · AO VIVO' : 'EM BATALHA') : 'AGUARDANDO');
  }
}

/* CPU Difficulty Selector UI */
function renderCpuDiffSelector() {
  const list = $('cpuDiffList');
  list.replaceChildren();
  for (const item of CPU_LEVELS) {
    const classicDescriptions = [
      'Joga lances legais, com escolhas variadas e erros frequentes.',
      'Prefere desenvolver peças e aproveitar capturas simples.',
      'Equilibra desenvolvimento, centro e oportunidades de captura.',
      'Escolhe lances táticos com menos aleatoriedade e protege peças.',
      'Prioriza os melhores lances avaliados e reduz ao mínimo os erros.'
    ];
    const description = selectedMode === 'classic' ? classicDescriptions[item.level - 1] : item.desc;
    const row = document.createElement('div');
    row.className = 'diff-item' + (cpuDifficulty === item.level ? ' selected' : '');
    const barsHtml = Array.from({ length: 5 }, (_, idx) => {
      const on = idx < item.level;
      const hard = item.level >= 4;
      return `<i class="diff-bar${on ? ' on' : ''}${on && hard ? ' hard' : ''}"></i>`;
    }).join('');
    row.innerHTML = `
      <div class="diff-main">
        <div class="diff-title-row">
          <span class="diff-name">${item.level}. ${item.name}</span>
          <div class="diff-meter" aria-label="Nível ${item.level} de 5">${barsHtml}</div>
          ${item.recommended ? '<span class="rec-tag">Recomendado para iniciantes</span>' : ''}
        </div>
        <div class="diff-desc">${description}</div>
        <div class="muted" style="font-size:10px;margin-top:2px;color:var(--gold)">${item.challenge}</div>
      </div>
    `;
    const btn = document.createElement('button');
    btn.className = cpuDifficulty === item.level ? 'primary' : 'secondary';
    btn.style.padding = '7px 12px';
    btn.textContent = 'Jogar';
    btn.addEventListener('click', e => {
      e.stopPropagation();
      cpuDifficulty = item.level;
      launchSelectedGame(selectedMode === 'classic' ? 'classic_cpu' : 'cpu');
    });
    row.addEventListener('click', () => {
      cpuDifficulty = item.level;
      renderCpuDiffSelector();
    });
    row.appendChild(btn);
    list.appendChild(row);
  }
}

let cpuOriginLobby = false;
function openCpuDiffSelector(fromLobby = false) {
  cpuOriginLobby = fromLobby;
  renderCpuDiffSelector();
  $('start').classList.add('hidden');
  $('over').classList.add('hidden');
  $('onlineLobbyOverlay').classList.add('hidden');
  $('cpuDiffOverlay').classList.remove('hidden');
}

$('cpuDiffBackBtn').addEventListener('click', () => {
  $('cpuDiffOverlay').classList.add('hidden');
  (cpuOriginLobby ? $('onlineLobbyOverlay') : $('start')).classList.remove('hidden');
});
$('cpuDiffCancelBtn').addEventListener('click', () => {
  $('cpuDiffOverlay').classList.add('hidden');
  (cpuOriginLobby ? $('onlineLobbyOverlay') : $('start')).classList.remove('hidden');
});
$('cpuDiffStartBtn').addEventListener('click', () => launchSelectedGame(selectedMode === 'classic' ? 'classic_cpu' : 'cpu'));
$('changeCpuDiffBtn').addEventListener('click', () => openCpuDiffSelector(false));

function openOnlineLobby() {
  $('start').classList.add('hidden');
  $('over').classList.add('hidden');
  $('cpuDiffOverlay').classList.add('hidden');
  $('onlineLobbyOverlay').classList.remove('hidden');
  const signed = Boolean(onlineUser);
  const classic = selectedMode === 'classic';
  $('classicLobbyControls').classList.toggle('hidden', !classic);
  $('onlineLobbyTitle').textContent = classic ? 'Xadrez Clássico' : 'Duelo Online 1v1';
  $('onlineLobbySub').textContent = classic
    ? 'Jogue contra o bot, crie uma sala privada ou encontre alguém na fila ranqueada.'
    : 'Encontre um adversário na fila pública ou crie uma sala privada.';
  $('queueBtn').textContent = classic ? 'BUSCAR OPONENTE RANQUEADO' : 'BUSCAR ADVERSÁRIO';
  $('classicTimeControl').value = classicTimeControl;
  $('onlineLobbyGuestNotice').classList.toggle('hidden', signed);
  $('onlineLobbyAuthContent').classList.toggle('hidden', !signed);
  if (signed && !wsReady) connectSocket();
}

$('onlineLobbyCloseBtn').addEventListener('click', () => {
  $('onlineLobbyOverlay').classList.add('hidden');
  if (!S?.started) $('start').classList.remove('hidden');
});
$('onlineGoAuthBtn').addEventListener('click', () => {
  $('onlineLobbyOverlay').classList.add('hidden');
  switchNav('profile');
});
$('openFriendsFromLobbyBtn').addEventListener('click', () => {
  $('onlineLobbyOverlay').classList.add('hidden');
  switchNav('friends');
});
$('classicBotBtn').addEventListener('click', () => {
  classicTimeControl = $('classicTimeControl').value;
  openCpuDiffSelector(true);
});

function launchSelectedGame(mode) {
  tut.active = false;
  $('tutorialBanner').classList.add('hidden');
  $('hudTutorialCard').classList.add('hidden');
  clearHudHighlights();
  reset(mode);
  S.started = true;
  S.turnTimer = createTurnTimer();
  $('start').classList.add('hidden');
  $('cpuDiffOverlay').classList.add('hidden');
  $('onlineLobbyOverlay').classList.add('hidden');
  $('over').classList.add('hidden');
  $('rematch').classList.add('hidden');
  $('again').classList.remove('hidden');
  $('statusText').textContent = 'EM BATALHA';
  hud();
  setTimeout(resize, 20);
}

function start() {
  if (selectedMode === 'online' || selectedMode === 'tactical_draft' || selectedMode === 'classic') {
    openOnlineLobby();
    if (selectedMode === 'tactical_draft') {
      setTimeout(() => $('createTacticalRoomBtn')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 80);
    }
    return;
  }
  if (selectedMode === 'cpu') {
    openCpuDiffSelector();
    return;
  }
  launchSelectedGame(selectedMode);
}

/* Confirmação dedicada para Desistir vs Voltar ao Menu Principal */
let pendingConfirmCallback = null;

function openConfirmExitModal(title, message, confirmLabel, onConfirm) {
  confirmModalOpen = true;
  syncTurnTimerPauseState();
  $('confirmExitTitle').textContent = title;
  $('confirmExitMessage').textContent = message;
  $('confirmExitConfirmBtn').textContent = confirmLabel;
  pendingConfirmCallback = onConfirm;
  $('confirmExitModal').classList.remove('hidden');
}

function closeConfirmExitModal() {
  confirmModalOpen = false;
  pendingConfirmCallback = null;
  $('confirmExitModal').classList.add('hidden');
  syncTurnTimerPauseState();
}

$('confirmExitCloseBtn').addEventListener('click', closeConfirmExitModal);
$('confirmExitCancelBtn').addEventListener('click', closeConfirmExitModal);
$('confirmExitConfirmBtn').addEventListener('click', () => {
  const cb = pendingConfirmCallback;
  closeConfirmExitModal();
  if (typeof cb === 'function') cb();
});

function executeResignMatch() {
  if (!S || !S.started || S.over) return;
  if (S.mode === 'online') {
    sendSocket('game:resign');
    return;
  }
  gameOver(1, 'Você desistiu da partida.');
}

function requestResignMatch() {
  if (!S || !S.started || S.over) {
    showToast('Não há uma partida em andamento para desistir.');
    return;
  }
  openConfirmExitModal(
    'Confirmar Desistência',
    'Tem certeza que deseja desistir da partida atual? A partida será encerrada imediatamente e o resultado será registrado como Derrota.',
    'Sim, desistir da partida',
    executeResignMatch
  );
}

function forceOpenMenu() {
  tut.active = false;
  $('tutorialBanner').classList.add('hidden');
  $('hudTutorialCard').classList.add('hidden');
  clearHudHighlights();
  if (S) { S.started = false; S.over = false; syncTurnTimerPauseState(); }
  $('over').classList.add('hidden');
  $('cpuDiffOverlay').classList.add('hidden');
  $('onlineLobbyOverlay').classList.add('hidden');
  $('start').classList.remove('hidden');
  $('rematch').classList.add('hidden');
  switchNav('play');
  setTimeout(resize, 20);
}

function requestReturnToMenu() {
  if (S && S.started && !S.over) {
    const msg = S.mode === 'online'
      ? 'Você está em uma partida online em andamento. Sair para o menu principal encerrará sua participação. Deseja realmente sair?'
      : 'Deseja sair da partida atual e retornar diretamente ao menu principal?';
    openConfirmExitModal(
      'Voltar ao Menu Principal',
      msg,
      'Sair para o Menu',
      () => {
        if (S?.mode === 'online' && !S.over) sendSocket('game:resign');
        forceOpenMenu();
      }
    );
    return;
  }
  forceOpenMenu();
}

function openMenu() {
  requestReturnToMenu();
}

$('hudResignBtn').addEventListener('click', requestResignMatch);

function chooseMode(mode) {
  selectedMode = mode;
  document.querySelectorAll('.mode-card').forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
  $('modeDesc').textContent = MODE_INFO[mode]?.desc || '';
  $('go').textContent = mode === 'arena'
    ? 'ENTRAR NA ARENA →'
    : mode === 'duel'
      ? 'COMEÇAR DUELO LOCAL →'
      : mode === 'cpu'
        ? 'ESCOLHER DIFICULDADE →'
        : mode === 'classic'
          ? 'CONFIGURAR XADREZ →'
        : mode === 'tactical_draft'
          ? 'ABRIR CERCO TÁTICO →'
          : 'ABRIR LOBBY ONLINE →';
  if (S && !S.started) $('modeTag').textContent = MODE_INFO[mode].tag;
}

/* Interactive Piece Demo Board in "Como jogar" */
const DEMO_SPECS = {
  P: {
    val: '1 ponto / XP',
    cd: '0.9 segundos',
    range: '1 casa frontal',
    rule: '<b>Peão (♟):</b> Avança 1 casa para frente (se estiver vazia) e captura 1 casa na diagonal frontal. Ao alcançar a última linha do tabuleiro, vira uma <b>Rainha (♛)</b> automaticamente!'
  },
  N: {
    val: '3 pontos / XP',
    cd: '1.4 segundos',
    range: 'Salto em L (2×1)',
    rule: '<b>Cavalo (♞):</b> Salta em formato de "L" e é a única peça que pode pular sobre outras peças no caminho. Excelente para ataques surpresa.'
  },
  B: {
    val: '3 pontos / XP',
    cd: '1.6 segundos',
    range: 'Diagonais livres',
    rule: '<b>Bispo (♝):</b> Desliza quantas casas quiser pelas diagonais livres. Forte para controlar longas linhas de longe.'
  },
  R: {
    val: '5 pontos / XP',
    cd: '1.8 segundos',
    range: 'Linhas retas livres',
    rule: '<b>Torre (♜):</b> Move-se na horizontal ou vertical por quantas casas livres desejar. Muito poderosa para cercar o Rei inimigo.'
  },
  Q: {
    val: '9 pontos / XP',
    cd: '2.2 segundos',
    range: 'Retas e diagonais',
    rule: '<b>Rainha (♛):</b> Combina os movimentos da Torre e do Bispo. É a peça mais forte do jogo, mas tem recarga de 2.2s — proteja-a bem!'
  },
  K: {
    val: '10 pontos (Vitória)',
    cd: '1.1 segundos',
    range: '1 casa ao redor',
    rule: '<b>Rei (♚):</b> Move-se 1 casa em qualquer direção. É o coração do seu exército: se ele for capturado no 1v1, a partida termina!'
  }
};

let demoState = { type: 'P', x: 3, y: 4, enemyX: 4, enemyY: 3 };
const demoCv = $('demoCanvas');
const demoCtx = demoCv.getContext('2d');

function computeDemoMoves() {
  const N_DEMO = 7;
  const { type, x, y, enemyX, enemyY } = demoState;
  const res = [];
  const ok = (a, b) => a >= 0 && b >= 0 && a < N_DEMO && b < N_DEMO;
  const isEnemy = (a, b) => a === enemyX && b === enemyY;
  const addSq = (a, b) => {
    if (!ok(a, b)) return false;
    res.push([a, b]);
    return !isEnemy(a, b);
  };
  if (type === 'R' || type === 'Q') {
    for (const [dx, dy] of ORTH) { let a = x + dx, b = y + dy; while (addSq(a, b)) { a += dx; b += dy; } }
  }
  if (type === 'B' || type === 'Q') {
    for (const [dx, dy] of DIAG) { let a = x + dx, b = y + dy; while (addSq(a, b)) { a += dx; b += dy; } }
  }
  if (type === 'N') for (const [dx, dy] of KN) addSq(x + dx, y + dy);
  if (type === 'K') for (const [dx, dy] of ORTH.concat(DIAG)) addSq(x + dx, y + dy);
  if (type === 'P') {
    if (ok(x, y - 1) && !isEnemy(x, y - 1)) res.push([x, y - 1]);
    for (const s of [-1, 1]) {
      if (ok(x + s, y - 1) && isEnemy(x + s, y - 1)) res.push([x + s, y - 1]);
    }
  }
  return res;
}

function drawDemoBoard() {
  if (!demoCv) return;
  const N_DEMO = 7, c = 34;
  const theme = getThemeColors();
  demoCtx.clearRect(0, 0, demoCv.width, demoCv.height);
  for (let y = 0; y < N_DEMO; y++) {
    for (let x = 0; x < N_DEMO; x++) {
      demoCtx.fillStyle = (x + y) % 2 ? theme.dark : theme.light;
      demoCtx.fillRect(x * c, y * c, c, c);
    }
  }
  const ms = computeDemoMoves();
  for (const [mx, my] of ms) {
    const cx = mx * c + c / 2, cy = my * c + c / 2;
    demoCtx.beginPath();
    if (mx === demoState.enemyX && my === demoState.enemyY) {
      demoCtx.strokeStyle = '#c96b6b';
      demoCtx.lineWidth = 2.5;
      demoCtx.arc(cx, cy, c * 0.39, 0, Math.PI * 2);
      demoCtx.stroke();
    } else {
      demoCtx.fillStyle = 'rgba(28, 42, 32, 0.5)';
      demoCtx.arc(cx, cy, c * 0.16, 0, Math.PI * 2);
      demoCtx.fill();
    }
  }
  demoCtx.textAlign = 'center';
  demoCtx.textBaseline = 'middle';
  demoCtx.font = '25px "Segoe UI Symbol","Noto Sans Symbols 2",serif';

  // Enemy target piece
  if (demoState.enemyX >= 0) {
    const ex = demoState.enemyX * c + c / 2, ey = demoState.enemyY * c + c / 2;
    demoCtx.fillStyle = '#bd7778';
    demoCtx.strokeStyle = '#222';
    demoCtx.lineWidth = 2;
    demoCtx.strokeText('♟', ex, ey + 1);
    demoCtx.fillText('♟', ex, ey + 1);
  }

  // Player demo piece
  const px = demoState.x * c + c / 2, py = demoState.y * c + c / 2;
  demoCtx.fillStyle = 'rgba(255,255,255,0.28)';
  demoCtx.fillRect(demoState.x * c, demoState.y * c, c, c);
  demoCtx.fillStyle = '#6f9daf';
  demoCtx.strokeStyle = '#222';
  demoCtx.lineWidth = 2;
  demoCtx.strokeText(GLYPH[demoState.type], px, py + 1);
  demoCtx.fillText(GLYPH[demoState.type], px, py + 1);
}

function selectDemoPiece(type) {
  demoState = { type, x: 3, y: 4, enemyX: type === 'N' ? 4 : 4, enemyY: type === 'N' ? 2 : 3 };
  document.querySelectorAll('#guidePiecePicker .piece-btn').forEach(b => b.classList.toggle('active', b.dataset.piece === type));
  const spec = DEMO_SPECS[type];
  $('guidePieceRuleText').innerHTML = spec.rule;
  $('guidePieceVal').textContent = spec.val;
  $('guidePieceCd').textContent = spec.cd;
  $('guidePieceRange').textContent = spec.range;
  drawDemoBoard();
}

document.querySelectorAll('#guidePiecePicker .piece-btn').forEach(btn => {
  btn.addEventListener('click', () => selectDemoPiece(btn.dataset.piece));
});

demoCv.addEventListener('pointerdown', e => {
  const r = demoCv.getBoundingClientRect();
  const gx = Math.floor((e.clientX - r.left) / 34);
  const gy = Math.floor((e.clientY - r.top) / 34);
  const ms = computeDemoMoves();
  if (ms.some(([a, b]) => a === gx && b === gy)) {
    demoState.x = gx;
    demoState.y = gy;
    if (demoState.type === 'P' && gy === 0) demoState.type = 'Q';
    if (gx === demoState.enemyX && gy === demoState.enemyY) {
      demoState.enemyX = (gx + 2) % 7;
      demoState.enemyY = (gy + 2) % 6 + 1;
    }
    drawDemoBoard();
  }
});

document.querySelectorAll('.guide-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    const target = tab.dataset.gtab;
    document.querySelectorAll('.guide-tab').forEach(t => t.classList.toggle('active', t === tab));
    document.querySelectorAll('.guide-section').forEach(sec => sec.classList.toggle('active', sec.id === 'gtab-' + target));
    if (target === 'pieces') setTimeout(drawDemoBoard, 20);
  });
});

/* API & WebSocket Communication */
async function apiRequest(path, body = null) {
  const headers = { 'Content-Type': 'application/json' };
  if (onlineToken) headers.Authorization = 'Bearer ' + onlineToken;
  const response = await fetch(path, {
    method: body ? 'POST' : 'GET',
    headers,
    credentials: 'same-origin',
    body: body ? JSON.stringify(body) : undefined
  });
  let data = {};
  try { data = await response.json(); } catch (_) {}
  if (!response.ok) throw new Error(data.error || 'Não foi possível concluir a solicitação.');
  return data;
}

function showOnlineMessage(message = '', kind = '') {
  const el = $('onlineMessage');
  if (!el) return;
  el.textContent = message;
  el.style.color = kind === 'error' ? 'var(--red)' : kind === 'success' ? 'var(--green)' : 'var(--muted)';
}

function showToast(message) {
  const stack = $('noticeStack'), el = document.createElement('div');
  el.className = 'notice-toast';
  el.textContent = message;
  stack.appendChild(el);
  while (stack.children.length > 4) stack.removeChild(stack.firstChild);
  setTimeout(() => el.remove(), 4400);
}

function sendSocket(type, payload = {}) {
  if (wsReady && ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type, ...payload }));
    return true;
  }
  showToast('Conectando ao servidor. Tente novamente em instantes.');
  if (onlineToken && !ws) connectSocket();
  return false;
}

function updateNavBadges() {
  const onlineCount = friendCache.filter(f => f.online).length;
  const badge = $('navFriendsOnlineBadge');
  badge.textContent = String(onlineCount);
  badge.classList.toggle('hidden', onlineCount === 0);

  const hasAlerts = incomingReqCache.length > 0 || challengeInbox.size > 0;
  $('navFriendsAlertDot').classList.toggle('hidden', !hasAlerts);
}

function renderAvatarSelector() {
  const grid = $('avatarSelectorGrid');
  if (!grid) return;
  grid.replaceChildren();
  for (const av of AVATARS) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'avatar-choice' + (selectedAvatarEdit === av ? ' selected' : '');
    btn.textContent = av;
    btn.addEventListener('click', () => {
      selectedAvatarEdit = av;
      renderAvatarSelector();
    });
    grid.appendChild(btn);
  }
}

function renderAccount() {
  const signed = Boolean(onlineUser);
  $('authView').classList.toggle('hidden', signed);
  $('accountView').classList.toggle('hidden', !signed);
  $('friendsGuestNotice').classList.toggle('hidden', signed);
  $('friendsAuthContent').classList.toggle('hidden', !signed);

  if (signed) {
    $('headerAvatar').textContent = onlineUser.avatar || '♟';
    $('headerAccountLabel').textContent = '@' + onlineUser.username;
    $('profileBigAvatar').textContent = onlineUser.avatar || '♟';
    $('accountName').textContent = onlineUser.displayName || onlineUser.username;
    $('accountHandle').textContent = '@' + onlineUser.username;
    $('accountBioText').textContent = onlineUser.bio || 'Sem frase de perfil definida.';

    const s = onlineUser.stats || {};
    const g = s.games || 0, w = s.wins || 0, l = s.losses || 0, d = s.draws || 0;
    const rate = g > 0 ? Math.round((w / g) * 100) : 0;
    $('statOnlineGames').textContent = String(g);
    $('statOnlineWins').textContent = String(w);
    $('statOnlineLosses').textContent = `${l} / ${d}`;
    $('statWinRate').textContent = `${rate}%`;
    $('statCpuWins').textContent = `${s.cpuWins || 0} (${s.cpuGames || 0} jogos)`;
    const ratings = s.classicRatings || {};
    for (const category of ['bullet', 'blitz', 'rapid', 'classic']) {
      $('statRating' + category[0].toUpperCase() + category.slice(1)).textContent = String(ratings[category] || 1200);
    }
    const diffNames = { 0: 'Nenhuma', 1: 'Iniciante', 2: 'Fácil', 3: 'Normal', 4: 'Difícil', 5: 'Especialista' };
    $('statCpuMax').textContent = diffNames[s.highestCpuLevel || 0] || 'Nenhuma';

    if (document.activeElement !== $('editUsername')) $('editUsername').value = onlineUser.username || '';
    if (document.activeElement !== $('editDisplayName')) $('editDisplayName').value = onlineUser.displayName || '';
    if (document.activeElement !== $('editBio')) $('editBio').value = onlineUser.bio || '';
    selectedAvatarEdit = onlineUser.avatar || '♟';
    renderAvatarSelector();
  } else {
    $('headerAvatar').textContent = '♟';
    $('headerAccountLabel').textContent = 'Entrar / Conta';
  }
  updateNavBadges();
}

function renderFriendRow(friend) {
  const row = document.createElement('div');
  row.className = 'friend-item';
  const statusClass = friend.inGame ? 'in_game' : friend.online ? 'online' : '';
  const statusLabel = friend.inGame ? 'Em partida agora' : friend.online ? 'Disponível para duelo' : 'Offline';
  row.innerHTML = `
    <div class="friend-ident">
      <div class="avatar-badge">${friend.avatar || '♟'}</div>
      <div class="friend-names">
        <strong>${friend.displayName || friend.username} <span class="muted" style="font-weight:500">@${friend.username}</span></strong>
        <span><i class="presence-dot ${statusClass}"></i>${statusLabel}</span>
      </div>
    </div>
  `;
  const actions = document.createElement('div');
  actions.className = 'friend-actions';

  const profBtn = document.createElement('button');
  profBtn.className = 'mini-btn';
  profBtn.textContent = 'Perfil';
  profBtn.addEventListener('click', () => inspectPlayerProfile(friend.username));
  actions.appendChild(profBtn);

  if (friend.online && !friend.inGame) {
    const chalBtn = document.createElement('button');
    chalBtn.className = 'mini-btn';
    chalBtn.style.borderColor = 'var(--accent)';
    chalBtn.textContent = '⚔️ Desafiar';
    chalBtn.addEventListener('click', () => openChallengeConfigModal(friend));
    actions.appendChild(chalBtn);
  }

  const remBtn = document.createElement('button');
  remBtn.className = 'mini-btn danger';
  remBtn.textContent = 'Remover';
  remBtn.addEventListener('click', () => {
    if (confirm(`Remover @${friend.username} da sua lista de amigos?`)) {
      sendSocket('friend:remove', { userId: friend.id });
    }
  });
  actions.appendChild(remBtn);

  const blkBtn = document.createElement('button');
  blkBtn.className = 'mini-btn danger';
  blkBtn.textContent = 'Bloquear';
  blkBtn.addEventListener('click', () => {
    if (confirm(`Bloquear @${friend.username}?`)) {
      sendSocket('friend:block', { userId: friend.id });
    }
  });
  actions.appendChild(blkBtn);

  row.appendChild(actions);
  return row;
}

function renderFriendsPage() {
  const onlineList = friendCache.filter(f => f.online && !f.inGame);
  const inGameList = friendCache.filter(f => f.online && f.inGame);
  const offlineList = friendCache.filter(f => !f.online);

  $('countOnlineFriends').textContent = String(onlineList.length);
  $('countInGameFriends').textContent = String(inGameList.length);
  $('countOfflineFriends').textContent = String(offlineList.length);

  const fillList = (elId, arr, emptyMsg) => {
    const box = $(elId);
    box.replaceChildren();
    if (!arr.length) { box.textContent = emptyMsg; return; }
    for (const f of arr) box.appendChild(renderFriendRow(f));
  };

  fillList('friendsOnlineList', onlineList, 'Nenhum amigo disponível online no momento.');
  fillList('friendsInGameList', inGameList, 'Nenhum amigo está em partida agora.');
  fillList('friendsOfflineList', offlineList, 'Nenhum amigo offline.');

  // Incoming requests
  $('countIncomingReq').textContent = String(incomingReqCache.length);
  const reqBox = $('friendRequests');
  reqBox.replaceChildren();
  if (!incomingReqCache.length) {
    reqBox.textContent = 'Nenhuma solicitação recebida.';
  } else {
    for (const r of incomingReqCache) {
      const row = document.createElement('div');
      row.className = 'friend-item';
      row.innerHTML = `<div class="friend-ident"><span class="avatar-badge">${r.from?.avatar || '♟'}</span><div class="friend-names"><strong>@${r.from?.username || 'jogador'}</strong><span>Quer adicionar você</span></div></div>`;
      const acts = document.createElement('div');
      acts.className = 'friend-actions';
      const acc = document.createElement('button');
      acc.className = 'mini-btn';
      acc.textContent = 'Aceitar';
      acc.addEventListener('click', () => sendSocket('friend:respond', { requestId: r.id, accept: true }));
      const rej = document.createElement('button');
      rej.className = 'mini-btn danger';
      rej.textContent = 'Recusar';
      rej.addEventListener('click', () => sendSocket('friend:respond', { requestId: r.id, accept: false }));
      acts.append(acc, rej);
      row.appendChild(acts);
      reqBox.appendChild(row);
    }
  }

  // Sent requests
  $('countOutgoingReq').textContent = String(outgoingReqCache.length);
  const sentBox = $('sentRequestsList');
  sentBox.replaceChildren();
  if (!outgoingReqCache.length) {
    sentBox.textContent = 'Nenhuma solicitação enviada pendente.';
  } else {
    for (const r of outgoingReqCache) {
      const row = document.createElement('div');
      row.className = 'friend-item';
      row.innerHTML = `<div class="friend-ident"><span class="avatar-badge">${r.to?.avatar || '♟'}</span><div class="friend-names"><strong>@${r.to?.username || 'jogador'}</strong><span>Aguardando resposta</span></div></div>`;
      const cancelBtn = document.createElement('button');
      cancelBtn.className = 'mini-btn danger';
      cancelBtn.textContent = 'Cancelar';
      cancelBtn.addEventListener('click', () => sendSocket('friend:cancel', { requestId: r.id }));
      row.appendChild(cancelBtn);
      sentBox.appendChild(row);
    }
  }

  renderChallenges();
  updateNavBadges();
}

function renderSearchResults(users) {
  const box = $('searchResults');
  box.replaceChildren();
  if (!users.length) {
    box.textContent = 'Nenhum jogador encontrado com esse nome.';
    return;
  }
  for (const u of users) {
    const row = document.createElement('div');
    row.className = 'friend-item';
    row.innerHTML = `<div class="friend-ident"><span class="avatar-badge">${u.avatar || '♟'}</span><div class="friend-names"><strong>${u.displayName || u.username} <span class="muted">@${u.username}</span></strong><span>${u.statusLabel || (u.online ? 'Online' : 'Offline')}</span></div></div>`;
    const acts = document.createElement('div');
    acts.className = 'friend-actions';

    const profBtn = document.createElement('button');
    profBtn.className = 'mini-btn';
    profBtn.textContent = 'Perfil';
    profBtn.addEventListener('click', () => inspectPlayerProfile(u.username));
    acts.appendChild(profBtn);

    if (u.isFriend) {
      const tag = document.createElement('span');
      tag.className = 'muted';
      tag.textContent = 'Já é amigo';
      acts.appendChild(tag);
    } else if (u.requestPending) {
      const tag = document.createElement('span');
      tag.className = 'muted';
      tag.textContent = 'Solicitação pendente';
      acts.appendChild(tag);
    } else {
      const addBtn = document.createElement('button');
      addBtn.className = 'mini-btn';
      addBtn.textContent = '+ Adicionar';
      addBtn.addEventListener('click', () => sendSocket('friend:request', { username: u.username }));
      acts.appendChild(addBtn);
    }
    row.appendChild(acts);
    box.appendChild(row);
  }
}

function renderChallenges() {
  const box = $('challengeList');
  box.replaceChildren();
  if (!challengeInbox.size) {
    box.textContent = 'Nenhum desafio pendente no momento.';
    updateNavBadges();
    return;
  }
  for (const c of challengeInbox.values()) {
    const row = document.createElement('div');
    row.className = 'friend-item';
    row.innerHTML = `
      <div class="friend-ident">
        <span class="avatar-badge">${c.from?.avatar || '⚔️'}</span>
        <div class="friend-names">
          <strong>@${c.from?.username || 'jogador'} desafiou você!</strong>
          <span>${c.summary || 'Partida 1v1 em tempo real'}</span>
        </div>
      </div>
    `;
    const acts = document.createElement('div');
    acts.className = 'friend-actions';
    const accept = document.createElement('button');
    accept.className = 'primary';
    accept.style.padding = '6px 12px';
    accept.textContent = 'Aceitar Duelo';
    accept.addEventListener('click', () => {
      sendSocket('challenge:respond', { challengeId: c.id, accept: true });
      challengeInbox.delete(c.id);
      renderChallenges();
    });
    const decline = document.createElement('button');
    decline.className = 'mini-btn danger';
    decline.textContent = 'Recusar';
    decline.addEventListener('click', () => {
      sendSocket('challenge:respond', { challengeId: c.id, accept: false });
      challengeInbox.delete(c.id);
      renderChallenges();
    });
    acts.append(accept, decline);
    row.appendChild(acts);
    box.appendChild(row);
  }
  updateNavBadges();
}

function renderGameHistory(games) {
  const box = $('gameHistory');
  box.replaceChildren();
  if (!games || !games.length) {
    box.textContent = 'Você ainda não disputou partidas registradas.';
    return;
  }
  for (const g of games) {
    const row = document.createElement('div');
    row.className = 'friend-item';
    const badgeColor = g.result === 'Vitória' ? 'var(--green)' : g.result === 'Derrota' ? 'var(--red)' : 'var(--gold)';
    const modeLabel = g.mode === 'classic' ? `Xadrez Clássico${CLASSIC_CONTROLS[g.timeControl]?.label ? ' · ' + CLASSIC_CONTROLS[g.timeControl].label : ''}` : g.mode === 'classic_cpu' ? 'Xadrez vs Bot' : g.mode === 'cpu' ? 'vs CPU' : g.mode === 'tutorial' ? 'Tutorial' : g.mode === 'duel' ? 'Duelo Local' : g.mode === 'arena' ? 'Arena' : g.mode === 'tactical_cpu' ? 'Cerco Tático vs CPU' : g.mode === 'tactical' ? 'Cerco Tático' : 'Online 1v1';
    const scoresText = Array.isArray(g.scores) ? `Placar: ${g.scores[0]} × ${g.scores[1]}` : '';
    const dateStr = g.createdAt ? new Date(g.createdAt).toLocaleDateString('pt-BR') : '';
    row.innerHTML = `
      <div class="friend-ident">
        <div class="avatar-badge" style="color:${badgeColor};font-weight:800;font-size:14px">${g.result === 'Vitória' ? '✓' : g.result === 'Derrota' ? '×' : '='}</div>
        <div class="friend-names">
          <strong><span style="color:${badgeColor}">${g.result}</span> · contra ${g.opponent} <span class="muted">(${modeLabel})</span></strong>
          <span>${scoresText} · Duração: ${fmt(g.duration || 0)} · ${dateStr} ${g.reason ? '· ' + g.reason : ''}</span>
        </div>
      </div>
    `;
    box.appendChild(row);
  }
}

/* Friend Challenge Configuration Modal */
function openChallengeConfigModal(friend) {
  pendingChallengeTargetId = friend.id;
  $('challengeModalTitle').textContent = `Desafiar @${friend.username}`;
  $('challengeModal').classList.remove('hidden');
}
$('challengeModalClose').addEventListener('click', () => $('challengeModal').classList.add('hidden'));
$('challengeCancelBtn').addEventListener('click', () => $('challengeModal').classList.add('hidden'));
$('challengeConfirmSendBtn').addEventListener('click', () => {
  if (!pendingChallengeTargetId) return;
  const options = {
    pace: $('chalPace').value,
    orbs: $('chalOrbs').value,
    timeLimit: Number($('chalTime').value) || 0
  };
  sendSocket('challenge:send', { userId: pendingChallengeTargetId, options });
  $('challengeModal').classList.add('hidden');
});

/* Inspect Friend / Player Profile Modal */
async function inspectPlayerProfile(username) {
  try {
    const data = await apiRequest('/api/users/' + encodeURIComponent(username));
    const u = data.user;
    const s = u.stats || {};
    const body = $('inspectModalBody');
    body.innerHTML = `
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px">
        <div class="avatar-badge" style="width:48px;height:48px;font-size:26px">${u.avatar || '♟'}</div>
        <div>
          <strong style="font-size:17px;display:block">${u.displayName || u.username}</strong>
          <span class="muted">@${u.username} · ${u.statusLabel || 'Offline'}</span>
          ${u.bio ? `<p class="muted" style="margin:4px 0 0">${u.bio}</p>` : ''}
        </div>
      </div>
      <div class="stats-grid" style="margin-bottom:12px">
        <div class="stat-box"><span>Jogos Online</span><strong>${s.games || 0}</strong></div>
        <div class="stat-box"><span>Vitórias</span><strong>${s.wins || 0}</strong></div>
        <div class="stat-box"><span>Vitórias vs CPU</span><strong>${s.cpuWins || 0}</strong></div>
      </div>
    `;
    $('inspectModal').classList.remove('hidden');
  } catch (err) {
    showToast(err.message);
  }
}
$('inspectModalClose').addEventListener('click', () => $('inspectModal').classList.add('hidden'));

/* Recovery Key Modal */
function showRecoveryKeyModal(key) {
  $('recoveryKeyDisplay').textContent = key;
  $('recoveryModal').classList.remove('hidden');
}
$('recoveryModalClose').addEventListener('click', () => $('recoveryModal').classList.add('hidden'));
$('recoveryModalOkBtn').addEventListener('click', () => $('recoveryModal').classList.add('hidden'));
$('copyRecoveryKeyBtn').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText($('recoveryKeyDisplay').textContent);
    showToast('Código de recuperação copiado!');
  } catch (_) {}
});

/* Online Game State Synchronization */
function applyOnlineState(data) {
  if (!data) return;
  tut.active = false;
  $('tutorialBanner').classList.add('hidden');
  clearHudHighlights();
  if (currentNav !== 'play') switchNav('play');

  onlineSide = Number(data.side) || 0;
  onlineOpponent = data.opponent?.displayName || data.opponent?.username || 'Adversário';
  N = data.classic || data.options?.mode === 'classic' ? 8 : 16;
  const classic = N === 8;
  const selectedId = S?.sel?.id ?? null;
  const pieces = (data.pieces || []).map(p => ({
    id: p.id, t: p.type, o: p.owner, x: p.x, y: p.y, ready: p.ready, cd0: p.cd0 || 1, q: null, shield: p.shield || 0
  }));
  const grid = Array.from({ length: N }, () => Array(N).fill(null));
  for (const p of pieces) if (p.x >= 0 && p.y >= 0 && p.x < N && p.y < N) grid[p.y][p.x] = p;
  const teams = (data.teams || []).map(t => ({
    id: t.id, score: t.score || 0, xp: t.xp || 0, lvl: t.level || 0,
    alive: t.alive !== false, respawn: 0, kings: t.kings || 0,
    energy: t.energy || 0, boostUntil: t.boostUntil || 0, captures: t.captures || 0
  }));

  S = {
    mode: 'online', classic, T: data.T || 0, grid, pieces, orbs: data.orbs || [], f: teams,
    opponent: data.opponent || null,
    options: data.options || {},
    turn: data.turn ?? 0,
    turnOwner: data.turn ?? 0,
    chessClock: classic ? (data.clocks || [0, 0]) : null,
    chessIncrement: data.options?.increment || 0,
    clockControlLabel: data.options?.label || '',
    castle: data.castle || null,
    enPassant: data.enPassant || null,
    ratingChanges: data.ratingChanges || null,
    sel: selectedId ? pieces.find(p => p.id === selectedId) || null : null,
    over: Boolean(data.over), started: true, nid: 0, foodT: 0, orbT: 0, attT: 0, att: null,
    fx: [], events: data.events || [], lastMove: data.lastMove || null,
    winner: data.winner ?? null, reason: data.reason || '',
    checkmatedKingOwner: classic && data.over && Number.isInteger(data.winner) && data.reason === 'Xeque-mate.'
      ? 1 - data.winner
      : null
  };
  calcAtt();

  $('start').classList.add('hidden');
  $('cpuDiffOverlay').classList.add('hidden');
  $('onlineLobbyOverlay').classList.add('hidden');
  $('modeTag').textContent = classic
    ? `XADREZ · ${data.options?.label || 'ONLINE'}${data.rated ? ' · RANQUEADA' : ''}`
    : 'DUELO ONLINE · ' + (onlineUser?.username || 'VOCÊ') + ' × ' + onlineOpponent;
  $('footerHint').textContent = classic
    ? 'Selecione uma peça e a casa de destino. Xeque-mate vence; o relógio controla o tempo da partida.'
    : 'Toque em uma peça da sua cor e depois na casa de destino. ESC cancela a seleção · ESPAÇO ativa o Surto em 100%.';
  $('playersLabel').textContent = '2 JOGADORES';
  $('statusText').textContent = S.over ? 'PARTIDA ENCERRADA' : 'ONLINE · AO VIVO';
  $('rematch').classList.toggle('hidden', !S.over);
  $('changeCpuDiffBtn').classList.add('hidden');

  if (S.checkmatedKingOwner !== null) {
    $('over').classList.add('hidden');
    $('statusText').textContent = 'XEQUE-MATE · #';
    renderClassicCheckmateBanner();
  } else if (S.over) {
    $('classicMateBanner').classList.add('hidden');
    showOnlineResult();
  } else {
    $('over').classList.add('hidden');
    $('classicMateBanner').classList.add('hidden');
  }
  hud();
}

function showOnlineResult() {
  const won = S.winner === onlineSide, draw = S.winner === null;
  if (won) playTone('win');
  $('overEyebrow').textContent = S.classic ? 'Fim do xadrez clássico' : 'Fim do duelo online';
  $('resultTitle').textContent = won ? 'VITÓRIA!' : draw ? 'EMPATE' : 'FIM DE JOGO';
  $('winnerText').textContent = won ? 'Você venceu!' : draw ? 'Partida empatada.' : onlineOpponent + ' venceu.';
  const mine = S.f[onlineSide], theirs = S.f[1 - onlineSide];
  if (S.classic) {
    const change = S.ratingChanges?.[onlineSide];
    const ratingText = S.rated && Number.isFinite(change)
      ? `<br>Variação de rating: <b>${change > 0 ? '+' : ''}${change}</b>`
      : S.rated ? '<br>Rating atualizado.' : '<br>Partida não ranqueada.';
    $('res').innerHTML = `${S.options?.label || 'Xadrez Clássico'}<br>${String(S.reason || 'Partida encerrada.')}${ratingText}`;
  } else {
    $('res').innerHTML = `Tempo: <b>${fmt(S.T)}</b><br>Seu placar: <b>${mine.score}</b> · Nível <b>${mine.lvl}</b><br>${onlineOpponent}: <b>${theirs.score}</b><br>${String(S.reason || 'Partida encerrada.')}`;
  }
  $('over').classList.remove('hidden');
  $('rematch').classList.remove('hidden');
  $('again').classList.add('hidden');
}

function handleSocketEvent(msg) {
  switch (msg.type) {
    case 'auth:ok':
      wsReady = true;
      onlineUser = msg.user;
      friendCache = msg.friends || [];
      incomingReqCache = msg.requests || [];
      outgoingReqCache = msg.sentRequests || [];
      if (msg.games) historyCache = msg.games;
      if (onlineUser?.preferences) {
        prefs = { ...prefs, ...onlineUser.preferences };
        applyPreferencesToDom();
      }
      renderAccount();
      renderFriendsPage();
      renderGameHistory(historyCache);
      checkFirstVisitPrompt();
      break;
    case 'profile:stats':
      if (msg.user) onlineUser = msg.user;
      if (msg.games) historyCache = msg.games;
      renderAccount();
      renderGameHistory(historyCache);
      renderSettingsPage();
      break;
    case 'games:history':
      historyCache = msg.games || [];
      renderGameHistory(historyCache);
      break;
    case 'social:update':
      if (msg.friends) friendCache = msg.friends;
      if (msg.requests) incomingReqCache = msg.requests;
      if (msg.sentRequests) outgoingReqCache = msg.sentRequests;
      renderFriendsPage();
      break;
    case 'profile:results':
      renderSearchResults(msg.users || []);
      break;
    case 'notice':
      showToast(msg.message || 'Atualização recebida.');
      break;
    case 'error':
      if (window.TacticalUI?.isOpen()) window.TacticalUI.onError(msg.message || 'Ocorreu um erro.');
      showOnlineMessage(msg.message || 'Ocorreu um erro.', 'error');
      showToast(msg.message || 'Ocorreu um erro.');
      if (msg.code === 'AUTH_EXPIRED') {
        onlineToken = '';
        localStorage.removeItem('cf_token');
        onlineUser = null;
        wsReady = false;
        explicitLogout = true;
        if (ws) ws.close();
        ws = null;
        renderAccount();
      }
      break;
    case 'presence:update':
      friendCache = friendCache.map(f =>
        f.id === msg.userId
          ? { ...f, online: Boolean(msg.online), inGame: Boolean(msg.inGame), status: msg.status, statusLabel: msg.statusLabel }
          : f
      );
      renderFriendsPage();
      break;
    case 'challenge:incoming':
      challengeInbox.set(msg.id, msg);
      renderChallenges();
      showToast(`⚔️ @${msg.from?.username || 'Amigo'} desafiou você (${msg.summary || '1v1'})! Abra a aba Amigos para aceitar.`);
      break;
    case 'challenge:declined':
      showToast(`@${msg.by?.username || 'Seu amigo'} recusou o desafio.`);
      break;
    case 'challenge:expired':
      if (msg.id) challengeInbox.delete(msg.id);
      renderChallenges();
      showToast('Um desafio expirou.');
      break;
    case 'challenge:accepted':
      showToast(`@${msg.by?.username || 'Seu amigo'} aceitou o desafio! Iniciando partida...`);
      break;
    case 'match:waiting':
      matchmaking = true;
      $('queueBtn').textContent = 'CANCELAR BUSCA';
      $('queueStatus').textContent = 'Procurando adversário conectado…';
      break;
    case 'match:cancelled':
      matchmaking = false;
      $('queueBtn').textContent = 'BUSCAR ADVERSÁRIO';
      $('queueStatus').textContent = 'Busca cancelada.';
      break;
    case 'room:created':
      $('roomCreated').classList.remove('hidden');
      $('roomCodeText').textContent = msg.code;
      $('queueStatus').textContent = 'Sala privada criada! Compartilhe o código com seu amigo.';
      showToast('Sala privada criada: ' + msg.code);
      break;
    case 'game:started':
    case 'game:state':
    case 'game:ended':
      matchmaking = false;
      $('queueBtn').textContent = 'BUSCAR ADVERSÁRIO';
      if (msg.state?.mode === 'tactical_draft') {
        window.TacticalUI?.onState(msg.state);
      } else {
        applyOnlineState(msg.state);
      }
      break;
    case 'tactical:state':
    case 'tactical:startDraft':
    case 'tactical:cardEffect':
      window.TacticalUI?.onState(msg.state);
      break;
    case 'tactical:left':
      window.TacticalUI?.onLeft(msg.outcome);
      break;
    case 'game:connection':
      if (window.TacticalUI?.isOpen()) window.TacticalUI.onConnection(msg);
      showToast(msg.connected ? 'Seu adversário reconectou à partida.' : 'Seu adversário perdeu a conexão. Aguardando reconexão...');
      break;
    case 'game:rematch-request':
      if (confirm(`@${msg.from?.username || 'Seu adversário'} pediu uma revanche. Aceitar?`)) {
        sendSocket('game:rematch');
      }
      break;
    case 'game:rematch-waiting':
      $('rematch').textContent = 'AGUARDANDO RESPOSTA…';
      $('rematch').disabled = true;
      $('classicMateRematch').textContent = 'AGUARDANDO RESPOSTA…';
      $('classicMateRematch').disabled = true;
      showToast('Pedido de revanche enviado.');
      break;
    case 'game:rematch-started':
      $('rematch').disabled = false;
      $('rematch').textContent = 'PEDIR REVANCHE';
      $('classicMateRematch').disabled = false;
      $('classicMateRematch').textContent = 'PEDIR REVANCHE';
      break;
  }
}

function connectSocket() {
  if (!onlineToken || (ws && [WebSocket.CONNECTING, WebSocket.OPEN].includes(ws.readyState))) return;
  if (location.protocol === 'file:') return;
  explicitLogout = false;
  clearTimeout(reconnectTimer);
  const scheme = location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(scheme + '//' + location.host + '/ws');
  ws.addEventListener('open', () => {
    ws.send(JSON.stringify({ type: 'auth', token: onlineToken }));
  });
  ws.addEventListener('message', event => {
    let msg;
    try { msg = JSON.parse(event.data); } catch (_) { return; }
    handleSocketEvent(msg);
  });
  ws.addEventListener('close', () => {
    wsReady = false;
    if (onlineToken && !explicitLogout) {
      reconnectTimer = setTimeout(connectSocket, 2400);
    }
  });
}

async function restoreSessionOnLoad() {
  try {
    const rawHist = localStorage.getItem('cf_local_history');
    if (rawHist) historyCache = JSON.parse(rawHist);
  } catch (_) {}

  if (location.protocol === 'file:') {
    checkFirstVisitPrompt();
    return;
  }
  try {
    const data = await apiRequest('/api/me');
    if (data.user) {
      onlineUser = data.user;
      friendCache = data.friends || [];
      incomingReqCache = data.requests || [];
      outgoingReqCache = data.sentRequests || [];
      if (data.games) historyCache = data.games;
      if (onlineUser.preferences) {
        prefs = { ...prefs, ...onlineUser.preferences };
        applyPreferencesToDom();
      }
      renderAccount();
      renderFriendsPage();
      renderGameHistory(historyCache);
      connectSocket();
    }
  } catch (_) {
    onlineToken = '';
    localStorage.removeItem('cf_token');
  }
  checkFirstVisitPrompt();
}

/* Auth & Profile Actions */
async function doAuth(kind) {
  const username = $('authUsername').value.trim();
  const password = $('authPassword').value;
  const rememberMe = $('authRememberMe').checked;
  if (!username || !password) {
    showOnlineMessage('Informe seu nome de usuário e senha.', 'error');
    return;
  }
  showOnlineMessage(kind === 'login' ? 'Entrando…' : 'Criando sua conta…');
  try {
    const payload = {
      username,
      password,
      rememberMe,
      preferences: prefs,
      tutorialCompleted: localStorage.getItem('cf_tutorial_completed') === '1',
      tutorialPromptState: localStorage.getItem('cf_tutorial_prompt') || 'pending'
    };
    const data = await apiRequest(kind === 'login' ? '/api/login' : '/api/register', payload);
    onlineToken = data.token;
    localStorage.setItem('cf_token', onlineToken);
    onlineUser = data.user;
    friendCache = data.friends || [];
    incomingReqCache = data.requests || [];
    outgoingReqCache = data.sentRequests || [];
    if (data.games) historyCache = data.games;
    $('authPassword').value = '';
    renderAccount();
    renderFriendsPage();
    renderGameHistory(historyCache);
    connectSocket();
    showOnlineMessage('Conectado com sucesso!', 'success');
    showToast('Bem-vindo, @' + onlineUser.username + '!');
    if (data.recoveryKey) {
      showRecoveryKeyModal(data.recoveryKey);
    }
  } catch (err) {
    showOnlineMessage(err.message, 'error');
  }
}

async function logout() {
  if (S?.mode === 'online' && !S.over && !confirm('Sair da conta durante uma partida contará como desistência. Continuar?')) return;
  if (S?.mode === 'online' && !S.over) sendSocket('game:resign');
  try { await apiRequest('/api/logout', {}); } catch (_) {}
  explicitLogout = true;
  clearTimeout(reconnectTimer);
  if (ws) { ws.close(); ws = null; }
  wsReady = false;
  matchmaking = false;
  onlineUser = null;
  onlineToken = '';
  friendCache = [];
  incomingReqCache = [];
  outgoingReqCache = [];
  localStorage.removeItem('cf_token');
  renderAccount();
  showToast('Sessão encerrada.');
}

$('loginBtn').addEventListener('click', () => doAuth('login'));
$('registerBtn').addEventListener('click', () => doAuth('register'));
$('logoutBtn').addEventListener('click', logout);

$('saveProfileBtn').addEventListener('click', async () => {
  const msgEl = $('profileSaveMsg');
  msgEl.textContent = 'Salvando alterações...';
  try {
    const data = await apiRequest('/api/profile/update', {
      username: $('editUsername').value.trim(),
      displayName: $('editDisplayName').value.trim(),
      bio: $('editBio').value.trim(),
      avatar: selectedAvatarEdit
    });
    onlineUser = data.user;
    renderAccount();
    msgEl.style.color = 'var(--green)';
    msgEl.textContent = 'Perfil atualizado com sucesso!';
    showToast('Perfil atualizado!');
  } catch (err) {
    msgEl.style.color = 'var(--red)';
    msgEl.textContent = err.message;
  }
});

$('changePasswordBtn').addEventListener('click', async () => {
  const msgEl = $('passwordChangeMsg');
  const currentPassword = $('curPasswordInput').value;
  const newPassword = $('newPasswordInput').value;
  if (!currentPassword || !newPassword) {
    msgEl.style.color = 'var(--red)';
    msgEl.textContent = 'Preencha a senha atual e a nova senha.';
    return;
  }
  try {
    const res = await apiRequest('/api/profile/password', { currentPassword, newPassword });
    $('curPasswordInput').value = '';
    $('newPasswordInput').value = '';
    msgEl.style.color = 'var(--green)';
    msgEl.textContent = res.message || 'Senha alterada com sucesso!';
    showToast('Sua senha foi atualizada.');
  } catch (err) {
    msgEl.style.color = 'var(--red)';
    msgEl.textContent = err.message;
  }
});

$('regenRecoveryBtn').addEventListener('click', async () => {
  const currentPassword = $('curPasswordInput').value;
  if (!currentPassword) {
    showToast('Digite sua senha atual no campo "Senha atual" acima para gerar um novo código.');
    $('curPasswordInput').focus();
    return;
  }
  try {
    const res = await apiRequest('/api/profile/recovery-key', { currentPassword });
    if (res.recoveryKey) showRecoveryKeyModal(res.recoveryKey);
  } catch (err) {
    showToast(err.message);
  }
});

$('resetPasswordBtn').addEventListener('click', async () => {
  const msgEl = $('resetMessage');
  const username = $('resetUsername').value.trim();
  const recoveryKey = $('resetRecoveryKey').value.trim();
  const newPassword = $('resetNewPassword').value;
  if (!username || !recoveryKey || !newPassword) {
    msgEl.style.color = 'var(--red)';
    msgEl.textContent = 'Preencha o usuário, o código de recuperação e a nova senha.';
    return;
  }
  try {
    const res = await apiRequest('/api/password/reset', { username, recoveryKey, newPassword });
    $('resetRecoveryKey').value = '';
    $('resetNewPassword').value = '';
    msgEl.style.color = 'var(--green)';
    msgEl.textContent = res.message;
    showToast('Senha redefinida! Faça login.');
  } catch (err) {
    msgEl.style.color = 'var(--red)';
    msgEl.textContent = err.message;
  }
});

/* Friends & Lobby Controls */
$('searchBtn').addEventListener('click', () => {
  const query = $('searchPlayer').value.trim();
  if (query.length < 2) {
    showToast('Digite pelo menos 2 caracteres para buscar.');
    return;
  }
  sendSocket('profile:search', { query });
});
$('searchPlayer').addEventListener('keydown', e => {
  if (e.key === 'Enter') $('searchBtn').click();
});
$('refreshFriendsBtn').addEventListener('click', () => {
  if (wsReady) sendSocket('friends:refresh');
  renderFriendsPage();
});
$('refreshHistoryBtn').addEventListener('click', () => {
  if (wsReady) sendSocket('games:history');
  renderGameHistory(historyCache);
});

$('queueBtn').addEventListener('click', () => {
  if (matchmaking) {
    sendSocket('match:cancel');
    matchmaking = false;
    $('queueBtn').textContent = 'BUSCAR ADVERSÁRIO';
    $('queueStatus').textContent = 'Busca cancelada.';
  } else {
    const options = selectedMode === 'classic'
      ? { mode: 'classic', timeControl: $('classicTimeControl').value }
      : undefined;
    if (selectedMode === 'classic') classicTimeControl = options.timeControl;
    sendSocket('match:queue', options ? { options } : {});
    $('queueStatus').textContent = 'Entrando na fila pública 1v1…';
  }
});
$('createRoomBtn').addEventListener('click', () => {
  const options = selectedMode === 'classic'
    ? { mode: 'classic', timeControl: $('classicTimeControl').value }
    : undefined;
  if (selectedMode === 'classic') classicTimeControl = options.timeControl;
  sendSocket('room:create', options ? { options } : {});
});
$('createTacticalRoomBtn').addEventListener('click', () => sendSocket('room:create', { options: { mode: 'tactical_draft' } }));
$('startTacticalCpuBtn').addEventListener('click', () => sendSocket('tactical:startCpu'));
$('startTacticalTutorialBtn').addEventListener('click', () => sendSocket('tactical:startTutorial'));
$('joinRoomBtn').addEventListener('click', () => {
  const code = $('joinRoomCode').value.trim().toUpperCase();
  if (code.length !== 4 && code.length !== 6) {
    showToast('O código da sala precisa ter 4 ou 6 caracteres.');
    return;
  }
  sendSocket('room:join', { code });
});
$('joinRoomCode').addEventListener('input', e => {
  e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
});
$('copyRoomCode').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText($('roomCodeText').textContent);
    showToast('Código copiado!');
  } catch (_) {}
});
$('rematch').addEventListener('click', () => sendSocket('game:rematch'));
$('classicMateRematch').addEventListener('click', () => sendSocket('game:rematch'));
$('classicMateMenu').addEventListener('click', openMenu);

document.querySelectorAll('.mode-card').forEach(b => b.addEventListener('click', () => chooseMode(b.dataset.mode)));
$('go').addEventListener('click', start);
function replayCurrentGame() {
  if (S?.mode === 'tutorial') startInteractiveTutorial();
  else if (S?.mode === 'cpu') launchSelectedGame('cpu');
  else if (S?.mode === 'classic_cpu') launchSelectedGame('classic_cpu');
  else start();
}
$('again').addEventListener('click', replayCurrentGame);
$('classicMateAgain').addEventListener('click', replayCurrentGame);
$('menu').addEventListener('click', openMenu);
$('boost').addEventListener('click', () => activateBoost(abilityOwner()));

addEventListener('keydown', e => {
  const editing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target?.tagName);
  if (e.code === 'Escape' && S) { S.sel = null; hud(); }
  if (e.code === 'Space' && !editing && S && S.started && !S.over) {
    e.preventDefault();
    activateBoost(abilityOwner());
  }
});
addEventListener('resize', resize);

function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  update(dt);
  if (currentNav === 'play') draw();
  hudTimer -= dt;
  if (hudTimer <= 0) { hud(); hudTimer = 0.18; }
  requestAnimationFrame(loop);
}

loadLocalPreferences();
resize();
reset();
hud();
selectDemoPiece('P');
restoreSessionOnLoad();
requestAnimationFrame(loop);

window.__crownflux = {
  get state() { return S; },
  get tutorial() { return tut; },
  get cpuDifficulty() { return cpuDifficulty; },
  setCpuDifficulty(lv) { cpuDifficulty = lv; },
  reset, start, launchSelectedGame, startInteractiveTutorial, handleClick, doMove, moves, botThink, activateBoost, switchNav
};
