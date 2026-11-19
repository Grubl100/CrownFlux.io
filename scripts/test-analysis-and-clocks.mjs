import assert from 'node:assert/strict';
import {
  ANALYSIS_SCHEMA_VERSION,
  MOVE_CLASSIFICATIONS,
  buildFullAnalysisReport,
  computeMoveLoss,
  computeSideAccuracy,
  evalToExpectedPoints,
  normalizeEngineScoreToWhite,
  toMoverPerspective,
} from '../src/ai/chessAnalysisEngine.js';
import { reconstructClassicStates } from '../src/game/classicEngine.js';
import {
  createClockAlertTracker,
  evaluateClockAlerts,
  getClockVisualState,
} from '../src/utils/clockAlerts.js';

let passed = 0;
function ok(label) {
  passed++;
  console.log(`PASS | ${label}`);
}

// =========================================================================
// 1. PERSPECTIVA DE AVALIAÇÃO (BRANCAS VS PRETAS ESPELHADAS + WDL + MATE)
// =========================================================================
{
  // Motor UCI reporta +250 cp para quem tem a vez
  const whiteTurnNorm = normalizeEngineScoreToWhite({ scoreCp: 250, mate: null, wdl: [700, 250, 50] }, 0);
  const blackTurnNorm = normalizeEngineScoreToWhite({ scoreCp: 250, mate: null, wdl: [700, 250, 50] }, 1);

  assert.equal(whiteTurnNorm.scoreCp, 250);
  assert.equal(blackTurnNorm.scoreCp, -250);
  assert.deepEqual(whiteTurnNorm.wdl, [700, 250, 50]);
  assert.deepEqual(blackTurnNorm.wdl, [50, 250, 700]);

  const wFromWhite = toMoverPerspective(whiteTurnNorm, 0);
  const bFromBlack = toMoverPerspective(blackTurnNorm, 1);
  assert.equal(wFromWhite.scoreCp, bFromBlack.scoreCp, 'Posições espelhadas devem ter mesma pontuação para quem move');
  assert.ok(Math.abs(wFromWhite.expectedPoints - bFromBlack.expectedPoints) < 0.01, 'WDL espelhado deve gerar mesmo Expected Points');

  // Mate espelhado
  const mateWhite = normalizeEngineScoreToWhite({ scoreCp: null, mate: 3 }, 0);
  const mateBlack = normalizeEngineScoreToWhite({ scoreCp: null, mate: 3 }, 1);
  assert.equal(mateWhite.mate, 3);
  assert.equal(mateBlack.mate, -3);
  assert.equal(evalToExpectedPoints(mateWhite), 100);
  assert.equal(evalToExpectedPoints(mateBlack), 0);

  ok('Perspectiva normalizada (Brancas fixa, espelhamento de sinal, WDL e mate)');
}

