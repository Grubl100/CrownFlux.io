/* ======================================================================
   CERCO TÁTICO — Cliente
   O servidor é a autoridade das regras. Este módulo apenas apresenta o
   estado recebido e envia intenções (mover, jogar carta, encerrar turno).
   ====================================================================== */
(() => {
  'use strict';
  const el = (id) => document.getElementById(id);
  const COLS = 'ABCDEFGHIJKLMNOP';
  const cellName = (x, y) => `${COLS[x] || x}${y + 1}`;
  const fmtClock = (ms) => { const s = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
  const fmtSecs = (ms) => `${(Math.max(0, ms) / 1000).toFixed(1)}s`;
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const manhattan = (ax, ay, bx, by) => Math.abs(ax - bx) + Math.abs(ay - by);

  // Espelho do CARD_CATALOG do servidor (substituído pelos dados de /api/tactical/rules quando disponível)
  const FALLBACK = {
    cards: [
      { id: 'short_teleport', name: 'Teleporte Curto', cost: 2, targetType: 'cell', range: 2, desc: 'Pula até 2 casas no grid, ignorando paredes no caminho.' },
      { id: 'flux_siphon', name: 'Dreno Tático', cost: 1, targetType: 'none', range: 0, desc: 'Remove 1 PA do próximo turno do inimigo e recupera o PA gasto. Se ele estiver com a Coroa a até 4 casas, reduz 1 turno de domínio.' },
      { id: 'flux_wall', name: 'Barreira de Fluxo', cost: 1, targetType: 'cell', range: 4, durationRounds: 2, desc: 'Ergue um bloqueio temporário em uma casa vazia por 2 rodadas.' },
      { id: 'crown_dash', name: 'Impulso Real', cost: 3, targetType: 'cell', range: 3, desc: 'Avança até 3 casas em linha reta pelo tabuleiro.' },
      { id: 'kinetic_push', name: 'Golpe de Cerco', cost: 2, targetType: 'enemy', range: 2, desc: 'Atinge o inimigo a até 2 casas, empurrando-o 1 casa para trás e derrubando a Coroa (se não estiver protegida).' },
      { id: 'royal_charge', name: 'Investida Real', cost: 2, targetType: 'cell', range: 2, desc: 'Avança até 2 casas em linha reta e empurra um inimigo adjacente em 1 casa, sem roubar a Coroa diretamente.' },
      { id: 'transposition', name: 'Transposição', cost: 2, targetType: 'cell', range: 5, desc: 'Troca sua posição com uma Barreira de Fluxo aliada (bloqueada enquanto a Coroa estiver sob proteção).' },
      { id: 'stamina_overcharge', name: 'Sobrecarga de Estamina', cost: 0, targetType: 'none', range: 0, desc: 'Concede +2 PA imediatos neste turno, mas reduz em 1 PA o seu próximo turno.' }
    ],
    rules: { boardSize: 12, targetVp: 3, crownHoldGoal: 3, basePa: 3, crownPaPenalty: 1, turnLimitMs: 15000, draftMs: 8000, draftEveryRounds: 3, visionRadius: 4, reconnectMs: 30000 }
  };
  let catalog = FALLBACK;
  const R = () => (st && st.rules) || catalog.rules;

  /* ---------------- Arte dos personagens (SVG original) ---------------- */
  function wardenSVG() {
    return `<svg viewBox="0 0 64 80" aria-hidden="true">
      <path d="M19 29C15 44 13 60 11 76h42c-2-16-4-32-8-47z" fill="#2d4855"/>
      <path d="M19 29c-3 15-4.5 31-5.5 47H20c.5-16 1.5-31 3.5-45z" fill="#223a45"/>
      <path d="M45 29c3 15 5 31 6 47h-5c-.5-16-2-31-4.5-45z" fill="#26404c"/>
      <path d="M24.5 57h6.5v17h-6.5z" fill="#858e89"/><path d="M33 57h6.5v17H33z" fill="#747d78"/>
      <path d="M24.5 63h6.5v2h-6.5zM33 63h6.5v2H33z" fill="#5f6763"/>
      <path d="M23 73.5h9V77H22zM32.5 73.5h9l1 3.5h-10z" fill="#3b3631"/>
      <path d="M22 29h20l2.5 13-2 16h-21l-2-16z" fill="#a3aca7"/>
      <path d="M25 30h14v27l-7 5-7-5z" fill="#4c7d94"/>
      <path d="M25 30h2v27l-2-1.5z" fill="#3f6a7e"/>
      <path d="M25.5 39l6.5 4.5 6.5-4.5v3.4L32 46.9l-6.5-4.5z" fill="#e7e1d1"/>
      <rect x="21.5" y="45" width="21" height="3" rx=".6" fill="#5b4631"/>
      <rect x="30.4" y="44.6" width="3.2" height="3.8" rx=".6" fill="#cfaf72"/>
      <path d="M42 31l5 2-.5 12-4.5.5z" fill="#8e9792"/>
      <rect x="47.3" y="9" width="2.6" height="31" rx="1" fill="#e1e5e2"/>
      <path d="M47.3 9l1.3-4 1.3 4z" fill="#e1e5e2"/>
      <rect x="48.3" y="11" width=".6" height="27" fill="#b9bfbb"/>
      <rect x="44.2" y="39.6" width="8.8" height="2.4" rx="1" fill="#cfaf72"/>
      <rect x="47.6" y="42" width="2" height="5" fill="#5b4631"/>
      <circle cx="48.6" cy="47.6" r="1.4" fill="#cfaf72"/>
      <ellipse cx="46.2" cy="44.6" rx="2.6" ry="2.2" fill="#9aa39e"/>
      <path d="M15.5 31q5.5-6 11-1l-1 4.5q-5-2-10 .5z" fill="#bcc4bf"/>
      <path d="M48.5 31q-5.5-6-11-1l1 4.5q5-2 10 .5z" fill="#bcc4bf"/>
      <path d="M7.5 34h17v11c0 8-4 12.5-8.5 15-4.5-2.5-8.5-7-8.5-15z" fill="#3b6679" stroke="#cfaf72" stroke-width="1.3" stroke-linejoin="round"/>
      <path d="M16 34.6v24.6c4-2.6 7.9-6.7 7.9-14.2V34.6z" fill="#335a6b"/>
      <path d="M12.6 40h1.5v1.6h1.3V40h1.3v1.6H18V40h1.5v3h-.8v6.5h-5.3V43h-.8z" fill="#e7e1d1"/>
      <rect x="15.1" y="46.5" width="1.8" height="3" fill="#3b6679"/>
      <path d="M23.5 15c0-8 17-8 17 0v12c-5 3-12 3-17 0z" fill="#c6cdc9"/>
      <path d="M23.5 15c0-5 4-7.5 8.5-7.9v22c-3.2 0-6.2-.8-8.5-2.1z" fill="#d6dcd8"/>
      <rect x="25.2" y="18.2" width="13.6" height="2.4" rx="1" fill="#262a28"/>
      <path d="M31.3 21.5h1.4v5h-1.4z" fill="#262a28" opacity=".5"/>
      <path d="M23.5 26.6c5 2.6 12 2.6 17 0v1.6c-5 2.6-12 2.6-17 0z" fill="#cfaf72"/>
      <path d="M32 8c2-5 7-6.5 11-4.5-3.5.6-6 2.8-7.5 6.6z" fill="#4c7d94"/>
      <path d="M33.5 8.6c2-3 4.6-4.2 7.4-4" stroke="#7fa7b9" stroke-width=".9" fill="none"/>
    </svg>`;
  }
  function besiegerSVG() {
    return `<svg viewBox="0 0 64 80" aria-hidden="true">
      <rect x="12.6" y="4" width="1.8" height="34" fill="#4a3a2f"/>
      <path d="M14.4 5h11l-3 4.5 3 4.5h-11z" fill="#a4585a" stroke="#b79560" stroke-width=".7"/>
      <path d="M18 28c-5 16-6.5 32-8 48h44c-1.5-16-3-32-8-48z" fill="#5a3032"/>
      <path d="M18 28c-4 16-5.2 32-6 48h7c.6-16 1.6-31 3.5-46z" fill="#4a2729"/>
      <path d="M24 57h7v17h-7z" fill="#4c3d34"/><path d="M33 57h7v17h-7z" fill="#433529"/>
      <path d="M24 62h7v6h-7zM33 62h7v6h-7z" fill="#8a837c"/>
      <path d="M22.5 73.5H32V77H21.5zM32.5 73.5H42l1 3.5H32.5z" fill="#2c2420"/>
      <path d="M21 28h22l3 13-2.5 17H21l-2.5-17z" fill="#6b3b3d"/>
      <g fill="#b79560"><circle cx="23.6" cy="33" r=".7"/><circle cx="40.4" cy="33" r=".7"/><circle cx="23.2" cy="38" r=".7"/><circle cx="40.8" cy="38" r=".7"/><circle cx="23.2" cy="43" r=".7"/><circle cx="40.8" cy="43" r=".7"/></g>
      <path d="M26 30h12v26l-6 4.5-6-4.5z" fill="#a4585a"/>
      <path d="M26 30h2v26l-2-1.4z" fill="#8c4a4c"/>
      <circle cx="32" cy="40.5" r="3.4" fill="none" stroke="#2c2420" stroke-width="1.4"/>
      <path d="M27.8 46.2l8.4-8.4" stroke="#2c2420" stroke-width="1.6" stroke-linecap="round"/>
      <rect x="20.5" y="47" width="23" height="3" rx=".6" fill="#2c2420"/>
      <rect x="30.3" y="46.6" width="3.4" height="3.8" rx=".6" fill="#b79560"/>
      <path d="M20 31l-4 3 1 9h4z" fill="#6b3b3d"/>
      <ellipse cx="17.6" cy="44" rx="2.8" ry="2.4" fill="#8a837c"/>
      <rect x="48.4" y="3" width="2.2" height="72" rx="1" fill="#5c4632"/>
      <path d="M48.4 3l1.1-3 1.1 3z" fill="#cfc9c1"/>
      <path d="M50.6 8c7 1.5 9 5 9 9s-2 7.5-9 9z" fill="#cbc5bd"/>
      <path d="M50.6 8c4 1.2 5.6 4 5.8 9h-5.8z" fill="#ddd8d1"/>
      <path d="M48.4 13l-4 2.4 4 1.6z" fill="#cbc5bd"/>
      <path d="M44 31l4.5 2-.8 6h-4.5z" fill="#6b3b3d"/>
      <ellipse cx="48" cy="40" rx="3" ry="2.6" fill="#8a837c"/>
      <path d="M18.5 27.5c8-6 19-6 27 0l2 6c-9 4-22 4-31 0z" fill="#7a4244"/>
      <path d="M18.5 27.5c8-6 19-6 27 0l.6 1.8c-8.6-4.6-19.6-4.6-28.2 0z" fill="#8f5254"/>
      <path d="M24.5 22.5h15v4.2c-5 1.8-10 1.8-15 0z" fill="#746d67"/>
      <path d="M22.5 22.5c0-11 19-11 19 0l3.5 3.2c-8 2-18 2-26 0z" fill="#8f8882"/>
      <path d="M22.5 22.5c0-7 4.5-10 9.5-10.4v15.2c-4 0-8-.5-12.5-1.6z" fill="#a39c95"/>
      <rect x="24.5" y="19.4" width="15" height="2.2" rx="1" fill="#1f1a18"/>
      <path d="M19 25.7c8 2 18 2 26 0" stroke="#b79560" stroke-width="1.2" fill="none"/>
      <path d="M30.5 12.4c.5-4 2.5-6 3-6.5.5 1.5 1 4 .5 6.5z" fill="#a4585a"/>
    </svg>`;
  }
  function figHTML(who, extra = '', figTag = who) {
    return `<div class="ts-fig ${who === 'me' ? 'me-fig' : 'enemy-fig'} idle ${extra}" data-fig="${figTag}"><div class="ts-bob">${who === 'me' ? wardenSVG() : besiegerSVG()}</div></div>`;
  }
  const CROWN_SVG = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3 17.5l1.6-9 4.6 4 2.8-7 2.8 7 4.6-4 1.6 9z"/><rect x="3" y="18.8" width="18" height="2.4" rx=".6"/></svg>';
  const EYE_OFF_SVG = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M2 8s2.3-4 6-4 6 4 6 4-2.3 4-6 4-6-4-6-4z"/><path d="M2.5 13.5l11-11"/></svg>';
  const EYE_SVG = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M2 8s2.3-4 6-4 6 4 6 4-2.3 4-6 4-6-4-6-4z"/><circle cx="8" cy="8" r="1.8"/></svg>';
  const WALL_SVG = '<svg class="ts-wall" viewBox="0 0 20 20" preserveAspectRatio="none" aria-hidden="true"><rect x="1" y="2" width="18" height="17" rx="1.5" fill="#6e687e"/><path d="M1 7.5h18M1 13h18M7 2v5.5M13 2v5.5M4 7.5V13M10 7.5V13M16 7.5V13M7 13v6M13 13v6" stroke="#4a4659" stroke-width="1"/><rect x="1" y="2" width="18" height="1.6" fill="#8a84a0"/></svg>';

  /* ---------------- Apresentação das cartas ---------------- */
  const CARD_ICON = {
    short_teleport: '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="33" r="4.5"/><circle cx="37" cy="33" r="4.5" stroke-dasharray="3 3"/><path d="M14 26c4-11 16-11 20-1" stroke-dasharray="4 3.5"/><path d="M29.5 22.5l4.6 3.2 3.2-4.6"/></svg>',
    flux_siphon: '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="37" cy="13" r="5"/><circle cx="11" cy="35" r="4.5" fill="currentColor" fill-opacity=".25"/><path d="M33 17c-5 3-6 8-10 11s-6 3-8 4"/><path d="M15.5 27.5l-1 4.6 4.6.8"/></svg>',
    flux_wall: '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"><rect x="8" y="12" width="32" height="26" rx="2"/><path d="M8 20.5h32M8 29h32M18 12v8.5M30 12v8.5M13 20.5V29M24 20.5V29M35 20.5V29M18 29v9M30 29v9"/></svg>',
    crown_dash: '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M11 28l2.6-12 6.4 5.5 4-8.5 4 8.5 6.4-5.5L37 28z"/><path d="M11 32.5h26"/><path d="M9 40h26m-4-4 4 4-4 4"/></svg>',
    kinetic_push: '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M10 24h24"/><path d="M26 16l8 8-8 8"/><path d="M38 12v24"/></svg>',
    royal_charge: '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M8 24h26"/><path d="M26 15l9 9-9 9"/><path d="M14 14v20"/></svg>',
    transposition: '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M12 18h20l-5-5"/><path d="M36 30H16l5 5"/></svg>',
    stamina_overcharge: '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M26 6L12 26h12l-2 16 14-20H24z"/></svg>'
  };
  const CARD_TYPE = { short_teleport: 'Movimento', crown_dash: 'Movimento', flux_wall: 'Bloqueio', flux_siphon: 'Sabotagem', kinetic_push: 'Combate', royal_charge: 'Avanço', transposition: 'Tática', stamina_overcharge: 'Energia' };
  function cardChips(card) {
    const chips = [`Custo ${card.cost} PA`];
    if (card.id === 'short_teleport') chips.push(`Alcance 1–${card.range}`, 'Alvo: casa livre');
    else if (card.id === 'crown_dash') chips.push(`Linha reta 1–${card.range}`, 'Alvo: casa livre');
    else if (card.id === 'royal_charge') chips.push(`Linha reta 1–${card.range}`, 'Empurra adjacente');
    else if (card.id === 'flux_wall') chips.push(`Alcance 0–${card.range}`, `${card.durationRounds || 2} rodadas`);
    else if (card.id === 'flux_siphon') chips.push('Alvo automático', 'Drena Coroa');
    else if (card.id === 'kinetic_push') chips.push(`Alcance 1–${card.range}`, 'Empurra & derruba Coroa');
    else if (card.id === 'transposition') chips.push(`Alcance 1–${card.range}`, 'Troca com Barreira');
    else if (card.id === 'stamina_overcharge') chips.push('Custo 0 PA', '+2 PA agora / −1 próximo');
    return chips;
  }
  function renderCardEl(card, opts = {}) {
    const node = document.createElement('button');
    node.type = 'button';
    node.className = 'ts-card' + (opts.static ? ' static' : '') + (opts.lock ? ' locked' : '') + (opts.selected ? ' selected' : '');
    node.dataset.card = card.id;
    if (card.uid) node.dataset.uid = card.uid;
    node.setAttribute('role', opts.static ? 'img' : 'listitem');
    node.setAttribute('aria-label', `${card.name}, custo ${card.cost} PA. ${card.desc}${opts.lock ? ' Indisponível: ' + opts.lock : ''}`);
    node.innerHTML = `
      <div class="ts-card-top"><span class="ts-cost" title="Custo em Pontos de Ação">${card.cost}</span>
        <div style="min-width:0"><div class="ts-card-name">${esc(card.name)}</div><div class="ts-card-type">${CARD_TYPE[card.id] || 'Carta'}</div></div></div>
      <div class="ts-card-art">${CARD_ICON[card.id] || ''}</div>
      <div class="ts-card-meta">${cardChips(card).slice(1).map(c => `<span class="ts-chip">${esc(c)}</span>`).join('')}</div>
      <div class="ts-card-desc">${esc(card.desc)}</div>
      ${opts.lock ? `<div class="ts-card-lock">${esc(opts.lock)}</div>` : ''}`;
    return node;
  }

  /* ---------------- Regras de alvo (espelham a validação do servidor) ---------------- */
  // ctx: { n, me:{x,y}, others:[{x,y}], walls:Set("x,y"), crown:{x,y,holder} }
  function targetsFor(action, ctx) {
    const out = [];
    const occupied = (x, y) => (ctx.me.x === x && ctx.me.y === y) || ctx.others.some(o => o.x === x && o.y === y);
    const wall = (x, y) => ctx.walls.has(`${x},${y}`);
    for (let y = 0; y < ctx.n; y++) {
      for (let x = 0; x < ctx.n; x++) {
        const d = manhattan(ctx.me.x, ctx.me.y, x, y);
        let ok = false;
        if (action === 'move') ok = d === 1 && !wall(x, y) && !occupied(x, y);
        else if (action === 'short_teleport') ok = d >= 1 && d <= 2 && !wall(x, y) && !occupied(x, y);
        else if (action === 'flux_wall') ok = d <= 4 && !wall(x, y) && !occupied(x, y) && !(ctx.crown.holder === null && ctx.crown.x === x && ctx.crown.y === y);
        else if (action === 'crown_dash') {
          const dx = Math.abs(x - ctx.me.x), dy = Math.abs(y - ctx.me.y);
          ok = ((dx === 0 && dy > 0 && dy <= 3) || (dy === 0 && dx > 0 && dx <= 3)) && !wall(x, y) && !occupied(x, y);
        } else if (action === 'royal_charge') {
          const dx = Math.abs(x - ctx.me.x), dy = Math.abs(y - ctx.me.y);
          ok = ((dx === 0 && dy > 0 && dy <= 2) || (dy === 0 && dx > 0 && dx <= 2)) && !wall(x, y) && !occupied(x, y);
        } else if (action === 'transposition') {
          ok = d >= 1 && d <= 5 && ctx.myWalls && ctx.myWalls.has(`${x},${y}`);
        }
        if (ok) out.push([x, y]);
      }
    }
    return out;
  }
  const RULE_HINT = {
    move: 'Movimento: 1 casa para cima, baixo, esquerda ou direita (1 PA), sem parede nem jogador no destino.',
    short_teleport: 'Teleporte Curto: escolha uma casa livre a 1 ou 2 passos de distância (paredes no caminho não bloqueiam).',
    flux_wall: 'Barreira de Fluxo: escolha uma casa vazia a até 4 passos, sem jogadores e que não seja a Coroa livre.',
    crown_dash: 'Impulso Real: destino na mesma linha ou coluna, de 1 a 3 casas, sem parede nem jogador.',
    royal_charge: 'Investida Real: avance até 2 casas em linha reta para empurrar um inimigo adjacente.',
    transposition: 'Transposição: clique em uma Barreira de Fluxo sua a até 5 casas para trocar de posição.'
  };

  /* ---------------- Estado da cena ---------------- */
  let st = null, gameId = null, lastSeq = 0, selectedUid = null;
  let clockRef = null, clockTimer = null, sceneOpen = false;
  let pendingAction = false, pendingTimer = null, leaveFallback = null, pendingRestart = null;
  let resultShownFor = null, prevWalls = new Set(), boardBuiltFor = null, feedbackTimer = null;

  const isMyTurn = () => Boolean(st && !st.over && st.phase === 'turn' && st.activeSide === st.side);
  const canAct = () => isMyTurn() && !st.frozen && !st.tutorialFrozen;
  const myName = () => st?.self?.displayName || 'Você';
  const enemyName = () => st?.opponent?.displayName || 'Adversário';
  const nameOf = (side) => (side === st.side ? myName() : enemyName());
  const sideKey = (side) => (side === st.side ? 'me' : 'enemy');
  const selectedCard = () => (st && selectedUid ? st.myTeam.hand.find(c => c.uid === selectedUid) || null : null);
  const ctxFromState = () => ({
    n: st.boardSize,
    me: st.myUnit,
    others: st.enemyUnit ? [st.enemyUnit] : [],
    walls: new Set(st.walls.map(w => `${w.x},${w.y}`)),
    myWalls: new Set(st.walls.filter(w => w.owner === st.side).map(w => `${w.x},${w.y}`)),
    crown: st.crown
  });

  function sfx(kind) {
    try {
      if (typeof prefs !== 'undefined' && prefs.soundEffects === false) return;
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') audioCtx.resume();
      const P = {
        move: [300, 400, 0.07, 'sine', 0.05], card: [340, 640, 0.16, 'triangle', 0.08], turn: [440, 554, 0.2, 'sine', 0.07],
        hit: [150, 80, 0.24, 'sawtooth', 0.08], crown: [587, 880, 0.3, 'triangle', 0.09], deny: [220, 180, 0.09, 'square', 0.03]
      }[kind];
      if (!P) return;
      const osc = audioCtx.createOscillator(), gain = audioCtx.createGain(), t = audioCtx.currentTime;
      osc.type = P[3]; osc.connect(gain); gain.connect(audioCtx.destination);
      osc.frequency.setValueAtTime(P[0], t); osc.frequency.exponentialRampToValueAtTime(P[1], t + P[2]);
      gain.gain.setValueAtTime(P[4], t); gain.gain.exponentialRampToValueAtTime(0.001, t + P[2]);
      osc.start(t); osc.stop(t + P[2]);
    } catch (_) {}
  }

  function feedback(text, isError = false) {
    const f = el('tsFeedback');
    f.textContent = text || '';
    f.classList.toggle('err', isError);
    clearTimeout(feedbackTimer);
    if (isError) feedbackTimer = setTimeout(() => { f.classList.remove('err'); }, 3500);
  }

  function animFig(who, cls, delay = 0) {
    setTimeout(() => {
      document.querySelectorAll(`#tacticalScene [data-fig="${who}"]`).forEach(node => {
        node.classList.remove(cls);
        void node.offsetWidth;
        node.classList.add(cls);
        setTimeout(() => node.classList.remove(cls), 700);
      });
    }, delay);
  }

  /* ---------------- Abertura / fechamento ---------------- */
  function buildPlayerPanels() {
    const panel = (p, who) => `
      <div class="ts-player-head">
        <div class="ts-portrait">${figHTML(who)}</div>
        <div class="ts-player-id">
          <div class="ts-player-tag" id="${p}Tag"></div>
          <div class="ts-player-name" id="${p}Name"></div>
          <div class="ts-player-sub" id="${p}Sub"></div>
        </div>
      </div>
      <div class="ts-stat" id="${p}PaBlock">
        <div class="ts-stat-row"><span id="${p}PaLabel">Pontos de Ação</span><strong id="${p}PaVal">0</strong></div>
        <div class="ts-pips" id="${p}Pips"></div>
      </div>
      <div class="ts-stat">
        <div class="ts-stat-row"><span>Domínio da Coroa</span><strong id="${p}VpVal">0 / 3</strong></div>
        <div class="ts-vp-track"><div class="ts-vp-fill" id="${p}VpFill"></div></div>
      </div>
      <div class="ts-stat-row"><span>Cartas na mão</span><strong id="${p}Hand">0</strong></div>
      <div class="ts-stat-row"><span>Última jogada</span><strong id="${p}Last">—</strong></div>
      <div class="ts-badge plain" id="${p}Crown"></div>
      ${who === 'me' ? `<div class="ts-challenge-box" id="tsMeChallenge" hidden></div>` : ''}
      ${who === 'enemy' ? `<div class="ts-badge fog" id="${p}Vis"></div>` : ''}`;
    el('tsMe').innerHTML = panel('tsMe', 'me');
    el('tsEnemy').innerHTML = panel('tsEn', 'enemy');
  }

  function openScene() {
    if (sceneOpen) return;
    sceneOpen = true;
    buildPlayerPanels();
    el('tacticalScene').hidden = false;
    document.body.style.overflow = 'hidden';
    ['onlineLobbyOverlay', 'start', 'cpuDiffOverlay'].forEach(id => { const n = el(id); if (n) n.classList.add('hidden'); });
    startClock();
  }

  function closeScene() {
    sceneOpen = false;
    stopClock();
    el('tacticalScene').hidden = true;
    el('tsTut').hidden = true;
    ['tsDraft', 'tsResult', 'tsRules'].forEach(id => { el(id).hidden = true; });
    document.body.style.overflow = '';
    st = null; gameId = null; selectedUid = null; resultShownFor = null; boardBuiltFor = null;
    pendingAction = false; clearTimeout(pendingTimer);
  }

  /* ---------------- Cronômetro (único, derivado do estado do servidor) ---------------- */
  function startClock() {
    if (clockTimer) return; // garante um único cronômetro ativo
    clockTimer = setInterval(tickClock, 200);
  }
  function stopClock() {
    if (clockTimer) clearInterval(clockTimer);
    clockTimer = null;
  }
  function tickClock() {
    if (!st || !clockRef) return;
    const dt = performance.now() - clockRef.receivedAt; // relógio monotônico: correto mesmo com a aba em segundo plano
    const clock = el('tsClock'), limit = el('tsLimit');
    if (st.over) {
      clock.textContent = fmtClock(st.durationMs);
      limit.textContent = 'duração total';
      limit.classList.remove('warn');
      return;
    }
    if (st.phase === 'draft') {
      const frozen = st.frozen || st.tutorialFrozen;
      const rem = Math.max(0, st.draftRemainingMs - (frozen ? 0 : dt));
      clock.textContent = fmtClock(rem);
      limit.textContent = frozen ? 'Draft pausado' : 'tempo do Draft';
      limit.classList.toggle('warn', rem <= 3000 && !frozen);
      const bar = el('tsDraftBar');
      if (bar) bar.style.width = `${Math.min(100, (rem / R().draftMs) * 100)}%`;
      return;
    }
    const elapsed = clockRef.paused ? clockRef.elapsedMs : clockRef.elapsedMs + dt;
    const remaining = clockRef.paused ? clockRef.remainingMs : Math.max(0, clockRef.remainingMs - dt);
    clock.textContent = fmtClock(elapsed);
    const secs = Math.ceil(remaining / 1000);
    limit.textContent = clockRef.paused ? `pausado · restam ${secs}s` : `limite ${Math.round(clockRef.limitMs / 1000)}s · restam ${secs}s`;
    limit.classList.toggle('warn', !clockRef.paused && remaining <= 4000);
    clock.style.color = (!clockRef.paused && remaining <= 4000) ? '#e07a7c' : '';
  }

  /* ---------------- Recepção do estado ---------------- */
  function onState(state) {
    if (!state || state.mode !== 'tactical_draft') return;
    let initial = false;
    if (state.gameId !== gameId) {
      initial = true;
      gameId = state.gameId;
      selectedUid = null;
      resultShownFor = null;
      boardBuiltFor = null;
      prevWalls = new Set((state.walls || []).map(w => `${w.x},${w.y}`));
      lastSeq = Math.max(0, ...(state.recentEvents || []).map(e => e.seq || 0));
      ['tsResult', 'tsRules'].forEach(id => { el(id).hidden = true; });
    }
    openScene();
    st = state;
    pendingAction = false;
    clearTimeout(pendingTimer);
    clockRef = { ...state.clock, receivedAt: performance.now() };
    if (!canAct() || (selectedUid && !selectedCard())) selectedUid = null;

    renderAll();

    const fresh = (state.recentEvents || []).filter(e => (e.seq || 0) > lastSeq);
    if (initial) {
      const last = (state.recentEvents || []).slice(-1)[0];
      feedback(state.over ? (state.reason || 'Partida encerrada.') : (last ? describe(last) : 'Partida iniciada.'));
    } else {
      fresh.forEach(processEvent);
    }
    lastSeq = Math.max(lastSeq, ...(state.recentEvents || []).map(e => e.seq || 0));

    if (state.over) {
      stopClock();
      tickClock();
      if (resultShownFor !== gameId) {
        resultShownFor = gameId;
        setTimeout(() => { if (st && st.gameId === resultShownFor) showResult(); }, initial ? 0 : 900);
      }
    } else {
      startClock();
    }
    handleTutorial();
  }

  function renderAll() {
    renderTop();
    renderPlayers();
    renderBoard();
    renderHand();
    renderDetail();
    renderTimes();
    renderEvents();
    renderDraft();
    tickClock();
  }

  function renderTop() {
    const kindLabel = { cpu: 'Treino contra CPU', tutorial: 'Tutorial guiado', private: 'Sala privada', rematch: 'Revanche' }[st.kind] || 'Partida online';
    el('tsMeta').textContent = `${kindLabel} · ${myName()} vs ${enemyName()} · Rodada ${st.round}`;
    let owner = 'none', label;
    if (st.over) label = 'Partida encerrada';
    else if (st.phase === 'draft') label = 'Fase de Draft';
    else {
      owner = sideKey(st.activeSide);
      label = owner === 'me' ? 'Sua vez' : `Vez de ${enemyName()}`;
      if (st.frozen) label += ' · pausado';
      else if (st.tutorialFrozen) label += ' · pausado';
    }
    el('tsTurnBox').dataset.owner = owner;
    el('tsTurnLabel').textContent = label;
    el('tsResignBtn').disabled = st.over;
  }

  function fillPlayer(p, side) {
    const isMe = side === st.side;
    const team = isMe ? st.myTeam : st.enemyTeam;
    const rules = R();
    const hasCrown = st.crown.holder === side;
    const baseAp = rules.basePa - (hasCrown ? rules.crownPaPenalty : 0);
    const active = !st.over && st.phase === 'turn' && st.activeSide === side;
    const who = isMe ? st.self : st.opponent;
    el(p === 'tsMe' ? 'tsMe' : 'tsEnemy').classList.toggle('active', active);
    el(`${p}Tag`).textContent = isMe ? 'Você · Guardião Azul' : (st.opponentIsBot ? 'CPU · Sitiante Rubi' : 'Adversário · Sitiante Rubi');
    el(`${p}Name`).textContent = who?.displayName || (isMe ? 'Você' : 'Adversário');
    el(`${p}Sub`).textContent = (!isMe && st.opponentIsBot) ? 'Controlado pelo computador' : `@${who?.username || ''}`;
    el(`${p}PaLabel`).textContent = `Pontos de Ação (base ${baseAp})`;
    el(`${p}PaVal`).textContent = active ? `${team.ap} restante${team.ap === 1 ? '' : 's'}` : String(team.ap);
    const pipCount = Math.max(baseAp, team.ap, 1);
    el(`${p}Pips`).innerHTML = Array.from({ length: pipCount }, (_, i) => `<i class="ts-pip${i < team.ap ? ' on' : ''}"></i>`).join('');
    const goal = rules.crownHoldGoal || rules.targetVp || 3;
    el(`${p}VpVal`).textContent = `${team.vp} / ${goal} turnos`;
    el(`${p}VpFill`).style.width = `${Math.min(100, (team.vp / goal) * 100)}%`;
    el(`${p}Hand`).textContent = String(isMe ? team.hand.length : team.handCount);
    const lastT = [...(st.turnTimes || [])].reverse().find(t => t.side === side);
    el(`${p}Last`).textContent = lastT ? fmtSecs(lastT.ms) : '—';
    const crown = el(`${p}Crown`);
    if (hasCrown) {
      const leftTurns = Math.max(0, goal - team.vp);
      const prot = st.crown.protectionTurns > 0 ? ` · 🔒 Protegida (${st.crown.protectionTurns}t)` : '';
      crown.className = 'ts-badge';
      crown.innerHTML = `${CROWN_SVG}<span>Com a Coroa: faltam ${leftTurns} turno${leftTurns === 1 ? '' : 's'}${prot}<span class="ts-badge-text-long"> · PA base −${rules.crownPaPenalty} · sempre visível</span></span>`;
    } else if (isMe && st.crown.myRecoverCooldown > 0) {
      crown.className = 'ts-badge';
      crown.innerHTML = `${CROWN_SVG}<span>⏳ Cooldown da Coroa (${st.crown.myRecoverCooldown} turno)</span>`;
    } else {
      crown.className = 'ts-badge plain';
      crown.innerHTML = `${CROWN_SVG}<span>Sem a Coroa</span>`;
    }
    if (isMe && st.myTeam.challenge) {
      const ch = st.myTeam.challenge;
      const chEl = el('tsMeChallenge');
      if (chEl) {
        chEl.hidden = false;
        chEl.classList.toggle('done', Boolean(ch.completed));
        chEl.innerHTML = `<span>${ch.completed ? '✓' : '🎯'} ${esc(ch.label)}</span><strong>${ch.progress}/${ch.goal}</strong>`;
      }
    }
    if (!isMe) {
      const vis = el('tsEnVis');
      if (st.over || st.enemyUnit) {
        const d = st.enemyUnit ? manhattan(st.myUnit.x, st.myUnit.y, st.enemyUnit.x, st.enemyUnit.y) : 0;
        vis.innerHTML = `${EYE_SVG}<span>${st.enemyUnit?.revealedByCrown ? 'Posição revelada pela Coroa' : `Visível · a ${d} casa${d === 1 ? '' : 's'} de você`}</span>`;
      } else {
        vis.innerHTML = `${EYE_OFF_SVG}<span>Oculto pela névoa<span class="ts-badge-text-long"> · fora do seu alcance de visão (${rules.visionRadius} casas)</span></span>`;
      }
    }
  }
  function renderPlayers() {
    fillPlayer('tsMe', st.side);
    fillPlayer('tsEn', 1 - st.side);
  }

  /* ---------------- Tabuleiro ---------------- */
  function buildBoard() {
    const board = el('tsBoard');
    const n = st.boardSize;
    board.style.setProperty('--n', n);
    const frag = document.createDocumentFragment();
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'ts-cell ' + ((x + y) % 2 ? 'd' : 'l');
        b.dataset.x = x;
        b.dataset.y = y;
        b.setAttribute('role', 'gridcell');
        b.innerHTML = `${x === 0 ? `<span class="ts-coord row">${y + 1}</span>` : ''}${y === n - 1 ? `<span class="ts-coord col">${COLS[x]}</span>` : ''}<span class="ts-wall-slot"></span>`;
        frag.appendChild(b);
      }
    }
    const layer = document.createElement('div');
    layer.className = 'ts-layer';
    layer.innerHTML = `
      <div class="ts-crown-free" id="tsCrownFree" hidden>${CROWN_SVG}</div>
      <div class="ts-token me" id="tsTokMe"><div class="ts-ring"></div>${figHTML('me')}<span class="ts-crown-on" hidden>${CROWN_SVG}</span></div>
      <div class="ts-token enemy" id="tsTokEn"><div class="ts-ring"></div>${figHTML('enemy')}<span class="ts-crown-on" hidden>${CROWN_SVG}</span></div>`;
    board.replaceChildren(frag, layer);
    boardBuiltFor = st.gameId;
  }

  function currentTargets() {
    if (!canAct()) return [];
    const card = selectedCard();
    if (card) return card.targetType === 'cell' ? targetsFor(card.id, ctxFromState()) : [];
    if (st.myTeam.ap >= 1) return targetsFor('move', ctxFromState());
    return [];
  }

  function currentAttackTarget() {
    if (!canAct() || selectedCard() || st.myTeam.ap < 1 || !st.enemyUnit) return null;
    if (manhattan(st.myUnit.x, st.myUnit.y, st.enemyUnit.x, st.enemyUnit.y) === 1) {
      return `${st.enemyUnit.x},${st.enemyUnit.y}`;
    }
    return null;
  }

  function renderBoard() {
    if (boardBuiltFor !== st.gameId) buildBoard();
    const card = selectedCard();
    const targets = new Set(currentTargets().map(([x, y]) => `${x},${y}`));
    const atkKey = currentAttackTarget();
    const wallMap = new Map(st.walls.map(w => [`${w.x},${w.y}`, w]));
    const fluxSet = new Set((st.fluxZones || []).map(z => `${z.x},${z.y}`));
    const R0 = R().visionRadius;
    for (const cell of el('tsBoard').querySelectorAll('.ts-cell')) {
      const x = +cell.dataset.x, y = +cell.dataset.y, key = `${x},${y}`;
      const isTarget = targets.has(key);
      const isAtk = atkKey === key;
      cell.classList.toggle('move', isTarget && !card);
      cell.classList.toggle('target', isTarget && Boolean(card));
      cell.classList.toggle('attack', isAtk);
      cell.classList.toggle('flux-zone', fluxSet.has(key));
      cell.classList.toggle('fog', !st.over && manhattan(st.myUnit.x, st.myUnit.y, x, y) > R0);
      const w = wallMap.get(key);
      const slot = cell.querySelector('.ts-wall-slot');
      if (w && !slot.firstChild) {
        slot.innerHTML = WALL_SVG;
        if (!prevWalls.has(key)) slot.firstChild.classList.add('new');
      } else if (!w && slot.firstChild) slot.innerHTML = '';
      let label = cellName(x, y);
      if (w) label += `, Parede de Fluxo (some ao fim da rodada ${w.expiresAtRound})`;
      if (isAtk) label += ', atacar inimigo adjacente (1 PA)';
      if (isTarget) label += card ? `, alvo válido para ${card.name}` : ', mover para cá (1 PA)';
      cell.setAttribute('aria-label', label);
      cell.title = isAtk ? 'Atacar inimigo adjacente (1 PA — derruba ou rouba a Coroa)' : (w ? `Parede de Fluxo — some ao fim da rodada ${w.expiresAtRound}` : '');
    }
    prevWalls = new Set(wallMap.keys());

    const place = (node, u) => { node.style.transform = `translate(${u.x * 100}%, ${u.y * 100}%)`; };
    const tokMe = el('tsTokMe'), tokEn = el('tsTokEn');
    place(tokMe, st.myUnit);
    if (st.enemyUnit) place(tokEn, st.enemyUnit);
    tokEn.classList.toggle('fogged', !st.enemyUnit);
    const active = !st.over && st.phase === 'turn';
    tokMe.classList.toggle('active', active && st.activeSide === st.side);
    tokEn.classList.toggle('active', active && st.activeSide !== st.side);
    tokMe.querySelector('.ts-crown-on').hidden = st.crown.holder !== st.side;
    tokEn.querySelector('.ts-crown-on').hidden = st.crown.holder !== 1 - st.side;
    const protMark = st.crown.protectionTurns > 0 ? ' 🔒' : '';
    tokMe.querySelector('.ts-crown-on').title = st.crown.protectionTurns > 0 ? 'Coroa protegida neste turno' : '';
    tokEn.querySelector('.ts-crown-on').title = st.crown.protectionTurns > 0 ? 'Coroa protegida neste turno' : '';
    const free = el('tsCrownFree');
    free.hidden = st.crown.holder !== null;
    if (st.crown.holder === null) place(free, st.crown);
  }

  function reasonCannotAct() {
    if (st.over) return 'A partida terminou.';
    if (st.phase === 'draft') return 'Fase de Draft: escolha uma carta primeiro.';
    if (st.frozen) return 'Partida pausada aguardando a reconexão de um jogador.';
    if (st.tutorialFrozen) return 'Leia a orientação do tutorial e clique em "Entendi, continuar".';
    if (!isMyTurn()) return `Aguarde: é a vez de ${enemyName()}.`;
    return '';
  }

  function onCellClick(x, y) {
    if (!st || st.over) return;
    if (!canAct()) { feedback(reasonCannotAct(), true); return; }
    if (pendingAction || st.autoEnding) return;
    const card = selectedCard();
    if (!card && currentAttackTarget() === `${x},${y}`) {
      sfx('hit');
      sendAction('tactical:attack', { x, y });
      return;
    }
    const valid = currentTargets().some(([a, b]) => a === x && b === y);
    if (!valid) {
      if (!card && st.myTeam.ap < 1) feedback('Você não tem PA para se mover. Use "Encerrar turno".', true);
      else feedback(RULE_HINT[card ? card.id : 'move'], true);
      sfx('deny');
      return;
    }
    if (card) {
      const cardEl = el('tsHand').querySelector(`[data-uid="${card.uid}"]`);
      if (cardEl) cardEl.classList.add('playing');
      sfx('card');
      sendAction('tactical:playCard', { cardUid: card.uid, target: { x, y } });
      selectedUid = null;
    } else {
      sendAction('tactical:move', { x, y });
    }
  }

  function sendAction(type, payload = {}) {
    if (typeof sendSocket !== 'function' || !sendSocket(type, payload)) return false;
    pendingAction = true;
    clearTimeout(pendingTimer);
    pendingTimer = setTimeout(() => { pendingAction = false; if (st) renderDetail(); }, 4000);
    renderDetail();
    return true;
  }

  /* ---------------- Mão de cartas ---------------- */
  function lockReason(card) {
    if (st.over) return 'Partida encerrada.';
    if (st.phase === 'draft') return 'Indisponível durante o Draft.';
    if (st.frozen) return 'Partida pausada (reconexão).';
    if (st.tutorialFrozen) return 'Conclua a orientação do tutorial.';
    if (!isMyTurn()) return 'Aguarde sua vez.';
    if (st.myTeam.ap < card.cost) return `Requer ${card.cost} PA — você tem ${st.myTeam.ap}.`;
    if (card.targetType === 'enemy') {
      if (!st.enemyUnit || manhattan(st.myUnit.x, st.myUnit.y, st.enemyUnit.x, st.enemyUnit.y) > card.range) {
        return `Inimigo fora do alcance (${card.range} casas).`;
      }
      return null;
    }
    if (card.targetType === 'cell' && targetsFor(card.id, ctxFromState()).length === 0) return 'Nenhuma casa válida no alcance agora.';
    return null;
  }

  function renderHand() {
    const hand = el('tsHand');
    hand.replaceChildren();
    const cards = st.myTeam.hand;
    el('tsHandInfo').textContent = `${cards.length} carta${cards.length === 1 ? '' : 's'} · ${st.myTeam.ap} PA disponíve${st.myTeam.ap === 1 ? 'l' : 'is'}`;
    if (!cards.length) {
      const empty = document.createElement('div');
      empty.className = 'ts-empty';
      empty.textContent = `Sem cartas na mão. Novas cartas chegam na Fase de Draft, a cada ${R().draftEveryRounds} rodadas completas.`;
      hand.appendChild(empty);
      return;
    }
    for (const card of cards) {
      const lock = lockReason(card);
      const node = renderCardEl(card, { lock, selected: selectedUid === card.uid });
      node.addEventListener('click', () => onCardClick(card, node));
      hand.appendChild(node);
    }
  }

  function onCardClick(card, node) {
    const lock = lockReason(card);
    if (lock) {
      node.classList.remove('denied'); void node.offsetWidth; node.classList.add('denied');
      feedback(`${card.name}: ${lock}`, true);
      sfx('deny');
      return;
    }
    selectedUid = selectedUid === card.uid ? null : card.uid;
    if (selectedUid) feedback(card.targetType === 'cell' ? `${card.name} selecionada — escolha uma casa dourada no tabuleiro.` : `${card.name} selecionada — confirme em "Usar carta".`);
    renderBoard(); renderHand(); renderDetail();
  }

  function renderDetail() {
    const title = el('tsDetailTitle'), text = el('tsDetailText');
    const cancel = el('tsCancelSel'), use = el('tsUseCard'), endBtn = el('tsEndTurn'), showRes = el('tsShowResult');
    const card = selectedCard();
    cancel.hidden = !card;
    use.hidden = !(card && (card.targetType === 'none' || card.targetType === 'enemy'));
    showRes.hidden = !st.over;
    endBtn.hidden = st.over;
    endBtn.disabled = !canAct() || pendingAction;
    use.disabled = pendingAction;
    const hasCrown = st.crown.holder === st.side;
    if (st.over) {
      title.textContent = 'Partida encerrada';
      text.textContent = 'Abra o resumo para ver o resultado, os tempos de cada jogada e os principais lances.';
    } else if (card) {
      title.textContent = `${card.name} · ${card.cost} PA`;
      text.textContent = `${card.desc} ${card.targetType === 'cell' ? 'Clique em uma casa dourada no tabuleiro para usar.' : 'Não precisa de alvo: confirme em "Usar carta".'}`;
    } else if (st.phase === 'draft') {
      title.textContent = 'Fase de Draft';
      text.textContent = 'Escolha 1 das 3 cartas oferecidas para adicionar à sua mão.';
    } else if (st.frozen) {
      title.textContent = 'Partida pausada';
      text.textContent = `Um jogador perdeu a conexão. O turno fica congelado por até ${Math.round(R().reconnectMs / 1000)}s esperando a volta dele.`;
    } else if (st.tutorialFrozen) {
      title.textContent = 'Tutorial em pausa';
      text.textContent = 'O cronômetro está parado enquanto você lê a explicação destacada.';
    } else if (canAct()) {
      title.textContent = pendingAction ? 'Enviando ação…' : 'Sua vez';
      text.textContent = `Você tem ${st.myTeam.ap} PA. Clique numa casa marcada para andar 1 casa (1 PA) ou selecione uma carta. PA não usados são perdidos ao encerrar o turno.${hasCrown ? ' Você está com a Coroa: ao encerrar o turno ganha +2 PV.' : ''}`;
    } else {
      title.textContent = `Vez de ${enemyName()}`;
      text.textContent = st.opponentIsBot ? 'O CrownBot está decidindo: ele leva cerca de 1 a 2 segundos entre cada ação.' : 'Aguarde o adversário concluir o turno. Você pode consultar suas cartas enquanto isso.';
    }
    endBtn.title = canAct() && st.myTeam.ap > 0 ? `${st.myTeam.ap} PA não usados serão perdidos` : '';
  }

  /* ---------------- Tempo por jogada e registro ---------------- */
  function renderTimes() {
    const box = el('tsTimes');
    const list = [...(st.turnTimes || [])].reverse().slice(0, 8);
    el('tsPrevTurn').textContent = list[0] ? `anterior: ${fmtSecs(list[0].ms)}` : '';
    if (!list.length) { box.innerHTML = '<div class="ts-empty">Os tempos aparecem quando cada turno termina.</div>'; return; }
    box.innerHTML = list.map(t => `
      <div class="ts-time-row"><span class="who"><i style="background:${t.side === st.side ? '#6f9daf' : '#bd7778'}"></i>${esc(nameOf(t.side))} · R${t.round}${t.reason === 'timeout' ? ' <em>limite</em>' : ''}</span><strong>${fmtSecs(t.ms)}</strong></div>`).join('');
  }

  function describe(ev) {
    const has = ev.side !== null && ev.side !== undefined;
    const who = has ? esc(nameOf(ev.side)) : '';
    const mine = has && ev.side === st.side;
    const d = ev.data || {};
    const rules = R();
    switch (ev.type) {
      case 'match_start': return 'Partida iniciada. A Coroa aguarda no tabuleiro.';
      case 'turn_start': return mine ? `Sua vez: ${d.ap} PA disponíveis.` : `Vez de ${who} (${d.ap} PA).`;
      case 'move': return d.to ? `${who} moveu para ${cellName(d.to.x, d.to.y)}.` : `${who} se moveu fora do seu campo de visão.`;
      case 'card_played':
        if (d.cardId === 'flux_siphon') return mine ? `Você usou ${esc(d.cardName)}: ${esc(enemyName())} começa o próximo turno com −1 PA.` : `${who} usou ${esc(d.cardName)}: você começa o próximo turno com −1 PA.`;
        if (d.cardId === 'flux_wall' && d.target) return `${who} ergueu uma ${esc(d.cardName)} em ${cellName(d.target.x, d.target.y)}.`;
        if (d.target && Number.isFinite(d.target.x)) return `${who} usou ${esc(d.cardName)} até ${cellName(d.target.x, d.target.y)}.`;
        return `${who} usou ${esc(d.cardName)}.`;
      case 'crown_protected_hit': return `🔒 Coroa protegida! O ataque empurrou o portador, mas não derrubou a Coroa.`;
      case 'challenge_completed': return `🎯 ${who} concluiu o desafio "${esc(d.label)}" (+1 carta e +1 PA)!`;
      case 'flux_zone_bonus': return `⚡ ${who} terminou na Zona de Fluxo (+1 PA no próximo turno).`;
      case 'crown_streak_bonus': return `👑 ${who} manteve a Coroa por 2 turnos e comprou ${esc(d.cardName)}!`;
      case 'crown_protected_hit':
        sfx('deny');
        if (typeof showToast === 'function') showToast('🔒 A Coroa está protegida neste turno! Você ainda pode empurrar ou bloquear rotas.');
        break;
      case 'challenge_completed':
        sfx('crown');
        if (who === 'me' && typeof showToast === 'function') showToast(`🎯 Desafio concluído! +1 PA e carta ${ev.data?.bonusCard || ''}`);
        break;
      case 'crown_captured': return mine ? `Você capturou a Coroa! Sobreviva por ${rules.crownHoldGoal || 3} turnos para vencer.` : `${who} capturou a Coroa! Ataque-o para derrubá-la.`;
      case 'crown_dropped': return `Coroa derrubada no chão em ${cellName(d.x, d.y)}!`;
      case 'crown_stolen': return `${who} roubou a Coroa em combate corpo a corpo!`;
      case 'melee_attack': return `${who} atacou o adversário em combate corpo a corpo (1 PA).`;
      case 'knockback': return `${who} empurrou o adversário para trás!`;
      case 'crown_vp': return `${who} manteve a Coroa (+1 turno de domínio: ${d.vp}/${d.goal || 3}).`;
      case 'turn_end':
        if (d.reason === 'auto_no_actions') return `${who} ficou sem ações/PA — turno passado automaticamente (${fmtSecs(d.ms)}).`;
        return d.reason === 'timeout' ? `${who} atingiu o limite de ${Math.round(rules.turnLimitMs / 1000)}s; turno encerrado automaticamente.` : `${who} encerrou o turno em ${fmtSecs(d.ms)}.`;
      case 'draft_start': return `Fase de Draft: cada jogador escolhe 1 de 3 cartas.`;
      case 'draft_pick': return mine ? `Você adicionou ${esc(d.cardName)} à mão.` : `${who} escolheu uma carta.`;
      case 'match_end': return esc(d.reason || 'Partida encerrada.');
      default: return '';
    }
  }

  function renderEvents() {
    const box = el('tsEvents');
    const items = [...(st.recentEvents || [])].reverse().filter(e => e.type !== 'turn_start').slice(0, 10);
    box.innerHTML = items.map(e => {
      const cls = e.side === null || e.side === undefined ? '' : (e.side === st.side ? 'me' : 'enemy');
      return `<div class="ts-event ${cls}">${describe(e)}</div>`;
    }).join('') || '<div class="ts-empty">Nenhuma ação ainda.</div>';
  }

  function processEvent(ev) {
    const text = describe(ev);
    if (text && ev.type !== 'turn_end') feedback(text.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'"));
    if (ev.side === null || ev.side === undefined) return;
    const who = sideKey(ev.side), other = who === 'me' ? 'enemy' : 'me';
    switch (ev.type) {
      case 'move': animFig(who, 'step'); sfx('move'); break;
      case 'card_played':
        if (ev.data.cardId === 'flux_siphon') {
          animFig(who, 'attack');
          animFig(other, 'hit', 160);
          if (other === 'me') {
            const frame = el('tsFrame');
            frame.classList.remove('shake'); void frame.offsetWidth; frame.classList.add('shake');
            sfx('hit');
          } else sfx('card');
        } else if (ev.data.cardId === 'short_teleport') { animFig(who, 'blink'); sfx('card'); }
        else { animFig(who, 'cast'); sfx('card'); }
        break;
      case 'crown_protected_hit':
        sfx('deny');
        if (typeof showToast === 'function') showToast('🔒 A Coroa está protegida neste turno! Você ainda pode empurrar ou bloquear rotas.');
        break;
      case 'challenge_completed':
        sfx('crown');
        if (who === 'me' && typeof showToast === 'function') showToast(`🎯 Desafio concluído! +1 PA e carta ${ev.data?.bonusCard || ''}`);
        break;
      case 'crown_captured':
        animFig(who, 'cast');
        sfx('crown');
        if (typeof showToast === 'function') showToast(who === 'me' ? `👑 Coroa capturada! Sobreviva por ${R().crownHoldGoal || 3} turnos para vencer.` : `👑 ${enemyName()} capturou a Coroa! Ataque-o para derrubá-la.`);
        break;
      case 'crown_dropped':
        sfx('hit');
        if (typeof showToast === 'function') showToast('💥 Coroa derrubada no chão!');
        break;
      case 'crown_stolen':
        sfx('crown');
        if (typeof showToast === 'function') showToast('⚔️ Coroa roubada em combate!');
        break;
      case 'melee_attack':
        animFig(who, 'attack');
        animFig(other, 'hit', 140);
        if (other === 'me') {
          const frame = el('tsFrame');
          frame.classList.remove('shake'); void frame.offsetWidth; frame.classList.add('shake');
          sfx('hit');
        } else sfx('card');
        break;
      case 'turn_end':
        if (ev.data?.reason === 'auto_no_actions' && who === 'me') {
          feedback('Sem PA ou ações válidas — turno passado automaticamente.');
        }
        break;
      case 'turn_start': if (who === 'me') sfx('turn'); break;
      default: break;
    }
  }

  /* ---------------- Draft ---------------- */
  function renderDraft() {
    const ov = el('tsDraft');
    if (st.over || st.phase !== 'draft') { ov.hidden = true; return; }
    ov.hidden = false;
    const opts = st.myTeam.draftOptions || [];
    const box = el('tsDraftChoices');
    box.replaceChildren();
    if (opts.length) {
      el('tsDraftTitle').textContent = 'Escolha 1 carta para sua mão';
      el('tsDraftText').textContent = `A cada ${R().draftEveryRounds} rodadas completas há um Draft de ${Math.round(R().draftMs / 1000)}s. Se o tempo acabar, a primeira opção é adicionada automaticamente.`;
      for (const card of opts) {
        const node = renderCardEl(card, {});
        node.addEventListener('click', () => {
          if (st.tutorialFrozen) { feedback('Leia a orientação do tutorial primeiro.', true); return; }
          sfx('card');
          sendAction('tactical:pickDraft', { cardUid: card.uid });
          node.classList.add('selected');
        });
        box.appendChild(node);
      }
    } else {
      el('tsDraftTitle').textContent = 'Carta escolhida';
      el('tsDraftText').textContent = `Aguardando ${enemyName()} escolher. A partida continua assim que os dois jogadores escolherem ou o tempo acabar.`;
    }
  }

  /* ---------------- Resultado ---------------- */
  function showResult() {
    if (!st || !st.over) return;
    const won = st.winner === st.side, draw = st.winner === null || st.winner === undefined;
    el('tsResFigMe').innerHTML = figHTML('me', won ? 'won' : (draw ? '' : 'lost'), 'res-me') + `<span>${esc(myName())}</span>`;
    el('tsResFigEnemy').innerHTML = figHTML('enemy', !won && !draw ? 'won' : (draw ? '' : 'lost'), 'res-enemy') + `<span>${esc(enemyName())}</span>`;
    const box = el('tsResTitleBox');
    box.className = 'ts-result-title ' + (won ? 'win' : draw ? '' : 'loss');
    el('tsResTitle').textContent = won ? 'Vitória' : draw ? 'Partida encerrada' : 'Derrota';
    const reasons = {
      vp: won ? `Você manteve a Coroa e chegou a ${R().targetVp} PV.` : `${enemyName()} manteve a Coroa e chegou a ${R().targetVp} PV.`,
      resign: won ? `${enemyName()} desistiu da partida.` : 'Você desistiu da partida.',
      abandon: won ? `${enemyName()} saiu da partida (abandono).` : 'Você saiu da partida (abandono).',
      disconnect: won ? `${enemyName()} não reconectou a tempo.` : 'Você não reconectou a tempo.'
    };
    el('tsResReason').textContent = reasons[st.resultType] || st.reason || '';
    el('tsResEyebrow').textContent = st.kind === 'tutorial' ? 'Tutorial do Cerco Tático' : 'Fim de partida';

    const log = st.replayLog || st.recentEvents || [];
    const myTurns = log.filter(e => e.type === 'turn_end' && e.side === st.side);
    const avg = myTurns.length ? myTurns.reduce((s, e) => s + (e.data.ms || 0), 0) / myTurns.length : 0;
    el('tsResStats').innerHTML = `
      <div><span>Pontos de Vitória</span><strong>${st.myTeam.vp} × ${st.enemyTeam.vp}</strong></div>
      <div><span>Rodadas</span><strong>${st.round}</strong></div>
      <div><span>Duração</span><strong>${fmtClock(st.durationMs)}</strong></div>
      <div><span>Sua média/jogada</span><strong>${myTurns.length ? fmtSecs(avg) : '—'}</strong></div>`;
    const key = log.filter(e => ['crown_captured', 'card_played', 'crown_vp', 'draft_pick', 'match_end'].includes(e.type) || (e.type === 'turn_end' && e.data.reason === 'timeout'));
    el('tsResTimeline').innerHTML = key.slice(-14).map(e => `<li><b>Rodada ${e.round}</b><span>${describe(e)}</span></li>`).join('') || '<li><span>Nenhum lance de destaque.</span></li>';
    el('tsResNote').textContent = st.kind === 'tutorial'
      ? 'Partidas do tutorial são treino guiado e não entram no histórico.'
      : st.opponentIsBot
        ? 'Resultado registrado no seu histórico como Cerco Tático vs CPU.'
        : 'Resultado registrado no histórico e nas estatísticas dos dois jogadores.';
    const again = el('tsAgainBtn');
    again.disabled = false;
    again.hidden = false;
    if (st.kind === 'cpu') again.textContent = 'Nova partida vs CPU';
    else if (st.kind === 'tutorial') again.textContent = 'Repetir tutorial';
    else if (st.resultType === 'abandon' || st.resultType === 'disconnect') again.hidden = true;
    else again.textContent = 'Pedir revanche';
    el('tsResult').hidden = false;
    if (won && typeof playTone === 'function') playTone('win');
  }

  /* ---------------- Saída, desistência e reinício ---------------- */
  function requestMenu() {
    if (!st || st.over) { leaveAndClose(); return; }
    const msg = st.kind === 'tutorial'
      ? 'Sair agora encerra o tutorial. Treinos guiados não entram no histórico.'
      : st.opponentIsBot
        ? 'A partida contra a CPU será encerrada e descartada: não conta como vitória nem derrota no histórico.'
        : `Sair de uma partida em andamento conta como ABANDONO: a partida termina na hora e a vitória vai para ${enemyName()}. O resultado será registrado no histórico.`;
    openConfirmExitModal('Voltar ao menu principal?', msg, 'Sair para o menu', leaveAndClose);
  }
  function requestResign() {
    if (!st || st.over) return;
    const msg = st.kind === 'tutorial'
      ? 'Desistir encerra o tutorial imediatamente como derrota. Treinos guiados não entram no histórico.'
      : `Desistir encerra a partida agora e conta como DERROTA para você (vitória de ${enemyName()}). O resultado será registrado no seu histórico.`;
    openConfirmExitModal('Desistir da partida?', msg, 'Sim, desistir', () => { sendSocket('game:resign'); });
  }
  function leaveAndClose() {
    pendingRestart = null;
    clearTimeout(leaveFallback);
    if (typeof sendSocket === 'function' && sendSocket('tactical:leave')) {
      leaveFallback = setTimeout(() => finishLeave('timeout'), 2500);
    } else {
      finishLeave('offline');
    }
  }
  function onLeft(outcome) {
    clearTimeout(leaveFallback);
    if (pendingRestart) {
      const kind = pendingRestart;
      pendingRestart = null;
      sendSocket(kind === 'cpu' ? 'tactical:startCpu' : 'tactical:startTutorial');
      return;
    }
    if (sceneOpen) finishLeave(outcome);
  }
  function finishLeave(outcome) {
    clearTimeout(leaveFallback);
    closeScene();
    if (typeof forceOpenMenu === 'function') forceOpenMenu();
    const msg = {
      discarded: 'Partida encerrada sem registro no histórico.',
      abandon: 'Você saiu da partida. O resultado foi registrado como abandono.'
    }[outcome];
    if (msg && typeof showToast === 'function') showToast(msg);
  }
  function playAgain() {
    if (!st) return;
    if (st.kind === 'cpu' || st.kind === 'tutorial') {
      pendingRestart = st.kind;
      el('tsAgainBtn').disabled = true;
      if (!sendSocket('tactical:leave')) { pendingRestart = null; el('tsAgainBtn').disabled = false; }
      return;
    }
    if (sendSocket('game:rematch')) {
      el('tsAgainBtn').disabled = true;
      el('tsAgainBtn').textContent = 'Aguardando resposta…';
    }
  }

  /* ---------------- Regras rápidas ---------------- */
  function rulesItems(rules) {
    return [
      `Tabuleiro ${rules.boardSize}×${rules.boardSize}. Cada jogador controla 1 personagem; a Coroa começa livre no tabuleiro.`,
      `No seu turno você recebe ${rules.basePa} PA. Andar 1 casa (cima, baixo, esquerda, direita) custa 1 PA; cada carta mostra seu custo. PA que sobra é perdido.`,
      `Quem pisa na Coroa a captura. Ao encerrar um turno com ela, soma +1 turno de domínio. Chegar a ${rules.targetVp} turnos vence a partida.`,
      `Combate direto: ataque um inimigo adjacente por 1 PA para empurrá-lo e derrubar (ou roubar) a Coroa. Se ficar sem PA ou ações válidas, o turno passa automaticamente.`,
      `Custo da Coroa: PA base −${rules.crownPaPenalty} por turno e posição sempre visível para o adversário.`,
      `Névoa de guerra: você só vê o adversário a até ${rules.visionRadius} casas (distância em passos), exceto se ele estiver com a Coroa.`,
      `A cada ${rules.draftEveryRounds} rodadas completas há uma Fase de Draft de ${Math.round(rules.draftMs / 1000)}s: escolha 1 de 3 cartas para a mão.`,
      `Cada turno tem limite de ${Math.round(rules.turnLimitMs / 1000)}s; ao estourar, o turno é encerrado automaticamente. O cronômetro mostra o tempo de decisão.`,
      'Desistir encerra a partida como derrota. Sair para o menu contra uma pessoa conta como abandono (vitória do adversário); contra a CPU a partida é descartada.'
    ];
  }
  function openRules() {
    const rules = R();
    el('tsRulesList').innerHTML = rulesItems(rules).map(t => `<li>${esc(t)}</li>`).join('');
    const cards = el('tsRulesCards');
    cards.replaceChildren(...catalog.cards.map(c => renderCardEl(c, { static: true })));
    el('tsRules').hidden = false;
  }

  /* ---------------- Tutorial do Cerco: foco em elementos ---------------- */
  function tutSteps() {
    const r = R();
    return {
      1: { sel: '#tsMePaBlock', title: 'Pontos de Ação (PA)', text: `A cada turno você recebe ${r.basePa} PA. Andar 1 casa custa 1 PA e cada carta mostra o custo no círculo azul. PA que sobrar é perdido ao encerrar o turno. A Coroa está a 2 casas à sua direita: clique nas casas marcadas para andar até ela.` },
      2: { sel: '#tsDraftChoices', title: 'Fase de Draft', text: `A cada ${r.draftEveryRounds} rodadas completas o jogo pausa para o Draft. Escolha 1 das 3 cartas para adicionar à sua mão. Fora do tutorial você tem ${Math.round(r.draftMs / 1000)}s; se o tempo acabar, a primeira carta é adicionada automaticamente.` },
      3: { sel: '#tsMeCrown', title: 'O poder e o risco da Coroa', text: `Com a Coroa você ganha +2 PV toda vez que encerra o turno — ${r.targetVp} PV vencem a partida. Em troca, seu PA base cai para ${r.basePa - r.crownPaPenalty} e sua posição fica visível para o adversário mesmo fora do alcance de visão. Agora clique em "Encerrar turno" para pontuar.` }
    };
  }
  function handleTutorial() {
    const layer = el('tsTut');
    if (!st || !st.isTutorial || !st.tutorialFrozen || st.over) { layer.hidden = true; return; }
    const cfg = tutSteps()[st.tutorialStep];
    if (!cfg) { layer.hidden = true; return; }
    layer.hidden = false;
    el('tsTipStep').textContent = `Tutorial do Cerco · Etapa ${st.tutorialStep} de 3`;
    el('tsTipTitle').textContent = cfg.title;
    el('tsTipText').textContent = cfg.text;
    el('tsTipNext').onclick = () => {
      layer.hidden = true;
      sendSocket('tactical:tutorialStepComplete', { step: st.tutorialStep });
    };
    requestAnimationFrame(() => positionSpot(cfg.sel));
  }
  function positionSpot(sel) {
    const target = document.querySelector(sel);
    if (!target || el('tsTut').hidden) return;
    const r0 = target.getBoundingClientRect();
    if (r0.top < 0 || r0.bottom > innerHeight) target.scrollIntoView({ block: 'center' });
    const r = target.getBoundingClientRect();
    const pad = 8, spot = el('tsSpot'), tip = el('tsTip');
    Object.assign(spot.style, { top: `${r.top - pad}px`, left: `${r.left - pad}px`, width: `${r.width + pad * 2}px`, height: `${r.height + pad * 2}px` });
    const tw = Math.min(330, innerWidth - 24);
    const th = tip.offsetHeight || 190;
    if (innerWidth < 600) {
      Object.assign(tip.style, { left: '12px', top: 'auto', bottom: '12px' });
    } else {
      const below = r.bottom + 14 + th < innerHeight;
      Object.assign(tip.style, {
        bottom: 'auto',
        top: `${below ? r.bottom + 14 : Math.max(12, r.top - th - 14)}px`,
        left: `${Math.max(12, Math.min(innerWidth - tw - 12, r.left))}px`
      });
    }
  }

  /* ---------------- Guia "Como jogar" + demonstração ---------------- */
  const demo = { n: 7, me: { x: 1, y: 5 }, crown: { x: 4, y: 2, holder: null }, walls: new Set(), action: 'move', ap: 3, vp: 0 };
  function renderGuide() {
    const root = el('gtab-tactical');
    if (!root) return;
    const r = catalog.rules;
    root.querySelectorAll('[data-rule]').forEach(n => {
      const k = n.dataset.rule;
      const v = r[k];
      n.textContent = /Ms$/.test(k) ? String(Math.round(v / 1000)) : (k === 'basePaCrown' ? String(r.basePa - r.crownPaPenalty) : String(v ?? ''));
    });
    const me = el('tgCharMe'), en = el('tgCharEnemy');
    if (me && !me.firstChild) me.innerHTML = figHTML('me', '', 'guide-me');
    if (en && !en.firstChild) en.innerHTML = figHTML('enemy', '', 'guide-enemy');
    const cards = el('tgCards');
    if (cards) cards.replaceChildren(...catalog.cards.map(c => renderCardEl(c, { static: true })));
    const actions = el('tgDemoActions');
    if (actions) {
      actions.replaceChildren();
      const mk = (id, label) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'ts-btn' + (demo.action === id ? ' on' : '');
        b.textContent = label;
        b.addEventListener('click', () => demoSelect(id));
        actions.appendChild(b);
      };
      mk('move', 'Andar (1 PA)');
      catalog.cards.forEach(c => mk(c.id, `${c.name} (${c.cost} PA)`));
      const reset = document.createElement('button');
      reset.type = 'button';
      reset.className = 'ts-btn';
      reset.textContent = `Novo turno (${r.basePa} PA)`;
      reset.addEventListener('click', () => { demo.ap = r.basePa - (demo.crown.holder === 0 ? r.crownPaPenalty : 0); demoText(`Novo turno: ${demo.ap} PA disponíveis.${demo.crown.holder === 0 ? ` (−${r.crownPaPenalty} PA por estar com a Coroa)` : ''}`); renderDemo(); });
      actions.appendChild(reset);
    }
    renderDemo();
  }
  function demoText(t) { const n = el('tgDemoText'); if (n) n.textContent = t; }
  function demoCost(action) { return action === 'move' ? 1 : (catalog.cards.find(c => c.id === action)?.cost ?? 1); }
  function demoSelect(action) {
    demo.action = action;
    const cost = demoCost(action);
    if (action === 'flux_siphon') {
      if (demo.ap < cost) demoText(`Sifão de Fluxo custa ${cost} PA — você tem ${demo.ap}.`);
      else demoText('Sifão de Fluxo não precisa de alvo: você paga 1 PA e o recupera na hora; o adversário começa o próximo turno com −1 PA.');
    } else if (demo.ap < cost) {
      demoText(`Esta ação custa ${cost} PA e você tem ${demo.ap}. Clique em "Novo turno" para recomeçar.`);
    } else {
      demoText(RULE_HINT[action] || '');
    }
    renderGuide();
  }
  function renderDemo() {
    const board = el('tgDemoBoard');
    if (!board) return;
    const ctx = { n: demo.n, me: demo.me, others: [], walls: demo.walls, crown: demo.crown };
    const canPay = demo.ap >= demoCost(demo.action);
    const targets = canPay && demo.action !== 'flux_siphon' ? new Set(targetsFor(demo.action, ctx).map(([x, y]) => `${x},${y}`)) : new Set();
    board.style.setProperty('--n', demo.n);
    const frag = document.createDocumentFragment();
    for (let y = 0; y < demo.n; y++) {
      for (let x = 0; x < demo.n; x++) {
        const b = document.createElement('button');
        b.type = 'button';
        const key = `${x},${y}`;
        b.className = `ts-cell ${(x + y) % 2 ? 'd' : 'l'}${targets.has(key) ? (demo.action === 'move' ? ' move' : ' target') : ''}`;
        b.setAttribute('aria-label', `Casa ${cellName(x, y)}`);
        if (demo.walls.has(key)) b.innerHTML = WALL_SVG;
        b.addEventListener('click', () => demoClick(x, y, targets.has(key)));
        frag.appendChild(b);
      }
    }
    const layer = document.createElement('div');
    layer.className = 'ts-layer';
    layer.innerHTML = `
      ${demo.crown.holder === null ? `<div class="ts-crown-free" style="transform:translate(${demo.crown.x * 100}%,${demo.crown.y * 100}%)">${CROWN_SVG}</div>` : ''}
      <div class="ts-token me" style="transform:translate(${demo.me.x * 100}%,${demo.me.y * 100}%)"><div class="ts-ring"></div>${figHTML('me', '', 'demo-me')}<span class="ts-crown-on" ${demo.crown.holder === 0 ? '' : 'hidden'}>${CROWN_SVG}</span></div>`;
    board.replaceChildren(frag, layer);
    const info = el('tgDemoInfo');
    if (info) info.textContent = `PA: ${demo.ap} · PV: ${demo.vp}${demo.crown.holder === 0 ? ' · com a Coroa' : ''}`;
  }
  function demoClick(x, y, valid) {
    if (!valid) { demoText(demo.ap < demoCost(demo.action) ? 'PA insuficiente para esta ação.' : (RULE_HINT[demo.action] || 'Casa inválida.')); return; }
    demo.ap -= demoCost(demo.action);
    if (demo.action === 'flux_wall') {
      demo.walls.add(`${x},${y}`);
      if (demo.walls.size > 3) demo.walls.delete(demo.walls.values().next().value);
      demoText(`Parede erguida em ${cellName(x, y)}: ninguém pode entrar nessa casa enquanto ela durar.`);
    } else {
      demo.me = { x, y };
      let msg = `Personagem em ${cellName(x, y)}.`;
      if (demo.crown.holder === null && demo.crown.x === x && demo.crown.y === y) {
        demo.crown.holder = 0;
        msg = 'Coroa capturada! A partir de agora você ganha +2 PV ao encerrar cada turno, mas perde 1 PA base e fica visível.';
      }
      if (demo.action === 'crown_dash' && demo.crown.holder === 0) { demo.vp += 1; msg += ' Impulso Real com a Coroa: +1 PV.'; }
      demoText(msg);
    }
    renderDemo();
  }
  function startFromGuide(kind) {
    if (typeof onlineUser === 'undefined' || !onlineUser) {
      showToast('Entre na sua conta para jogar o Cerco Tático: as partidas são processadas no servidor.');
      switchNav('profile');
      return;
    }
    if (!wsReady) connectSocket();
    sendSocket(kind === 'cpu' ? 'tactical:startCpu' : 'tactical:startTutorial');
  }

  /* ---------------- Eventos de interface ---------------- */
  el('tsBoard').addEventListener('click', (e) => {
    const c = e.target.closest('.ts-cell');
    if (c) onCellClick(+c.dataset.x, +c.dataset.y);
  });
  el('tsEndTurn').addEventListener('click', () => {
    if (!canAct()) { feedback(reasonCannotAct(), true); return; }
    selectedUid = null;
    sendAction('tactical:endTurn');
  });
  el('tsCancelSel').addEventListener('click', () => { selectedUid = null; feedback('Seleção cancelada.'); renderBoard(); renderHand(); renderDetail(); });
  el('tsUseCard').addEventListener('click', () => {
    const card = selectedCard();
    if (!card || (card.targetType !== 'none' && card.targetType !== 'enemy')) return;
    const lock = lockReason(card);
    if (lock) { feedback(lock, true); return; }
    const cardEl = el('tsHand').querySelector(`[data-uid="${card.uid}"]`);
    if (cardEl) cardEl.classList.add('playing');
    sfx('card');
    sendAction('tactical:playCard', { cardUid: card.uid });
    selectedUid = null;
  });
  el('tsShowResult').addEventListener('click', showResult);
  el('tsMenuBtn').addEventListener('click', requestMenu);
  el('tsResMenuBtn').addEventListener('click', leaveAndClose);
  el('tsResignBtn').addEventListener('click', requestResign);
  el('tsAgainBtn').addEventListener('click', playAgain);
  el('tsCloseResult').addEventListener('click', () => { el('tsResult').hidden = true; });
  el('tsRulesBtn').addEventListener('click', openRules);
  el('tsRulesClose').addEventListener('click', () => { el('tsRules').hidden = true; });
  el('tsRulesOk').addEventListener('click', () => { el('tsRules').hidden = true; });
  document.addEventListener('keydown', (e) => {
    if (!sceneOpen || e.key !== 'Escape') return;
    if (!el('tsRules').hidden) { el('tsRules').hidden = true; return; }
    if (selectedUid) { selectedUid = null; renderBoard(); renderHand(); renderDetail(); feedback('Seleção cancelada.'); }
  });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) tickClock(); });
  window.addEventListener('resize', () => { if (st && st.isTutorial && st.tutorialFrozen) handleTutorial(); });

  const tgTut = el('tgStartTutorial'), tgCpu = el('tgStartCpu');
  if (tgTut) tgTut.addEventListener('click', () => startFromGuide('tutorial'));
  if (tgCpu) tgCpu.addEventListener('click', () => startFromGuide('cpu'));

  fetch('/api/tactical/rules').then(r => (r.ok ? r.json() : null)).then(data => {
    if (data && Array.isArray(data.cards) && data.rules) { catalog = data; renderGuide(); }
  }).catch(() => {});
  renderGuide();

  window.TacticalUI = {
    onState,
    onLeft,
    onError(message) {
      if (!sceneOpen) return;
      pendingAction = false;
      clearTimeout(pendingTimer);
      if (st) { renderHand(); renderDetail(); }
      feedback(message, true);
    },
    onConnection(msg) {
      if (!sceneOpen) return;
      feedback(msg.connected ? `${enemyName()} reconectou. A partida continua.` : `${enemyName()} perdeu a conexão. Turno pausado por até ${msg.graceSeconds || 30}s.`, !msg.connected);
    },
    isOpen: () => sceneOpen,
    _debug: () => ({ st, selectedUid, clockTimer: Boolean(clockTimer), targets: st ? currentTargets() : [] })
  };
})();
