// IA dedicada para o modo Cerco Tático (Cartas & Turnos 12x12)
// Respeita estritamente Névoa de Guerra, custos de PA, proteção da Coroa e todas as regras oficiais.

const TACTICAL_AI_PROFILES = {
  1: { noise: 18, cardUseBias: 0.45, draftSmartness: 0.15, planWall: false, useOvercharge: false, evadeWhenHolding: 0.25, thinkDelay: [1100, 1750] },
  2: { noise: 9.5, cardUseBias: 0.72, draftSmartness: 0.45, planWall: false, useOvercharge: false, evadeWhenHolding: 0.55, thinkDelay: [900, 1450] },
  3: { noise: 4.0, cardUseBias: 0.95, draftSmartness: 0.75, planWall: true, useOvercharge: true, evadeWhenHolding: 0.85, thinkDelay: [750, 1200] },
  4: { noise: 1.4, cardUseBias: 1.15, draftSmartness: 0.92, planWall: true, useOvercharge: true, evadeWhenHolding: 1.15, thinkDelay: [600, 980] },
  5: { noise: 0.25, cardUseBias: 1.35, draftSmartness: 1.0, planWall: true, useOvercharge: true, evadeWhenHolding: 1.4, thinkDelay: [480, 820] },
};

export function clampTacticalDifficulty(level) {
  const n = Math.round(Number(level) || 3);
  return Math.max(1, Math.min(5, n));
}

export function getTacticalThinkDelay(level) {
  const p = TACTICAL_AI_PROFILES[clampTacticalDifficulty(level)] || TACTICAL_AI_PROFILES[3];
  const [minMs, maxMs] = p.thinkDelay;
  return Math.floor(minMs + Math.random() * (maxMs - minMs));
}

// BFS respeitando paredes e unidades conhecidas
function bfsPath(game, fromX, fromY, targetX, targetY) {
  const queue = [[fromX, fromY, null, 0]];
  const visited = new Set([`${fromX},${fromY}`]);
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  while (queue.length > 0) {
    const [cx, cy, firstStep, dist] = queue.shift();
    if (cx === targetX && cy === targetY) return { firstStep, dist };
    for (const [dx, dy] of dirs) {
      const nx = cx + dx;
      const ny = cy + dy;
      const key = `${nx},${ny}`;
      if (visited.has(key) || !game.isInside(nx, ny) || game.hasWall(nx, ny)) continue;
      const occ = game.unitAt(nx, ny);
      if (occ && !(nx === targetX && ny === targetY)) continue;
      visited.add(key);
      queue.push([nx, ny, firstStep || { x: nx, y: ny }, dist + 1]);
    }
  }
  return { firstStep: null, dist: 99 };
}

function getVisibleEnemyPos(game, botSide) {
  const unit = game.units[botSide];
  const enemySide = 1 - botSide;
  const enemyUnit = game.units[enemySide];
  const visionRadius = 4;
  // Inimigo é visível se está dentro do raio de visão OU segurando a Coroa (regra pública do jogo)
  const inVision = game.manhattan(unit.x, unit.y, enemyUnit.x, enemyUnit.y) <= visionRadius;
  const holdingCrown = game.crown.holder === enemySide;
  if (inVision || holdingCrown) {
    game._aiMemory ||= {};
    game._aiMemory[botSide] ||= { visited: [] };
    game._aiMemory[botSide].lastKnownEnemy = { x: enemyUnit.x, y: enemyUnit.y, round: game.round };
    return { x: enemyUnit.x, y: enemyUnit.y, exact: true };
  }
  const mem = game._aiMemory?.[botSide]?.lastKnownEnemy;
  if (mem && game.round - mem.round <= 2) {
    return { x: mem.x, y: mem.y, exact: false };
  }
  return null;
}

function getVisitedSet(game, botSide) {
  game._aiMemory ||= {};
  game._aiMemory[botSide] ||= { visited: [] };
  if (game._aiMemory[botSide].lastRound !== game.round) {
    game._aiMemory[botSide].visited = [`${game.units[botSide].x},${game.units[botSide].y}`];
    game._aiMemory[botSide].lastRound = game.round;
  }
  return game._aiMemory[botSide].visited;
}

