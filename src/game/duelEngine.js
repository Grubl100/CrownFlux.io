import {
  BASE,
  CPU_LEVELS,
  DIAG,
  DOCTRINES_INFO,
  FAC,
  GROW,
  KN,
  LAYOUT,
  NOME,
  ORTH,
  STRATEGIC_ZONES,
  TUTORIAL_STEPS,
  VAL,
} from '../utils/constants.js';
import { cheb, rand } from '../utils/format.js';

export function teamDisplayName(mode, i, onlineOpponentName = 'Adversário') {
  if (mode === 'duel' && i === 1) return 'Rubi';
  if (mode === 'tutorial' && i === 1) return 'Mentor Rubi';
  if (mode === 'cpu' && i === 1) return 'CPU (Rubi)';
  if (mode === 'online' && i === 1) return onlineOpponentName;
  return FAC[i]?.name || 'Neutro';
}

export function createDuelState({
  mode = 'cpu',
  cpuDifficulty = 3,
  doctrine = 'vanguard',
}) {
  const isArena = mode === 'arena';
  const is1v1Rules = !isArena;
  const teamIds = isArena ? [0, 1, 2, 3] : [0, 1];
  const botDoctrines = ['vanguard', 'bastion', 'celerity'];

  const state = {
    mode,
    isArena,
    is1v1Rules,
    cpuDifficulty,
    N: 16,
    T: 0,
    phase: 'development',
    winCondition: '',
    skillsUsedCount: 0,
    turnOwner: 0,
    lastBotMove: null,
    grid: Array.from({ length: 16 }, () => Array(16).fill(null)),
    pieces: [],
    orbs: [],
    crown: is1v1Rules
      ? {
          x: 7,
          y: 7,
          state: 'sealed',
          unlockAt: mode === 'tutorial' ? 4 : 12,
          holderId: null,
          owner: -1,
          dropCooldownOwner: -1,
          dropCooldownUntil: 0,
          tributeTimer: 10,
        }
      : null,
    zones: is1v1Rules
      ? STRATEGIC_ZONES.map((z) => ({ ...z, owner: -1, contested: false, fortressTimer: 14 }))
      : [],
    f: FAC.map((d, i) => {
      const doc = is1v1Rules
        ? i === 0
          ? doctrine || 'vanguard'
          : botDoctrines[(i + cpuDifficulty) % 3]
        : 'standard';
      return {
        id: i,
        score: 0,
        xp: 0,
        lvl: 0,
        alive: teamIds.includes(i),
        respawn: 0,
        next: mode === 'tutorial' ? 9999 : 1.2 + i * 0.25,
        kings: 0,
        energy: is1v1Rules ? (doc === 'vanguard' ? 28 : doc === 'celerity' ? 8 : 18) : 18,
        boostUntil: 0,
        aegisCooldownUntil: 0,
        captures: 0,
        doctrine: doc,
        crownProgress: 0,
        maxCrownProgress: 0,
      };
    }),
    sel: null,
    over: false,
    started: true,
    nid: 1,
    foodT: 0,
    orbT: 5,
    attT: 0,
    att: null,
    fx: [],
    events: [],
    lastMove: null,
    winner: null,
    reason: '',
    turnTimer: {
      activeOwner: 0,
      turnStartedAtMs: performance.now(),
      pausedAccumMs: 0,
      pauseStartedAtMs: null,
      lastMove: null,
      history: [],
    },
    tutorial: {
      active: mode === 'tutorial',
      step: 1,
      paused: false,
      movesInStep6: 0,
      targetPieceId: null,
      attackerPieceId: null,
      hint: TUTORIAL_STEPS[0].hint,
    },
    decisiveMoment: null,
    _callbacks: {},
  };

  for (const i of teamIds) spawnArmy(state, i);
  const initialFood = isArena ? 24 : mode === 'tutorial' ? 6 : 16;
  for (let i = 0; i < initialFood; i++) spawnFood(state, mode === 'tutorial');
  calcAtt(state);

  if (mode === 'tutorial') {
    feed(state, 'Partida 1v1 iniciada: Você (Azul) contra Mentor Rubi (Bot).');
  } else if (mode === 'cpu') {
    const info = CPU_LEVELS.find((c) => c.level === cpuDifficulty) || CPU_LEVELS[0];
    const myDoc = DOCTRINES_INFO[state.f[0].doctrine]?.name || 'Vanguarda';
    feed(state, `Duelo 1v1 contra CPU (${info.name}) · Doutrina <b>${myDoc}</b>. A Coroa desperta em 12s!`);
  } else if (mode === 'duel') {
    feed(state, 'Duelo Local 1v1 preparado: Azul contra Rubi.');
  } else {
    feed(state, 'Arena 4 Jogadores iniciada: quatro facções em disputa pelo domínio total.');
  }

  return state;
}

export function feed(S, msg) {
  S.events.unshift({ msg, t: S.T });
  if (S.events.length > 24) S.events.length = 24;
}

function need(f) {
  return 4 + f.lvl * 3;
}

export function addPiece(S, t, o, x, y) {
  const p = {
    id: S.nid++,
    t,
    o,
    x,
    y,
    ready: S.T + 0.8,
    cd0: 0.8,
    q: null,
    shield: 0,
    chargeUntil: 0,
    animFromX: x,
    animFromY: y,
    animAt: -10,
    animDur: 0.14,
  };
  S.grid[y][x] = p;
  S.pieces.push(p);
  return p;
}

function removePiece(S, p) {
  if (S.grid[p.y]?.[p.x] === p) S.grid[p.y][p.x] = null;
  const i = S.pieces.indexOf(p);
  if (i >= 0) S.pieces.splice(i, 1);
  if (S.sel === p) S.sel = null;
}

