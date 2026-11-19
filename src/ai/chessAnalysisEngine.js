import { VAL } from '../utils/constants.js';
import { uciPvToSanList } from '../game/classicEngine.js';

export const ANALYSIS_SCHEMA_VERSION = 2;

export const MOVE_CLASSIFICATIONS = [
  { id: 'brilliant', label: 'Brilhante', badge: '!!', color: '#26c6da' },
  { id: 'great', label: 'Ótimo', badge: '!', color: '#5c9ce6' },
  { id: 'best', label: 'Melhor', badge: '★', color: '#6db38b' },
  { id: 'excellent', label: 'Excelente', badge: '✓', color: '#84c9a0' },
  { id: 'good', label: 'Bom', badge: '○', color: '#9ab4c4' },
  { id: 'book', label: 'Livro', badge: 'L', color: '#c4a46b' },
  { id: 'inaccuracy', label: 'Imprecisão', badge: '?!', color: '#e6ca5c' },
  { id: 'mistake', label: 'Erro', badge: '?', color: '#e39648' },
  { id: 'blunder', label: 'Erro grave', badge: '??', color: '#e05a5a' },
  { id: 'miss', label: 'Oportunidade perdida', badge: '✕', color: '#d9707c' },
];

export const CLASS_MAP = Object.fromEntries(MOVE_CLASSIFICATIONS.map((c) => [c.id, c]));

// Critérios objetivos e documentados utilizados na classificação (baseados em perda de probabilidade
// de vitória real + guarda de centipawns/mate na perspectiva de quem moveu).
export const CLASSIFICATION_CRITERIA = {
  book: 'Sequência teórica conhecida nas primeiras 8 meias-jogadas com perda de expectativa <= 3,5%.',
  brilliant: 'Melhor lance (ou <= 0,5% WP), não forçado, com sacrifício material real, margem >= 10% WP sobre a 2ª opção e posição resultante >= 45% WP.',
  great: 'Melhor lance não forçado com margem decisiva >= 14% WP sobre a 2ª melhor alternativa em posição >= 40% WP.',
  best: 'Lance igual ao melhor do motor (ou perda ajustada <= 1,0% WP e <= 15 cp sem degradar mate/material em posição perdida).',
  excellent: 'Perda ajustada <= 2,5% WP e <= 45 cp.',
  good: 'Perda ajustada <= 5,5% WP e <= 95 cp.',
  inaccuracy: 'Perda ajustada entre 5,5% e 11,0% WP (ou perda tática moderada).',
  mistake: 'Perda ajustada entre 11,0% e 20,0% WP.',
  miss: 'Posição ganha (>= 72% WP ou mate forçado a favor) que desperdiça >= 15% WP mantendo posição >= 35% WP.',
  blunder: 'Perda ajustada > 20,0% WP, permite mate forçado adversário ou colapsa posição equilibrada/vencedora.',
};

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

// =========================================================================
// FUNÇÕES CENTRALIZADAS DE PERSPECTIVA E CONVERSÃO (FONTE ÚNICA DE VERDADE)
// =========================================================================

/**
 * Converte a pontuação bruta do protocolo UCI (sempre na perspectiva de quem tem a vez)
 * para a perspectiva fixa das Brancas:
 *   + = vantagem das Brancas
 *   - = vantagem das Pretas
 *   0 = equilíbrio
 */
export function normalizeEngineScoreToWhite(raw = {}, sideToMove = 0) {
  const sign = sideToMove === 0 ? 1 : -1;
  const scoreCp = raw.scoreCp !== null && raw.scoreCp !== undefined
    ? Number(raw.scoreCp) * sign
    : null;
  const mate = raw.mate !== null && raw.mate !== undefined
    ? Number(raw.mate) * sign
    : null;

  let wdl = null;
  if (Array.isArray(raw.wdl) && raw.wdl.length === 3) {
    const [w, d, l] = raw.wdl.map(Number);
    if (Number.isFinite(w) && Number.isFinite(d) && Number.isFinite(l)) {
      // UCI WDL é [win_mover, draw, loss_mover]; para Brancas invertemos W e L quando sideToMove === 1
      wdl = sideToMove === 0 ? [w, d, l] : [l, d, w];
    }
  }

  return { scoreCp, mate, wdl };
}

