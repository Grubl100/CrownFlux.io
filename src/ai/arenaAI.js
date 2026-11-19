import { VAL } from '../utils/constants.js';
import { cheb } from '../utils/format.js';
import { ARENA_AI_PROFILES, clampDifficulty } from './aiConfig.js';

function countAttackingFactions(attMask, myMask) {
  let enemyMask = attMask & ~myMask;
  let count = 0;
  while (enemyMask) {
    count += enemyMask & 1;
    enemyMask >>= 1;
  }
  return count;
}

function getArenaHistory(S, teamId) {
  S._arenaAiHist ||= {};
  S._arenaAiHist[teamId] ||= [];
  return S._arenaAiHist[teamId];
}

function recordArenaMove(S, teamId, pieceId, x0, y0, x1, y1) {
  const hist = getArenaHistory(S, teamId);
  hist.unshift({ pieceId, x0, y0, x1, y1 });
  if (hist.length > 6) hist.length = 6;
}

function arenaRepetitionPenalty(S, teamId, p, a, b) {
  const hist = getArenaHistory(S, teamId);
  let pen = 0;
  for (let idx = 0; idx < hist.length; idx++) {
    const h = hist[idx];
    if (h.pieceId !== p.id) continue;
    if (h.x0 === a && h.y0 === b && h.x1 === p.x && h.y1 === p.y) pen += idx === 0 ? 16 : 9;
    if (h.x1 === a && h.y1 === b) pen += 5;
  }
  return pen;
}

