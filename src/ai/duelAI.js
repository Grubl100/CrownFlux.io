import { VAL } from '../utils/constants.js';
import { cheb, rand } from '../utils/format.js';
import { DUEL_AI_PROFILES, clampDifficulty } from './aiConfig.js';

function getRecentMoves(S, teamId) {
  S._aiRecentMoves ||= {};
  S._aiRecentMoves[teamId] ||= [];
  return S._aiRecentMoves[teamId];
}

function recordAiMove(S, teamId, pieceId, x0, y0, x1, y1) {
  const hist = getRecentMoves(S, teamId);
  hist.unshift({ pieceId, x0, y0, x1, y1, t: S.T });
  if (hist.length > 8) hist.length = 8;
}

function repetitionPenalty(S, teamId, p, a, b) {
  const hist = getRecentMoves(S, teamId);
  let pen = 0;
  for (let idx = 0; idx < hist.length; idx++) {
    const h = hist[idx];
    if (h.pieceId !== p.id) continue;
    // Penaliza vai-e-volta imediato (A -> B -> A)
    if (h.x0 === a && h.y0 === b && h.x1 === p.x && h.y1 === p.y) {
      pen += idx === 0 ? 18 : 10;
    }
    // Penaliza repetir exatamente o mesmo destino recentemente
    if (h.x1 === a && h.y1 === b) {
      pen += 6;
    }
  }
  return pen;
}

function chooseStance(S, teamId, enemyId, myKing, enemyKing, crownHolder, meMask) {
  const myKingAttacked = myKing && (S.att[myKing.y]?.[myKing.x] & ~meMask) !== 0;
  if (myKingAttacked && myKing.shield === 0) return 'defensive';

  const myCrown = S.f[teamId]?.crownProgress || 0;
  const enemyCrown = S.f[enemyId]?.crownProgress || 0;

  if (crownHolder && crownHolder.o === enemyId) return 'offensive';
  if (enemyCrown >= 55) return 'offensive';
  if (crownHolder && crownHolder.o === teamId) {
    return myCrown >= 65 ? 'defensive' : 'control';
  }
  if (S.crown?.state === 'free') return 'control';
  return 'mobility';
}

function maybeUseDuelSkills(S, teamId, enemyId, level, profile, myKing, enemyKing, crownHolder, meMask, api) {
  const f = S.f[teamId];
  if (!f || profile.skillUse <= 0) return;

  // 1. Égide Real (60% Energia): proteção proativa do portador da Coroa ou do Rei sob ameaça
  if (S.is1v1Rules && level >= 3 && f.energy >= 60 && S.T >= (f.aegisCooldownUntil || 0)) {
    const carrierDanger =
      crownHolder &&
      crownHolder.o === teamId &&
      crownHolder.shield === 0 &&
      (S.att[crownHolder.y]?.[crownHolder.x] & ~meMask) !== 0;
    const kingDanger =
      myKing &&
      myKing.shield === 0 &&
      (S.att[myKing.y]?.[myKing.x] & ~meMask) !== 0;

    if (carrierDanger || kingDanger) {
      if (Math.random() <= profile.skillUse) {
        api.activateDuelSkill(S, teamId, 'aegis', carrierDanger ? crownHolder : myKing);
        return;
      }
    }
  }

  // 2. Investida Real (45% Energia): nos níveis 4-5, libera peça forte em recarga se houver alvo de alto valor
  if (S.is1v1Rules && level >= 4 && f.energy >= 45) {
    const reserveEnergy = f.energy >= 85 || (level === 5 && f.energy >= 55);
    if (reserveEnergy) {
      const coolingHeavies = S.pieces
        .filter((p) => p.o === teamId && (p.t === 'Q' || p.t === 'R' || p.t === 'N' || p.t === 'B') && p.ready - S.T > 0.65)
        .sort((a, b) => (VAL[b.t] || 1) - (VAL[a.t] || 1));

      for (const heavy of coolingHeavies) {
        const moves = api.getDuelMoves(S, heavy);
        const canStrikeHighValue = moves.some(([mx, my]) => {
          const target = S.grid[my]?.[mx];
          if (target && target.o === enemyId && (target.t === 'K' || target.t === 'Q' || (crownHolder && target.id === crownHolder.id))) {
            return true;
          }
          if (S.crown?.state === 'free' && S.crown.x === mx && S.crown.y === my) return true;
          return false;
        });
        if (canStrikeHighValue) {
          api.activateDuelSkill(S, teamId, 'charge', heavy);
          return;
        }
      }
    }
  }

  // 3. Surto Imperial (100% Energia): ativa quando acelera o exército em momento decisivo
  if (f.energy >= 100) {
    const coolingCount = S.pieces.filter((p) => p.o === teamId && p.ready > S.T + 0.25).length;
    const nearEnemyKing = enemyKing && S.pieces.some((p) => p.o === teamId && cheb(p.x, p.y, enemyKing.x, enemyKing.y) <= 4);
    const crownRace = (S.f[enemyId]?.crownProgress || 0) >= 50 || S.crown?.state === 'free';
    if (coolingCount >= 2 || nearEnemyKing || crownRace || (level === 2 && Math.random() < 0.35)) {
      if (Math.random() <= profile.skillUse) {
        api.activateDuelSkill(S, teamId, 'surge', null);
      }
    }
  }
}

