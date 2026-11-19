export const ORTH = [[1, 0], [-1, 0], [0, 1], [0, -1]];
export const DIAG = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
export const KN = [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]];

export const FAC = [
  { name: 'Azul', col: '#6f9daf', fwd: [0, -1], base: [8, 14] },
  { name: 'Rubi', col: '#bd7778', fwd: [0, 1], base: [8, 1] },
  { name: 'Ouro', col: '#cfaf72', fwd: [1, 0], base: [1, 8] },
  { name: 'Violeta', col: '#9e88bd', fwd: [-1, 0], base: [14, 8] },
];

export const LAYOUT = [[-2, 'R'], [-1, 'B'], [0, 'K'], [1, 'Q'], [2, 'N']];
export const BASE = { P: 0.9, N: 1.4, B: 1.6, R: 1.8, Q: 2.2, K: 1.1 };
export const VAL = { P: 1, N: 3, B: 3, R: 5, Q: 9, K: 10 };
export const GLYPH = { P: '♟', N: '♞', B: '♝', R: '♜', Q: '♛', K: '♚' };
export const NOME = { P: 'Peão', N: 'Cavalo', B: 'Bispo', R: 'Torre', Q: 'Rainha', K: 'Rei' };
export const GROW = ['P', 'P', 'N', 'B', 'R', 'N', 'B', 'R', 'Q', 'Q'];

export const AVATARS = ['♟', '♞', '♝', '♜', '♛', '♚', '⚔', '🛡', '👑', '⚡', '🔥', '💎'];

export const DEFAULT_PREFERENCES = {
  uiTheme: 'blue',
  boardTheme: 'imperial',
  pieceStyle: 'medallion',
  doctrine: 'vanguard',
  showCoords: true,
  highlightMoves: true,
  autoQueueMove: true,
  confirmResign: true,
  soundEffects: true,
  lowTimeSound: true,
  reducedMotion: false,
};

export const STRATEGIC_ZONES = [
  { id: 'sanctuary', name: 'Santuário de Fluxo', short: 'Santuário', icon: '⚡', bonus: '+3% Fluxo/s', x0: 2, y0: 7, x1: 3, y1: 8 },
  { id: 'throne', name: 'Trono Imperial', short: 'Trono Central', icon: '👑', bonus: '+3,5% Coroa/s', x0: 7, y0: 7, x1: 8, y1: 8 },
  { id: 'fortress', name: 'Fortaleza Real', short: 'Fortaleza', icon: '🏰', bonus: 'Escudo ao Rei', x0: 12, y0: 7, x1: 13, y1: 8 },
];

export const DOCTRINES_INFO = {
  vanguard: {
    id: 'vanguard',
    name: 'Vanguarda',
    icon: '⚔️',
    tag: 'Ofensiva',
    bonus: '-12% recarga em capturas · Começa com 28% Fluxo',
    tradeoff: '-10% velocidade de Domínio da Coroa',
  },
  bastion: {
    id: 'bastion',
    name: 'Bastião',
    icon: '🛡️',
    tag: 'Defesa & Controle',
    bonus: 'Rei inicia com Escudo Real · Regiões rendem +25%',
    tradeoff: '+10% recarga em movimentos neutros de Torre/Rainha',
  },
  celerity: {
    id: 'celerity',
    name: 'Céleres',
    icon: '🐎',
    tag: 'Mobilidade & Coroa',
    bonus: '-12% recarga em Peão/Cavalo/Rei · Metade do peso da Coroa',
    tradeoff: 'Começa com 8% Fluxo · Surto dura 5s',
  },
};

export const ACHIEVEMENTS_CATALOG = [
  { id: 'first_blood', title: 'Primeira Conquista', icon: '⚔️', desc: 'Vença sua primeira partida no modo Duelo.' },
  { id: 'crown_sovereign', title: 'Soberano da Coroa', icon: '👑', desc: 'Vença atingindo 100% de Domínio Imperial da Coroa.' },
  { id: 'regicide', title: 'Regicida Real', icon: '♚', desc: 'Vença capturando diretamente o Rei adversário.' },
  { id: 'tactician', title: 'Mestre do Fluxo', icon: '⚡', desc: 'Ative habilidades táticas de Fluxo em combate.' },
  { id: 'comeback_king', title: 'Virada Imperial', icon: '🔥', desc: 'Vença após o rival ultrapassar 50% de Domínio da Coroa.' },
  { id: 'veteran_10', title: 'Veterano da Arena', icon: '🛡️', desc: 'Dispute 10 partidas completas no Crownflux.io.' },
  { id: 'cpu_slayer', title: 'Domador de Máquinas', icon: '💎', desc: 'Vença a CPU na dificuldade Difícil ou Especialista.' },
];

