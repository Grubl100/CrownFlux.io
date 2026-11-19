// Sistema Global de Dificuldades de Inteligência Artificial — Crownflux.io
// Padroniza a experiência em 5 níveis reais; cada modalidade aplica seu motor próprio.

export const GLOBAL_AI_DIFFICULTIES = [
  {
    level: 1,
    id: 'beginner',
    name: 'Iniciante',
    shortDesc: 'Decisões simples, comete erros táticos e deixa passar oportunidades.',
    challenge: 'Ideal para aprender',
    recommended: true,
    modeDesc: {
      duel: 'Movimentos básicos e reação calma; ignora ameaças compostas e disputa a Coroa de forma simples.',
      arena: 'Facções defensivas e desorganizadas; raramente exploram oportunidades contra múltiplos rivais.',
      tactical: 'Joga cartas simples sem planejar combos e desperdiça PA com frequência.',
      classic: 'Motor Stockfish limitado (Skill 0, profundidade curta): ideal para praticar fundamentos.',
    },
  },
  {
    level: 2,
    id: 'easy',
    name: 'Fácil',
    shortDesc: 'Reconhece oportunidades diretas, mas ainda comete erros estratégicos perceptíveis.',
    challenge: 'Desafio leve',
    modeDesc: {
      duel: 'Reconhece capturas diretas, fragmentos próximos e a Coroa livre, mas subestima contra-ataques.',
      arena: 'Busca capturas fáceis e fragmentos, porém avalia mal ataques vindos de múltiplos lados.',
      tactical: 'Aproxima-se da Coroa e usa cartas ofensivas básicas, mas não antecipa bloqueios.',
      classic: 'Motor Stockfish em força reduzida (Skill 3): encontra capturas simples e erra em táticas.',
    },
  },
  {
    level: 3,
    id: 'intermediate',
    name: 'Intermediário',
    shortDesc: 'Desenvolve estratégias coerentes, reconhece ameaças comuns e administra recursos.',
    challenge: 'Equilibrado',
    modeDesc: {
      duel: 'Equilibra ataque e defesa, disputa Regiões Estratégicas, protege peças e usa habilidades de Fluxo.',
      arena: 'Avalia os 3 adversários, evita fogo cruzado óbvio e aproveita aberturas para crescer o exército.',
      tactical: 'Administra PA, escolhe cartas úteis no Draft e combina avanço com ataque ou bloqueio.',
      classic: 'Motor Stockfish intermediário (Skill 7): desenvolve bem, protege peças e pune erros claros.',
    },
  },
  {
    level: 4,
    id: 'hard',
    name: 'Difícil',
    shortDesc: 'Planeja com antecedência, evita erros básicos e antecipa respostas do adversário.',
    challenge: 'Alta intensidade',
    modeDesc: {
      duel: 'Alterna postura estratégica, antecipa contra-ataques, protege o portador com Égide e pressiona o Rei.',
      arena: 'Calcula riscos de múltiplos rivais, busca conversões de exército e evita exposição desnecessária.',
      tactical: 'Planeja sequências de cartas no turno, gerencia proteção da Coroa e faz Draft sinérgico.',
      classic: 'Motor Stockfish forte (Skill 13): táticas precisas, controle posicional e finais sólidos.',
    },
  },
  {
    level: 5,
    id: 'very_hard',
    name: 'Muito difícil',
    shortDesc: 'Máxima profundidade da modalidade: combinações complexas e adaptação estratégica.',
    challenge: 'Desafio máximo',
    modeDesc: {
      duel: 'Simulação tática de 2 lances, coordenação de Investida/Égide/Surto e domínio implacável da Coroa.',
      arena: 'Leitura tática completa da Arena 4P: pune fraquezas, controla ritmo e evita armadilhas de 3 frentes.',
      tactical: 'Otimização multi-ação por turno, combos com Sobrecarga/Impulso/Barreira e controle fino de PA.',
      classic: 'Motor Stockfish força máxima (Skill 20): cálculo profundo de aberturas, combinações e finais.',
    },
  },
];