export function spawnArmy(S, i) {
  const d = FAC[i];
  const [bx, by] = d.base;
  const [fx, fy] = d.fwd;
  const rx = fy !== 0 ? 1 : 0;
  const ry = fx !== 0 ? 1 : 0;
  const cells = [];
  for (const [off, t] of LAYOUT) cells.push([bx + rx * off, by + ry * off, t]);
  for (let off = -2; off <= 2; off++) cells.push([bx + rx * off + fx, by + ry * off + fy, 'P']);
  const king = cells[2];
  if (S.grid[king[1]]?.[king[0]]) return false;
  let count = 0;
  for (const [x, y, t] of cells) {
    if (x >= 0 && y >= 0 && x < S.N && y < S.N && !S.grid[y][x]) {
      const p = addPiece(S, t, i, x, y);
      if (S.mode === 'tutorial') p.ready = 0;
      if (S.is1v1Rules && t === 'K' && S.f[i]?.doctrine === 'bastion') p.shield = 1;
      count++;
    }
  }
  S.f[i].alive = true;
  return count >= 1;
}

function spawnFood(S, centerOnly = false) {
  for (let k = 0; k < 40; k++) {
    const x = centerOnly ? 3 + rand(S.N - 6) : rand(S.N);
    const y = centerOnly ? 6 + rand(4) : rand(S.N);
    if (S.grid[y][x]) continue;
    const r = Math.random();
    const t = r < 0.78 ? 'P' : r < 0.88 ? 'N' : r < 0.95 ? 'B' : 'R';
    addPiece(S, t, -1, x, y).ready = 0;
    return true;
  }
  return false;
}

function spawnOrb(S) {
  if (S.orbs.length >= 5) return;
  for (let k = 0; k < 80; k++) {
    const x = rand(S.N);
    const y = rand(S.N);
    if (S.grid[y][x] || S.orbs.some((o) => o.x === x && o.y === y)) continue;
    S.orbs.push({ x, y, t: S.T });
    return;
  }
}