export const CPU_LEVELS = [
  { level: 1, name: 'Iniciante', interval: 1.75, desc: 'Ideal para aprender com calma: movimentos simples, sem previsão de ameaças e reações lentas.', challenge: 'Ideal para aprender', recommended: true },
  { level: 2, name: 'Fácil', interval: 1.35, desc: 'Reconhece capturas diretas, fragmentos próximos e a Coroa livre, mas subestima ameaças.', challenge: 'Desafio leve' },
  { level: 3, name: 'Intermediário', interval: 0.98, desc: 'Estratégia equilibrada: protege peças importantes, disputa territórios e administra recursos.', challenge: 'Equilibrado' },
  { level: 4, name: 'Difícil', interval: 0.72, desc: 'Antecipa ameaças, protege o portador com Égide Real e pressiona o Rei adversário.', challenge: 'Alta intensidade' },
  { level: 5, name: 'Muito difícil', interval: 0.52, desc: 'Simulação tática de 2 lances, evita armadilhas e coordena Investida, Égide e Surto.', challenge: 'Desafio máximo' },
];

export const CLASSIC_CATEGORIES = [
  { id: 'bullet', name: 'Bullet', icon: '⚡', desc: 'Partidas ultrarrápidas' },
  { id: 'blitz', name: 'Blitz', icon: '🔥', desc: 'Ritmo dinâmico e tático' },
  { id: 'rapid', name: 'Rapid', icon: '⏱️', desc: 'Cálculo equilibrado' },
  { id: 'classic', name: 'Clássico', icon: '🏛️', desc: 'Estratégia profunda' },
  { id: 'custom', name: 'Personalizado', icon: '⚙️', desc: 'Defina tempo e incremento' },
];

export const CLASSIC_CONTROLS = {
  bullet1: { category: 'bullet', label: 'Bullet · 1+0', shortLabel: '1+0', seconds: 60, increment: 0, ranked: true },
  bullet1_1: { category: 'bullet', label: 'Bullet · 1+1', shortLabel: '1+1', seconds: 60, increment: 1, ranked: true },
  bullet2: { category: 'bullet', label: 'Bullet · 2+0', shortLabel: '2+0', seconds: 120, increment: 0, ranked: true },
  bullet2_1: { category: 'bullet', label: 'Bullet · 2+1', shortLabel: '2+1', seconds: 120, increment: 1, ranked: true },
  blitz3: { category: 'blitz', label: 'Blitz · 3+0', shortLabel: '3+0', seconds: 180, increment: 0, ranked: true },
  blitz3_2: { category: 'blitz', label: 'Blitz · 3+2', shortLabel: '3+2', seconds: 180, increment: 2, ranked: true },
  blitz5: { category: 'blitz', label: 'Blitz · 5+0', shortLabel: '5+0', seconds: 300, increment: 0, ranked: true },
  blitz5_3: { category: 'blitz', label: 'Blitz · 5+3', shortLabel: '5+3', seconds: 300, increment: 3, ranked: true },
  rapid10: { category: 'rapid', label: 'Rapid · 10+0', shortLabel: '10+0', seconds: 600, increment: 0, ranked: true },
  rapid10_5: { category: 'rapid', label: 'Rapid · 10+5', shortLabel: '10+5', seconds: 600, increment: 5, ranked: true },
  rapid15: { category: 'rapid', label: 'Rapid · 15+10', shortLabel: '15+10', seconds: 900, increment: 10, ranked: true },
  rapid25: { category: 'rapid', label: 'Rapid · 25+0', shortLabel: '25+0', seconds: 1500, increment: 0, ranked: true },
  classic30: { category: 'classic', label: 'Clássico · 30+0', shortLabel: '30+0', seconds: 1800, increment: 0, ranked: true },
  classic30_20: { category: 'classic', label: 'Clássico · 30+20', shortLabel: '30+20', seconds: 1800, increment: 20, ranked: true },
  classic60: { category: 'classic', label: 'Clássico · 60+0', shortLabel: '60+0', seconds: 3600, increment: 0, ranked: true },
  classic90_30: { category: 'classic', label: 'Clássico · 90+30', shortLabel: '90+30', seconds: 5400, increment: 30, ranked: true },
};

