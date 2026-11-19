import assert from 'node:assert/strict';
import {
  CHESS_PIECE_STYLES,
  getChessPieceSvgMarkup,
  normalizePieceStyle,
} from '../src/game/chessPieceAssets.js';
import {
  applyUciMove,
  createClassicState,
  getClassicMoves,
  getFreeArrowTargets,
  getLegalArrowTargets,
  reconstructClassicStates,
  validateClassicMoveArrow,
  validateFreeMoveArrow,
} from '../src/game/classicEngine.js';
import { boardToView, viewToBoard } from '../src/game/classicRenderer.js';

function makeCustomState({ pieces, turnOwner = 0, castle = null, enPassant = null }) {
  const grid = Array.from({ length: 8 }, () => Array(8).fill(null));
  const list = pieces.map((p, idx) => ({ id: idx + 1, t: p.t, o: p.o, x: p.x, y: p.y }));
  for (const p of list) grid[p.y][p.x] = p;
  return {
    classic: true,
    N: 8,
    grid,
    pieces: list,
    turnOwner,
    turn: turnOwner,
    castle: castle || [
      { king: false, queen: false },
      { king: false, queen: false },
    ],
    enPassant,
  };
}

let passed = 0;
function ok(label) {
  passed++;
  console.log(`PASS | ${label}`);
}

