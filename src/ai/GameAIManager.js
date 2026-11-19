import { clampDifficulty, getDifficultyInfo } from './aiConfig.js';
import { runArenaAI } from './arenaAI.js';
import { runDuelAI } from './duelAI.js';

// Coordenador global de IA: padroniza níveis/metadados e delega para o motor específico da modalidade.
export const GameAIManager = {
  getDifficultyInfo(level, mode = 'duel') {
    return getDifficultyInfo(level, mode);
  },

  stepDuel(S, teamId, api) {
    const level = clampDifficulty(S.cpuDifficulty || 3);
    if (S.isArena) {
      return runArenaAI(S, teamId, level, api);
    }
    return runDuelAI(S, teamId, level, api);
  },
};
