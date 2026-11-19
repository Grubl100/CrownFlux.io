import {
  DIAG,
  GLYPH,
  KN,
  NOME,
  ORTH,
  VAL,
  resolveClassicControl,
} from '../utils/constants.js';

const FILES = 'abcdefgh';

export const PREMOVE_COST_SECONDS = 0.1; // 100ms de custo configurável por premove

export function getClassicPremoveTargets(S, p) {
  if (!S || !p) return [];
  const res = [];
  const { x, y, t, o } = p;
  const add = (a, b) => {
    if (a >= 0 && b >= 0 && a < 8 && b < 8 && !(a === x && b === y)) res.push([a, b]);
  };
  if (t === 'P') {
    const dir = o === 0 ? -1 : 1;
    const start = o === 0 ? 6 : 1;
    add(x, y + dir);
    if (y === start) add(x, y + dir * 2);
    add(x - 1, y + dir);
    add(x + 1, y + dir);
  } else if (t === 'N') {
    for (const [dx, dy] of KN) add(x + dx, y + dy);
  } else if (t === 'B' || t === 'R' || t === 'Q') {
    const dirs = t === 'B' ? DIAG : t === 'R' ? ORTH : ORTH.concat(DIAG);
    for (const [dx, dy] of dirs) {
      let a = x + dx;
      let b = y + dy;
      while (a >= 0 && b >= 0 && a < 8 && b < 8) {
        add(a, b);
        a += dx;
        b += dy;
      }
    }
  } else if (t === 'K') {
    for (const [dx, dy] of ORTH.concat(DIAG)) add(x + dx, y + dy);
    const row = o === 0 ? 7 : 0;
    if (x === 4 && y === row) {
      add(6, row);
      add(2, row);
    }
  }
  return res;
}

export function getAllLegalUciMoves(S, side = S.turnOwner) {
  const out = [];
  for (const p of S.pieces) {
    if (p.o !== side) continue;
    for (const [tx, ty] of getClassicMoves(S, p)) {
      const promo = p.t === 'P' && (ty === 0 || ty === 7) ? 'q' : '';
      out.push(`${FILES[p.x]}${8 - p.y}${FILES[tx]}${8 - ty}${promo}`);
    }
  }
  return out;
}