/**
 * Converte uma avaliação já normalizada para as Brancas para a perspectiva de `moverSide`.
 */
export function toMoverPerspective(whiteEval, moverSide = 0) {
  if (!whiteEval) {
    return {
      scoreCp: 0,
      mate: null,
      expectedPoints: 50,
      effectiveCp: 0,
      terminalWin: false,
      terminalLoss: false,
      terminalDraw: false,
    };
  }
  const sign = moverSide === 0 ? 1 : -1;
  const epWhite = evalToExpectedPoints(whiteEval);
  const expectedPoints = moverSide === 0 ? epWhite : 100 - epWhite;
  const scoreCp = whiteEval.scoreCp !== null && whiteEval.scoreCp !== undefined
    ? Number(whiteEval.scoreCp) * sign
    : null;
  const mate = whiteEval.mate !== null && whiteEval.mate !== undefined
    ? Number(whiteEval.mate) * sign
    : null;

  return {
    scoreCp,
    mate,
    expectedPoints,
    effectiveCp: evalToRawEffectiveCp(whiteEval) * sign,
    terminalWin: whiteEval.terminalWinner === moverSide,
    terminalLoss: whiteEval.terminalWinner === 1 - moverSide,
    terminalDraw: Boolean(whiteEval.terminalDraw),
  };
}

/**
 * Converte avaliação na perspectiva das Brancas para Expected Points [0..100].
 * Prioriza o modelo WDL real da NNUE do Stockfish 19 quando presente.
 */
export function evalToExpectedPoints(ev) {
  if (!ev) return 50;
  if (ev.terminalWinner === 0) return 100;
  if (ev.terminalWinner === 1) return 0;
  if (ev.terminalDraw) return 50;
  if (ev.mate !== null && ev.mate !== undefined) {
    if (ev.mate > 0) return 100;
    if (ev.mate < 0) return 0;
  }
  if (Array.isArray(ev.wdl) && ev.wdl.length === 3) {
    const [w, d, l] = ev.wdl;
    const total = w + d + l;
    if (total > 0) {
      return Math.max(0, Math.min(100, ((w + 0.5 * d) / total) * 100));
    }
  }
  const cp = Number(ev.scoreCp) || 0;
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);
}

/**
 * Centipawns efetivos sem teto estreito (±3000) para detectar perdas reais de material
 * mesmo em posições já desfavoráveis (corrige o bug antigo de clamping em ±1200).
 */
export function evalToRawEffectiveCp(ev) {
  if (!ev) return 0;
  if (ev.terminalWinner === 0) return 3000;
  if (ev.terminalWinner === 1) return -3000;
  if (ev.terminalDraw) return 0;
  if (ev.mate !== null && ev.mate !== undefined) {
    if (ev.mate === 0) return 0;
    const dist = Math.min(20, Math.abs(ev.mate));
    const mag = 3000 - dist * 40; // mate mais rápido vale mais
    return ev.mate > 0 ? mag : -mag;
  }
  return Math.max(-3000, Math.min(3000, Number(ev.scoreCp) || 0));
}

export function evalToEffectiveCp(ev) {
  return Math.max(-1200, Math.min(1200, evalToRawEffectiveCp(ev)));
}