// =========================================================================
// 1. TESTES DE ESTILOS E ASSETS VETORIAIS DAS PEÇAS (Padrão, Minimalista, Medieval)
// =========================================================================
{
  assert.deepEqual(
    CHESS_PIECE_STYLES.map((s) => s.id),
    ['standard', 'minimal', 'medieval'],
    'Devem existir exatamente 3 estilos: standard, minimal, medieval'
  );
  assert.deepEqual(
    CHESS_PIECE_STYLES.map((s) => s.name),
    ['Padrão', 'Minimalista', 'Medieval'],
    'Os nomes devem ser exatamente Padrão, Minimalista e Medieval'
  );
  assert.equal(normalizePieceStyle('medallion'), 'standard');
  assert.equal(normalizePieceStyle('heraldic'), 'medieval');
  assert.equal(normalizePieceStyle('minimal'), 'minimal');
  assert.equal(normalizePieceStyle('unknown_style'), 'standard');

  const types = ['K', 'Q', 'R', 'B', 'N', 'P'];
  for (const owner of [0, 1]) {
    for (const t of types) {
      const svgStd = getChessPieceSvgMarkup('standard', t, owner);
      const svgMin = getChessPieceSvgMarkup('minimal', t, owner);
      const svgMed = getChessPieceSvgMarkup('medieval', t, owner);

      assert.ok(svgStd.startsWith('<svg ') && svgStd.endsWith('</svg>'));
      assert.ok(svgMin.startsWith('<svg ') && svgMin.endsWith('</svg>'));
      assert.ok(svgMed.startsWith('<svg ') && svgMed.endsWith('</svg>'));

      // Os 3 conjuntos precisam ser visualmente distintos entre si
      assert.notEqual(svgStd, svgMin, `standard vs minimal devem diferir para ${t}`);
      assert.notEqual(svgStd, svgMed, `standard vs medieval devem diferir para ${t}`);
      assert.notEqual(svgMin, svgMed, `minimal vs medieval devem diferir para ${t}`);

      // Nenhuma peça deve usar branco puro #fff/#ffffff ou glow/filter artificial
      for (const svg of [svgStd, svgMin, svgMed]) {
        assert.ok(!/#ffffff\b/i.test(svg), `SVG não deve usar branco puro #ffffff (${t})`);
        assert.ok(!/drop-shadow|feGaussianBlur|neon/i.test(svg), `SVG não deve usar glow/bloom (${t})`);
      }
    }
  }
  ok('Peças: exatamente 3 estilos distintos (Padrão, Minimalista, Medieval) × 6 peças × 2 cores = 36 SVGs foscos');
}

// =========================================================================
// 2. TESTE DE ORIGEM VAZIA
// =========================================================================
{
  const S = createClassicState({ mode: 'classic_local' });
  const r = validateClassicMoveArrow(S, 4, 4, 4, 3);
  assert.equal(r.legal, false);
  assert.equal(r.reason, 'empty_origin');
  ok('Seta a partir de casa vazia rejeitada em Setas Legais');
}

// =========================================================================
// 3. CAVALO (L, reto, diagonal, própria peça, inimigo, cravado/xeque)
// =========================================================================
{
  const S = createClassicState({ mode: 'classic_local' });
  // Cavalo branco em b1 (1,7)
  assert.equal(validateClassicMoveArrow(S, 1, 7, 2, 5).legal, true, 'b1->c3 (L) legal');
  assert.equal(validateClassicMoveArrow(S, 1, 7, 0, 5).legal, true, 'b1->a3 (L) legal');
  assert.equal(validateClassicMoveArrow(S, 1, 7, 1, 5).legal, false, 'b1->b3 reto ilegal');
  assert.equal(validateClassicMoveArrow(S, 1, 7, 3, 5).legal, false, 'b1->d3 diagonal ilegal');
  assert.equal(validateClassicMoveArrow(S, 1, 7, 3, 6).legal, false, 'b1->d2 ocupado por peão próprio ilegal');

  // Cavalo capturando inimigo vs Cavalo cravado no próprio Rei
  const pinState = makeCustomState({
    pieces: [
      { t: 'K', o: 0, x: 4, y: 7 }, // e1
      { t: 'N', o: 0, x: 4, y: 6 }, // e2 (cravado pela torre preta em e8!)
      { t: 'R', o: 1, x: 4, y: 0 }, // e8
      { t: 'K', o: 1, x: 0, y: 0 }, // a8
      { t: 'P', o: 1, x: 3, y: 4 }, // d4 (seria captura em L se não estivesse cravado)
    ],
  });
  assert.equal(validateClassicMoveArrow(pinState, 4, 6, 3, 4).legal, false, 'Cavalo cravado não pode mover e deixar Rei em xeque');

  const freeCap = makeCustomState({
    pieces: [
      { t: 'K', o: 0, x: 0, y: 7 },
      { t: 'N', o: 0, x: 4, y: 4 },
      { t: 'P', o: 1, x: 5, y: 2 },
      { t: 'K', o: 1, x: 7, y: 0 },
    ],
  });
  const capRes = validateClassicMoveArrow(freeCap, 4, 4, 5, 2);
  assert.equal(capRes.legal, true);
  assert.equal(capRes.isCapture, true);
  ok('Cavalo: L legal, captura inimiga, rejeita reto/diagonal/peça própria/cravada');
}

// =========================================================================
// 4. BISPO (4 diagonais, bloqueio, captura, horizontal/vertical ilegal)
// =========================================================================
{
  const S = makeCustomState({
    pieces: [
      { t: 'K', o: 0, x: 0, y: 7 },
      { t: 'K', o: 1, x: 7, y: 0 },
      { t: 'B', o: 0, x: 3, y: 4 }, // d4
      { t: 'P', o: 0, x: 5, y: 2 }, // f6 bloqueia NE além de e5
      { t: 'P', o: 1, x: 1, y: 2 }, // b6 capturável em NW
    ],
  });
  assert.equal(validateClassicMoveArrow(S, 3, 4, 4, 3).legal, true, 'd4->e5 NE livre');
  assert.equal(validateClassicMoveArrow(S, 3, 4, 5, 2).legal, false, 'd4->f6 peça própria');
  assert.equal(validateClassicMoveArrow(S, 3, 4, 6, 1).legal, false, 'd4->g7 bloqueado por f6');
  assert.equal(validateClassicMoveArrow(S, 3, 4, 1, 2).legal, true, 'd4->b6 captura NW');
  assert.equal(validateClassicMoveArrow(S, 3, 4, 0, 1).legal, false, 'd4->a7 além da captura bloqueado');
  assert.equal(validateClassicMoveArrow(S, 3, 4, 5, 6).legal, true, 'd4->f2 SE livre');
  assert.equal(validateClassicMoveArrow(S, 3, 4, 1, 6).legal, true, 'd4->b2 SW livre');
  assert.equal(validateClassicMoveArrow(S, 3, 4, 3, 2).legal, false, 'd4->d6 vertical ilegal');
  assert.equal(validateClassicMoveArrow(S, 3, 4, 6, 4).legal, false, 'd4->g4 horizontal ilegal');
  ok('Bispo: 4 diagonais, bloqueio, captura, rejeita horizontal/vertical');
}

// =========================================================================
// 5. TORRE (horizontal, vertical, bloqueio, diagonal ilegal)
// =========================================================================
{
  const S = makeCustomState({
    pieces: [
      { t: 'K', o: 0, x: 0, y: 7 },
      { t: 'K', o: 1, x: 7, y: 0 },
      { t: 'R', o: 0, x: 3, y: 4 },
      { t: 'P', o: 0, x: 3, y: 2 },
    ],
  });
  assert.equal(validateClassicMoveArrow(S, 3, 4, 7, 4).legal, true, 'horizontal livre');
  assert.equal(validateClassicMoveArrow(S, 3, 4, 3, 3).legal, true, 'vertical até antes do bloqueio');
  assert.equal(validateClassicMoveArrow(S, 3, 4, 3, 1).legal, false, 'vertical atravessando peão ilegal');
  assert.equal(validateClassicMoveArrow(S, 3, 4, 5, 2).legal, false, 'diagonal ilegal para Torre');
  ok('Torre: horizontal/vertical, bloqueio, rejeita diagonais');
}

// =========================================================================
// 6. RAINHA (horizontal, vertical, diagonal, bloqueio, salto ilegal)
// =========================================================================
{
  const S = makeCustomState({
    pieces: [
      { t: 'K', o: 0, x: 0, y: 7 },
      { t: 'K', o: 1, x: 7, y: 0 },
      { t: 'Q', o: 0, x: 3, y: 4 },
      { t: 'P', o: 0, x: 5, y: 4 },
    ],
  });
  assert.equal(validateClassicMoveArrow(S, 3, 4, 3, 1).legal, true, 'vertical');
  assert.equal(validateClassicMoveArrow(S, 3, 4, 1, 2).legal, true, 'diagonal');
  assert.equal(validateClassicMoveArrow(S, 3, 4, 6, 4).legal, false, 'bloqueado horizontalmente');
  assert.equal(validateClassicMoveArrow(S, 3, 4, 4, 2).legal, false, 'salto de cavalo ilegal para Rainha');
  ok('Rainha: ortogonal/diagonal, bloqueio, rejeita movimentos inválidos');
}

// =========================================================================
// 7. REI (casas seguras, casas atacadas, roque legal e roque ilegal)
// =========================================================================
{
  const castleOk = makeCustomState({
    pieces: [
      { t: 'K', o: 0, x: 4, y: 7 }, // e1
      { t: 'R', o: 0, x: 7, y: 7 }, // h1
      { t: 'R', o: 0, x: 0, y: 7 }, // a1
      { t: 'K', o: 1, x: 4, y: 0 }, // e8
    ],
    castle: [{ king: true, queen: true }, { king: false, queen: false }],
  });
  assert.equal(validateClassicMoveArrow(castleOk, 4, 7, 6, 7).legal, true, 'Roque pequeno O-O legal');
  assert.equal(validateClassicMoveArrow(castleOk, 4, 7, 6, 7).isCastle, true);
  assert.equal(validateClassicMoveArrow(castleOk, 4, 7, 2, 7).legal, true, 'Roque grande O-O-O legal');

  // Roque passando por casa atacada (f1 atacada por Torre preta em f8) -> ilegal
  const castleBlockedByAttack = makeCustomState({
    pieces: [
      { t: 'K', o: 0, x: 4, y: 7 },
      { t: 'R', o: 0, x: 7, y: 7 },
      { t: 'R', o: 1, x: 5, y: 0 }, // ataca f1
      { t: 'K', o: 1, x: 0, y: 0 },
    ],
    castle: [{ king: true, queen: false }, { king: false, queen: false }],
  });
  assert.equal(validateClassicMoveArrow(castleBlockedByAttack, 4, 7, 6, 7).legal, false, 'Roque atravessando casa atacada ilegal');
  assert.equal(validateClassicMoveArrow(castleBlockedByAttack, 4, 7, 5, 7).legal, false, 'Rei não pode ir para casa atacada f1');
  assert.equal(validateClassicMoveArrow(castleBlockedByAttack, 4, 7, 3, 7).legal, true, 'Rei pode ir para casa segura d1');
  ok('Rei: casas seguras, rejeita casas atacadas, roque legal e roque ilegal');
}

// =========================================================================
// 8. PEÃO (1 casa, 2 casas inicial, bloqueio, captura, en passant válido/expirado/cravado, promoção)
// =========================================================================
{
  const S = createClassicState({ mode: 'classic_local' });
  // Peão branco e2 (4,6)
  assert.equal(validateClassicMoveArrow(S, 4, 6, 4, 5).legal, true, 'e2->e3 legal');
  assert.equal(validateClassicMoveArrow(S, 4, 6, 4, 4).legal, true, 'e2->e4 inicial legal');
  assert.equal(validateClassicMoveArrow(S, 4, 6, 5, 5).legal, false, 'e2->f3 diagonal vazia ilegal');

  // Bloqueio na casa intermediária e na casa destino
  const blockedPawn = makeCustomState({
    pieces: [
      { t: 'K', o: 0, x: 0, y: 7 },
      { t: 'K', o: 1, x: 7, y: 0 },
      { t: 'P', o: 0, x: 4, y: 6 },
      { t: 'N', o: 1, x: 4, y: 5 }, // bloqueia e3
      { t: 'P', o: 0, x: 3, y: 5 }, // d3 (já saiu da inicial)
    ],
  });
  assert.equal(validateClassicMoveArrow(blockedPawn, 4, 6, 4, 5).legal, false, 'avanço 1 casa bloqueado');
  assert.equal(validateClassicMoveArrow(blockedPawn, 4, 6, 4, 4).legal, false, 'avanço 2 casas com intermediária bloqueada');
  assert.equal(validateClassicMoveArrow(blockedPawn, 3, 5, 3, 3).legal, false, 'peão fora da fila inicial não avança 2 casas');

  // En Passant válido -> expirado no lance seguinte
  const epGame = createClassicState({ mode: 'classic_local' });
  assert.equal(applyUciMove(epGame, 'e2e4'), true);
  assert.equal(applyUciMove(epGame, 'a7a6'), true);
  assert.equal(applyUciMove(epGame, 'e4e5'), true);
  assert.equal(applyUciMove(epGame, 'd7d5'), true); // abre en passant em d6 (x=3, y=2)
  const epValid = validateClassicMoveArrow(epGame, 4, 3, 3, 2);
  assert.equal(epValid.legal, true, 'En passant e5->d6 deve ser legal');
  assert.equal(epValid.isEnPassant, true);

  // Peão da mesma cor NÃO pode abusar do en passant do próprio lance
  const selfEp = makeCustomState({
    pieces: [
      { t: 'K', o: 0, x: 0, y: 7 },
      { t: 'K', o: 1, x: 7, y: 0 },
      { t: 'P', o: 0, x: 3, y: 6 }, // d2
      { t: 'P', o: 0, x: 4, y: 4 }, // e4 acabou de andar 2 casas
    ],
    turnOwner: 1,
    enPassant: { x: 4, y: 5 }, // e3
  });
  assert.equal(validateClassicMoveArrow(selfEp, 3, 6, 4, 5).legal, false, 'Peão branco não pode capturar en passant no próprio peão');

  // Expirado após outro lance
  assert.equal(applyUciMove(epGame, 'a2a3'), true);
  assert.equal(applyUciMove(epGame, 'h7h6'), true);
  assert.equal(validateClassicMoveArrow(epGame, 4, 3, 3, 2).legal, false, 'En passant expirado deve ser rejeitado');

  // Promoção
  const promoState = makeCustomState({
    pieces: [
      { t: 'K', o: 0, x: 0, y: 7 },
      { t: 'K', o: 1, x: 7, y: 0 },
      { t: 'P', o: 0, x: 4, y: 1 }, // e7
    ],
  });
  const promoRes = validateClassicMoveArrow(promoState, 4, 1, 4, 0, { promotion: 'N' });
  assert.equal(promoRes.legal, true);
  assert.equal(promoRes.isPromotion, true);
  assert.equal(promoRes.promotion, 'N');
  ok('Peão: 1 casa, 2 casas, bloqueios, captura, en passant válido/próprio/expirado e promoção');
}

// =========================================================================
// 9. PERSPECTIVA (BRANCAS & PRETAS) + SNAPSHOTS HISTÓRICOS
// =========================================================================
{
  for (const flipped of [false, true]) {
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        const [vx, vy] = boardToView(x, y, flipped);
        const [bx, by] = viewToBoard(vx, vy, flipped);
        assert.equal(bx, x);
        assert.equal(by, y);
      }
    }
  }

  // Snapshot histórico preserva enPassant e castle para validação fiel na revisão/análise
  const snaps = reconstructClassicStates(['e2e4', 'a7a6', 'e4e5', 'd7d5']);
  const lastSnap = snaps[snaps.length - 1];
  assert.deepEqual(lastSnap.enPassant, { x: 3, y: 2 });
  assert.equal(lastSnap.castle[0].king, true);
  const grid = Array.from({ length: 8 }, () => Array(8).fill(null));
  for (const p of lastSnap.pieces) grid[p.y][p.x] = p;
  const snapState = { ...lastSnap, grid };
  assert.equal(validateClassicMoveArrow(snapState, 4, 3, 3, 2).legal, true, 'En passant legal no snapshot reconstruído');
  assert.equal(validateClassicMoveArrow(snapState, 1, 7, 1, 5).legal, false, 'Cavalo reto bloqueado no snapshot reconstruído');
  ok('Perspectiva Brancas/Pretas e snapshots históricos (castle/enPassant) validados');
}