export function runDuelAI(S, teamId, difficulty, api) {
  const level = clampDifficulty(difficulty);
  const profile = DUEL_AI_PROFILES[level] || DUEL_AI_PROFILES[3];
  let readyPieces = S.pieces.filter((p) => p.o === teamId && p.ready <= S.T);
  if (!readyPieces.length) return false;

  const enemyId = 1 - teamId;
  const meMask = 1 << teamId;
  const myKing = S.pieces.find((p) => p.o === teamId && p.t === 'K');
  const enemyKing = S.pieces.find((p) => p.o === enemyId && p.t === 'K');
  const crownHolder = S.crown?.state === 'held' ? S.pieces.find((p) => p.id === S.crown.holderId) : null;

  // Gerenciamento de energia e habilidades
  maybeUseDuelSkills(S, teamId, enemyId, level, profile, myKing, enemyKing, crownHolder, meMask, api);

  // Recarrega lista caso Investida Real tenha liberado uma peça
  readyPieces = S.pieces.filter((p) => p.o === teamId && p.ready <= S.T);
  if (!readyPieces.length) return false;

  const stance = chooseStance(S, teamId, enemyId, myKing, enemyKing, crownHolder, meMask);
  const enemies = S.pieces.filter((p) => p.o !== teamId);
  const dropLocked = S.crown && S.crown.dropCooldownOwner === teamId && S.T < S.crown.dropCooldownUntil;

  // Nos níveis 1-2, considera um subconjunto coerente para simular menor percepção global (sem lances ilegais)
  let activePieces = readyPieces;
  if (profile.candidateRatio < 1 && readyPieces.length > 2) {
    const subset = readyPieces.filter(() => Math.random() < profile.candidateRatio);
    activePieces = subset.length ? subset : [readyPieces[rand(readyPieces.length)]];
  }

  let bestMove = null;
  let bestScore = -1e9;

  for (const p of activePieces) {
    const moves = api.getDuelMoves(S, p);
    if (!moves.length) continue;

    const isMyCarrier = Boolean(crownHolder && crownHolder.id === p.id);
    const pv = (VAL[p.t] || 1) * (p.t === 'K' ? 3.2 : isMyCarrier ? 2.6 : 1);
    const currentlyAttacked = (S.att[p.y]?.[p.x] & ~meMask) !== 0;

    // Alvo principal da peça
    let primaryTarget = null;
    let bestTargetDist = 1e9;
    for (const e of enemies) {
      const isEnemyCarrier = crownHolder && crownHolder.id === e.id;
      let priorityBias = e.o === enemyId ? -1.4 : 0.4;
      if (e.t === 'K') priorityBias -= stance === 'offensive' ? 4.2 : 2.5;
      if (isEnemyCarrier) priorityBias -= 4.8;
      const dist = cheb(p.x, p.y, e.x, e.y) + priorityBias;
      if (dist < bestTargetDist) {
        bestTargetDist = dist;
        primaryTarget = e;
      }
    }
    const origDist = primaryTarget ? cheb(p.x, p.y, primaryTarget.x, primaryTarget.y) : 0;

    for (const [a, b] of moves) {
      const target = S.grid[b][a];
      let score = (Math.random() - 0.5) * profile.noise;

      // 1. Capturas (Rei, Portador da Coroa, peças inimigas, neutras)
      if (target) {
        if (target.t === 'K' && target.o === enemyId) {
          score += target.shield > 0 ? 110 : 650;
        } else if (crownHolder && target.id === crownHolder.id) {
          score += target.shield > 0 ? 75 : 240 * profile.crownWeight;
        } else {
          const baseCap = (VAL[target.t] + 0.6) * (target.o === enemyId ? 12 : 8.2);
          score += target.shield > 0 ? baseCap * 0.42 : baseCap;
        }
      }

      // 2. Disputa pela Coroa Imperial (centro da estratégia no 1v1)
      if (S.crown) {
        if (S.crown.state === 'free' && !dropLocked && p.t !== 'K') {
          if (a === S.crown.x && b === S.crown.y) {
            // Reconhece que pegar a Coroa sob ataque pesado pode ser arriscado nos níveis altos
            const crownSquareAttacked = (S.att[b]?.[a] & ~meMask) !== 0;
            const safeBonus = crownSquareAttacked && level >= 4 && p.shield === 0 ? 52 : 108;
            score += safeBonus * profile.crownWeight;
          } else {
            const deltaCrown = cheb(p.x, p.y, S.crown.x, S.crown.y) - cheb(a, b, S.crown.x, S.crown.y);
            score += deltaCrown * 4.8 * profile.crownWeight;
          }
        } else if (S.crown.state === 'sealed' && p.t !== 'K') {
          const deltaCenter = cheb(p.x, p.y, 7.5, 7.5) - cheb(a, b, 7.5, 7.5);
          score += deltaCenter * 2.2 * profile.crownWeight;
        } else if (isMyCarrier) {
          // Portador aliado: busca o Trono Central (3.5%/s) se seguro, evita base própria (0.6%/s)
          const inThrone = a >= 7 && a <= 8 && b >= 7 && b <= 8;
          const nearThrone = a >= 6 && a <= 9 && b >= 6 && b <= 9;
          const inBase = (teamId === 0 && b >= 13) || (teamId === 1 && b <= 2);
          if (inThrone) score += 16 * profile.crownWeight;
          else if (nearThrone) score += 8.5 * profile.crownWeight;
          if (inBase) score -= 22 * profile.crownWeight;
        } else if (crownHolder && crownHolder.o === teamId && p.t !== 'K' && level >= 3) {
          // Escolta do portador aliado
          const dCarrier = cheb(a, b, crownHolder.x, crownHolder.y);
          if (dCarrier <= 2) score += 5.5 * profile.crownWeight;
        }
      }

      // 3. Regiões Estratégicas (Santuário, Trono, Fortaleza)
      if (S.zones?.length && p.t !== 'K') {
        for (const z of S.zones) {
          if (a >= z.x0 && a <= z.x1 && b >= z.y0 && b <= z.y1 && z.owner !== teamId) {
            const zBonus = z.id === 'throne' ? 8 : z.id === 'fortress' ? 7 : 6.2;
            score += zBonus * profile.zoneWeight;
          }
        }
      }

      // 4. Fragmentos Flux (administração de energia)
      if (S.orbs.some((o) => o.x === a && o.y === b)) {
        const energyNeed = (S.f[teamId]?.energy || 0) < 60 ? 1.25 : 0.85;
        score += 17 * energyNeed;
      }

      // 5. Avaliação de risco e segurança do Rei
      const destAttacked = (S.att[b]?.[a] & ~meMask) !== 0;
      const destDefended = (S.att[b]?.[a] & meMask) !== 0;
      if (destAttacked) {
        const tradeValue = target ? VAL[target.t] || 0 : 0;
        const netRisk = Math.max(0.5, pv - tradeValue * 0.75);
        score -= netRisk * (destDefended ? 4.8 : 8.4) * profile.threatWeight;
        if (isMyCarrier && p.shield === 0) score -= 54 * profile.threatWeight;
        if (p.t === 'K') score -= 75 * profile.threatWeight;
      } else if (destDefended && level >= 3) {
        score += 2.1;
      }

      if (currentlyAttacked && !destAttacked) {
        score += pv * 5.2 * profile.threatWeight;
      }

      // 6. Adaptação à postura (Ofensiva / Defensiva / Controle / Mobilidade)
      if (primaryTarget) {
        const approach = origDist - cheb(a, b, primaryTarget.x, primaryTarget.y);
        const stanceMult = stance === 'offensive' ? 1.55 : stance === 'mobility' ? 1.25 : 0.9;
        score += approach * (p.t === 'P' ? 2.1 : 1.35) * stanceMult;
      }

      if (stance === 'defensive' && myKing && p.t !== 'K') {
        const dKing = cheb(a, b, myKing.x, myKing.y);
        if (dKing <= 2) score += 11 * profile.threatWeight;
      }
      if (stance === 'offensive' && enemyKing && level >= 3) {
        score += Math.max(0, 7 - cheb(a, b, enemyKing.x, enemyKing.y)) * (p.t === 'Q' || p.t === 'R' || p.t === 'N' ? 1.6 : 0.7);
      }

      // 7. Promoção de Peão
      if (p.t === 'P') {
        const promoRow = teamId === 0 ? 0 : S.N - 1;
        if (b === promoRow) score += 45;
      }

      // 8. Anti-repetição (evita oscilações sem sentido)
      score -= repetitionPenalty(S, teamId, p, a, b);

      // 9. Antecipação / Lookahead tático (níveis 3-5)
      if (profile.lookahead >= 1) {
        const origX = p.x;
        const origY = p.y;
        S.grid[origY][origX] = null;
        S.grid[b][a] = p;
        p.x = a;
        p.y = b;

        // Ameaças criadas após nosso lance (garfos, ataque ao Rei ou ao portador da Coroa)
        let threatsCreated = 0;
        for (const [nx, ny] of api.getDuelMoves(S, p, true)) {
          const threatened = S.grid[ny]?.[nx];
          if (threatened && threatened.o === enemyId) {
            if (threatened.t === 'K') threatsCreated += 24;
            else if (crownHolder && threatened.id === crownHolder.id) threatsCreated += 18;
            else threatsCreated += (VAL[threatened.t] || 1) * 2.0;
          }
        }
        score += threatsCreated * (profile.lookahead >= 2 ? 1.1 : 0.65);

        // Nível 4-5: verifica contra-ataque imediato do adversário (peças prontas ou quase prontas)
        if (profile.lookahead >= 2) {
          let worstCounter = 0;
          for (const ep of S.pieces) {
            if (ep.o !== enemyId || ep === target) continue;
            if (ep.ready > S.T + 0.35) continue;
            const eMoves = api.getDuelMoves(S, ep, true);
            for (const [ex, ey] of eMoves) {
              if (ex === a && ey === b) {
                const gainVal = target ? VAL[target.t] || 0 : 0;
                const loss = Math.max(0, pv - gainVal);
                if (loss > worstCounter) worstCounter = loss;
              } else if (myKing && ex === myKing.x && ey === myKing.y && myKing.shield === 0) {
                worstCounter = Math.max(worstCounter, 18);
              }
            }
          }
          score -= worstCounter * (level === 5 ? 11.5 : 7.5);
        }

        // Restaura tabuleiro exatamente como estava
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

  if (bestMove && bestScore > -42) {
    const [piece, a, b] = bestMove;
    const x0 = piece.x;
    const y0 = piece.y;
    const moved = api.doDuelMove(S, piece, a, b);
    if (moved) recordAiMove(S, teamId, piece.id, x0, y0, a, b);
    return moved;
  }
  return false;
}
