import { clampDifficulty } from './aiConfig.js';

// Gerenciador de tempo realista para o bot de Xadrez Clássico.
// Calcula orçamento de pensamento por lance baseado no controle de tempo, relógio restante,
// complexidade da posição, fase da partida e dificuldade — sempre descontado do relógio oficial do bot.

export function estimatePositionComplexity(S) {
  if (!S || !S.pieces) return 1.0;
  const pieceCount = S.pieces.length;
  const ply = S.moveHistory?.length || 0;

  // Abertura inicial (primeiros 6 meios-lances): ritmo mais rápido
  let phaseFactor = 1.0;
  if (ply < 6) phaseFactor = 0.58;
  else if (ply < 14) phaseFactor = 0.85;
  else if (pieceCount <= 10) phaseFactor = 0.92; // Finais: cálculo mais focado
  else phaseFactor = 1.18; // Meio-jogo complexo

  // Se o último lance foi captura ou xeque, a posição exige um pouco mais de cálculo
  const last = S.moveHistory?.[S.moveHistory.length - 1];
  const tacticalFactor = last?.inCheck ? 1.15 : last?.captured ? 1.08 : 1.0;

  return Math.max(0.45, Math.min(1.55, phaseFactor * tacticalFactor));
}

export function computeBotTimeBudgetMs({
  botClockSec = 180,
  initialSeconds = 180,
  incrementSec = 0,
  category = 'blitz',
  difficulty = 3,
  state = null,
}) {
  const lv = clampDifficulty(difficulty);
  const complexity = estimatePositionComplexity(state);
  const clockMs = Math.max(0, Number(botClockSec) * 1000);

  // Se o bot está em apuro severo de tempo (< 6s), acelera para evitar perder no relógio artificialmente
  if (clockMs < 2500) return { targetThinkMs: 140, searchTimeMs: 70 };
  if (clockMs < 6000) return { targetThinkMs: 320, searchTimeMs: 120 };
  if (clockMs < 12000) return { targetThinkMs: 560, searchTimeMs: 180 };

  // Orçamento base por categoria (em ms), proporcional ao tempo real disponível
  let baseMs;
  if (category === 'bullet' || initialSeconds <= 120) {
    // Bullet 1+0 / 2+1: média natural ~0.85s–1.45s por lance (evita terminar 1+0 com 52s sobrando!)
    baseMs = initialSeconds <= 60 ? 980 : 1350;
  } else if (category === 'blitz' || initialSeconds <= 360) {
    // Blitz 3+0 / 5+0: média natural ~1.6s–2.6s por lance
    baseMs = initialSeconds <= 180 ? 1750 : 2350;
  } else if (category === 'rapid' || initialSeconds <= 1500) {
    // Rapid 10+0 / 15+10: média natural ~2.6s–4.0s por lance
    baseMs = 2900;
  } else {
    // Clássico 30+0+: média natural ~3.5s–5.2s por lance
    baseMs = 4100;
  }

  // Incremento adiciona margem confortável de pensamento
  baseMs += Math.min(incrementSec * 380, 1600);

  // Ajuste moderado por dificuldade (força != lentidão; níveis mais altos pensam um pouco mais em posições complexas)
  const diffMult = [0, 0.88, 0.94, 1.0, 1.1, 1.22][lv] || 1.0;

  // Jitter humano controlado (+/- 22%) para ritmo orgânico
  const jitter = 0.78 + Math.random() * 0.44;
  let targetThinkMs = Math.round(baseMs * complexity * diffMult * jitter);

  // Nunca excede 6.5% do relógio restante do bot (preserva gestão saudável de tempo)
  const maxAllowedMs = Math.max(220, Math.min(clockMs * 0.065, category === 'bullet' ? 2200 : 7500));
  const minAllowedMs = category === 'bullet' ? 420 : 650;
  targetThinkMs = Math.max(minAllowedMs, Math.min(targetThinkMs, maxAllowedMs));

  // Tempo efetivo de busca do Stockfish (menor nos níveis baixos, maior nos níveis altos)
  const searchCap = [0, 90, 130, 260, 480, 900][lv] || 300;
  const searchTimeMs = Math.max(60, Math.min(searchCap, Math.round(targetThinkMs * 0.65)));

  return { targetThinkMs, searchTimeMs };
}
