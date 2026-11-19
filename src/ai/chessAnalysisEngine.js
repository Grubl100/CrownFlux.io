import { VAL } from '../utils/constants.js';

export const MOVE_CLASSIFICATIONS = [
  { id: 'brilliant', label: 'Brilhante', badge: '!!', color: '#26c6da' },
  { id: 'great', label: 'Ótimo', badge: '!', color: '#5c9ce6' },
  { id: 'best', label: 'Melhor', badge: '★', color: '#6db38b' },
  { id: 'excellent', label: 'Excelente', badge: '✓', color: '#84c9a0' },
  { id: 'good', label: 'Bom', badge: '○', color: '#9ab4c4' },
  { id: 'book', label: 'Livro', badge: '📖', color: '#c4a46b' },
  { id: 'inaccuracy', label: 'Imprecisão', badge: '?!', color: '#e6ca5c' },
  { id: 'mistake', label: 'Erro', badge: '?', color: '#e39648' },
  { id: 'blunder', label: 'Erro grave', badge: '??', color: '#e05a5a' },
  { id: 'miss', label: 'Oportunidade perdida', badge: '✕', color: '#d9707c' },
];

export const CLASS_MAP = Object.fromEntries(MOVE_CLASSIFICATIONS.map((c) => [c.id, c]));

// Sequências clássicas de abertura reconhecidas (UCI) para classificação "Livro"
const OPENING_BOOK_PREFIXES = [
  ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1b5', 'a7a6', 'b5a4', 'g8f6'], // Ruy Lopez
  ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'f8c5', 'c2c3', 'g8f6'], // Italiana
  ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'g8f6', 'd2d3', 'f8c5'], // Dois Cavalos
  ['e2e4', 'c7c5', 'g1f3', 'd7d6', 'd2d4', 'c5d4', 'f3d4', 'g8f6'], // Siciliana
  ['e2e4', 'c7c5', 'g1f3', 'b8c6', 'd2d4', 'c5d4', 'f3d4', 'g8f6'], // Siciliana Aberta
  ['e2e4', 'e7e6', 'd2d4', 'd7d5', 'b1c3', 'g8f6'], // Francesa
  ['e2e4', 'c7c6', 'd2d4', 'd7d5', 'b1c3', 'd5e4'], // Caro-Kann
  ['d2d4', 'd7d5', 'c2c4', 'e7e6', 'b1c3', 'g8f6'], // Gambito da Dama
  ['d2d4', 'd7d5', 'c2c4', 'c7c6', 'g1f3', 'g8f6'], // Eslava
  ['d2d4', 'g8f6', 'c2c4', 'g7g6', 'b1c3', 'f8g7'], // Índia do Rei
  ['d2d4', 'd7d5', 'c1f4', 'g8f6', 'e2e3', 'c7c5'], // Sistema Londres
  ['c2c4', 'e7e5', 'b1c3', 'g8f6', 'g2g3', 'd7d5'], // Inglesa
  ['g1f3', 'd7d5', 'd2d4', 'g8f6', 'c2c4', 'e7e6'], // Reti
];

export function isBookMove(uciMoves, plyIndex) {
  if (plyIndex < 1 || plyIndex > 8) return false;
  const seq = uciMoves.slice(0, plyIndex);
  return OPENING_BOOK_PREFIXES.some(
    (line) => line.length >= plyIndex && seq.every((mv, i) => line[i] === mv)
  );
}

// Converte avaliação normalizada (perspectiva das Brancas) para Expected Points [0..100]
export function evalToExpectedPoints(ev) {
  if (!ev) return 50;
  if (ev.terminalWinner === 0) return 100;
  if (ev.terminalWinner === 1) return 0;
  if (ev.terminalDraw) return 50;
  if (ev.mate !== null && ev.mate !== undefined) {
    if (ev.mate > 0) return 100;
    if (ev.mate < 0) return 0;
  }
  const cp = Number(ev.scoreCp) || 0;
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);
}