export function formatWhiteEvalText(ev) {
  if (!ev) return '0.0';
  if (ev.terminalWinner === 0) return '1-0';
  if (ev.terminalWinner === 1) return '0-1';
  if (ev.terminalDraw) return '0.0';
  if (ev.mate !== null && ev.mate !== undefined) {
    if (ev.mate === 0) return '0.0';
    return ev.mate > 0 ? `#${ev.mate}` : `-#${Math.abs(ev.mate)}`;
  }
  const pawns = (Number(ev.scoreCp) || 0) / 100;
  return `${pawns >= 0 ? '+' : ''}${pawns.toFixed(1)}`;
}

/**
 * Calcula a perda real de qualidade de um lance na perspectiva de quem jogou (`moverSide`).
 * Trata separadamente:
 *  - Mudança de probabilidade de vitória (WP / Expected Points)
 *  - Mate permitido, mate desperdiçado e aceleração de mate adversário
 *  - Guarda de perda material em posições já perdidas (impede 100% de precisão ao pendurar peças perdendo)
 *  - Conversão limpa em posições já totalmente ganhas
 */
export function computeMoveLoss(prevWhiteEval, nextWhiteEval, moverSide, {
  isEngineBest = false,
  legalMoveCount = 2,
} = {}) {
  const before = toMoverPerspective(prevWhiteEval, moverSide);
  const after = toMoverPerspective(nextWhiteEval, moverSide);

  const wpLoss = Math.max(0, before.expectedPoints - after.expectedPoints);
  const cpLoss = Math.max(0, before.effectiveCp - after.effectiveCp);

  const hadForcedMate = before.mate !== null && before.mate > 0;
  const keptForcedMate = after.terminalWin || (after.mate !== null && after.mate > 0);
  const wasBeingMated = before.mate !== null && before.mate < 0;
  const isBeingMated = after.terminalLoss || (after.mate !== null && after.mate < 0);

  // Permitiu mate forçado onde antes não havia mate forçado contra si
  const allowedMate = isBeingMated && !wasBeingMated;
  // Acelerou significativamente o mate que já ia levar (ex: M8 -> M1)
  const acceleratedMateAgainst =
    wasBeingMated &&
    isBeingMated &&
    !isEngineBest &&
    (after.terminalLoss || (Math.abs(after.mate || 0) + 2 <= Math.abs(before.mate || 0)));

  // Perdeu mate forçado a favor
  const missedMate = hadForcedMate && !keptForcedMate;

  // Lance forçado único: não há alternativa legal melhor
  if (legalMoveCount === 1) {
    return {
      before,
      after,
      wpLoss: 0,
      cpLoss: 0,
      adjustedLoss: 0,
      allowedMate: false,
      missedMate: false,
      acceleratedMateAgainst: false,
      forced: true,
    };
  }

  // Se jogou exatamente o melhor lance do motor, a perda real é 0
  if (isEngineBest) {
    return {
      before,
      after,
      wpLoss: 0,
      cpLoss: 0,
      adjustedLoss: 0,
      allowedMate: false,
      missedMate: false,
      acceleratedMateAgainst: false,
      forced: false,
    };
  }

  let adjustedLoss = wpLoss;

  // 1. Guarda de cauda para posições já perdidas (wpBefore < 18%):
  // Evita que pendurar peças repetidamente enquanto está perdido receba perda ~0 e precisão 100%!
  if (before.expectedPoints < 18) {
    if (allowedMate || acceleratedMateAgainst) {
      adjustedLoss = Math.max(adjustedLoss, 28);
    } else if (cpLoss >= 120) {
      // Penalidade proporcional à perda material/posicional real em centipawns
      const tailPenalty = Math.min(42, cpLoss / 14);
      adjustedLoss = Math.max(adjustedLoss, tailPenalty);
    }
  } else if (before.expectedPoints < 94) {
    // Em posições disputadas, cpLoss extremo também complementa wpLoss
    adjustedLoss = Math.max(wpLoss, Math.min(35, cpLoss / 16));
  } else if (after.expectedPoints >= 92 && !missedMate) {
    // Posição totalmente ganha mantida totalmente ganha: pequena perda de cp não deve virar erro grave
    adjustedLoss = Math.min(wpLoss, 4.5);
  }

  // 2. Mate permitido a partir de posição não-perdida em mate
  if (allowedMate) {
    const baseMatePenalty = before.expectedPoints >= 45 ? 46 : before.expectedPoints >= 20 ? 34 : 26;
    adjustedLoss = Math.max(adjustedLoss, baseMatePenalty);
  }

  // 3. Mate forçado a favor desperdiçado
  if (missedMate) {
    if (after.expectedPoints < 55) {
      adjustedLoss = Math.max(adjustedLoss, 40); // jogou fora mate para empate/derrota
    } else if (after.expectedPoints < 88) {
      adjustedLoss = Math.max(adjustedLoss, 22); // jogou fora mate para vantagem incerta
    } else {
      adjustedLoss = Math.max(adjustedLoss, 7); // ainda totalmente ganho, apenas atrasou o mate
    }
  }

  return {
    before,
    after,
    wpLoss,
    cpLoss,
    adjustedLoss,
    allowedMate,
    missedMate,
    acceleratedMateAgainst,
    forced: false,
  };
}