// =========================================================================
// 2. REGRESSÃO DO BUG 88% vs 87%: JOGAR MUITO MAL NÃO PODE DAR PRECISÃO ALTA
// =========================================================================
{
  // Simula partida de 10 meias-jogadas onde as Brancas jogam terrivelmente (penduram peças
  // mesmo depois de já estarem perdidas em -900 / -1400 / -2100) e as Pretas vencem com mate.
  const uciMoves = ['f2f3', 'e7e5', 'g2g4', 'd8h4']; // Mate do Louco base (4 plies) + cenário longo sintético
  const snaps = reconstructClassicStates(uciMoves);
  const rawEvals = [
    { ply: 0, bestMove: 'e2e4', pv: ['e2e4', 'e7e5'], depth: 16, nodes: 42000, scoreCp: 25, mate: null, secondBest: { scoreCp: 20, mate: null } },
    { ply: 1, bestMove: 'e7e5', pv: ['e7e5', 'd2d4'], depth: 16, nodes: 45000, scoreCp: -130, mate: null, secondBest: { scoreCp: -90, mate: null } }, // f3 ruim
    { ply: 2, bestMove: 'e2e4', pv: ['e2e4'], depth: 16, nodes: 41000, scoreCp: -135, mate: null, secondBest: { scoreCp: -150, mate: null } }, // e5 ótimo
    { ply: 3, bestMove: 'd8h4', pv: ['d8h4'], depth: 16, nodes: 30000, scoreCp: null, mate: -1, secondBest: { scoreCp: -400, mate: null } }, // g4 permite mate em 1!
    { ply: 4, bestMove: null, pv: [], depth: 16, nodes: 0, scoreCp: null, mate: 0, terminalWinner: 1, terminalDraw: false, secondBest: null }, // Dh4#
  ];
  const foolReport = buildFullAnalysisReport(snaps, rawEvals, 'Stockfish 19', 'complete');
  assert.equal(foolReport.schemaVersion, ANALYSIS_SCHEMA_VERSION);
  assert.ok(foolReport.whiteStats.accuracy <= 45, `Brancas jogando mal no Mate do Louco devem ter precisão baixa, veio ${foolReport.whiteStats.accuracy}%`);
  assert.ok(foolReport.blackStats.accuracy >= 90, `Pretas dando mate perfeito devem ter precisão alta, veio ${foolReport.blackStats.accuracy}%`);
  assert.equal(foolReport.whiteStats.counts.blunder, 1, 'g4 permitindo mate em 1 deve ser Erro grave');

  // Cenário longo de "pendurar peças enquanto já está perdido" (antigo bug do clamp -1200 -> 100%)
  const badMoverMoves = [
    // Lance 1: pendura dama (+0.2 -> -9.0)
    computeMoveLoss({ scoreCp: 20, mate: null }, { scoreCp: -900, mate: null }, 0, { isEngineBest: false }),
    // Lance 2: já perdido em -9.0, pendura torre (-9.0 -> -14.5)
    computeMoveLoss({ scoreCp: -900, mate: null }, { scoreCp: -1450, mate: null }, 0, { isEngineBest: false }),
    // Lance 3: já perdido em -14.5, pendura cavalo (-14.5 -> -18.0)
    computeMoveLoss({ scoreCp: -1450, mate: null }, { scoreCp: -1800, mate: null }, 0, { isEngineBest: false }),
    // Lance 4: já perdido em -18.0, permite mate em 2 (-18.0 -> -M2)
    computeMoveLoss({ scoreCp: -1800, mate: null }, { scoreCp: null, mate: -2 }, 0, { isEngineBest: false }),
  ];
  for (const m of badMoverMoves) {
    assert.ok(m.adjustedLoss >= 20, `Pendurar material mesmo já perdido deve gerar perda >= 20 (veio ${m.adjustedLoss.toFixed(1)})`);
  }
  const terribleAcc = computeSideAccuracy(badMoverMoves.map((m) => ({
    adjustedLoss: m.adjustedLoss,
    moveAccuracy: Math.max(0, 103.1668 * Math.exp(-0.04354 * m.adjustedLoss) - 3.1669),
    forced: false,
  })));
  assert.ok(terribleAcc < 35, `Sequência de erros graves perdendo peças deve ter precisão < 35%, veio ${terribleAcc}%`);

  ok(`Regressão 88% vs 87% corrigida (Mate do Louco: Brancas=${foolReport.whiteStats.accuracy}%, Pretas=${foolReport.blackStats.accuracy}%; pendurando perdido=${terribleAcc}%)`);
}