export function createClassicState({
  mode = 'classic_cpu',
  timeControl = 'blitz3',
  customTime = null,
  cpuDifficulty = 3,
  playerSide = 0, // 0 = Brancas, 1 = Pretas (usado em classic_cpu)
} = {}) {
  const control = resolveClassicControl(timeControl, customTime);
  const resolvedPlayerSide = playerSide === 1 ? 1 : 0;
  const grid = Array.from({ length: 8 }, () => Array(8).fill(null));
  const state = {
    mode,
    classic: true,
    N: 8,
    T: 0,
    turnOwner: 0,
    turn: 0,
    playerSide: resolvedPlayerSide,
    botSide: mode === 'classic_cpu' ? 1 - resolvedPlayerSide : -1,
    cpuDifficulty,
    timeControl: control.key,
    customTime: control.custom ? customTime : null,
    category: control.category,
    clockControlLabel: control.label,
    chessClock: [control.seconds, control.seconds],
    initialSeconds: control.seconds,
    chessIncrement: control.increment,
    castle: [{ king: true, queen: true }, { king: true, queen: true }],
    enPassant: null,
    halfMoves: 0,
    fullMoveNumber: 1,
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
    moveHistory: [], // cronológico: [{ ply, side, san, uci, fromX, fromY, toX, toY, piece, captured, promotion, inCheck, isMate, fenAfter, clockAfter }]
    events: [{ msg: `Xadrez Clássico · ${control.label}.`, t: 0 }],
    f: [
      { id: 0, score: 0, captures: 0, alive: true },
      { id: 1, score: 0, captures: 0, alive: true },
    ],
    nextBotAt: mode === 'classic_cpu' && resolvedPlayerSide === 1 ? 0.35 : 0,
    botThinking: false,
    createdAt: new Date().toISOString(),
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
  state.initialFen = stateToFen(state);
  state.repetition.set(classicPositionKey(state), 1);
  return state;
}

export function stateToFen(S) {
  const rows = [];
  for (let y = 0; y < 8; y++) {
    let row = '';
    let empty = 0;
    for (let x = 0; x < 8; x++) {
      const p = S.grid[y]?.[x];
      if (!p) {
        empty++;
      } else {
        if (empty > 0) {
          row += String(empty);
          empty = 0;
        }
        row += p.o === 0 ? p.t.toUpperCase() : p.t.toLowerCase();
      }
    }
    if (empty > 0) row += String(empty);
    rows.push(row);
  }
  const active = (S.turnOwner ?? S.turn ?? 0) === 0 ? 'w' : 'b';
  let castle = '';
  if (S.castle?.[0]?.king) castle += 'K';
  if (S.castle?.[0]?.queen) castle += 'Q';
  if (S.castle?.[1]?.king) castle += 'k';
  if (S.castle?.[1]?.queen) castle += 'q';
  if (!castle) castle = '-';
  const ep = S.enPassant ? `${FILES[S.enPassant.x]}${8 - S.enPassant.y}` : '-';
  const half = S.halfMoves || 0;
  const full = S.fullMoveNumber || Math.floor((S.moveHistory?.length || 0) / 2) + 1;
  return `${rows.join('/')} ${active} ${castle} ${ep} ${half} ${full}`;
}

export function stateToPgn(S, meta = {}) {
  const resultTag = S.over
    ? S.winner === 0
      ? '1-0'
      : S.winner === 1
        ? '0-1'
        : '1/2-1/2'
    : '*';
  const dateStr = (meta.date || S.createdAt || new Date().toISOString()).slice(0, 10).replace(/-/g, '.');
  const headers = [
    `[Event "Crownflux.io ${S.clockControlLabel || 'Xadrez Clássico'}"]`,
    `[Site "Crownflux.io"]`,
    `[Date "${dateStr}"]`,
    `[White "${meta.white || 'Brancas'}"]`,
    `[Black "${meta.black || 'Pretas'}"]`,
    `[Result "${resultTag}"]`,
    `[TimeControl "${S.initialSeconds || 180}+${S.chessIncrement || 0}"]`,
  ];
  const tokens = [];
  const hist = S.moveHistory || [];
  for (let i = 0; i < hist.length; i++) {
    if (i % 2 === 0) tokens.push(`${Math.floor(i / 2) + 1}.`);
    tokens.push(hist[i].san || hist[i].text || hist[i].uci);
  }
  tokens.push(resultTag);
  return `${headers.join('\n')}\n\n${tokens.join(' ')}`;
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
    if (y + dir >= 0 && y + dir < 8 && !grid[y + dir]?.[x]) {
      result.push([x, y + dir]);
      if (y === start && !grid[y + dir * 2]?.[x]) result.push([x, y + dir * 2]);
    }
    for (const dx of [-1, 1]) {
      const a = x + dx;
      const b = y + dir;
      const isEp = S.enPassant?.x === a && S.enPassant?.y === b
        && grid[y]?.[a]?.o === 1 - o && grid[y]?.[a]?.t === 'P';
      if (a >= 0 && a < 8 && b >= 0 && b < 8 && ((grid[b]?.[a]?.o === 1 - o && grid[b][a]?.t !== 'K') || isEp)) {
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

export function isPromotionMove(S, p, x, y) {
  if (!p || p.t !== 'P') return false;
  return (p.o === 0 && y === 0) || (p.o === 1 && y === 7);
}

// Obtém os destinos legais reais para setas partindo de (fromX, fromY) usando getClassicMoves
export function getLegalArrowTargets(S, fromX, fromY) {
  if (!S || !S.grid || fromX < 0 || fromY < 0 || fromX >= 8 || fromY >= 8) return [];
  const piece = S.grid[fromY]?.[fromX];
  if (!piece) return [];
  return getClassicMoves(S, piece);
}

// Validador oficial de setas de movimento legal no Xadrez Clássico.
// Consulta diretamente getClassicMoves (mesmo gerador de lances legais do jogo).
export function validateClassicMoveArrow(S, fromX, fromY, toX, toY, options = {}) {
  if (!S || !S.grid) {
    return { legal: false, reason: 'no_state', message: 'Tabuleiro indisponível.' };
  }
  if (fromX < 0 || fromY < 0 || fromX >= 8 || fromY >= 8 || toX < 0 || toY < 0 || toX >= 8 || toY >= 8) {
    return { legal: false, reason: 'out_of_bounds', message: 'Destino fora do tabuleiro.' };
  }
  if (fromX === toX && fromY === toY) {
    return { legal: false, reason: 'same_square', message: 'Origem e destino iguais.' };
  }

  const piece = S.grid[fromY]?.[fromX];
  if (!piece) {
    return {
      legal: false,
      reason: 'empty_origin',
      message: 'Setas de movimento exigem uma peça na casa de origem. Use "Marcação Livre" para anotações abstratas.',
    };
  }

  const legalTargets = getClassicMoves(S, piece);
  const isLegal = legalTargets.some(([mx, my]) => mx === toX && my === toY);
  if (!isLegal) {
    const pieceLabel = NOME[piece.t] || 'Peça';
    return {
      legal: false,
      reason: 'illegal_move',
      piece,
      legalTargets,
      message: `Movimento ilegal para ${pieceLabel} nesta posição.`,
    };
  }

  const target = S.grid[toY]?.[toX];
  const isEnPassant = piece.t === 'P' && fromX !== toX && !target;
  const isCapture = Boolean(target) || isEnPassant;
  const isCastle = piece.t === 'K' && Math.abs(toX - fromX) === 2;
  const isPromotion = isPromotionMove(S, piece, toX, toY);
  const promoChoice = isPromotion
    ? (['Q', 'R', 'B', 'N'].includes(String(options.promotion || '').toUpperCase()) ? String(options.promotion).toUpperCase() : 'Q')
    : null;

  return {
    legal: true,
    reason: 'ok',
    piece,
    isCapture,
    isEnPassant,
    isCastle,
    isPromotion,
    promotion: promoChoice,
    legalTargets,
  };
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

export function doClassicMove(S, p, x, y, emit, promotion = 'Q') {
  const side = S.turnOwner;
  const fromX = p.x;
  const fromY = p.y;
  const origType = p.t;
  const target = S.grid[y][x];
  const pawnMove = origType === 'P';
  const epCapture = pawnMove && x !== fromX && !target;
  const captured = target || (epCapture ? S.grid[y + (side === 0 ? 1 : -1)][x] : null);
  const isCastleKing = origType === 'K' && x - fromX === 2;
  const isCastleQueen = origType === 'K' && fromX - x === 2;

  // Desambiguação algébrica padrão (SAN) antes de alterar o tabuleiro
  let disambig = '';
  if (origType !== 'P' && origType !== 'K') {
    const peers = S.pieces.filter(
      (o) => o !== p && o.o === side && o.t === origType && getClassicMoves(S, o).some(([mx, my]) => mx === x && my === y)
    );
    if (peers.length > 0) {
      const sameFile = peers.some((o) => o.x === fromX);
      const sameRank = peers.some((o) => o.y === fromY);
      if (!sameFile) disambig = FILES[fromX];
      else if (!sameRank) disambig = String(8 - fromY);
      else disambig = `${FILES[fromX]}${8 - fromY}`;
    }
  }

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

  if (isCastleKing || isCastleQueen) {
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
  const promoChoice = ['Q', 'R', 'B', 'N'].includes(String(promotion || '').toUpperCase())
    ? String(promotion).toUpperCase()
    : 'Q';
  let promotedTo = null;
  if (pawnMove && (y === 0 || y === 7)) {
    p.t = promoChoice;
    promotedTo = promoChoice;
    S.events.unshift({ msg: `Promoção: peão convertido em ${NOME[promoChoice] || 'Rainha'}.`, t: S.T });
  }

  S.halfMoves = pawnMove || captured ? 0 : S.halfMoves + 1;
  if (side === 1) S.fullMoveNumber = (S.fullMoveNumber || 1) + 1;
  S.chessClock[side] += S.chessIncrement;
  S.turnOwner = 1 - side;
  S.turn = S.turnOwner;
  S.lastMove = { x0: fromX, y0: fromY, x1: x, y1: y, t: S.T, promotion: promotedTo };

  const replyExists = S.pieces.some((piece) => piece.o === S.turnOwner && getClassicMoves(S, piece).length > 0);
  const king = S.pieces.find((piece) => piece.o === S.turnOwner && piece.t === 'K');
  const checked = king && classicIsAttacked(S, king.x, king.y, side);
  const key = classicPositionKey(S);
  S.repetition.set(key, (S.repetition.get(key) || 0) + 1);

  if (checked && replyExists) emit?.('sound', 'check');

  let san = '';
  if (isCastleKing) san = 'O-O';
  else if (isCastleQueen) san = 'O-O-O';
  else {
    const destSq = `${FILES[x]}${8 - y}`;
    if (origType === 'P') san = `${captured ? `${FILES[fromX]}x` : ''}${destSq}${promotedTo ? `=${promotedTo}` : ''}`;
    else san = `${origType}${disambig}${captured ? 'x' : ''}${destSq}`;
  }
  if (!replyExists && checked) san += '#';
  else if (checked) san += '+';

  const uci = `${FILES[fromX]}${8 - fromY}${FILES[x]}${8 - y}${promotedTo ? promotedTo.toLowerCase() : ''}`;
  const fenAfter = stateToFen(S);

  S.moveHistory.push({
    ply: S.moveHistory.length + 1,
    side,
    san,
    text: san,
    uci,
    fromX,
    fromY,
    toX: x,
    toY: y,
    piece: origType,
    captured: captured?.t || null,
    promotion: promotedTo,
    inCheck: Boolean(checked),
    isMate: Boolean(!replyExists && checked),
    glyph: GLYPH[p.t],
    name: NOME[p.t],
    fenAfter,
    clockAfter: Number(S.chessClock[side].toFixed(1)),
  });

  S.events.unshift({ msg: `${side === 0 ? 'Brancas' : 'Pretas'}: ${san}`, t: S.T });
  if (S.events.length > 24) S.events.length = 24;

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
    if (S.winner === S.playerSide) emit?.('sound', 'win');
    emit?.('gameover', { winner: S.winner, reason: S.reason });
  } else if (S.mode === 'classic_cpu' && S.turnOwner === S.botSide) {
    S.nextBotAt = S.T + 0.18;
  }
  return true;
}

export function applyUciMove(S, uci, emit) {
  if (!S || S.over || !uci || uci.length < 4) return false;
  const fromX = FILES.indexOf(uci[0]);
  const fromY = 8 - Number(uci[1]);
  const toX = FILES.indexOf(uci[2]);
  const toY = 8 - Number(uci[3]);
  const promo = uci[4] ? uci[4].toUpperCase() : 'Q';
  const piece = S.grid[fromY]?.[fromX];
  if (!piece || piece.o !== S.turnOwner) return false;
  const legal = getClassicMoves(S, piece).some(([mx, my]) => mx === toX && my === toY);
  if (!legal) return false;
  return doClassicMove(S, piece, toX, toY, emit, promo);
}

export function reconstructClassicStates(uciMoves = []) {
  const base = createClassicState({ mode: 'classic_local', timeControl: 'classic30' });
  const snapshots = [
    {
      ply: 0,
      fen: stateToFen(base),
      pieces: base.pieces.map((p) => ({ ...p })),
      castle: base.castle.map((c) => ({ ...c })),
      enPassant: base.enPassant ? { ...base.enPassant } : null,
      lastMove: null,
      turnOwner: 0,
      move: null,
      inCheck: false,
      checkmatedKingOwner: null,
    },
  ];
  for (const uci of uciMoves) {
    if (!applyUciMove(base, uci)) break;
    const lastEntry = base.moveHistory[base.moveHistory.length - 1];
    snapshots.push({
      ply: base.moveHistory.length,
      fen: lastEntry.fenAfter,
      pieces: base.pieces.map((p) => ({ ...p })),
      castle: base.castle.map((c) => ({ ...c })),
      enPassant: base.enPassant ? { ...base.enPassant } : null,
      lastMove: base.lastMove ? { ...base.lastMove } : null,
      turnOwner: base.turnOwner,
      move: lastEntry,
      inCheck: lastEntry.inCheck,
      checkmatedKingOwner: base.checkmatedKingOwner,
    });
  }
  return snapshots;
}

// Fallback local apenas caso o Web Worker Stockfish não consiga inicializar
export function classicFallbackBotMove(S, emit) {
  const botSide = S.botSide >= 0 ? S.botSide : 1;
  const candidates = [];
  for (const p of S.pieces.filter((piece) => piece.o === botSide)) {
    for (const [x, y] of getClassicMoves(S, p)) {
      const target = S.grid[y][x];
      let score = target ? (VAL[target.t] || 0) * 3.5 : 0;
      score += (3.5 - Math.abs(3.5 - x) - Math.abs(3.5 - y)) * 0.25;
      candidates.push({ p, x, y, score: score + Math.random() * 0.8 });
    }
  }
  if (!candidates.length) return false;
  candidates.sort((a, b) => b.score - a.score);
  const choice = candidates[0];
  return doClassicMove(S, choice.p, choice.x, choice.y, emit, 'Q');
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
  } else if (S.mode === 'classic_cpu' && S.turnOwner === S.botSide && !S.botThinking && S.T >= S.nextBotAt) {
    emit?.('requestBotMove', { fen: stateToFen(S), difficulty: S.cpuDifficulty });
  }
}

export function handleClassicClick(S, x, y, emit, onNeedPromotion = null) {
  if (!S || !S.started || S.over || x < 0 || y < 0 || x >= 8 || y >= 8) return;
  if (S.mode === 'classic_cpu' && S.turnOwner !== S.playerSide) return;

  const q = S.grid[y][x];
  const s = S.sel;
  if (s && getClassicMoves(S, s).some((m) => m[0] === x && m[1] === y)) {
    if (isPromotionMove(S, s, x, y) && onNeedPromotion) {
      onNeedPromotion({ piece: s, x, y });
      S.sel = null;
      return;
    }
    doClassicMove(S, s, x, y, emit, 'Q');
    S.sel = null;
    return;
  }
  if (q && q.o === S.turnOwner) S.sel = q;
  else S.sel = null;
}