export function resolveClassicControl(timeControl, customTime = null) {
  if (timeControl && CLASSIC_CONTROLS[timeControl]) {
    return { key: timeControl, ...CLASSIC_CONTROLS[timeControl] };
  }
  if (timeControl === 'custom' && customTime) {
    const minutes = Math.max(1, Math.min(180, Math.round(Number(customTime.minutes) || 10)));
    const increment = Math.max(0, Math.min(60, Math.round(Number(customTime.increment) || 0)));
    const seconds = minutes * 60;
    const estTotal = seconds + increment * 40;
    const category = estTotal < 180 ? 'bullet' : estTotal < 480 ? 'blitz' : estTotal < 1500 ? 'rapid' : 'classic';
    return {
      key: 'custom',
      category,
      label: `Personalizado · ${minutes}+${increment}`,
      shortLabel: `${minutes}+${increment}`,
      seconds,
      increment,
      ranked: false,
      custom: true,
    };
  }
  return { key: 'blitz3', ...CLASSIC_CONTROLS.blitz3 };
}

export const PIECE_RULE_SUMMARY = {
  P: 'O Peão (♟) avança 1 casa para frente (se vazia) e captura 1 casa na diagonal frontal.',
  N: 'O Cavalo (♞) salta em formato de "L" (2×1) e pode pular sobre outras peças.',
  B: 'O Bispo (♝) desliza pelas diagonais livres quantas casas quiser.',
  R: 'A Torre (♜) desliza em linha reta (horizontal ou vertical) por casas livres.',
  Q: 'A Rainha (♛) combina Torre e Bispo: move-se em linha reta ou diagonal.',
  K: 'O Rei (♚) move-se 1 casa em qualquer direção. Proteja-o a todo custo!',
};

export const TUTORIAL_STEPS = [
  {
    step: 1,
    title: 'Objetivo do Jogo & Os Reis',
    text: 'Bem-vindo ao Duelo do Crownflux.io! Você comanda as peças Azuis na base e enfrenta o Mentor Rubi no topo. Vença capturando o Rei inimigo (♚) OU conquistando a Coroa Imperial (👑) no centro até atingir 100% de Domínio!',
    hint: 'Observe os dois Reis destacados no tabuleiro e as três Regiões Estratégicas no meio. Quando estiver pronto, clique em "Avançar →" ou já selecione qualquer peça Azul!',
    hudHighlight: null,
  },
  {
    step: 2,
    title: 'Como Selecionar uma Peça',
    text: 'Para agir, toque em qualquer peça Azul. As casas válidas aparecerão marcadas no tabuleiro: pontos escuros são movimentos livres e círculos vermelhos são capturas possíveis.',
    hint: 'Toque em uma peça AZUL (como um Peão ♟ ou Cavalo ♞ na parte inferior) para ver seus destinos.',
    hudHighlight: null,
  },
  {
    step: 3,
    title: 'Realizando seu Primeiro Movimento',
    text: 'Com uma peça Azul selecionada, toque em uma casa destacada para movê-la. Depois de se mover, a peça exibe um arco dourado de recarga individual enquanto se prepara para o próximo lance.',
    hint: 'Toque em uma das casas destacadas com ponto escuro para mover sua peça.',
    hudHighlight: null,
  },
  {
    step: 4,
    title: 'Ritmo de Ação & Resposta do Adversário',
    text: 'Excelente! Aqui no treino guiado, o Mentor Rubi (Bot) responde a cada movimento seu em torno de 1 segundo para você acompanhar as jogadas com clareza no tabuleiro.',
    hint: 'Observe o movimento do Mentor Rubi destacado em vermelho no topo e depois faça mais 1 movimento para avançar.',
    hudHighlight: 'turnBannerBox',
  },
  {
    step: 5,
    title: 'Praticando Capturas & Ganhando Pontos',
    text: 'Capturar peças neutras ou inimigas concede pontos, XP e Energia de Fluxo. Peças selecionadas com círculo vermelho sobre um alvo indicam captura disponível!',
    hint: 'Selecione sua peça Azul e capture a peça destacada com anel dourado no tabuleiro!',
    hudHighlight: 'scoreCard',
  },
  {
    step: 6,
    title: 'Coroa Imperial & Regiões Estratégicas',
    text: 'No centro do tabuleiro fica o Trono Imperial, onde a Coroa (👑) desperta. À esquerda está o Santuário (+Fluxo) e à direita a Fortaleza (Escudo ao Rei). Evite deixar seu Rei exposto!',
    hint: 'Realize 2 movimentos estratégicos avançando peças para controlar o centro e proteger seu Rei.',
    hudHighlight: 'progressCard',
  },
  {
    step: 7,
    title: 'Habilidades Táticas de Fluxo',
    text: 'Sua Energia de Fluxo alimenta 3 habilidades: [1] Investida Real (45%, zera recarga), [2] Égide Real (60%, Escudo Real) e [3 / Espaço] Surto Imperial (100%, acelera todo o exército)!',
    hint: 'Sua energia de Fluxo está em 100%! Clique em "🔥 ATIVAR SURTO IMPERIAL" (ou pressione ESPAÇO) para liberar o poder máximo.',
    hudHighlight: 'progressCard',
  },
  {
    step: 8,
    title: 'Batalha Final — Domine a Arena!',
    text: 'Agora você domina o essencial do Duelo! Enfrente o Mentor Rubi livremente: conquiste 15 pontos, atinja 100% de Domínio da Coroa ou capture o Rei dele para concluir o treinamento.',
    hint: 'Capture peças, dispute a Coroa Imperial no centro ou capture o Rei do Mentor Rubi para vencer o tutorial!',
    hudHighlight: 'scoreCard',
  },
];