// =========================================================================
// 3. PARTIDA DE ALTA QUALIDADE (AMBOS JOGAM BEM) + SOMA EXATA DAS CATEGORIAS
// =========================================================================
{
  const ruyUci = ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1b5', 'a7a6', 'b5a4', 'g8f6'];
  const snaps = reconstructClassicStates(ruyUci);
  const rawEvals = snaps.map((s, idx) => ({
    ply: idx,
    bestMove: ruyUci[idx] || null,
    pv: ruyUci.slice(idx, idx + 3),
    depth: 16,
    nodes: 55000,
    scoreCp: 25,
    mate: null,
    wdl: [220, 620, 160],
    secondBest: { scoreCp: 15, mate: null },
  }));
  const report = buildFullAnalysisReport(snaps, rawEvals, 'Stockfish 19', 'complete');
  assert.ok(report.whiteStats.accuracy >= 95, `Ruy Lopez perfeita Brancas >= 95% (veio ${report.whiteStats.accuracy}%)`);
  assert.ok(report.blackStats.accuracy >= 95, `Ruy Lopez perfeita Pretas >= 95% (veio ${report.blackStats.accuracy}%)`);

  const sumWhite = MOVE_CLASSIFICATIONS.reduce((acc, c) => acc + (report.whiteStats.counts[c.id] || 0), 0);
  const sumBlack = MOVE_CLASSIFICATIONS.reduce((acc, c) => acc + (report.blackStats.counts[c.id] || 0), 0);
  assert.equal(sumWhite, report.whiteStats.totalMoves, 'Soma das classificações das Brancas deve bater com totalMoves');
  assert.equal(sumBlack, report.blackStats.totalMoves, 'Soma das classificações das Pretas deve bater com totalMoves');
  assert.equal(report.averageDepth, 16);
  assert.ok(report.totalNodes > 0);
  ok(`Partida forte (Brancas=${report.whiteStats.accuracy}%, Pretas=${report.blackStats.accuracy}%) + somas exatas das 10 categorias`);
}

// =========================================================================
// 4. REGRAS ESPECIAIS NA RECONSTRUÇÃO (ROQUE, EN PASSANT, PROMOÇÃO, REPETIÇÃO)
// =========================================================================
{
  // Roque + En Passant
  const specialMoves = ['e2e4', 'a7a6', 'e4e5', 'd7d5', 'e5d6', 'e7d6', 'g1f3', 'g8f6', 'f1e2', 'f8e7', 'e1g1'];
  const snaps = reconstructClassicStates(specialMoves);
  assert.equal(snaps.length, specialMoves.length + 1);
  assert.equal(snaps[5].move.san, 'exd6', 'En passant reconstruído corretamente');
  assert.equal(snaps[11].move.san, 'O-O', 'Roque pequeno reconstruído corretamente');

  // Repetição tripla -> isDraw = true
  const repMoves = [
    'g1f3', 'g8f6', 'f3g1', 'f6g8',
    'g1f3', 'g8f6', 'f3g1', 'f6g8',
  ];
  const repSnaps = reconstructClassicStates(repMoves);
  const lastRep = repSnaps[repSnaps.length - 1];
  assert.equal(lastRep.over, true, 'Repetição tripla encerra a partida');
  assert.equal(lastRep.isDraw, true, 'Repetição tripla marcada como empate');

  // Promoção
  const promoMoves = [
    'a2a4', 'b7b5', 'a4b5', 'a7a6', 'b5a6', 'c7c6', 'a6a7', 'd7d6', 'a7b8q',
  ];
  const promoSnaps = reconstructClassicStates(promoMoves);
  assert.equal(promoSnaps[promoSnaps.length - 1].move.promotion, 'Q', 'Promoção a Rainha reconstruída');

  ok('Reconstrução fiel de roque, en passant, promoção e empate por repetição tripla');
}