/**
 * Curva calibrada de precisão individual por lance (metodologia CrownFlux.io).
 * - adjustedLoss = 0   -> 100.0
 * - adjustedLoss = 2   ->  91.4
 * - adjustedLoss = 5   ->  79.8
 * - adjustedLoss = 10  ->  63.6
 * - adjustedLoss = 20  ->  40.0
 * - adjustedLoss = 35  ->  19.3
 * - adjustedLoss = 46  ->  10.8
 */
export function moveLossToAccuracy(adjustedLoss) {
  if (adjustedLoss <= 0.4) return 100;
  const raw = 103.1668 * Math.exp(-0.04354 * adjustedLoss) - 3.1669;
  return Math.max(0, Math.min(100, raw));
}

/**
 * Calcula a precisão independente de um lado (Brancas ou Pretas).
 * Combina média ponderada por criticidade + média harmônica suavizada para que
 * sequências de erros graves realmente derrubem a precisão (sem inflar para ~88%).
 * O resultado da partida NUNCA altera esta métrica.
 */
export function computeSideAccuracy(sideMoves = []) {
  if (!sideMoves.length) return 0;

  let weightedSum = 0;
  let weightTotal = 0;
  let harmDenom = 0;

  for (const m of sideMoves) {
    const acc = Math.max(0, Math.min(100, Number(m.moveAccuracy) || 0));
    // Lances críticos (grandes perdas ou posições tensas) recebem peso ligeiramente maior
    const weight = m.forced ? 0.5 : (m.adjustedLoss >= 18 ? 1.45 : m.adjustedLoss >= 10 ? 1.2 : 1.0);
    weightedSum += acc * weight;
    weightTotal += weight;
    harmDenom += weight / (acc + 8);
  }

  const weightedMean = weightTotal > 0 ? weightedSum / weightTotal : 0;
  const smoothHarmonic = harmDenom > 0 ? Math.max(0, (weightTotal / harmDenom) - 8) : 0;

  // 60% média ponderada + 40% harmônica suavizada (sensível a sequências de erros graves)
  const combined = weightedMean * 0.6 + smoothHarmonic * 0.4;
  return Math.round(Math.max(0, Math.min(100, combined)));
}

function materialForSide(pieces, side) {
  let total = 0;
  for (const p of pieces || []) {
    if (p.o === side && p.t !== 'K') total += VAL[p.t] || 0;
  }
  return total;
}