export const TACTICAL_CARDS_FALLBACK = [
  { id: 'short_teleport', name: 'Teleporte Curto', cost: 2, targetType: 'cell', range: 2, desc: 'Pula até 2 casas no grid, ignorando paredes no caminho.' },
  { id: 'flux_siphon', name: 'Dreno Tático', cost: 1, targetType: 'none', range: 0, desc: 'Remove 1 PA do próximo turno do inimigo e recupera o PA gasto. Se ele estiver com a Coroa a até 4 casas, reduz 1 turno de domínio.' },
  { id: 'flux_wall', name: 'Barreira de Fluxo', cost: 1, targetType: 'cell', range: 4, durationRounds: 2, desc: 'Ergue um bloqueio temporário em uma casa vazia por 2 rodadas.' },
  { id: 'crown_dash', name: 'Impulso Real', cost: 3, targetType: 'cell', range: 3, desc: 'Avança até 3 casas em linha reta pelo tabuleiro.' },
  { id: 'kinetic_push', name: 'Golpe de Cerco', cost: 2, targetType: 'enemy', range: 2, desc: 'Atinge o inimigo a até 2 casas, empurrando-o 1 casa para trás e derrubando a Coroa (se não estiver protegida).' },
  { id: 'royal_charge', name: 'Investida Real', cost: 2, targetType: 'cell', range: 2, desc: 'Avança até 2 casas em linha reta e empurra um inimigo adjacente em 1 casa, sem roubar a Coroa diretamente.' },
  { id: 'transposition', name: 'Transposição', cost: 2, targetType: 'cell', range: 5, desc: 'Troca sua posição com uma Barreira de Fluxo aliada (bloqueada enquanto a Coroa estiver sob proteção).' },
  { id: 'stamina_overcharge', name: 'Sobrecarga de Estamina', cost: 0, targetType: 'none', range: 0, desc: 'Concede +2 PA imediatos neste turno, mas reduz em 1 PA o seu próximo turno.' },
];

export const TACTICAL_RULES_FALLBACK = {
  boardSize: 12,
  targetVp: 3,
  crownHoldGoal: 3,
  basePa: 3,
  crownPaPenalty: 1,
  turnLimitMs: 15000,
  draftMs: 8000,
  draftEveryRounds: 3,
  visionRadius: 4,
  reconnectMs: 30000,
};