// =========================================================================
// 5. RELÓGIOS E ALERTAS SONOROS NOS ÚLTIMOS 15 SEGUNDOS (SEM DUPLICAÇÃO)
// =========================================================================
{
  const tr = createClockAlertTracker();

  // > 15s: nenhum som
  assert.deepEqual(
    evaluateClockAlerts(tr, { isMyTurn: true, turnOwner: 0, clockSeconds: 20 }),
    []
  );
  assert.deepEqual(
    evaluateClockAlerts(tr, { isMyTurn: true, turnOwner: 0, clockSeconds: 15.1 }),
    []
  );

  // Exatamente 15s: dispara lowtime + tick
  assert.deepEqual(
    evaluateClockAlerts(tr, { isMyTurn: true, turnOwner: 0, clockSeconds: 15.0 }),
    ['lowtime', 'tick']
  );

  // Múltiplos frames dentro do mesmo segundo (14.9 -> 14.2): dispara apenas 1 tick para o segundo 15->14
  assert.deepEqual(
    evaluateClockAlerts(tr, { isMyTurn: true, turnOwner: 0, clockSeconds: 14.9 }),
    []
  );
  assert.deepEqual(
    evaluateClockAlerts(tr, { isMyTurn: true, turnOwner: 0, clockSeconds: 14.0 }),
    ['tick']
  );
  assert.deepEqual(
    evaluateClockAlerts(tr, { isMyTurn: true, turnOwner: 0, clockSeconds: 13.8 }),
    []
  );

  // 10s -> tick; 5s -> tickUrgent; 1s -> tickUrgent
  assert.deepEqual(
    evaluateClockAlerts(tr, { isMyTurn: true, turnOwner: 0, clockSeconds: 10.0 }),
    ['tick']
  );
  assert.deepEqual(
    evaluateClockAlerts(tr, { isMyTurn: true, turnOwner: 0, clockSeconds: 5.0 }),
    ['tickUrgent']
  );
  assert.deepEqual(
    evaluateClockAlerts(tr, { isMyTurn: true, turnOwner: 0, clockSeconds: 1.0 }),
    ['tickUrgent']
  );

  // Tempo esgotado (0s): para imediatamente
  assert.deepEqual(
    evaluateClockAlerts(tr, { isMyTurn: true, turnOwner: 0, clockSeconds: 0 }),
    []
  );

  // Incremento devolve tempo > 15s -> rearma sem tocar som; depois volta a <= 15s -> toca novamente
  assert.deepEqual(
    evaluateClockAlerts(tr, { isMyTurn: true, turnOwner: 0, clockSeconds: 17.0 }),
    []
  );
  assert.deepEqual(
    evaluateClockAlerts(tr, { isMyTurn: true, turnOwner: 0, clockSeconds: 14.9 }),
    ['lowtime', 'tick']
  );

  // Pausa, troca de turno e fim de partida interrompem imediatamente
  assert.deepEqual(
    evaluateClockAlerts(tr, { isMyTurn: true, turnOwner: 0, paused: true, clockSeconds: 12.0 }),
    []
  );
  assert.deepEqual(
    evaluateClockAlerts(tr, { isMyTurn: false, turnOwner: 1, clockSeconds: 12.0 }),
    []
  );
  assert.deepEqual(
    evaluateClockAlerts(tr, { isMyTurn: true, turnOwner: 0, over: true, clockSeconds: 4.0 }),
    []
  );

  // Preferência clockTickSound = false: dispara lowtime, mas ZERO ticks
  const trNoTick = createClockAlertTracker();
  assert.deepEqual(
    evaluateClockAlerts(trNoTick, { isMyTurn: true, turnOwner: 0, clockSeconds: 15.0, clockTickSound: false }),
    ['lowtime']
  );
  assert.deepEqual(
    evaluateClockAlerts(trNoTick, { isMyTurn: true, turnOwner: 0, clockSeconds: 14.0, clockTickSound: false }),
    []
  );

  // Som global desativado: zero eventos
  const trMuted = createClockAlertTracker();
  assert.deepEqual(
    evaluateClockAlerts(trMuted, { isMyTurn: true, turnOwner: 0, clockSeconds: 15.0, soundEffects: false }),
    []
  );

  // Estados visuais do relógio
  assert.equal(getClockVisualState(45, { active: true }), 'active');
  assert.equal(getClockVisualState(45, { active: false }), 'idle');
  assert.equal(getClockVisualState(15, { active: true }), 'low');
  assert.equal(getClockVisualState(5, { active: true }), 'critical');
  assert.equal(getClockVisualState(0, { active: true }), 'expired');
  assert.equal(getClockVisualState(12, { active: true, over: true }), 'ended');

  ok('Relógios e alertas sonoros dos últimos 15s (alerta, tique-taque, sem duplicação, pausa/turno/incremento/mute)');
}

console.log(`\nALL ${passed} ANALYSIS & CLOCK TEST SUITES PASSED!`);