export function getDuelMoves(S, p, att = false, grid = S.grid) {
  const r = [];
  const { x, y, t, o } = p;
  const ok = (a, b) => a >= 0 && b >= 0 && a < S.N && b < S.N;
  const tryAdd = (a, b) => {
    if (!ok(a, b)) return false;
    const q = grid[b][a];
    if (q && q.o === o && !att) return false;
    r.push([a, b]);
    return !q;
  };
  const slide = (ds) => {
    for (const [dx, dy] of ds) {
      let a = x + dx;
      let b = y + dy;
      while (tryAdd(a, b)) {
        a += dx;
        b += dy;
      }
    }
  };
  if (t === 'R' || t === 'Q') slide(ORTH);
  if (t === 'B' || t === 'Q') slide(DIAG);
  if (t === 'N') for (const [dx, dy] of KN) tryAdd(x + dx, y + dy);
  if (t === 'K') for (const [dx, dy] of ORTH.concat(DIAG)) tryAdd(x + dx, y + dy);
  if (t === 'P' && o >= 0) {
    const [fx, fy] = FAC[o].fwd;
    const a = x + fx;
    const b = y + fy;
    if (!att && ok(a, b) && !grid[b][a]) r.push([a, b]);
    for (const s of [-1, 1]) {
      const c = x + (fx ? fx : s);
      const d = y + (fy ? fy : s);
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

export function calcAtt(S) {
  const a = Array.from({ length: S.N }, () => Array(S.N).fill(0));
  for (const p of S.pieces) {
    if (p.o < 0) continue;
    for (const [x, y] of getDuelMoves(S, p, true)) a[y][x] |= 1 << p.o;
  }
  S.att = a;
}

function gain(S, o, v) {
  if (o < 0) return;
  const f = S.f[o];
  f.score += v;
  f.xp += v;
  f.energy = Math.min(100, f.energy + v * 9);
  f.captures++;
  while (f.xp >= need(f)) {
    f.xp -= need(f);
    f.lvl++;
    growPiece(S, o);
    feed(S, `<b>${teamDisplayName(S.mode, o)}</b> subiu para o nível ${f.lvl} e ganhou ${NOME[GROW[Math.min(f.lvl - 1, GROW.length - 1)]]}.`);
  }
}

function growPiece(S, o) {
  const k = S.pieces.find((p) => p.o === o && p.t === 'K');
  if (!k) return;
  const t = GROW[Math.min(S.f[o].lvl - 1, GROW.length - 1)];
  for (let r = 1; r <= 6; r++) {
    const c = [];
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = k.x + dx;
        const y = k.y + dy;
        if (x >= 0 && y >= 0 && x < S.N && y < S.N && !S.grid[y][x]) c.push([x, y]);
      }
    }
    if (c.length) {
      const [x, y] = c[rand(c.length)];
      addPiece(S, t, o, x, y).ready = S.T + 0.6;
      S.fx.push({ x, y, t: S.T, col: FAC[o].col, big: 1 });
      return;
    }
  }
}

function collectOrb(S, p, emit) {
  const i = S.orbs.findIndex((o) => o.x === p.x && o.y === p.y);
  if (i < 0 || p.o < 0) return false;
  S.orbs.splice(i, 1);
  const f = S.f[p.o];
  gain(S, p.o, 3);
  f.energy = Math.min(100, f.energy + 24);
  S.fx.push({ x: p.x, y: p.y, t: S.T, col: '#cfaf72', big: 1 });
  feed(S, `<b>${teamDisplayName(S.mode, p.o)}</b> coletou um Fragmento Flux (+3 XP e +24% Fluxo).`);
  emit?.('sound', 'orb');
  if (S.mode === 'tutorial' && p.o === 0 && S.tutorial.step === 7) {
    f.energy = 100;
    S.tutorial.hint = 'Fragmento Flux coletado! Sua energia chegou a 100%. Clique em "🔥 Surto Imperial" (ou pressione ESPAÇO)!';
  }
  return true;
}

function emitDecisive(S, title, subtitle, kind, icon, emit) {
  S.decisiveMoment = { id: Date.now() + Math.random(), title, subtitle, kind, icon };
  emit?.('decisive', S.decisiveMoment);
}

function finishDuel(S, winner, reason, winCondition, emit) {
  if (S.over) return;
  S.over = true;
  S.winner = winner;
  S.reason = reason;
  S.winCondition = winCondition || (reason.includes('Soberania') ? 'crown' : reason.includes('Rei') ? 'regicide' : '');
  if (winner === 0) emit?.('sound', 'win');
  emit?.('gameover', { winner, reason, winCondition: S.winCondition });
}

function recordTurn(S, actorOwner, pieceType) {
  const tt = S.turnTimer;
  if (!tt) return;
  const now = performance.now();
  const durSec = Math.max(0.1, (now - tt.turnStartedAtMs - tt.pausedAccumMs) / 1000);
  const item = {
    actorOwner,
    actorName: teamDisplayName(S.mode, actorOwner),
    pieceName: NOME[pieceType] || 'Peça',
    durationSec: Number(durSec.toFixed(1)),
  };
  tt.lastMove = item;
  tt.history.unshift(item);
  if (tt.history.length > 6) tt.history.length = 6;
  tt.turnStartedAtMs = now;
  tt.pausedAccumMs = 0;
  tt.pauseStartedAtMs = null;
  const totalTeams = S.isArena ? 4 : 2;
  tt.activeOwner = (actorOwner + 1) % totalTeams;
}

function capture(S, p, q, emit) {
  const owner = q.o;
  const v = VAL[q.t] || 1;
  if (q.shield > 0) {
    q.shield--;
    S.fx.push({ x: q.x, y: q.y, t: S.T, col: '#a6e9ff' });
    feed(S, '<b>Escudo!</b> Um golpe foi bloqueado.');
    emit?.('sound', 'shield');
    return false;
  }
  const wasCrownHolder = S.crown && S.crown.state === 'held' && S.crown.holderId === q.id;
  if (p.o >= 0) {
    gain(S, p.o, v);
    S.fx.push({ x: q.x, y: q.y, t: S.T, col: FAC[p.o].col });
  }
  emit?.('sound', wasCrownHolder ? 'crown' : 'capture');
  removePiece(S, q);

  if (wasCrownHolder && S.crown) {
    S.crown.state = 'free';
    S.crown.holderId = null;
    S.crown.owner = -1;
    S.crown.x = q.x;
    S.crown.y = q.y;
    S.crown.dropCooldownOwner = owner;
    S.crown.dropCooldownUntil = S.T + 3.5;
    if (owner >= 0 && S.f[owner]) {
      S.f[owner].crownProgress = Math.max(0, (S.f[owner].crownProgress || 0) - 12);
    }
    if (p.o >= 0 && S.f[p.o]) {
      gain(S, p.o, 4);
      S.f[p.o].energy = Math.min(100, S.f[p.o].energy + 28);
    }
    S.fx.push({ x: q.x, y: q.y, t: S.T, col: '#f0c869', big: 1 });
    feed(S, `<b>👑 Portador Derrubado!</b> ${teamDisplayName(S.mode, p.o)} derrubou o Portador (+4 XP, +28% Fluxo)!`);
    emitDecisive(S, 'Portador da Coroa Derrubado!', `${teamDisplayName(S.mode, p.o)} derrubou o portador inimigo e abriu contra-ataque!`, 'red', '⚔️', emit);
  }

  if (q.t === 'K' && owner >= 0) {
    if (S.mode === 'tutorial' && owner === 0) {
      addPiece(S, 'K', 0, 8, 14).ready = 0;
      S.tutorial.hint = 'Cuidado! O Mentor Rubi alcançou seu Rei, mas no tutorial ele foi reposicionado em segurança na base.';
      return true;
    }
    S.f[p.o >= 0 ? p.o : 0].kings++;
    if (!S.isArena) {
      S.f[owner].alive = false;
      finishDuel(S, p.o, 'Regicídio: O Rei adversário foi capturado!', 'regicide', emit);
      return true;
    }
    const f = S.f[owner];
    f.alive = false;
    f.respawn = S.T + 7;
    for (const z of S.pieces) if (z.o === owner) z.o = p.o;
    feed(S, `<b>${teamDisplayName(S.mode, p.o)}</b> capturou o Rei de <b>${teamDisplayName(S.mode, owner)}</b> e converteu seu exército!`);
    if (owner === 0) finishDuel(S, p.o, 'Seu Rei foi capturado na Arena.', 'regicide', emit);
  } else if (owner >= 0 && !wasCrownHolder) {
    feed(S, `<b>${teamDisplayName(S.mode, p.o)}</b> capturou ${NOME[q.t]} de ${teamDisplayName(S.mode, owner)}.`);
  }
  return true;
}

export function doDuelMove(S, p, a, b, emit) {
  if (!p || S.grid[p.y]?.[p.x] !== p) return false;
  const fromX = p.x;
  const fromY = p.y;
  const q = S.grid[b][a];
  const d = Math.max(Math.abs(a - p.x), Math.abs(b - p.y));
  const hadCapture = Boolean(q);

  if (q && q.shield > 0) {
    q.shield--;
    p.ready = S.T + Math.max(0.35, BASE[p.t]);
    p.cd0 = p.ready - S.T;
    S.fx.push({ x: q.x, y: q.y, t: S.T, col: '#a6e9ff', big: 1 });
    feed(S, '<b>Escudo!</b> A peça resistiu ao ataque.');
    emit?.('sound', 'shield');
    calcAtt(S);
    return false;
  }

  S.grid[p.y][p.x] = null;
  if (q) capture(S, p, q, emit);
  if (S.over) {
    recordTurn(S, p.o, p.t);
    return true;
  }

  S.grid[b][a] = p;
  p.animFromX = fromX;
  p.animFromY = fromY;
  p.animAt = S.T;
  p.animDur = 0.14;
  p.x = a;
  p.y = b;

  if (S.crown) {
    if (S.crown.state === 'held' && S.crown.holderId === p.id) {
      S.crown.x = a;
      S.crown.y = b;
    } else if (S.crown.state === 'free' && S.crown.x === a && S.crown.y === b && p.o >= 0) {
      const dropLocked = S.crown.dropCooldownOwner === p.o && S.T < S.crown.dropCooldownUntil;
      if (!dropLocked) {
        S.crown.state = 'held';
        S.crown.holderId = p.id;
        S.crown.owner = p.o;
        S.crown.tributeTimer = 10;
        p.shield = Math.max(p.shield, 1);
        S.fx.push({ x: a, y: b, t: S.T, col: '#f0c869', big: 1 });
        emit?.('sound', 'crown');
        feed(S, `<b>👑 Coroa Reivindicada!</b> ${NOME[p.t]} de <b>${teamDisplayName(S.mode, p.o)}</b> empunhou a Coroa (+1 Escudo)!`);
        emitDecisive(S, 'Coroa Imperial Conquistada!', `${teamDisplayName(S.mode, p.o)} assumiu a Coroa com ${NOME[p.t]}!`, 'gold', '👑', emit);
      } else {
        feed(S, `A Coroa está instável para sua facção por ${(S.crown.dropCooldownUntil - S.T).toFixed(1)}s.`);
      }
    }
  }

  let cd = BASE[p.t] + (p.t === 'N' ? 0.25 : d * 0.12);
  const f = p.o >= 0 ? S.f[p.o] : null;
  if (f) {
    if (S.is1v1Rules) {
      if (f.doctrine === 'vanguard' && hadCapture) cd *= 0.88;
      if (f.doctrine === 'celerity' && !hadCapture && (p.t === 'P' || p.t === 'N' || p.t === 'K')) cd *= 0.88;
      if (f.doctrine === 'bastion' && !hadCapture && (p.t === 'R' || p.t === 'Q')) cd *= 1.1;
      if (S.crown && S.crown.state === 'held' && S.crown.holderId === p.id) {
        cd *= f.doctrine === 'celerity' ? 1.1 : 1.22;
      }
      if (p.chargeUntil && p.chargeUntil > S.T) {
        cd *= 0.55;
        p.chargeUntil = 0;
      }
    }
    if (f.boostUntil > S.T) cd *= 0.58;
  }
  p.cd0 = cd;
  p.ready = S.mode === 'tutorial' ? S.T + Math.min(0.65, cd) : S.T + cd;
  p.q = null;
  S.lastMove = { x0: fromX, y0: fromY, x1: a, y1: b, t: S.T, owner: p.o };
  if (p.o === 1) S.lastBotMove = { x0: fromX, y0: fromY, x1: a, y1: b, t: S.T, pieceType: p.t };
  if (!hadCapture) emit?.('sound', 'move');

  if (p.t === 'P' && p.o >= 0) {
    const [fx, fy] = FAC[p.o].fwd;
    if (a + fx < 0 || b + fy < 0 || a + fx >= S.N || b + fy >= S.N) {
      p.t = 'Q';
      S.fx.push({ x: a, y: b, t: S.T, col: FAC[p.o].col, big: 1 });
      feed(S, '<b>Promoção!</b> Um Peão chegou ao fim do tabuleiro e virou Rainha.');
    }
  }
  collectOrb(S, p, emit);
  calcAtt(S);
  if (p.o >= 0) recordTurn(S, p.o, p.t);

  if (S.mode === 'tutorial') {
    if (p.o === 0) {
      onTutorialPlayerMoved(S, p, hadCapture, emit);
      if (!S.over) {
        S.turnOwner = 1;
        S.f[1].next = S.T + 1.05;
      }
    } else if (p.o === 1) {
      S.turnOwner = 0;
      S.f[1].next = S.T + 9999;
      if (S.tutorial.step === 4) {
        S.tutorial.hint = `O Mentor Rubi respondeu movendo ${NOME[p.t]}. Faça mais 1 movimento para ir à Etapa 5!`;
      }
    }
  }
  return true;
}

export function activateDuelSkill(S, i, skill = 'surge', explicitTarget = null, emit) {
  if (!S || S.over || i < 0 || !S.f[i] || !S.f[i].alive) return false;
  const f = S.f[i];
  const effectiveSkill = S.isArena ? 'surge' : skill;

  if (effectiveSkill === 'charge') {
    if (f.energy < 45) {
      if (i === 0) emit?.('toast', 'Investida Real requer 45% de Energia de Fluxo.');
      return false;
    }
    let target = explicitTarget && explicitTarget.o === i ? explicitTarget : S.sel && S.sel.o === i ? S.sel : null;
    if (!target) {
      const rec = S.pieces.filter((p) => p.o === i && p.ready > S.T).sort((a, b) => (VAL[b.t] || 1) - (VAL[a.t] || 1));
      target = rec[0] || S.pieces.find((p) => p.o === i && p.t !== 'K') || S.pieces.find((p) => p.o === i);
    }
    if (!target) return false;
    f.energy = Math.max(0, f.energy - 45);
    target.ready = S.T;
    target.cd0 = 0.2;
    target.chargeUntil = S.T + 4.5;
    if (i === 0) S.skillsUsedCount++;
    S.fx.push({ x: target.x, y: target.y, t: S.T, col: '#f0c869', big: 1 });
    feed(S, `<b>⚡ Investida Real!</b> ${NOME[target.t]} de <b>${teamDisplayName(S.mode, i)}</b> zerou a recarga!`);
    emit?.('sound', 'boost');
    return true;
  }

  if (effectiveSkill === 'aegis') {
    if (f.energy < 60) {
      if (i === 0) emit?.('toast', 'Égide Real requer 60% de Energia de Fluxo.');
      return false;
    }
    if (S.T < (f.aegisCooldownUntil || 0)) {
      if (i === 0) emit?.('toast', `Égide Real em recarga (${(f.aegisCooldownUntil - S.T).toFixed(1)}s).`);
      return false;
    }
    let target = explicitTarget && explicitTarget.o === i ? explicitTarget : S.sel && S.sel.o === i ? S.sel : null;
    if (!target) {
      const carrier = S.crown?.state === 'held' && S.crown.owner === i ? S.pieces.find((p) => p.id === S.crown.holderId) : null;
      const king = S.pieces.find((p) => p.o === i && p.t === 'K');
      target = (carrier && carrier.shield === 0 ? carrier : null) || (king && king.shield === 0 ? king : null) || carrier || king;
    }
    if (!target) return false;
    f.energy = Math.max(0, f.energy - 60);
    f.aegisCooldownUntil = S.T + 8;
    target.shield = Math.max(target.shield, 1);
    if (target.ready > S.T) target.ready = S.T + (target.ready - S.T) * 0.5;
    if (i === 0) S.skillsUsedCount++;
    S.fx.push({ x: target.x, y: target.y, t: S.T, col: '#7fd8ff', big: 1 });
    feed(S, `<b>🛡️ Égide Real!</b> ${NOME[target.t]} de <b>${teamDisplayName(S.mode, i)}</b> recebeu Escudo Real!`);
    emit?.('sound', 'shield');
    return true;
  }

  if (f.energy < 100) return false;
  const dur = S.is1v1Rules && f.doctrine === 'celerity' ? 5 : 6;
  f.energy = 0;
  f.boostUntil = S.T + dur;
  for (const p of S.pieces) {
    if (p.o === i && p.ready > S.T) p.ready = S.T + (p.ready - S.T) * 0.48;
  }
  if (i === 0) S.skillsUsedCount++;
  S.fx.push({ x: 8, y: 8, t: S.T, col: FAC[i].col, big: 1 });
  feed(S, `<b>🔥 ${S.isArena ? 'SURTO' : 'Surto Imperial'}!</b> <b>${teamDisplayName(S.mode, i)}</b> acelerou o exército por ${dur}s.`);
  emit?.('sound', 'boost');
  if (S.mode === 'tutorial' && i === 0 && S.tutorial.step === 7) {
    setTutorialStep(S, 8);
  }
  return true;
}

export function setTutorialStep(S, nextStep) {
  if (!S.tutorial?.active) return;
  const step = Math.min(TUTORIAL_STEPS.length, Math.max(1, nextStep));
  S.tutorial.step = step;
  const info = TUTORIAL_STEPS.find((s) => s.step === step) || TUTORIAL_STEPS[0];
  S.tutorial.hint = info.hint;
  if (step === 5) ensureCapturableTargetForStep5(S);
  if (step === 7) ensureOrbForStep7(S);
}

function ensureCapturableTargetForStep5(S) {
  const myPieces = S.pieces.filter((p) => p.o === 0 && p.t !== 'K');
  for (const mp of myPieces) {
    for (const [mx, my] of getDuelMoves(S, mp)) {
      const q = S.grid[my][mx];
      if (q && q.o !== 0) {
        S.tutorial.targetPieceId = q.id;
        S.tutorial.attackerPieceId = mp.id;
        return;
      }
    }
  }
  const pawn = myPieces.find((p) => p.t === 'P') || myPieces[0];
  if (pawn) {
    for (const [cx, cy] of [[pawn.x - 1, pawn.y - 1], [pawn.x + 1, pawn.y - 1]]) {
      if (cx >= 0 && cy >= 0 && cx < S.N && cy < S.N && !S.grid[cy][cx]) {
        const np = addPiece(S, 'P', -1, cx, cy);
        np.ready = 0;
        S.tutorial.targetPieceId = np.id;
        S.tutorial.attackerPieceId = pawn.id;
        calcAtt(S);
        return;
      }
    }
  }
}

function ensureOrbForStep7(S) {
  const myPiece = S.pieces.find((p) => p.o === 0 && p.t !== 'K') || S.pieces.find((p) => p.o === 0);
  if (myPiece) {
    const ms = getDuelMoves(S, myPiece).filter(([x, y]) => !S.grid[y][x]);
    if (ms.length) {
      const [ox, oy] = ms[0];
      if (!S.orbs.some((o) => o.x === ox && o.y === oy)) S.orbs.unshift({ x: ox, y: oy, t: S.T });
    }
  }
  S.f[0].energy = 100;
}

function onTutorialPlayerMoved(S, piece, hadCapture, emit) {
  const tut = S.tutorial;
  if (!tut?.active) return;
  if (tut.step <= 3) {
    setTutorialStep(S, 4);
    tut.hint = `Boa jogada com ${NOME[piece.t]}! Observe a resposta do Mentor Rubi no topo...`;
    return;
  }
  if (tut.step === 4) {
    setTutorialStep(S, 5);
    return;
  }
  if (tut.step === 5) {
    if (hadCapture) {
      tut.movesInStep6 = 0;
      setTutorialStep(S, 6);
    } else {
      ensureCapturableTargetForStep5(S);
      tut.hint = 'Bom movimento! Para concluir a Etapa 5, capture a peça marcada com anel dourado.';
    }
    return;
  }
  if (tut.step === 6) {
    tut.movesInStep6 = (tut.movesInStep6 || 0) + 1;
    if (tut.movesInStep6 >= 2) setTutorialStep(S, 7);
    else tut.hint = 'Ótimo! Faça mais 1 movimento estratégico para ir à Etapa 7.';
    return;
  }
  if (tut.step === 8 && S.f[0].score >= 15 && !S.over) {
    finishDuel(S, 0, 'Objetivo de pontuação do tutorial concluído com sucesso!', 'score', emit);
  }
}

function botThink(S, i, emit) {
  let ps = S.pieces.filter((p) => p.o === i && p.ready <= S.T);
  if (!ps.length && S.mode === 'tutorial') {
    for (const p of S.pieces) if (p.o === i) p.ready = 0;
    ps = S.pieces.filter((p) => p.o === i);
  }
  if (!ps.length) return;
  const enemies = S.pieces.filter((p) => p.o !== i);
  const me = 1 << i;
  const level = S.mode === 'tutorial' ? 1 : S.mode === 'cpu' ? S.cpuDifficulty : 3;

  if (S.mode === 'tutorial') {
    if (S.tutorial.paused || S.turnOwner !== 1) return;
    let bestMove = null;
    let bs = -1e9;
    for (const p of ps) {
      for (const [a, b] of getDuelMoves(S, p)) {
        const target = S.grid[b][a];
        if (target && target.o === 0 && (target.t === 'K' || S.tutorial.step < 6)) continue;
        if (target && target.id === S.tutorial.targetPieceId) continue;
        let score = Math.random() * 2.5 + (b - p.y) * (p.t === 'P' ? 3.2 : p.t === 'N' || p.t === 'B' ? 2.4 : 1.0);
        score -= Math.abs(a - 7.5) * 0.25;
        if (p.t === 'K') score -= 6;
        if (target && target.o < 0) score += VAL[target.t] * 3.5;
        else if (target && target.o === 0 && S.tutorial.step >= 6) score += VAL[target.t] * 4.0;
        if (score > bs) {
          bs = score;
          bestMove = [p, a, b];
        }
      }
    }
    if (bestMove) doDuelMove(S, bestMove[0], bestMove[1], bestMove[2], emit);
    return;
  }

  if (level === 1) {
    const sample = ps.filter(() => Math.random() < 0.55);
    const candidates = sample.length ? sample : [ps[rand(ps.length)]];
    let bestMove = null;
    let bs = -1e9;
    for (const p of candidates) {
      for (const [a, b] of getDuelMoves(S, p)) {
        const q = S.grid[b][a];
        let score = Math.random() * 6;
        if (q && q.o < 0) score += VAL[q.t] * 4;
        else if (q && q.o >= 0 && Math.random() < 0.45) score += VAL[q.t] * 5;
        if (p.t === 'P') score += 1.5;
        if (score > bs) {
          bs = score;
          bestMove = [p, a, b];
        }
      }
    }
    if (bestMove) doDuelMove(S, bestMove[0], bestMove[1], bestMove[2], emit);
    return;
  }

  if (level === 2) {
    let bestMove = null;
    let bs = -1e9;
    for (const p of ps) {
      for (const [a, b] of getDuelMoves(S, p)) {
        const q = S.grid[b][a];
        let score = Math.random() * 3.5;
        if (q) score += q.t === 'K' ? 180 : VAL[q.t] * 8;
        if (S.crown && S.crown.state === 'free' && S.crown.x === a && S.crown.y === b) score += 45;
        if ((S.att[b][a] & ~me) !== 0) score -= VAL[p.t] * 2.2;
        if (S.orbs.some((o) => o.x === a && o.y === b)) score += 9;
        if (score > bs) {
          bs = score;
          bestMove = [p, a, b];
        }
      }
    }
    if (bestMove) doDuelMove(S, bestMove[0], bestMove[1], bestMove[2], emit);
    return;
  }

  const enemyKing = S.pieces.find((p) => p.o === 0 && p.t === 'K');
  const myKing = S.pieces.find((p) => p.o === i && p.t === 'K');
  const crownHolder = S.crown?.state === 'held' ? S.pieces.find((p) => p.id === S.crown.holderId) : null;

  if (level >= 3) {
    if (S.f[i].energy >= 100) {
      const rec = S.pieces.filter((p) => p.o === i && p.ready > S.T).length;
      if (level === 3 && Math.random() < 0.35) activateDuelSkill(S, i, 'surge', null, emit);
      else if (level >= 4 && (rec >= 2 || (enemyKing && S.pieces.some((p) => p.o === i && cheb(p.x, p.y, enemyKing.x, enemyKing.y) <= 4)))) {
        activateDuelSkill(S, i, 'surge', null, emit);
      }
    } else if (S.is1v1Rules && level >= 4 && S.f[i].energy >= 60 && S.T >= (S.f[i].aegisCooldownUntil || 0)) {
      const carrierDanger = crownHolder && crownHolder.o === i && crownHolder.shield === 0 && (S.att[crownHolder.y][crownHolder.x] & ~me) !== 0;
      const kingDanger = myKing && myKing.shield === 0 && (S.att[myKing.y][myKing.x] & ~me) !== 0;
      if (carrierDanger || kingDanger) activateDuelSkill(S, i, 'aegis', carrierDanger ? crownHolder : myKing, emit);
    } else if (S.is1v1Rules && level === 5 && S.f[i].energy >= 72) {
      const heavyRec = S.pieces.find((p) => p.o === i && (p.t === 'Q' || p.t === 'R' || p.t === 'N') && p.ready - S.T > 0.7);
      if (heavyRec) activateDuelSkill(S, i, 'charge', heavyRec, emit);
    }
  }

  let bestMove = null;
  let bs = -1e9;
  for (const p of ps) {
    const ms = getDuelMoves(S, p);
    if (!ms.length) continue;
    let target = null;
    let td = 1e9;
    for (const e of enemies) {
      const isEnemyCarrier = crownHolder && crownHolder.id === e.id;
      const d = cheb(p.x, p.y, e.x, e.y) - (e.o >= 0 ? 1.3 : 0) + (e.t === 'K' ? -2.5 : 0) + (isEnemyCarrier ? -3.2 : 0);
      if (d < td) {
        td = d;
        target = e;
      }
    }
    const isMyCarrier = crownHolder && crownHolder.id === p.id;
    const pv = VAL[p.t] * (p.t === 'K' ? 3.0 : isMyCarrier ? 2.4 : 1);
    const inDanger = (S.att[p.y][p.x] & ~me) !== 0;
    const d0 = target ? cheb(p.x, p.y, target.x, target.y) : 0;

    for (const [a, b] of ms) {
      const q = S.grid[b][a];
      let score = level === 5 ? Math.random() * 0.35 : level === 4 ? Math.random() * 0.8 : Math.random() * 1.6;
      if (q) {
        if (q.t === 'K' && q.o >= 0) score += 500;
        else if (crownHolder && q.id === crownHolder.id) score += 210;
        else score += (VAL[q.t] + 0.5) * (q.o >= 0 ? 11.5 : 8.5);
      }

      if (S.crown) {
        const dropLocked = S.crown.dropCooldownOwner === i && S.T < S.crown.dropCooldownUntil;
        if (S.crown.state === 'free' && !dropLocked && p.t !== 'K') {
          if (a === S.crown.x && b === S.crown.y) score += 92;
          else score += (cheb(p.x, p.y, S.crown.x, S.crown.y) - cheb(a, b, S.crown.x, S.crown.y)) * 4.2;
        } else if (S.crown.state === 'sealed' && p.t !== 'K') {
          score += (cheb(p.x, p.y, 7.5, 7.5) - cheb(a, b, 7.5, 7.5)) * 1.8;
        } else if (isMyCarrier) {
          if (a >= 6 && a <= 9 && b >= 6 && b <= 9) score += 9.5;
          if (b <= 2 || b >= 13) score -= 18;
        }
      }

      if (S.zones?.length && p.t !== 'K') {
        for (const z of S.zones) {
          if (a >= z.x0 && a <= z.x1 && b >= z.y0 && b <= z.y1 && z.owner !== i) score += level >= 4 ? 6.5 : 4.0;
        }
      }

      const destAttacked = (S.att[b][a] & ~me) !== 0;
      const destDefended = (S.att[b][a] & me) !== 0;
      if (destAttacked) {
        score -= pv * (level >= 4 ? (destDefended ? 5.2 : 8.5) : 6.5);
        if (isMyCarrier) score -= 45;
      } else if (destDefended && level >= 4) score += 1.8;

      if (inDanger && !destAttacked) score += pv * (level >= 4 ? 5.0 : 3.3);
      if (target) score += (d0 - cheb(a, b, target.x, target.y)) * (p.t === 'P' ? 1.8 : 1.2);
      if (p.t === 'K' && destAttacked) score -= 40;
      if (S.orbs.some((o) => o.x === a && o.y === b)) score += level >= 4 ? 18 : 13;

      if (level >= 4) {
        if (enemyKing) score += Math.max(0, 8 - cheb(a, b, enemyKing.x, enemyKing.y)) * (p.t === 'Q' || p.t === 'R' || p.t === 'N' ? 1.4 : 0.6);
        if (myKing && (S.att[myKing.y][myKing.x] & ~me) !== 0 && p.t !== 'K' && cheb(a, b, myKing.x, myKing.y) <= 2) score += 9;
      }

      if (level === 5) {
        const origX = p.x;
        const origY = p.y;
        const prevTarget = S.grid[b][a];
        S.grid[origY][origX] = null;
        S.grid[b][a] = p;
        p.x = a;
        p.y = b;
        for (const [nx, ny] of getDuelMoves(S, p, true)) {
          const threatened = S.grid[ny][nx];
          if (threatened && threatened.o === 0) score += threatened.t === 'K' ? 22 : VAL[threatened.t] * 1.9;
        }
        const readyEnemy = S.pieces.some(
          (ep) => ep.o === 0 && ep !== prevTarget && ep.ready <= S.T + 0.25 && getDuelMoves(S, ep, true).some(([ex, ey]) => ex === a && ey === b)
        );
        if (readyEnemy) {
          const gainVal = prevTarget ? VAL[prevTarget.t] : 0;
          if (pv > gainVal) score -= (pv - gainVal) * 11;
        }
        p.x = origX;
        p.y = origY;
        S.grid[origY][origX] = p;
        S.grid[b][a] = prevTarget;
      }

      if (score > bs) {
        bs = score;
        bestMove = [p, a, b];
      }
    }
  }
  if (bestMove && bs > -35) doDuelMove(S, bestMove[0], bestMove[1], bestMove[2], emit);
}

export function stepDuelState(S, dt, emit) {
  if (!S || !S.started || S.over) return;
  if (S.mode === 'tutorial' && S.tutorial.paused) return;

  S.T += dt;
  S.attT -= dt;
  if (S.attT <= 0) {
    calcAtt(S);
    S.attT = 0.22;
  }

  if (S.crown) {
    if (S.crown.state === 'sealed' && S.T >= S.crown.unlockAt) {
      S.crown.state = 'free';
      S.phase = 'confrontation';
      emit?.('sound', 'crown');
      feed(S, '<b>👑 A Coroa Imperial despertou no centro (8,9)!</b> Reivindique-a!');
      if (S.mode !== 'tutorial') {
        emitDecisive(S, 'A Coroa Imperial Despertou!', 'O Trono Central está aberto! Conquiste a Coroa para acumular Domínio Imperial!', 'gold', '👑', emit);
      }
      const occ = S.grid[S.crown.y]?.[S.crown.x];
      if (occ && occ.o >= 0) {
        S.crown.state = 'held';
        S.crown.holderId = occ.id;
        S.crown.owner = occ.o;
        S.crown.tributeTimer = 10;
        occ.shield = Math.max(occ.shield, 1);
      }
    } else if (S.crown.state === 'held') {
      const holder = S.pieces.find((p) => p.id === S.crown.holderId);
      if (!holder || holder.o < 0) {
        S.crown.state = 'free';
        S.crown.holderId = null;
        S.crown.owner = -1;
      } else {
        S.crown.x = holder.x;
        S.crown.y = holder.y;
        const owner = holder.o;
        const f = S.f[owner];
        if (f && f.alive) {
          const inThrone = holder.x >= 7 && holder.x <= 8 && holder.y >= 7 && holder.y <= 8;
          const inBase = (owner === 0 && holder.y >= 13) || (owner === 1 && holder.y <= 2);
          let rate = inThrone ? 3.5 : inBase ? 0.6 : 2.5;
          if (f.doctrine === 'vanguard') rate *= 0.9;
          if (S.phase === 'ascension') rate *= 1.35;
          f.crownProgress = Math.min(100, (f.crownProgress || 0) + rate * dt);
          f.maxCrownProgress = Math.max(f.maxCrownProgress || 0, f.crownProgress);

          S.crown.tributeTimer -= dt;
          if (S.crown.tributeTimer <= 0) {
            S.crown.tributeTimer = 10;
            gain(S, owner, 2);
            f.energy = Math.min(100, f.energy + 15);
            feed(S, `<b>👑 Tributo Imperial:</b> ${teamDisplayName(S.mode, owner)} manteve a Coroa (+2 XP e +15% Fluxo).`);
          }

          if (S.phase !== 'ascension' && (S.T >= 150 || f.crownProgress >= 70)) {
            S.phase = 'ascension';
            feed(S, '<b>🔥 Fase III — Ascensão Imperial!</b> Velocidade de Domínio +35%!');
            emitDecisive(S, 'Fase III · Ascensão Imperial!', `${teamDisplayName(S.mode, owner)} atingiu ${Math.round(f.crownProgress)}% de Domínio!`, 'gold', '🔥', emit);
          }

          if (f.crownProgress >= 100 && S.mode !== 'tutorial') {
            finishDuel(S, owner, 'Soberania Imperial: 100% de Domínio da Coroa alcançado!', 'crown', emit);
            return;
          }
        }
      }
    }
    if (S.phase !== 'ascension' && S.T >= 150) {
      S.phase = 'ascension';
      feed(S, '<b>🔥 Fase III — Ascensão Imperial!</b> O ritmo da disputa aumentou!');
    }
  }

  if (S.zones?.length) {
    for (const z of S.zones) {
      const ownersInZone = new Set();
      for (const p of S.pieces) {
        if (p.o >= 0 && p.x >= z.x0 && p.x <= z.x1 && p.y >= z.y0 && p.y <= z.y1) ownersInZone.add(p.o);
      }
      if (ownersInZone.size === 1) {
        const ctrl = [...ownersInZone][0];
        z.owner = ctrl;
        z.contested = false;
        const f = S.f[ctrl];
        if (f && f.alive) {
          const mult = f.doctrine === 'bastion' ? 1.25 : 1.0;
          if (z.id === 'sanctuary') {
            f.energy = Math.min(100, f.energy + 3.0 * mult * dt);
          } else if (z.id === 'fortress') {
            z.fortressTimer -= dt * mult;
            if (z.fortressTimer <= 0) {
              z.fortressTimer = 14;
              const king = S.pieces.find((p) => p.o === ctrl && p.t === 'K');
              if (king && king.shield < 1) {
                king.shield = 1;
                S.fx.push({ x: king.x, y: king.y, t: S.T, col: '#7fd8ff', big: 1 });
                feed(S, `<b>🏰 Fortaleza Real:</b> O Rei de <b>${teamDisplayName(S.mode, ctrl)}</b> recebeu +1 Escudo!`);
              } else {
                f.energy = Math.min(100, f.energy + 12);
              }
            }
          }
        }
      } else if (ownersInZone.size > 1) {
        z.owner = -1;
        z.contested = true;
      } else {
        z.owner = -1;
        z.contested = false;
      }
    }
  }

  const activeTeams = S.isArena ? [0, 1, 2, 3] : [0, 1];
  const isBotTeam = (i) => (S.mode === 'arena' ? i !== 0 : S.mode === 'cpu' || S.mode === 'tutorial' ? i === 1 : false);
  const lvlBoost = Math.min(0.35, S.T / 500);

  for (const i of activeTeams) {
    if (!isBotTeam(i)) continue;
    const f = S.f[i];
    if (!f.alive) {
      if (S.isArena && S.T >= f.respawn && !spawnArmy(S, i)) f.respawn = S.T + 2;
      continue;
    }
    if (S.T >= f.next) {
      if (S.mode === 'tutorial') {
        if (S.turnOwner === 1) {
          botThink(S, i, emit);
          calcAtt(S);
        }
        f.next = S.T + 1.1;
      } else {
        botThink(S, i, emit);
        calcAtt(S);
        const baseInt = S.mode === 'cpu'
          ? CPU_LEVELS.find((c) => c.level === S.cpuDifficulty)?.interval || 0.9
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
      if (getDuelMoves(S, p).some((m) => m[0] === a && m[1] === b)) doDuelMove(S, p, a, b, emit);
    }
  }

  S.foodT -= dt;
  if (S.foodT <= 0) {
    S.foodT = S.mode === 'tutorial' ? 3.2 : 1.35;
    const maxNeutral = S.isArena ? 38 : S.mode === 'tutorial' ? 10 : 24;
    if (S.pieces.filter((p) => p.o < 0).length < maxNeutral) spawnFood(S, S.mode === 'tutorial');
  }
  S.orbT -= dt;
  if (S.orbT <= 0) {
    S.orbT = 6.8 + Math.random() * 2.4;
    spawnOrb(S);
  }
  S.fx = S.fx.filter((e) => S.T - e.t < 0.65);
}

export function handleDuelCellClick(S, a, b, prefs, emit) {
  if (!S || !S.started || S.over || a < 0 || b < 0 || a >= S.N || b >= S.N) return;
  if (S.mode === 'tutorial' && S.tutorial.paused) return;
  if (S.mode === 'tutorial' && S.turnOwner === 1) {
    S.tutorial.hint = 'Aguarde um instante: o Mentor Rubi está respondendo à sua jogada...';
    return;
  }

  const q = S.grid[b][a];
  const s = S.sel;

  if (s) {
    if (getDuelMoves(S, s).some((m) => m[0] === a && m[1] === b)) {
      if (s.ready <= S.T) {
        doDuelMove(S, s, a, b, emit);
        s.q = null;
      } else if (prefs.autoQueueMove !== false && (s.o === 0 || S.mode === 'duel')) {
        s.q = [a, b];
        if (S.mode === 'tutorial') S.tutorial.hint = 'Movimento agendado! A peça irá para lá ao concluir a recarga.';
      }
      return;
    }
    if (S.mode === 'tutorial' && (!q || q.o !== 0)) {
      S.tutorial.hint = `Movimento inválido para ${NOME[s.t]}. Toque em um dos pontos ou círculos destacados.`;
      return;
    }
  }

  const selectable = q && q.o >= 0 && (S.mode === 'duel' ? true : q.o === 0);
  if (selectable) {
    S.sel = q;
    if (S.mode === 'tutorial' && (S.tutorial.step === 1 || S.tutorial.step === 2)) {
      setTutorialStep(S, 3);
    }
  } else {
    S.sel = null;
  }
}