function buildMoveExplanation({
  classification,
  lossInfo,
  bestBeforeSan,
  pvBeforeSan,
  evalBeforeText,
  evalAfterText,
  playedSan,
}) {
  const pvLine = pvBeforeSan.length > 1 ? pvBeforeSan.slice(0, 5).join(' ') : '';
  if (lossInfo.forced) {
    return 'Único lance legal disponível nesta posição.';
  }
  if (classification === 'book') {
    return 'Lance teórico padrão de abertura.';
  }
  if (lossInfo.allowedMate) {
    const mateSteps = lossInfo.after.mate ? Math.abs(lossInfo.after.mate) : null;
    const mateLabel = mateSteps ? `mate forçado em ${mateSteps}` : 'xeque-mate imediato';
    return bestBeforeSan
      ? `Permite ${mateLabel} (${evalBeforeText} -> ${evalAfterText}). A defesa recomendada era ${bestBeforeSan}${pvLine ? ` (${pvLine})` : ''}.`
      : `Permite ${mateLabel} (${evalBeforeText} -> ${evalAfterText}).`;
  }
  if (lossInfo.missedMate) {
    return bestBeforeSan
      ? `Deixa escapar sequência de mate forçado (${evalBeforeText} -> ${evalAfterText}). A continuação vencedora era ${bestBeforeSan}${pvLine ? ` (${pvLine})` : ''}.`
      : `Deixa escapar sequência de mate forçado (${evalBeforeText} -> ${evalAfterText}).`;
  }
  if (classification === 'brilliant') {
    return `Sacrifício tático preciso (${playedSan}) que mantém ou amplia a iniciativa (${evalBeforeText} -> ${evalAfterText}).`;
  }
  if (classification === 'great') {
    return `Única continuação forte na posição (${playedSan}), superando claramente as demais alternativas.`;
  }
  if (classification === 'best') {
    return `Corresponde à melhor continuação encontrada pelo motor (${evalAfterText}).`;
  }
  if (classification === 'excellent') {
    return `Muito próximo da melhor opção do motor (${evalBeforeText} -> ${evalAfterText}).`;
  }
  if (classification === 'good') {
    return bestBeforeSan
      ? `Mantém a estrutura da posição (${evalBeforeText} -> ${evalAfterText}); ${bestBeforeSan} era ligeiramente mais preciso.`
      : `Mantém a posição sob controle (${evalBeforeText} -> ${evalAfterText}).`;
  }
  if (classification === 'miss') {
    return bestBeforeSan
      ? `Desperdiça oportunidade clara (${evalBeforeText} -> ${evalAfterText}). A linha mais forte era ${bestBeforeSan}${pvLine ? ` (${pvLine})` : ''}.`
      : `Desperdiça oportunidade clara (${evalBeforeText} -> ${evalAfterText}).`;
  }
  if (classification === 'inaccuracy') {
    return bestBeforeSan
      ? `Piora perceptível (${evalBeforeText} -> ${evalAfterText}). Melhor alternativa: ${bestBeforeSan}${pvLine ? ` (${pvLine})` : ''}.`
      : `Piora perceptível na avaliação (${evalBeforeText} -> ${evalAfterText}).`;
  }
  if (classification === 'mistake') {
    return bestBeforeSan
      ? `Perda relevante de avaliação (${evalBeforeText} -> ${evalAfterText}). O motor recomenda ${bestBeforeSan}${pvLine ? ` (${pvLine})` : ''}.`
      : `Perda relevante de avaliação (${evalBeforeText} -> ${evalAfterText}).`;
  }
  return bestBeforeSan
    ? `Erro grave (${evalBeforeText} -> ${evalAfterText}) que compromete a posição. Melhor continuação: ${bestBeforeSan}${pvLine ? ` (${pvLine})` : ''}.`
    : `Erro grave (${evalBeforeText} -> ${evalAfterText}) que compromete a posição.`;
}