export function evalToEffectiveCp(ev) {
  if (!ev) return 0;
  if (ev.terminalWinner === 0) return 1200;
  if (ev.terminalWinner === 1) return -1200;
  if (ev.terminalDraw) return 0;
  if (ev.mate !== null && ev.mate !== undefined) {
    return ev.mate > 0 ? 1200 : -1200;
  }
  return Math.max(-1200, Math.min(1200, Number(ev.scoreCp) || 0));
}

function materialForSide(pieces, side) {
  let total = 0;
  for (const p of pieces || []) {
    if (p.o === side && p.t !== 'K') total += VAL[p.t] || 0;
  }
  return total;
}

export function buildFullAnalysisReport(snapshots, rawEvals, engineName = 'Stockfish 19 Lite WASM', mode = 'complete') {
  const uciMoves = snapshots.slice(1).map((s) => s.move?.uci).filter(Boolean);

  const evaluations = rawEvals.map((ev, idx) => {
    if (idx === 0) {
      return {
        ...ev,
        classification: null,
        epLoss: 0,
        cpLoss: 0,
        moveAccuracy: 100,
        bestBefore: ev.bestMove,
        pvBefore: ev.pv || [],
      };
    }

    const prev = rawEvals[idx - 1];
    const move = snapshots[idx].move;
    const moverSide = move?.side ?? (idx - 1) % 2;
    const sign = moverSide === 0 ? 1 : -1;

    const epBeforeWhite = evalToExpectedPoints(prev);
    const epAfterWhite = evalToExpectedPoints(ev);
    const epBeforeMover = moverSide === 0 ? epBeforeWhite : 100 - epBeforeWhite;
    const epAfterMover = moverSide === 0 ? epAfterWhite : 100 - epAfterWhite;
    const epLoss = Math.max(0, epBeforeMover - epAfterMover);

    const cpBeforeMover = evalToEffectiveCp(prev) * sign;
    const cpAfterMover = evalToEffectiveCp(ev) * sign;
    const cpLoss = Math.max(0, cpBeforeMover - cpAfterMover);

    const mateBeforeMover = prev.mate !== null && prev.mate !== undefined ? prev.mate * sign : null;
    const mateAfterMover = ev.mate !== null && ev.mate !== undefined ? ev.mate * sign : null;

    const allowedMate =
      ev.terminalWinner === 1 - moverSide ||
      (mateAfterMover !== null && mateAfterMover < 0 && !(mateBeforeMover !== null && mateBeforeMover < 0));
    const missedMate =
      mateBeforeMover !== null &&
      mateBeforeMover > 0 &&
      !(ev.terminalWinner === moverSide) &&
      !(mateAfterMover !== null && mateAfterMover > 0);

    const isEngineBest = Boolean(
      (prev.bestMove && move?.uci && prev.bestMove === move.uci) ||
      ev.terminalWinner === moverSide
    );

    // Perda efetiva combina Expected Points + Centipawn Loss (evita inflar precisão em posições já perdidas!)
    let effectiveLoss = Math.max(epLoss, Math.min(36, cpLoss / 14));
    if (allowedMate) effectiveLoss = Math.max(effectiveLoss, 42);
    if (missedMate) effectiveLoss = Math.max(effectiveLoss, 26);

    // Verifica se o lance foi um sacrifício real (para critério de "Brilhante")
    const matBefore = materialForSide(snapshots[idx - 1]?.pieces, moverSide);
    const matAfter = materialForSide(snapshots[idx]?.pieces, moverSide);
    const oppMatBefore = materialForSide(snapshots[idx - 1]?.pieces, 1 - moverSide);
    const oppMatAfter = materialForSide(snapshots[idx]?.pieces, 1 - moverSide);
    const nextMove = snapshots[idx + 1]?.move;
    const sacrificedPiece =
      nextMove &&
      nextMove.captured &&
      (VAL[nextMove.captured] || 0) >= 3 &&
      (VAL[nextMove.captured] || 0) > (VAL[move?.captured] || 0) &&
      nextMove.toX === move?.toX &&
      nextMove.toY === move?.toY;
    const immediateSac = matAfter - matBefore < oppMatAfter - oppMatBefore;

    // Gap para a 2ª melhor opção do motor (para critério de "Ótimo")
    let gapOverSecond = 0;
    if (prev.secondBest) {
      const epSecondWhite = evalToExpectedPoints(prev.secondBest);
      const epSecondMover = moverSide === 0 ? epSecondWhite : 100 - epSecondWhite;
      gapOverSecond = Math.max(0, epBeforeMover - epSecondMover);
    }

    let classification;
    if (isBookMove(uciMoves, idx) && effectiveLoss <= 5.0) {
      classification = 'book';
    } else if (allowedMate) {
      classification = 'blunder';
    } else if (missedMate && epAfterMover < 88) {
      classification = 'miss';
    } else if (isEngineBest && (sacrificedPiece || immediateSac) && epAfterMover >= 46 && idx >= 6) {
      classification = 'brilliant';
    } else if (isEngineBest && gapOverSecond >= 12 && epAfterMover >= 44 && idx >= 4) {
      classification = 'great';
    } else if (isEngineBest || (effectiveLoss <= 1.2 && cpLoss <= 15)) {
      classification = 'best';
    } else if (effectiveLoss <= 3.0 && cpLoss <= 45) {
      classification = 'excellent';
    } else if (effectiveLoss <= 6.5 && cpLoss <= 95) {
      classification = 'good';
    } else if (epBeforeMover >= 68 && epLoss >= 14 && epAfterMover >= 40) {
      classification = 'miss';
    } else if (effectiveLoss <= 12.5 && cpLoss <= 185) {
      classification = 'inaccuracy';
    } else if (effectiveLoss <= 22.0 && cpLoss <= 320) {
      classification = 'mistake';
    } else {
      classification = 'blunder';
    }

    // Curva de precisão realista (0-100): lances ruins derrubam a precisão de verdade!
    const moveAccuracy = classification === 'book' || classification === 'brilliant' || classification === 'great' || classification === 'best'
      ? 100
      : Math.max(0, Math.min(100, 100 * Math.exp(-0.078 * effectiveLoss)));

    return {
      ...ev,
      classification,
      epLoss: Number(epLoss.toFixed(1)),
      cpLoss: Math.round(cpLoss),
      effectiveLoss: Number(effectiveLoss.toFixed(1)),
      moveAccuracy: Number(moveAccuracy.toFixed(1)),
      bestBefore: prev.bestMove,
      pvBefore: prev.pv || [],
      moverSide,
    };
  });

  const calcSideStats = (side) => {
    const counts = Object.fromEntries(MOVE_CLASSIFICATIONS.map((c) => [c.id, 0]));
    const sideMoves = evaluations.filter((e) => e.ply > 0 && e.moverSide === side);
    if (!sideMoves.length) {
      return { accuracy: 0, totalMoves: 0, counts };
    }
    let accSum = 0;
    for (const m of sideMoves) {
      counts[m.classification] = (counts[m.classification] || 0) + 1;
      accSum += m.moveAccuracy;
    }
    return {
      accuracy: Math.round(accSum / sideMoves.length),
      totalMoves: sideMoves.length,
      counts,
    };
  };

  const decisiveMoments = evaluations
    .filter((e) =>
      e.ply > 0 &&
      ['brilliant', 'great', 'blunder', 'mistake', 'miss'].includes(e.classification)
    )
    .sort((a, b) => {
      const prio = { brilliant: 5, blunder: 4, miss: 3, great: 2, mistake: 1 };
      return (prio[b.classification] || 0) - (prio[a.classification] || 0) || b.effectiveLoss - a.effectiveLoss;
    })
    .slice(0, 8)
    .map((e) => ({
      ply: e.ply,
      san: snapshots[e.ply]?.move?.san || '',
      side: e.moverSide,
      classification: e.classification,
      epLoss: e.epLoss,
      cpLoss: e.cpLoss,
      bestBefore: e.bestBefore,
    }));

  return {
    evaluations,
    whiteStats: calcSideStats(0),
    blackStats: calcSideStats(1),
    decisiveMoments,
    engineName,
    analysisMode: mode,
    analyzedAt: new Date().toISOString(),
  };
}