function scoreCardForDraft(game, botSide, card, level) {
  const team = game.teams[botSide];
  const crown = game.crown;
  const holding = crown.holder === botSide;
  const enemyHolding = crown.holder === 1 - botSide;
  const dupCount = team.hand.filter((c) => c.id === card.id).length;

  let s = 10 - dupCount * 4;
  switch (card.id) {
    case 'stamina_overcharge':
      s += 14; // Forte em qualquer cenário (gera +2 PA)
      break;
    case 'short_teleport':
      s += holding ? 13 : 12; // Excelente para pegar Coroa ou escapar
      break;
    case 'crown_dash':
      s += holding ? 11 : 12; // Mobilidade de 3 casas
      break;
    case 'kinetic_push':
      s += enemyHolding ? 16 : 9; // Melhor resposta contra portador inimigo
      break;
    case 'flux_siphon':
      s += enemyHolding ? 15 : 10; // Custo líquido 0 PA e tira PA/VP do rival
      break;
    case 'royal_charge':
      s += enemyHolding ? 11 : 9;
      break;
    case 'flux_wall':
      s += holding ? 12 : 7; // Excelente para proteger a Coroa e habilitar Transposição
      break;
    case 'transposition':
      s += team.hand.some((c) => c.id === 'flux_wall') || game.walls.some((w) => w.owner === botSide) ? 12 : 3;
      break;
    default:
      break;
  }
  const profile = TACTICAL_AI_PROFILES[level] || TACTICAL_AI_PROFILES[3];
  s += (Math.random() - 0.5) * (1 - profile.draftSmartness) * 26;
  return s;
}

export function chooseTacticalDraftCard(game, botSide, difficulty = 3) {
  const level = clampTacticalDifficulty(difficulty);
  const opts = game.teams[botSide]?.draftOptions || [];
  if (!opts.length) return null;
  if (level === 1 && Math.random() < 0.65) {
    return opts[Math.floor(Math.random() * opts.length)];
  }
  let best = opts[0];
  let bestScore = -1e9;
  for (const card of opts) {
    const sc = scoreCardForDraft(game, botSide, card, level);
    if (sc > bestScore) {
      bestScore = sc;
      best = card;
    }
  }
  return best;
}