// IA dedicada para Arena de 4 Jogadores (Free-For-All)
// Considera simultaneamente os 3 adversários, risco de fogo cruzado e conversão de exércitos.
export function runArenaAI(S, teamId, difficulty, api) {
  const level = clampDifficulty(difficulty);
  const profile = ARENA_AI_PROFILES[level] || ARENA_AI_PROFILES[3];
  const readyPieces = S.pieces.filter((p) => p.o === teamId && p.ready <= S.T);
  if (!readyPieces.length) return false;

  const meMask = 1 << teamId;
  const myKing = S.pieces.find((p) => p.o === teamId && p.t === 'K');

  // Mapeia força e posição de cada facção rival viva
  const factionStats = new Map();
  for (let tid = 0; tid < 4; tid++) {
    if (tid === teamId || !S.f[tid]?.alive) continue;
    const pieces = S.pieces.filter((p) => p.o === tid);
    const king = pieces.find((p) => p.t === 'K');
    const armyVal = pieces.reduce((acc, p) => acc + (VAL[p.t] || 1), 0);
    const kingExposed = king ? countAttackingFactions(S.att[king.y]?.[king.x] || 0, 1 << tid) : 0;
    factionStats.set(tid, { tid, pieces, king, armyVal, kingExposed });
  }

  // Uso inteligente de Surto (única habilidade da Arena 4P)
  const f = S.f[teamId];
  if (f && f.energy >= 100 && Math.random() <= profile.surgeUse) {
    const cooling = S.pieces.filter((p) => p.o === teamId && p.ready > S.T + 0.3).length;
    const myKingDanger = myKing && countAttackingFactions(S.att[myKing.y]?.[myKing.x] || 0, meMask) > 0;
    const nearAnyEnemyKing = [...factionStats.values()].some(
      (fs) => fs.king && S.pieces.some((p) => p.o === teamId && cheb(p.x, p.y, fs.king.x, fs.king.y) <= 4)
    );
    if (cooling >= 2 || myKingDanger || nearAnyEnemyKing) {
      api.activateDuelSkill(S, teamId, 'surge', null);
    }
  }

  const myArmySize = S.pieces.filter((p) => p.o === teamId).length;
  const myKingAttackers = myKing ? countAttackingFactions(S.att[myKing.y]?.[myKing.x] || 0, meMask) : 0;

  let bestMove = null;
  let bestScore = -1e9;

  for (const p of readyPieces) {
    const moves = api.getDuelMoves(S, p);
    if (!moves.length) continue;

    const pv = (VAL[p.t] || 1) * (p.t === 'K' ? 3.5 + myArmySize * 0.2 : 1);
    const currAttackers = countAttackingFactions(S.att[p.y]?.[p.x] || 0, meMask);

    // Escolhe alvo mais oportuno considerando todos os 3 rivais e peças neutras
    let bestTarget = null;
    let bestTargetMetric = 1e9;
    for (const e of S.pieces) {
      if (e.o === teamId) continue;
      let bias = e.o < 0 ? 0.6 : -1.0;
      if (e.t === 'K' && e.o >= 0) {
        const fs = factionStats.get(e.o);
        // Prioriza Reis inimigos com exércitos grandes (conversão massiva) ou já pressionados
        bias -= 2.5 + Math.min(4, (fs?.armyVal || 0) * 0.08) + (fs?.kingExposed || 0) * 1.1;
      }
      const metric = cheb(p.x, p.y, e.x, e.y) + bias;
      if (metric < bestTargetMetric) {
        bestTargetMetric = metric;
        bestTarget = e;
      }
    }
    const origDist = bestTarget ? cheb(p.x, p.y, bestTarget.x, bestTarget.y) : 0;

    for (const [a, b] of moves) {
      const target = S.grid[b][a];
      let score = (Math.random() - 0.5) * profile.noise;

      // 1. Capturas e Conversão de Exército na Arena 4P
      if (target) {
        if (target.t === 'K' && target.o >= 0) {
          const fs = factionStats.get(target.o);
          const convertBonus = (fs?.armyVal || 10) * 8 * profile.convertWeight;
          score += 420 + convertBonus;
        } else if (target.o >= 0) {
          score += (VAL[target.t] + 0.5) * 11.5;
        } else {
          // Crescimento rápido por peças neutras (muito importante no início de 4P)
          score += (VAL[target.t] + 0.5) * 9.2;
        }
      }

      // 2. Fragmentos Flux
      if (S.orbs.some((o) => o.x === a && o.y === b)) {
        score += 17;
      }

      // 3. Risco multi-direcional (fogo cruzado de 2 ou 3 facções!)
      const destAttackers = countAttackingFactions(S.att[b]?.[a] || 0, meMask);
      const destDefended = (S.att[b]?.[a] & meMask) !== 0;
      if (destAttackers > 0) {
        const crossfireMult = destAttackers >= 2 ? 1.85 : 1.0;
        const tradeGain = target ? VAL[target.t] || 0 : 0;
        const exposure = Math.max(0.5, pv - tradeGain * 0.7);
        score -= exposure * (destDefended ? 4.5 : 8.2) * crossfireMult * profile.multiThreatWeight;
        if (p.t === 'K') score -= 95 * destAttackers * profile.multiThreatWeight;
      } else if (destDefended && level >= 3) {
        score += 2.0;
      }

      // Fuga de posição ameaçada por 1 ou mais facções
      if (currAttackers > 0 && destAttackers === 0) {
        score += pv * (4.5 + currAttackers * 2.2) * profile.multiThreatWeight;
      }

      // 4. Proteção do próprio Rei sob pinça de múltiplos adversários
      if (myKing && myKingAttackers > 0 && p.t !== 'K') {
        const dKing = cheb(a, b, myKing.x, myKing.y);
        if (dKing <= 2) score += 10 * myKingAttackers * profile.multiThreatWeight;
      }

      // 5. Posicionamento seguro: evita mergulhar no centro (6..9, 6..9) se houver 3 rivais vivos e peça cara
      if (factionStats.size >= 3 && (p.t === 'K' || p.t === 'Q') && a >= 6 && a <= 9 && b >= 6 && b <= 9 && destAttackers > 0) {
        score -= 14 * profile.multiThreatWeight;
      }

      // 6. Proximidade ao alvo oportuno
      if (bestTarget) {
        score += (origDist - cheb(a, b, bestTarget.x, bestTarget.y)) * (p.t === 'P' ? 2.0 : 1.3);
      }

      // 7. Anti-repetição
      score -= arenaRepetitionPenalty(S, teamId, p, a, b);

      // 8. Lookahead (níveis 3-5): verifica se criamos ameaça a Reis rivais ou caímos em armadilha imediata
      if (profile.lookahead >= 1) {
        const origX = p.x;
        const origY = p.y;
        S.grid[origY][origX] = null;
        S.grid[b][a] = p;
        p.x = a;
        p.y = b;

        for (const [nx, ny] of api.getDuelMoves(S, p, true)) {
          const threatened = S.grid[ny]?.[nx];
          if (threatened && threatened.o >= 0 && threatened.o !== teamId) {
            score += threatened.t === 'K' ? 22 * profile.convertWeight : (VAL[threatened.t] || 1) * 1.5;
          }
        }

        if (profile.lookahead >= 2) {
          const immediateCounter = S.pieces.some(
            (ep) =>
              ep.o >= 0 &&
              ep.o !== teamId &&
              ep !== target &&
              ep.ready <= S.T + 0.3 &&
              api.getDuelMoves(S, ep, true).some(([ex, ey]) => ex === a && ey === b)
          );
          if (immediateCounter) {
            const gain = target ? VAL[target.t] || 0 : 0;
            if (pv > gain) score -= (pv - gain) * 10;
          }
        }

        p.x = origX;
        p.y = origY;
        S.grid[origY][origX] = p;
        S.grid[b][a] = target;
      }

      if (score > bestScore) {
        bestScore = score;
        bestMove = [p, a, b];
      }
    }
  }

  if (bestMove && bestScore > -45) {
    const [piece, a, b] = bestMove;
    const x0 = piece.x;
    const y0 = piece.y;
    const moved = api.doDuelMove(S, piece, a, b);
    if (moved) recordArenaMove(S, teamId, piece.id, x0, y0, a, b);
    return moved;
  }
  return false;
}