export function buildFullAnalysisReport(
  snapshots,
  rawEvals,
  engineName = 'Stockfish 19 (WASM NNUE)',
  mode = 'complete',
  meta = {}
) {
  const uciMoves = snapshots.slice(1).map((s) => s.move?.uci).filter(Boolean);
  let totalNodes = 0;
  let depthSum = 0;
  let depthCount = 0;

  const evaluations = rawEvals.map((ev, idx) => {
    if (Number.isFinite(ev?.nodes)) totalNodes += ev.nodes;
    if (Number.isFinite(ev?.depth) && ev.depth > 0) {
      depthSum += ev.depth;
      depthCount++;
    }

    if (idx === 0) {
      const pvBeforeSan = uciPvToSanList([], ev.pv || [], 6);
      return {
        ...ev,
        classification: null,
        epLoss: 0,
        cpLoss: 0,
        effectiveLoss: 0,
        adjustedLoss: 0,
        moveAccuracy: 100,
        bestBefore: ev.bestMove,
        bestBeforeSan: pvBeforeSan[0] || ev.bestMove || null,
        pvBefore: ev.pv || [],
        pvBeforeSan,
        evalBeforeText: formatWhiteEvalText(ev),
        evalAfterText: formatWhiteEvalText(ev),
        explanation: 'Posição inicial da partida.',
      };
    }

    const prev = rawEvals[idx - 1];
    const snapBefore = snapshots[idx - 1];
    const snapAfter = snapshots[idx];
    const move = snapAfter?.move;
    const moverSide = move?.side ?? (idx - 1) % 2;
    const legalMoveCount = snapBefore?.legalMoveCount ?? 2;

    const isEngineBest = Boolean(
      (prev.bestMove && move?.uci && prev.bestMove === move.uci) ||
      ev.terminalWinner === moverSide
    );

    const lossInfo = computeMoveLoss(prev, ev, moverSide, {
      isEngineBest,
      legalMoveCount,
    });

    // Sacrifício real (para critério rigoroso de "Brilhante")
    const matBefore = materialForSide(snapBefore?.pieces, moverSide);
    const matAfter = materialForSide(snapAfter?.pieces, moverSide);
    const oppMatBefore = materialForSide(snapBefore?.pieces, 1 - moverSide);
    const oppMatAfter = materialForSide(snapAfter?.pieces, 1 - moverSide);
    const nextMove = snapshots[idx + 1]?.move;
    const sacrificedPiece = Boolean(
      nextMove &&
      nextMove.captured &&
      (VAL[nextMove.captured] || 0) >= 3 &&
      (VAL[nextMove.captured] || 0) > (VAL[move?.captured] || 0) &&
      nextMove.toX === move?.toX &&
      nextMove.toY === move?.toY
    );
    const immediateSac = (matAfter - matBefore) < (oppMatAfter - oppMatBefore);

    // Margem sobre a 2ª melhor alternativa (MultiPV 2)
    let gapOverSecond = 0;
    if (prev.secondBest) {
      const epSecondWhite = evalToExpectedPoints(prev.secondBest);
      const epSecondMover = moverSide === 0 ? epSecondWhite : 100 - epSecondWhite;
      gapOverSecond = Math.max(0, lossInfo.before.expectedPoints - epSecondMover);
    }

    const epBeforeMover = lossInfo.before.expectedPoints;
    const epAfterMover = lossInfo.after.expectedPoints;
    const adjLoss = lossInfo.adjustedLoss;
    const cpLoss = lossInfo.cpLoss;

    let classification;
    if (isBookMove(uciMoves, idx) && adjLoss <= 3.5) {
      classification = 'book';
    } else if (lossInfo.forced) {
      classification = 'best';
    } else if (lossInfo.allowedMate) {
      classification = 'blunder';
    } else if (lossInfo.missedMate && epAfterMover < 88) {
      classification = epAfterMover < 50 ? 'blunder' : 'miss';
    } else if (
      (isEngineBest || adjLoss <= 0.5) &&
      (sacrificedPiece || immediateSac) &&
      gapOverSecond >= 10 &&
      epAfterMover >= 45 &&
      idx >= 6
    ) {
      classification = 'brilliant';
    } else if (isEngineBest && gapOverSecond >= 14 && epAfterMover >= 40 && idx >= 4) {
      classification = 'great';
    } else if (isEngineBest || (adjLoss <= 1.0 && cpLoss <= 15)) {
      classification = 'best';
    } else if (adjLoss <= 2.5 && cpLoss <= 45) {
      classification = 'excellent';
    } else if (adjLoss <= 5.5 && cpLoss <= 95) {
      classification = 'good';
    } else if (epBeforeMover >= 72 && lossInfo.wpLoss >= 15 && epAfterMover >= 35) {
      classification = 'miss';
    } else if (adjLoss <= 11.0) {
      classification = 'inaccuracy';
    } else if (adjLoss <= 20.0) {
      classification = 'mistake';
    } else {
      classification = 'blunder';
    }

    const moveAccuracy =
      classification === 'book' ||
      classification === 'brilliant' ||
      classification === 'great' ||
      classification === 'best'
        ? 100
        : moveLossToAccuracy(adjLoss);

    const pvBeforeUci = prev.pv || (prev.bestMove ? [prev.bestMove] : []);
    const pvBeforeSan = uciPvToSanList(snapBefore?.uciHistory || uciMoves.slice(0, idx - 1), pvBeforeUci, 6);
    const bestBeforeSan = pvBeforeSan[0] || prev.bestMove || null;
    const evalBeforeText = formatWhiteEvalText(prev);
    const evalAfterText = formatWhiteEvalText(ev);

    const explanation = buildMoveExplanation({
      classification,
      lossInfo,
      bestBeforeSan,
      pvBeforeSan,
      evalBeforeText,
      evalAfterText,
      playedSan: move?.san || move?.uci || '',
    });

    return {
      ...ev,
      classification,
      forced: lossInfo.forced,
      epLoss: Number(lossInfo.wpLoss.toFixed(1)),
      cpLoss: Math.round(cpLoss),
      effectiveLoss: Number(adjLoss.toFixed(1)),
      adjustedLoss: Number(adjLoss.toFixed(1)),
      moveAccuracy: Number(moveAccuracy.toFixed(1)),
      bestBefore: prev.bestMove,
      bestBeforeSan,
      pvBefore: pvBeforeUci,
      pvBeforeSan,
      evalBeforeText,
      evalAfterText,
      evalBeforeWhite: prev.scoreCp,
      mateBeforeWhite: prev.mate,
      explanation,
      moverSide,
    };
  });

  const calcSideStats = (side) => {
    const counts = Object.fromEntries(MOVE_CLASSIFICATIONS.map((c) => [c.id, 0]));
    const sideMoves = evaluations.filter((e) => e.ply > 0 && e.moverSide === side);
    if (!sideMoves.length) {
      return { accuracy: null, totalMoves: 0, counts };
    }
    for (const m of sideMoves) {
      counts[m.classification] = (counts[m.classification] || 0) + 1;
    }
    return {
      accuracy: computeSideAccuracy(sideMoves),
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
      return (prio[b.classification] || 0) - (prio[a.classification] || 0) || b.adjustedLoss - a.adjustedLoss;
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
      bestBeforeSan: e.bestBeforeSan,
      evalBeforeText: e.evalBeforeText,
      evalAfterText: e.evalAfterText,
    }));

  return {
    schemaVersion: ANALYSIS_SCHEMA_VERSION,
    evaluations,
    whiteStats: calcSideStats(0),
    blackStats: calcSideStats(1),
    decisiveMoments,
    engineName,
    engineVersion: meta.engineVersion || 'Stockfish 19.0.1 WASM (GPL-3.0)',
    averageDepth: depthCount ? Number((depthSum / depthCount).toFixed(1)) : 0,
    totalNodes,
    analysisMode: mode,
    methodologyNote: 'Estimativa de precisão CrownFlux.io baseada em perda de probabilidade de vitória (WDL/NNUE) e guarda de material/mate.',
    analyzedAt: new Date().toISOString(),
  };
}