// Avalia todas as ações legais disponíveis no turno e retorna a melhor ação estratégica
export function chooseTacticalAction(game, botSide, difficulty = 3) {
  const level = clampTacticalDifficulty(difficulty);
  const profile = TACTICAL_AI_PROFILES[level] || TACTICAL_AI_PROFILES[3];
  const team = game.teams[botSide];
  const unit = game.units[botSide];
  const enemySide = 1 - botSide;
  if (!team || !unit || team.ap <= 0) return null;

  const visibleEnemy = getVisibleEnemyPos(game, botSide);
  const visited = getVisitedSet(game, botSide);
  const iHoldCrown = game.crown.holder === botSide;
  const enemyHoldsCrown = game.crown.holder === enemySide;
  const crownFree = game.crown.holder === null;
  const canPickupCrown = crownFree && (game.crown.recoverCooldown?.[botSide] || 0) === 0;
  const crownDistNow = crownFree ? game.manhattan(unit.x, unit.y, game.crown.x, game.crown.y) : 99;
  const enemyDistNow = visibleEnemy ? game.manhattan(unit.x, unit.y, visibleEnemy.x, visibleEnemy.y) : 99;

  const actions = [];

  // 1. Ataque corpo a corpo (1 PA) — somente se inimigo está adjacente (portanto visível)
  if (team.ap >= 1 && visibleEnemy?.exact && enemyDistNow === 1) {
    let score = 20;
    if (enemyHoldsCrown) {
      if (game.crown.protectionTurns === 0) {
        score = 135; // Derruba ou rouba a Coroa!
      } else {
        score = level >= 3 ? -8 : 14; // Níveis altos não desperdiçam ataque enquanto Coroa está protegida
      }
    } else if (iHoldCrown) {
      score = 32; // Empurra o rival para longe do portador
    } else {
      score = 24;
    }
    actions.push({ type: 'attack', x: visibleEnemy.x, y: visibleEnemy.y, score });
  }

  // 2. Movimentos ortogonais (1 PA)
  if (team.ap >= 1) {
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (const [dx, dy] of dirs) {
      const nx = unit.x + dx;
      const ny = unit.y + dy;
      if (!game.isInside(nx, ny) || game.hasWall(nx, ny) || game.unitAt(nx, ny)) continue;
      if (crownFree && game.crown.x === nx && game.crown.y === ny && !canPickupCrown) continue;

      let score = 4;
      // Anti-repetição dentro do turno
      if (visited.includes(`${nx},${ny}`)) score -= 22;

      if (canPickupCrown) {
        if (nx === game.crown.x && ny === game.crown.y) {
          score += 115;
        } else {
          const oldPath = bfsPath(game, unit.x, unit.y, game.crown.x, game.crown.y).dist;
          const newPath = bfsPath(game, nx, ny, game.crown.x, game.crown.y).dist;
          score += (oldPath - newPath) * 24;
        }
      } else if (enemyHoldsCrown && visibleEnemy) {
        const oldPath = bfsPath(game, unit.x, unit.y, visibleEnemy.x, visibleEnemy.y).dist;
        const newPath = bfsPath(game, nx, ny, visibleEnemy.x, visibleEnemy.y).dist;
        score += (oldPath - newPath) * 26;
      } else if (iHoldCrown) {
        // Portador da Coroa: ganha mantendo distância do inimigo e controlando área segura com rotas de fuga
        if (visibleEnemy) {
          const newEnemyDist = game.manhattan(nx, ny, visibleEnemy.x, visibleEnemy.y);
          score += (newEnemyDist - enemyDistNow) * 18 * profile.evadeWhenHolding;
          if (newEnemyDist <= 1 && game.crown.protectionTurns === 0) score -= 40 * profile.evadeWhenHolding;
        }
        // Evita ficar encurralado nas bordas (menos saídas)
        let exits = 0;
        for (const [ex, ey] of dirs) {
          if (game.isInside(nx + ex, ny + ey) && !game.hasWall(nx + ex, ny + ey)) exits++;
        }
        score += exits * 3.5;
        // Pequeno bônus se completar desafio do centro
        if (team.challenge?.id === 'center_2_turns' && !team.challenge.completed && nx >= 4 && nx <= 7 && ny >= 4 && ny <= 7) {
          score += 7;
        }
      } else {
        // Sem Coroa e sem inimigo visível: explorar em direção ao centro / última posição conhecida
        const target = visibleEnemy || { x: 5, y: 5 };
        const dBefore = game.manhattan(unit.x, unit.y, target.x, target.y);
        const dAfter = game.manhattan(nx, ny, target.x, target.y);
        score += (dBefore - dAfter) * 12;
      }

      actions.push({ type: 'move', x: nx, y: ny, score });
    }
  }

  // 3. Avaliação estratégica de cada carta na mão
  for (const card of team.hand) {
    if (team.ap < card.cost) continue;

    if (card.id === 'stamina_overcharge' && profile.useOvercharge) {
      // Usa quando tem <= 1 PA e realmente há algo valioso para fazer (capturar coroa, perseguir ou escapar)
      const useful =
        (canPickupCrown && crownDistNow <= 3) ||
        (enemyHoldsCrown && visibleEnemy && enemyDistNow <= 4) ||
        (iHoldCrown && visibleEnemy && enemyDistNow <= 3);
      if (team.ap <= 1 && useful) {
        actions.push({ type: 'card', card, target: {}, score: 58 * profile.cardUseBias });
      }
      continue;
    }

    if (card.id === 'flux_siphon') {
      // Custo líquido 0 PA (paga 1, ganha 1) e tira 1 PA do próximo turno do rival!
      let score = 38 * profile.cardUseBias;
      if (enemyHoldsCrown && visibleEnemy && enemyDistNow <= 4 && game.teams[enemySide].vp > 0) {
        score = 112 * profile.cardUseBias; // Reduz 1 turno de domínio do inimigo!
      } else if (enemyHoldsCrown) {
        score = 62 * profile.cardUseBias;
      }
      actions.push({ type: 'card', card, target: {}, score });
      continue;
    }

    if (card.id === 'kinetic_push' && visibleEnemy?.exact && enemyDistNow <= card.range) {
      let score = 26 * profile.cardUseBias;
      if (enemyHoldsCrown && game.crown.protectionTurns === 0) {
        score = 132 * profile.cardUseBias;
      } else if (enemyHoldsCrown && game.crown.protectionTurns > 0) {
        score = level >= 3 ? -15 : 15;
      } else if (iHoldCrown && enemyDistNow <= 2) {
        score = 68 * profile.cardUseBias; // Empurra perseguidor para longe!
      }
      actions.push({ type: 'card', card, target: {}, score });
      continue;
    }

    if (card.id === 'short_teleport') {
      // Testa destinos até distância 2
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const dist = Math.abs(dx) + Math.abs(dy);
          if (dist < 1 || dist > 2) continue;
          const tx = unit.x + dx;
          const ty = unit.y + dy;
          if (!game.isInside(tx, ty) || game.hasWall(tx, ty) || game.unitAt(tx, ty)) continue;
          if (crownFree && game.crown.x === tx && game.crown.y === ty && !canPickupCrown) continue;
          if (visited.includes(`${tx},${ty}`)) continue;

          let score = -6;
          if (canPickupCrown && tx === game.crown.x && ty === game.crown.y) {
            score = 128 * profile.cardUseBias;
          } else if (canPickupCrown) {
            const gain = crownDistNow - game.manhattan(tx, ty, game.crown.x, game.crown.y);
            if (gain >= 2) score = 46 * profile.cardUseBias;
          } else if (enemyHoldsCrown && visibleEnemy && game.crown.protectionTurns === 0) {
            const newD = game.manhattan(tx, ty, visibleEnemy.x, visibleEnemy.y);
            if (newD === 1 && team.ap >= card.cost + 1) score = 104 * profile.cardUseBias; // Teleporta adjacente + ataca!
          } else if (iHoldCrown && visibleEnemy && enemyDistNow <= 2) {
            const newD = game.manhattan(tx, ty, visibleEnemy.x, visibleEnemy.y);
            if (newD >= enemyDistNow + 2) score = 74 * profile.cardUseBias; // Fuga limpa com a Coroa
          }
          if (score > 10) actions.push({ type: 'card', card, target: { x: tx, y: ty }, score });
        }
      }
      continue;
    }

    if (card.id === 'crown_dash' || card.id === 'royal_charge') {
      const range = card.range || 2;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        for (let step = 2; step <= range; step++) {
          const tx = unit.x + dx * step;
          const ty = unit.y + dy * step;
          if (!game.isInside(tx, ty) || game.hasWall(tx, ty) || game.unitAt(tx, ty)) break;
          if (crownFree && game.crown.x === tx && game.crown.y === ty && !canPickupCrown) continue;

          let score = -8;
          if (canPickupCrown && tx === game.crown.x && ty === game.crown.y) {
            score = 124 * profile.cardUseBias;
          } else if (canPickupCrown) {
            const gain = crownDistNow - game.manhattan(tx, ty, game.crown.x, game.crown.y);
            if (gain >= 2) score = 42 * profile.cardUseBias;
          } else if (enemyHoldsCrown && visibleEnemy) {
            const newD = game.manhattan(tx, ty, visibleEnemy.x, visibleEnemy.y);
            if (newD === 1 && (card.id === 'royal_charge' || team.ap >= card.cost + 1)) {
              score = 92 * profile.cardUseBias;
            }
          } else if (iHoldCrown && visibleEnemy && enemyDistNow <= 2) {
            const newD = game.manhattan(tx, ty, visibleEnemy.x, visibleEnemy.y);
            if (newD >= enemyDistNow + 2) score = 68 * profile.cardUseBias;
          }
          if (score > 12) actions.push({ type: 'card', card, target: { x: tx, y: ty }, score });
        }
      }
      continue;
    }

    if (card.id === 'flux_wall' && profile.planWall && visibleEnemy) {
      // Ergue barreira entre bot e inimigo se estiver segurando a Coroa ou travando avanço inimigo para a Coroa
      const anchor = iHoldCrown ? unit : crownFree ? game.crown : null;
      if (anchor && enemyDistNow <= 5) {
        const path = bfsPath(game, visibleEnemy.x, visibleEnemy.y, anchor.x, anchor.y);
        if (path.firstStep) {
          const wx = path.firstStep.x;
          const wy = path.firstStep.y;
          if (
            game.manhattan(unit.x, unit.y, wx, wy) <= card.range &&
            !game.hasWall(wx, wy) &&
            !game.unitAt(wx, wy) &&
            !(crownFree && game.crown.x === wx && game.crown.y === wy)
          ) {
            const score = (iHoldCrown ? 66 : 44) * profile.cardUseBias;
            actions.push({ type: 'card', card, target: { x: wx, y: wy }, score });
          }
        }
      }
      continue;
    }

    if (card.id === 'transposition') {
      if (iHoldCrown && game.crown.protectionTurns > 0) continue;
      const myWalls = game.walls.filter((w) => w.owner === botSide && game.manhattan(unit.x, unit.y, w.x, w.y) <= card.range);
      for (const w of myWalls) {
        let score = 0;
        if (iHoldCrown && visibleEnemy) {
          const dAfter = game.manhattan(w.x, w.y, visibleEnemy.x, visibleEnemy.y);
          if (dAfter > enemyDistNow + 1) score = 70 * profile.cardUseBias;
        } else if (canPickupCrown) {
          const dAfter = game.manhattan(w.x, w.y, game.crown.x, game.crown.y);
          if (dAfter < crownDistNow - 1) score = 58 * profile.cardUseBias;
        }
        if (score > 20) actions.push({ type: 'card', card, target: { x: w.x, y: w.y }, score });
      }
    }
  }

  if (!actions.length) return null;

  // Aplica ruído controlado conforme dificuldade (nunca gera ações ilegais)
  for (const act of actions) {
    act.finalScore = act.score + (Math.random() - 0.5) * profile.noise;
  }
  actions.sort((a, b) => b.finalScore - a.finalScore);

  const chosen = actions[0];
  // Nos níveis 3-5, não desperdiça PA em ações negativas se já não há ação vantajosa
  if (level >= 3 && chosen.score < -5) return null;

  return chosen;
}

export function recordTacticalBotPosition(game, botSide) {
  const visited = getVisitedSet(game, botSide);
  const unit = game.units[botSide];
  if (unit) {
    const k = `${unit.x},${unit.y}`;
    if (!visited.includes(k)) visited.push(k);
  }
}
