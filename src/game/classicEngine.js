import { CLASSIC_CONTROLS, DIAG, FAC, GLYPH, KN, NOME, ORTH, VAL } from '../utils/constants.js';

const FILES = 'abcdefgh';

export function createClassicState({
  mode = 'classic_cpu',
  timeControl = 'blitz3',
  cpuDifficulty = 3,
}) {
  const control = CLASSIC_CONTROLS[timeControl] || CLASSIC_CONTROLS.blitz3;
  const grid = Array.from({ length: 8 }, () => Array(8).fill(null));
  const state = {
    mode,
    classic: true,
    N: 8,
    T: 0,
    turnOwner: 0,
    turn: 0,
    cpuDifficulty,
    timeControl,
    clockControlLabel: control.label,
    chessClock: [control.seconds, control.seconds],
    chessIncrement: control.increment,
    castle: [{ king: true, queen: true }, { king: true, queen: true }],
    enPassant: null,
    halfMoves: 0,
    repetition: new Map(),
    grid,
    pieces: [],
    nid: 1,
    sel: null,
    over: false,
    started: true,
    winner: null,
    reason: '',
    checkmatedKingOwner: null,
    lastMove: null,
    moveHistory: [],
    events: [{ msg: `Xadrez Clássico · ${control.label}.`, t: 0 }],
    f: [
      { id: 0, score: 0, captures: 0, alive: true },
      { id: 1, score: 0, captures: 0, alive: true },
    ],
    nextBotAt: 0,
  };

  const add = (t, o, x, y) => {
    const p = { id: state.nid++, t, o, x, y };
    grid[y][x] = p;
    state.pieces.push(p);
    return p;
  };
  const backRank = ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R'];
  for (let x = 0; x < 8; x++) {
    add(backRank[x], 1, x, 0);
    add('P', 1, x, 1);
    add('P', 0, x, 6);
    add(backRank[x], 0, x, 7);
  }
  state.repetition.set(classicPositionKey(state), 1);
  return state;
}

export function classicPositionKey(S) {
  const board = S.grid.map((row) => row.map((p) => (p ? `${p.o}${p.t}` : '--')).join('')).join('/');
  return `${board}|${S.turnOwner}|${S.castle.map((c) => `${c.king ? 'K' : ''}${c.queen ? 'Q' : ''}`).join('')}|${S.enPassant ? `${S.enPassant.x},${S.enPassant.y}` : '-'}`;
}

export function classicIsAttacked(S, x, y, bySide, grid = S.grid) {
  for (const p of S.pieces) {
    if (p.o !== bySide || grid[p.y]?.[p.x] !== p) continue;
    const dx = x - p.x;
    const dy = y - p.y;
    const ax = Math.abs(dx);
    const ay = Math.abs(dy);
    if (p.t === 'P' && dy === (bySide === 0 ? -1 : 1) && ax === 1) return true;
    if (p.t === 'N' && ax * ay === 2) return true;
    if (p.t === 'K' && Math.max(ax, ay) === 1) return true;
    const diagonal = ax === ay && ax > 0;
    const straight = (dx === 0) !== (dy === 0);
    if ((p.t === 'B' && diagonal) || (p.t === 'R' && straight) || (p.t === 'Q' && (diagonal || straight))) {
      const sx = Math.sign(dx);
      const sy = Math.sign(dy);
      let cx = p.x + sx;
      let cy = p.y + sy;
      let blocked = false;
      while (cx !== x || cy !== y) {
        if (grid[cy][cx]) {
          blocked = true;
          break;
        }
        cx += sx;
        cy += sy;
      }
      if (!blocked) return true;
    }
  }
  return false;
}