export function clampDifficulty(level) {
  const n = Math.round(Number(level) || 3);
  return Math.max(1, Math.min(5, n));
}

export function getDifficultyInfo(level, mode = 'duel') {
  const lv = clampDifficulty(level);
  const entry = GLOBAL_AI_DIFFICULTIES.find((d) => d.level === lv) || GLOBAL_AI_DIFFICULTIES[2];
  return {
    ...entry,
    desc: entry.modeDesc?.[mode] || entry.shortDesc,
  };
}

export function getDifficultyName(level) {
  return getDifficultyInfo(level).name;
}

// Parâmetros específicos do Duelo 1v1 (inteligência real + ritmo coerente)
export const DUEL_AI_PROFILES = {
  1: { interval: 1.75, noise: 6.0, lookahead: 0, threatWeight: 0.25, crownWeight: 0.45, skillUse: 0.0, zoneWeight: 0.15, candidateRatio: 0.6 },
  2: { interval: 1.35, noise: 3.2, lookahead: 0, threatWeight: 0.55, crownWeight: 0.72, skillUse: 0.25, zoneWeight: 0.45, candidateRatio: 0.82 },
  3: { interval: 0.98, noise: 1.4, lookahead: 1, threatWeight: 0.85, crownWeight: 1.0, skillUse: 0.65, zoneWeight: 0.85, candidateRatio: 1.0 },
  4: { interval: 0.72, noise: 0.55, lookahead: 2, threatWeight: 1.15, crownWeight: 1.25, skillUse: 0.9, zoneWeight: 1.1, candidateRatio: 1.0 },
  5: { interval: 0.52, noise: 0.12, lookahead: 2, threatWeight: 1.38, crownWeight: 1.45, skillUse: 1.0, zoneWeight: 1.25, candidateRatio: 1.0 },
};

// Parâmetros específicos da Arena 4 Jogadores
export const ARENA_AI_PROFILES = {
  1: { interval: 1.55, noise: 5.5, multiThreatWeight: 0.25, convertWeight: 0.4, surgeUse: 0.15, lookahead: 0 },
  2: { interval: 1.2, noise: 2.8, multiThreatWeight: 0.55, convertWeight: 0.7, surgeUse: 0.45, lookahead: 0 },
  3: { interval: 0.9, noise: 1.2, multiThreatWeight: 0.95, convertWeight: 1.0, surgeUse: 0.75, lookahead: 1 },
  4: { interval: 0.68, noise: 0.45, multiThreatWeight: 1.3, convertWeight: 1.3, surgeUse: 0.95, lookahead: 1 },
  5: { interval: 0.5, noise: 0.1, multiThreatWeight: 1.6, convertWeight: 1.6, surgeUse: 1.0, lookahead: 2 },
};

// Parâmetros UCI reais do Stockfish 19 Lite WASM (calibrados por testes)
export const CHESS_STOCKFISH_PROFILES = {
  1: { skillLevel: 0, limitStrength: true, uciElo: 1320, depth: 2, movetime: 90, multiPv: 4, pickTopN: 4, blunderChance: 0.34 },
  2: { skillLevel: 3, limitStrength: true, uciElo: 1350, depth: 4, movetime: 140, multiPv: 3, pickTopN: 2, blunderChance: 0.16 },
  3: { skillLevel: 7, limitStrength: true, uciElo: 1650, depth: 7, movetime: 260, multiPv: 1, pickTopN: 1, blunderChance: 0.0 },
  4: { skillLevel: 13, limitStrength: true, uciElo: 2100, depth: 11, movetime: 480, multiPv: 1, pickTopN: 1, blunderChance: 0.0 },
  5: { skillLevel: 20, limitStrength: false, uciElo: null, depth: 15, movetime: 850, multiPv: 1, pickTopN: 1, blunderChance: 0.0 },
};