// =========================================================================
// 10. VALIDAÇÃO DE TURNO EM SETAS LEGAIS
// =========================================================================
{
  const S = createClassicState({ mode: 'classic_local' }); // turnOwner = 0 (Brancas)
  const blackMoveOnWhiteTurn = validateClassicMoveArrow(S, 1, 0, 2, 2); // Cavalo preto b8->c6
  assert.equal(blackMoveOnWhiteTurn.legal, false, 'Setas Legais devem respeitar o turno atual');
  assert.equal(blackMoveOnWhiteTurn.reason, 'wrong_turn');
  assert.deepEqual(getLegalArrowTargets(S, 1, 0), [], 'Sem destinos legais para peça fora do turno');
  ok('Setas Legais respeitam o turno atual e rejeitam peças do lado inativo');
}

// =========================================================================
// 11. MARCAÇÃO LIVRE: EXIGE PEÇA NA ORIGEM E RESPEITA GEOMETRIA DE TODAS AS 6 PEÇAS
// =========================================================================
{
  const S = createClassicState({ mode: 'classic_local' });

  // 11.1 Origem vazia rejeitada
  const emptyRes = validateFreeMoveArrow(S, 4, 4, 4, 3);
  assert.equal(emptyRes.legal, false, 'Marcação Livre exige peça na origem');
  assert.equal(emptyRes.reason, 'empty_origin');
  assert.deepEqual(getFreeArrowTargets(S, 4, 4), []);

  // 11.2 Cavalo (N): só em L, inclusive ignorando ocupação (d2 tem peão branco), nunca reto/diagonal
  assert.equal(validateFreeMoveArrow(S, 1, 7, 2, 5).legal, true, 'Cavalo livre b1->c3 (L)');
  assert.equal(validateFreeMoveArrow(S, 1, 7, 3, 6).legal, true, 'Cavalo livre b1->d2 (L ignorando ocupação própria)');
  assert.equal(validateFreeMoveArrow(S, 1, 7, 1, 5).legal, false, 'Cavalo livre b1->b3 reto PROIBIDO');
  assert.equal(validateFreeMoveArrow(S, 1, 7, 3, 5).legal, false, 'Cavalo livre b1->d3 diagonal PROIBIDO');
  assert.equal(validateFreeMoveArrow(S, 1, 0, 2, 2).legal, true, 'Cavalo preto livre b8->c6 (ignora turno)');

  // 11.3 Bispo (B): só diagonais (ignorando bloqueio), nunca horizontal/vertical
  assert.equal(validateFreeMoveArrow(S, 2, 7, 5, 4).legal, true, 'Bispo livre c1->f4 diagonal atravessando peão');
  assert.equal(validateFreeMoveArrow(S, 2, 7, 2, 4).legal, false, 'Bispo livre c1->c4 vertical PROIBIDO');
  assert.equal(validateFreeMoveArrow(S, 2, 7, 5, 7).legal, false, 'Bispo livre c1->f1 horizontal PROIBIDO');

  // 11.4 Torre (R): só horizontal/vertical (ignorando bloqueio), nunca diagonal
  assert.equal(validateFreeMoveArrow(S, 0, 7, 0, 2).legal, true, 'Torre livre a1->a6 vertical atravessando peão');
  assert.equal(validateFreeMoveArrow(S, 0, 7, 5, 7).legal, true, 'Torre livre a1->f1 horizontal atravessando peças');
  assert.equal(validateFreeMoveArrow(S, 0, 7, 3, 4).legal, false, 'Torre livre a1->d4 diagonal PROIBIDO');

  // 11.5 Rainha (Q): horizontal, vertical ou diagonal (ignorando bloqueio), nunca salto de cavalo
  assert.equal(validateFreeMoveArrow(S, 3, 7, 3, 1).legal, true, 'Rainha livre d1->d7 vertical');
  assert.equal(validateFreeMoveArrow(S, 3, 7, 7, 3).legal, true, 'Rainha livre d1->h5 diagonal');
  assert.equal(validateFreeMoveArrow(S, 3, 7, 4, 5).legal, false, 'Rainha livre d1->e3 em L PROIBIDO');

  // 11.6 Rei (K): 1 casa em qualquer direção + roque na casa inicial, nunca 2+ casas fora do roque
  assert.equal(validateFreeMoveArrow(S, 4, 7, 4, 6).legal, true, 'Rei livre e1->e2 (1 casa)');
  assert.equal(validateFreeMoveArrow(S, 4, 7, 6, 7).legal, true, 'Rei livre e1->g1 (roque pequeno)');
  assert.equal(validateFreeMoveArrow(S, 4, 7, 2, 7).legal, true, 'Rei livre e1->c1 (roque grande)');
  assert.equal(validateFreeMoveArrow(S, 4, 7, 4, 5).legal, false, 'Rei livre e1->e3 (2 casas vertical) PROIBIDO');
  assert.equal(validateFreeMoveArrow(S, 4, 7, 6, 5).legal, false, 'Rei livre e1->g3 (2 casas diagonal) PROIBIDO');

  // 11.7 Peão (P): direção por cor, 1 casa, 2 casas na fila inicial, diagonal à frente como intenção de captura, nunca para trás ou lateral
  // Peão branco em e2 (4,6)
  assert.equal(validateFreeMoveArrow(S, 4, 6, 4, 5).legal, true, 'Peão branco livre e2->e3');
  assert.equal(validateFreeMoveArrow(S, 4, 6, 4, 4).legal, true, 'Peão branco livre e2->e4 (fila inicial)');
  assert.equal(validateFreeMoveArrow(S, 4, 6, 5, 5).legal, true, 'Peão branco livre e2->f3 (diagonal captura)');
  assert.equal(validateFreeMoveArrow(S, 4, 6, 4, 7).legal, false, 'Peão branco livre para trás PROIBIDO');
  assert.equal(validateFreeMoveArrow(S, 4, 6, 5, 6).legal, false, 'Peão branco livre lateral PROIBIDO');
  assert.equal(validateFreeMoveArrow(S, 4, 6, 4, 3).legal, false, 'Peão branco livre 3 casas PROIBIDO');

  // Peão preto em d7 (3,1) - direção oposta!
  assert.equal(validateFreeMoveArrow(S, 3, 1, 3, 2).legal, true, 'Peão preto livre d7->d6');
  assert.equal(validateFreeMoveArrow(S, 3, 1, 3, 3).legal, true, 'Peão preto livre d7->d5 (fila inicial)');
  assert.equal(validateFreeMoveArrow(S, 3, 1, 2, 2).legal, true, 'Peão preto livre d7->c6 (diagonal captura)');
  assert.equal(validateFreeMoveArrow(S, 3, 1, 3, 0).legal, false, 'Peão preto livre para trás PROIBIDO');

  // Peão fora da fila inicial NÃO pode andar 2 casas na Marcação Livre
  const advancedPawn = makeCustomState({
    pieces: [
      { t: 'K', o: 0, x: 4, y: 7 },
      { t: 'K', o: 1, x: 4, y: 0 },
      { t: 'P', o: 0, x: 4, y: 4 }, // e4
    ],
  });
  assert.equal(validateFreeMoveArrow(advancedPawn, 4, 4, 4, 2).legal, false, 'Peão fora da fila inicial não avança 2 casas');
  assert.equal(validateFreeMoveArrow(advancedPawn, 4, 4, 4, 3).legal, true, 'Peão em e4 avança 1 casa para e5');

  ok('Marcação Livre: exige peça na origem e impõe geometria exata para Cavalo, Bispo, Torre, Rainha, Rei e Peão (Brancas e Pretas)');
}