function classicPseudoMoves(S, p, grid = S.grid) {
  const result = [];
  const { x, y, t, o } = p;
  const add = (a, b) => {
    if (a < 0 || b < 0 || a >= 8 || b >= 8 || grid[b][a]?.o === o) return;
    if (grid[b][a]?.t !== 'K') result.push([a, b]);
  };
  const slide = (dirs) => {
    for (const [dx, dy] of dirs) {
      let a = x + dx;
      let b = y + dy;
      while (a >= 0 && b >= 0 && a < 8 && b < 8) {
        if (grid[b][a]?.o === o) break;
        if (grid[b][a]?.t !== 'K') result.push([a, b]);
        if (grid[b][a]) break;
        a += dx;
        b += dy;
      }
    }
  };
  if (t === 'P') {
    const dir = o === 0 ? -1 : 1;
    const start = o === 0 ? 6 : 1;
    if (!grid[y + dir]?.[x]) {
      result.push([x, y + dir]);
      if (y === start && !grid[y + dir * 2]?.[x]) result.push([x, y + dir * 2]);
    }
    for (const dx of [-1, 1]) {
      const a = x + dx;
      const b = y + dir;
      if (a >= 0 && a < 8 && ((grid[b]?.[a]?.o === 1 - o && grid[b][a]?.t !== 'K') || (S.enPassant?.x === a && S.enPassant?.y === b))) {
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
    const row = o === 0 ? 7 : 0;
    const rights = S.castle?.[o];
    if (rights && y === row && x === 4 && !classicIsAttacked(S, 4, row, 1 - o, grid)) {
      if (rights.king && !grid[row][5] && !grid[row][6] && grid[row][7]?.t === 'R' && grid[row][7]?.o === o && !classicIsAttacked(S, 5, row, 1 - o, grid) && !classicIsAttacked(S, 6, row, 1 - o, grid)) {
        result.push([6, row]);
      }
      if (rights.queen && !grid[row][1] && !grid[row][2] && !grid[row][3] && grid[row][0]?.t === 'R' && grid[row][0]?.o === o && !classicIsAttacked(S, 3, row, 1 - o, grid) && !classicIsAttacked(S, 2, row, 1 - o, grid)) {
        result.push([2, row]);
      }
    }
  }
  return result;
}

export function getClassicMoves(S, p, grid = S.grid) {
  return classicPseudoMoves(S, p, grid).filter(([x, y]) => {
    const fromX = p.x;
    const fromY = p.y;
    const target = grid[y][x];
    const ep = p.t === 'P' && x !== fromX && !target;
    const epPiece = ep ? grid[y + (p.o === 0 ? 1 : -1)][x] : null;
    grid[fromY][fromX] = null;
    if (epPiece) grid[epPiece.y][epPiece.x] = null;
    grid[y][x] = p;
    p.x = x;
    p.y = y;
    const king = S.pieces.find((piece) => piece.o === p.o && piece.t === 'K' && grid[piece.y]?.[piece.x] === piece);
    const safe = king && !classicIsAttacked(S, king.x, king.y, 1 - p.o, grid);
    p.x = fromX;
    p.y = fromY;
    grid[fromY][fromX] = p;
    grid[y][x] = target;
    if (epPiece) grid[epPiece.y][epPiece.x] = epPiece;
    return safe;
  });
}

function classicInsufficientMaterial(S) {
  const material = S.pieces.filter((p) => p.t !== 'K');
  if (!material.length) return true;
  if (material.some((p) => ['P', 'R', 'Q'].includes(p.t))) return false;
  if (material.length === 1) return true;
  if (material.every((p) => p.t === 'B') && new Set(material.map((p) => (p.x + p.y) % 2)).size === 1) return true;
  return material.length === 2 && material.every((p) => p.t === 'N' && p.o === material[0].o);
}

export function classicCanMate(S, side) {
  const material = S.pieces.filter((p) => p.o === side && p.t !== 'K');
  if (material.some((p) => ['P', 'R', 'Q'].includes(p.t))) return true;
  if (material.some((p) => p.t === 'B') && material.some((p) => p.t === 'N')) return true;
  if (material.filter((p) => p.t === 'B').length >= 2 && new Set(material.filter((p) => p.t === 'B').map((p) => (p.x + p.y) % 2)).size > 1) return true;
  if (material.filter((p) => p.t === 'N').length >= 3) return true;
  return material.length >= 2 && S.pieces.some((p) => p.o !== side && p.t !== 'K');
}

function rmPiece(S, p) {
  if (S.grid[p.y]?.[p.x] === p) S.grid[p.y][p.x] = null;
  const idx = S.pieces.indexOf(p);
  if (idx >= 0) S.pieces.splice(idx, 1);
  if (S.sel === p) S.sel = null;
}

export function doClassicMove(S, p, x, y, emit) {
  const side = S.turnOwner;
  const fromX = p.x;
  const fromY = p.y;
  const target = S.grid[y][x];
  const pawnMove = p.t === 'P';
  const epCapture = pawnMove && x !== fromX && !target;
  const captured = target || (epCapture ? S.grid[y + (side === 0 ? 1 : -1)][x] : null);

  if (captured) {
    rmPiece(S, captured);
    S.f[side].score += VAL[captured.t] || 1;
    S.f[side].captures++;
    emit?.('sound', 'capture');
  } else {
    emit?.('sound', 'move');
  }

  S.grid[fromY][fromX] = null;
  p.x = x;
  p.y = y;
  S.grid[y][x] = p;

  if (p.t === 'K' && Math.abs(x - fromX) === 2) {
    const rookX = x === 6 ? 7 : 0;
    const rook = S.grid[y][rookX];
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
  let promoted = false;
  if (pawnMove && (y === 0 || y === 7)) {
    p.t = 'Q';
    promoted = true;
    S.events.unshift({ msg: 'Promoção: peão convertido em Rainha.', t: S.T });
  }
  S.halfMoves = pawnMove || captured ? 0 : S.halfMoves + 1;
  S.chessClock[side] += S.chessIncrement;
  S.turnOwner = 1 - side;
  S.turn = S.turnOwner;
  S.lastMove = { x0: fromX, y0: fromY, x1: x, y1: y, t: S.T };

  const notation = `${p.t === 'P' ? '' : p.t}${FILES[fromX]}${8 - fromY}${captured ? '×' : '→'}${FILES[x]}${8 - y}${promoted ? '=Q' : ''}`;
  S.moveHistory.unshift({ side, text: notation, glyph: GLYPH[p.t], name: NOME[p.t] });
  if (S.moveHistory.length > 30) S.moveHistory.length = 30;
  S.events.unshift({ msg: `${side === 0 ? 'Azul' : 'Rubi'}: ${notation}`, t: S.T });
  if (S.events.length > 16) S.events.length = 16;

  const replyExists = S.pieces.some((piece) => piece.o === S.turnOwner && getClassicMoves(S, piece).length > 0);
  const king = S.pieces.find((piece) => piece.o === S.turnOwner && piece.t === 'K');
  const checked = king && classicIsAttacked(S, king.x, king.y, side);
  const key = classicPositionKey(S);
  S.repetition.set(key, (S.repetition.get(key) || 0) + 1);

  if (!replyExists) {
    S.over = true;
    S.winner = checked ? side : null;
    S.reason = checked ? 'Xeque-mate.' : 'Afogamento: empate.';
    S.checkmatedKingOwner = checked ? 1 - side : null;
  } else if (classicInsufficientMaterial(S)) {
    S.over = true;
    S.winner = null;
    S.reason = 'Material insuficiente: empate.';
  } else if (S.halfMoves >= 100) {
    S.over = true;
    S.winner = null;
    S.reason = 'Regra dos 50 lances: empate.';
  } else if (S.repetition.get(key) >= 3) {
    S.over = true;
    S.winner = null;
    S.reason = 'Repetição tripla: empate.';
  }

  if (S.over) {
    if (S.winner === 0) emit?.('sound', 'win');
    emit?.('gameover', { winner: S.winner, reason: S.reason });
  } else if (S.mode === 'classic_cpu' && S.turnOwner === 1) {
    S.nextBotAt = S.T + 0.45;
  }
  return true;
}

export function classicBotMove(S, emit) {
  const candidates = [];
  for (const p of S.pieces.filter((piece) => piece.o === 1)) {
    for (const [x, y] of getClassicMoves(S, p)) {
      const target = S.grid[y][x];
      let score = target ? (VAL[target.t] || 0) * 3 : 0;
      score += (3.5 - Math.abs(3.5 - x) - Math.abs(3.5 - y)) * 0.22;
      if (p.t === 'P') score += (y - p.y) * 0.35;
      if ((p.t === 'N' || p.t === 'B') && (p.x === 1 || p.x === 6) && p.y === 0) score += 0.8;
      candidates.push({ p, x, y, score: score + Math.random() * (6 - S.cpuDifficulty) * 0.9 });
    }
  }
  if (!candidates.length) return;
  candidates.sort((a, b) => b.score - a.score);
  const pool = Math.max(1, 6 - S.cpuDifficulty);
  const choice = candidates[Math.floor(Math.random() * Math.min(pool, candidates.length))];
  doClassicMove(S, choice.p, choice.x, choice.y, emit);
}

export function stepClassicState(S, dt, emit) {
  if (!S || !S.started || S.over) return;
  S.T += dt;
  S.chessClock[S.turnOwner] = Math.max(0, S.chessClock[S.turnOwner] - dt);
  if (S.chessClock[S.turnOwner] <= 0) {
    const winner = classicCanMate(S, 1 - S.turnOwner) ? 1 - S.turnOwner : null;
    S.over = true;
    S.winner = winner;
    S.reason = winner === null ? 'Tempo esgotado sem material suficiente para mate: empate.' : 'Tempo esgotado.';
    emit?.('gameover', { winner: S.winner, reason: S.reason });
  } else if (S.mode === 'classic_cpu' && S.turnOwner === 1 && S.T >= S.nextBotAt) {
    classicBotMove(S, emit);
  }
}

export function handleClassicClick(S, x, y, emit) {
  if (!S || !S.started || S.over || x < 0 || y < 0 || x >= 8 || y >= 8) return;
  if (S.mode === 'classic_cpu' && S.turnOwner !== 0) return;

  const q = S.grid[y][x];
  const s = S.sel;
  if (s && getClassicMoves(S, s).some((m) => m[0] === x && m[1] === y)) {
    doClassicMove(S, s, x, y, emit);
    S.sel = null;
    return;
  }
  if (q && q.o === S.turnOwner) S.sel = q;
  else S.sel = null;
}