// =========================================================================
// 12. INDICADORES DE MOVIMENTOS LEGAIS (getClassicMoves PARA TODAS AS PEÇAS)
// =========================================================================
{
  const S = createClassicState({ mode: 'classic_local' });
  // Cavalo b1 -> apenas a3 e c3
  const knightMoves = getClassicMoves(S, S.grid[7][1]);
  assert.equal(knightMoves.length, 2, 'Cavalo inicial deve ter exatamente 2 lances legais');
  // Peão e2 -> apenas e3 e e4
  const pawnMoves = getClassicMoves(S, S.grid[6][4]);
  assert.equal(pawnMoves.length, 2, 'Peão inicial deve ter exatamente 2 lances legais');
  // Torre a1 -> bloqueada inicialmente (0 lances)
  assert.equal(getClassicMoves(S, S.grid[7][0]).length, 0, 'Torre bloqueada tem 0 lances');
  // Bispo c1 -> bloqueado inicialmente (0 lances)
  assert.equal(getClassicMoves(S, S.grid[7][2]).length, 0, 'Bispo bloqueado tem 0 lances');
  // Rainha d1 -> bloqueada inicialmente (0 lances)
  assert.equal(getClassicMoves(S, S.grid[7][3]).length, 0, 'Rainha bloqueada tem 0 lances');
  // Rei e1 -> bloqueado inicialmente (0 lances)
  assert.equal(getClassicMoves(S, S.grid[7][4]).length, 0, 'Rei bloqueado tem 0 lances');
  ok('Indicadores de movimentos legais (getClassicMoves) validados na posição inicial para todas as 6 peças');
}

console.log(`\nALL ${passed} PIECE & ARROW TEST SUITES PASSED!`);
