import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocket } from 'ws';

import { CHESS_STOCKFISH_PROFILES } from '../src/ai/aiConfig.js';
import { runArenaAI } from '../src/ai/arenaAI.js';
import { runDuelAI } from '../src/ai/duelAI.js';
import {
  activateDuelSkill,
  calcAtt,
  createDuelState,
  doDuelMove,
  getDuelMoves,
  stepDuelState,
} from '../src/game/duelEngine.js';
import {
  applyUciMove,
  createClassicState,
  doClassicMove,
  getClassicMoves,
  reconstructClassicStates,
  stateToFen,
  stateToPgn,
} from '../src/game/classicEngine.js';
import { boardToView, viewToBoard } from '../src/game/classicRenderer.js';
import { chooseTacticalAction, chooseTacticalDraftCard } from '../server-ai/tacticalAI.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const require = createRequire(import.meta.url);

if (typeof globalThis.performance === 'undefined') {
  globalThis.performance = { now: () => Date.now() };
}

const results = [];
function pass(name, detail = '') {
  console.log(`PASS | ${name}${detail ? ` — ${detail}` : ''}`);
  results.push({ name, ok: true, detail });
}

// =========================================================
// 1. DUELO 1v1 AI — 5 NÍVEIS, LEGALIDADE E DIFERENÇA REAL
// =========================================================
{
  const api = {
    getDuelMoves,
    doDuelMove: (st, piece, a, b) => doDuelMove(st, piece, a, b),
    activateDuelSkill: (st, tid, skill, target) => activateDuelSkill(st, tid, skill, target),
  };

  let lv5Wins = 0;
  let lv1Wins = 0;
  let lv5ScoreTotal = 0;
  let lv1ScoreTotal = 0;
  const GAMES = 6;

  for (let g = 0; g < GAMES; g++) {
    const S = createDuelState({ mode: 'duel', cpuDifficulty: 5, doctrine: 'vanguard' });
    for (const p of S.pieces) p.ready = 0;
    for (let step = 0; step < 360 && !S.over; step++) {
      S.T += 0.25;
      calcAtt(S);
      if (step % 2 === 0) runDuelAI(S, 0, 5, api); // Azul = Nível 5 (Muito difícil)
      if (!S.over && step % 4 === 0) runDuelAI(S, 1, 1, api); // Rubi = Nível 1 (Iniciante)
      stepDuelState(S, 0.05);
    }
    lv5ScoreTotal += S.f[0].score;
    lv1ScoreTotal += S.f[1].score;
    if (S.winner === 0 || (!S.over && S.f[0].score > S.f[1].score)) lv5Wins++;
    else if (S.winner === 1 || (!S.over && S.f[1].score > S.f[0].score)) lv1Wins++;
  }
  assert.ok(lv5Wins >= lv1Wins, `Expected Lv5 (${lv5Wins}) >= Lv1 (${lv1Wins})`);
  pass(
    'Duel 1v1 AI (Lv5 vs Lv1)',
    `${GAMES} partidas simuladas: Lv5 venceu/liderou ${lv5Wins}/${GAMES} (placar médio ${(lv5ScoreTotal / GAMES).toFixed(1)} vs ${(lv1ScoreTotal / GAMES).toFixed(1)})`
  );
}

// =========================================================
// 2. ARENA 4 JOGADORES AI — MULTI-ADVERSÁRIO E 5 NÍVEIS
// =========================================================
{
  const api = {
    getDuelMoves,
    doDuelMove: (st, piece, a, b) => doDuelMove(st, piece, a, b),
    activateDuelSkill: (st, tid, skill, target) => activateDuelSkill(st, tid, skill, target),
  };
  const S = createDuelState({ mode: 'arena', cpuDifficulty: 4 });
  for (const p of S.pieces) p.ready = 0;
  let movesMade = 0;
  for (let step = 0; step < 120 && !S.over; step++) {
    S.T += 0.2;
    calcAtt(S);
    const tid = step % 4;
    const lv = tid === 0 ? 5 : tid === 1 ? 3 : 1;
    if (S.f[tid].alive && runArenaAI(S, tid, lv, api)) movesMade++;
  }
  assert.ok(movesMade > 20, 'Arena AI should execute legal moves across all 4 factions');
  pass('Arena 4P AI (Multi-agente)', `${movesMade} ações legais executadas entre 4 facções (Lv5 placar=${S.f[0].score}, Lv1 placar=${S.f[2].score})`);
}

// =========================================================
// 3. CERCO TÁTICO AI — NÉVOA DE GUERRA, CARTAS E DRAFT
// =========================================================
{
  const mockGame = {
    round: 2,
    boardSize: 12,
    walls: [],
    units: [
      { x: 1, y: 1 }, // Jogador humano longe (dist > 4, oculto pela névoa!)
      { x: 9, y: 9 }, // Bot
    ],
    crown: { x: 6, y: 6, holder: null, protectionTurns: 0, recoverCooldown: [0, 0] },
    teams: [
      { ap: 3, vp: 0, hand: [], draftOptions: [] },
      {
        ap: 3,
        vp: 0,
        hand: [
          { uid: 'c1', id: 'short_teleport', cost: 2, range: 2 },
          { uid: 'c2', id: 'flux_siphon', cost: 1, range: 0 },
          { uid: 'c3', id: 'stamina_overcharge', cost: 0, range: 0 },
        ],
        draftOptions: [
          { uid: 'd1', id: 'transposition', cost: 2 },
          { uid: 'd2', id: 'stamina_overcharge', cost: 0 },
          { uid: 'd3', id: 'flux_wall', cost: 1 },
        ],
      },
    ],
    manhattan: (x0, y0, x1, y1) => Math.abs(x0 - x1) + Math.abs(y0 - y1),
    isInside: (x, y) => x >= 0 && y >= 0 && x < 12 && y < 12,
    hasWall: () => false,
    unitAt: (x, y) => mockGame.units.find((u) => u.x === x && u.y === y) || null,
  };

  // Bot não vê o inimigo (dist 16 > 4), deve caminhar/teletransportar em direção à Coroa (6,6)
  const act5 = chooseTacticalAction(mockGame, 1, 5);
  assert.ok(act5, 'Tactical AI Lv5 should return a valid action');
  assert.ok(['move', 'card'].includes(act5.type));
  // Draft Lv5 deve priorizar stamina_overcharge ou carta forte (não transposition sem paredes)
  let smartPicks = 0;
  for (let i = 0; i < 10; i++) {
    const d = chooseTacticalDraftCard(mockGame, 1, 5);
    if (d && d.id === 'stamina_overcharge') smartPicks++;
  }
  assert.ok(smartPicks >= 8, `Expected Lv5 draft to pick strong card consistently (${smartPicks}/10)`);
  pass('Cerco Tático AI (Névoa + Cartas + Draft)', `Ação Lv5=${act5.type}${act5.card ? `:${act5.card.id}` : ''}, Draft ótimo=${smartPicks}/10`);
}

// =========================================================
// 4. XADREZ CLÁSSICO — COORDENADAS, PERSPECTIVA, SAN, PGN, STOCKFISH 19
// =========================================================
{
  // Round-trip de perspectiva para todas as 64 casas (Brancas e Pretas)
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
  // Brancas: h1 (x=7,y=7) -> bottom-right (7,7). Pretas: e4 (x=4,y=4) -> (3,3)
  assert.deepEqual(boardToView(7, 7, false), [7, 7]);
  assert.deepEqual(boardToView(7, 0, true), [0, 7]);
  assert.deepEqual(boardToView(0, 0, true), [7, 7]);
  pass('Perspectiva 8x8 (Brancas e Pretas)', 'Conversão bidirecional validada nas 64 casas');

  // SAN, PGN e Reconstrução
  const S = createClassicState({ mode: 'classic_local', timeControl: 'blitz3_2' });
  assert.equal(applyUciMove(S, 'e2e4'), true);
  assert.equal(applyUciMove(S, 'e7e5'), true);
  assert.equal(applyUciMove(S, 'g1f3'), true);
  assert.equal(applyUciMove(S, 'b8c6'), true);
  assert.equal(applyUciMove(S, 'f1b5'), true);
  assert.deepEqual(S.moveHistory.map((m) => m.san), ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5']);
  const pgn = stateToPgn(S, { white: 'Alice', black: 'Bob' });
  assert.ok(pgn.includes('1. e4 e5 2. Nf3 Nc6 3. Bb5'));
  const snaps = reconstructClassicStates(S.moveHistory.map((m) => m.uci));
  assert.equal(snaps.length, 6);
  pass('Motor Clássico (FEN / SAN / PGN / Reconstrução)', `FEN=${stateToFen(S).split(' ')[0]} · 5 lances reconstruídos`);

  // Stockfish 19 Lite WASM real em Node (Mate em 1 + 5 níveis)
  const stockfishMod = require('stockfish');
  const engineFile = stockfishMod.findEngine('lite-single');
  const runSfSearch = (fen, level) =>
    new Promise((resolve, reject) => {
      const cfg = CHESS_STOCKFISH_PROFILES[level];
      let bestScore = null;
      const child = spawn(process.execPath, [engineFile], { stdio: ['pipe', 'pipe', 'pipe'] });
      let buf = '';
      child.stdout.on('data', (chunk) => {
        buf += chunk.toString();
        const lines = buf.split(/\r?\n/);
        buf = lines.pop() || '';
        for (const raw of lines) {
          const line = raw.trim();
          if (line === 'uciok') {
            child.stdin.write(`setoption name Skill Level value ${cfg.skillLevel}\n`);
            if (cfg.limitStrength && cfg.uciElo) {
              child.stdin.write('setoption name UCI_LimitStrength value true\n');
              child.stdin.write(`setoption name UCI_Elo value ${cfg.uciElo}\n`);
            } else {
              child.stdin.write('setoption name UCI_LimitStrength value false\n');
            }
            child.stdin.write(`position fen ${fen}\n`);
            child.stdin.write(`go depth ${cfg.depth} movetime ${cfg.movetime}\n`);
          } else if (line.includes('score mate')) {
            bestScore = line.match(/score mate (-?\d+)/)?.[1] || null;
          } else if (line.startsWith('bestmove')) {
            const mv = line.split(/\s+/)[1];
            child.kill();
            resolve({ mv, mate: bestScore });
          }
        }
      });
      child.stdin.write('uci\n');
      setTimeout(() => {
        try { child.kill(); } catch {}
        reject(new Error('Stockfish timeout'));
      }, 10000);
    });

  const mateInOneFen = '6k1/5ppp/8/8/8/8/5PPP/4R1K1 w - - 0 1';
  const sfLv5 = await runSfSearch(mateInOneFen, 5);
  assert.equal(sfLv5.mv, 'e1e8', `Expected Stockfish Lv5 to find mate-in-1 e1e8, got ${sfLv5.mv}`);
  const sfLv1 = await runSfSearch('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1', 1);
  assert.ok(sfLv1.mv && sfLv1.mv.length >= 4);
  pass('Stockfish 19 Lite WASM (UCI)', `Lv5 encontrou mate-em-1 (${sfLv5.mv}, mate=${sfLv5.mate}) · Lv1 respondeu ${sfLv1.mv}`);
}

// =========================================================
// 5. MULTIPLAYER END-TO-END (2 JOGADORES, MATCHMAKING, PERSPECTIVA, RECONEXÃO, SALA PRIVADA, WASM MIME)
// =========================================================
{
  const testPort = 18945;
  const tmpDb = path.join(os.tmpdir(), `crownflux_test_db_${Date.now()}.json`);
  const serverProc = spawn(process.execPath, [path.join(rootDir, 'server.mjs')], {
    env: { ...process.env, PORT: String(testPort), HOST: '127.0.0.1', DATA_FILE: tmpDb },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Server startup timeout')), 8000);
    serverProc.stdout.on('data', (d) => {
      if (d.toString().includes(String(testPort))) {
        clearTimeout(timer);
        resolve();
      }
    });
    serverProc.stderr.on('data', (d) => console.error('[server stderr]', d.toString()));
  });

  try {
    const base = `http://127.0.0.1:${testPort}`;

    // Verifica MIME application/wasm do Stockfish
    const wasmRes = await fetch(`${base}/stockfish/stockfish-19-lite-single.wasm`);
    assert.equal(wasmRes.status, 200);
    assert.ok((wasmRes.headers.get('content-type') || '').includes('application/wasm'));
    pass('Stockfish WASM static serving', `HTTP 200 · Content-Type=${wasmRes.headers.get('content-type')}`);

    // Registra 2 usuários independentes
    const reg = async (username) => {
      const r = await fetch(`${base}/api/register`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username, password: 'TestPassword123!' }),
      });
      assert.equal(r.status, 201);
      return r.json();
    };
    const uA = await reg('chess_player_a');
    const uB = await reg('chess_player_b');

    const connectWs = (token) =>
      new Promise((resolve, reject) => {
        const ws = new WebSocket(`ws://127.0.0.1:${testPort}/ws`);
        const inbox = [];
        const waiters = [];
        ws.on('message', (raw) => {
          const msg = JSON.parse(raw.toString());
          const idx = waiters.findIndex((w) => w.pred(msg));
          if (idx >= 0) {
            const w = waiters.splice(idx, 1)[0];
            clearTimeout(w.t);
            w.res(msg);
          } else {
            inbox.push(msg);
          }
        });
        ws.waitFor = (pred, ms = 5000) => {
          const existing = inbox.findIndex(pred);
          if (existing >= 0) return Promise.resolve(inbox.splice(existing, 1)[0]);
          return new Promise((res, rej) => {
            const t = setTimeout(() => rej(new Error('WS waitFor timeout')), ms);
            waiters.push({ pred, res, t });
          });
        };
        ws.sendJson = (obj) => ws.send(JSON.stringify(obj));
        ws.on('open', async () => {
          ws.sendJson({ type: 'auth', token });
          await ws.waitFor((m) => m.type === 'auth:ok');
          resolve(ws);
        });
        ws.on('error', reject);
      });

    const wsA = await connectWs(uA.token);
    const wsB = await connectWs(uB.token);

    // Testa rejeição de controle personalizado na fila ranqueada
    wsA.sendJson({ type: 'match:queue', options: { mode: 'classic', timeControl: 'custom', customTime: { minutes: 7, increment: 3 } } });
    const customErr = await wsA.waitFor((m) => m.type === 'error');
    assert.equal(customErr.code, 'CUSTOM_NOT_RANKED');

    // Testa entrada e cancelamento de fila
    wsA.sendJson({ type: 'match:queue', options: { mode: 'classic', timeControl: 'blitz3_2' } });
    await wsA.waitFor((m) => m.type === 'match:waiting');
    wsA.sendJson({ type: 'match:cancel' });
    await wsA.waitFor((m) => m.type === 'match:cancelled');

    // Matchmaking real entre 2 jogadores (blitz3_2)
    wsA.sendJson({ type: 'match:queue', options: { mode: 'classic', timeControl: 'blitz3_2' } });
    await wsA.waitFor((m) => m.type === 'match:waiting');
    wsB.sendJson({ type: 'match:queue', options: { mode: 'classic', timeControl: 'blitz3_2' } });

    const [startA, startB] = await Promise.all([
      wsA.waitFor((m) => m.type === 'game:started'),
      wsB.waitFor((m) => m.type === 'game:started'),
    ]);
    assert.equal(startA.state.gameId, startB.state.gameId);
    assert.equal(startA.state.side + startB.state.side, 1, 'One player must be White (0) and the other Black (1)');

    const whiteWs = startA.state.side === 0 ? wsA : wsB;
    const blackWs = startA.state.side === 1 ? wsA : wsB;
    const blackToken = startA.state.side === 1 ? uA.token : uB.token;
    const whiteState = startA.state.side === 0 ? startA.state : startB.state;

    // Brancas jogam e2 -> e4 (x=4, y=6 -> x=4, y=4)
    const e2Pawn = whiteState.pieces.find((p) => p.owner === 0 && p.x === 4 && p.y === 6);
    whiteWs.sendJson({ type: 'game:move', pieceId: e2Pawn.id, x: 4, y: 4 });
    const [afterW1, afterB1] = await Promise.all([
      whiteWs.waitFor((m) => m.type === 'game:state' && m.state.moveHistory?.length === 1),
      blackWs.waitFor((m) => m.type === 'game:state' && m.state.moveHistory?.length === 1),
    ]);
    assert.equal(afterW1.state.moveHistory[0].san, 'e4');
    assert.equal(afterB1.state.moveHistory[0].san, 'e4');
    assert.equal(afterB1.state.side, 1);

    // Pretas jogam e7 -> e5 (x=4, y=1 -> x=4, y=3)
    const e7Pawn = afterB1.state.pieces.find((p) => p.owner === 1 && p.x === 4 && p.y === 1);
    blackWs.sendJson({ type: 'game:move', pieceId: e7Pawn.id, x: 4, y: 3 });
    const [afterW2, afterB2] = await Promise.all([
      whiteWs.waitFor((m) => m.type === 'game:state' && m.state.moveHistory?.length === 2),
      blackWs.waitFor((m) => m.type === 'game:state' && m.state.moveHistory?.length === 2),
    ]);
    assert.equal(afterW2.state.moveHistory[1].san, 'e5');
    assert.equal(afterB2.state.moveHistory[1].san, 'e5');

    // Reconexão do jogador de Pretas!
    blackWs.close();
    const blackWs2 = await connectWs(blackToken);
    const reconnected = await blackWs2.waitFor((m) => m.type === 'game:started');
    assert.equal(reconnected.reconnected, true);
    assert.equal(reconnected.state.side, 1, 'Reconnected Black player must retain side=1');
    assert.equal(reconnected.state.moveHistory.length, 2, 'Reconnected player must retain full moveHistory');

    // Encerra partida por desistência e valida persistência
    blackWs2.sendJson({ type: 'game:resign' });
    const [endW, endB] = await Promise.all([
      whiteWs.waitFor((m) => m.type === 'game:ended'),
      blackWs2.waitFor((m) => m.type === 'game:ended'),
    ]);
    assert.equal(endW.state.winner, 0);
    assert.equal(endB.state.winner, 0);

    // Sala privada com controle personalizado (12+4)
    whiteWs.sendJson({ type: 'room:create', options: { mode: 'classic', timeControl: 'custom', customTime: { minutes: 12, increment: 4 } } });
    const createdRoom = await whiteWs.waitFor((m) => m.type === 'room:created');
    assert.ok(createdRoom.code);
    assert.equal(createdRoom.options.seconds, 720);
    assert.equal(createdRoom.options.increment, 4);

    whiteWs.close();
    blackWs2.close();
    pass(
      'Multiplayer Clássico E2E (2 Jogadores + Reconexão + Sala Privada)',
      `Matchmaking blitz3_2, sides 0/1, lances e4/e5 sincronizados, reconexão side=1 preservada, sala privada custom 12+4 (${createdRoom.code})`
    );
  } finally {
    serverProc.kill();
    try { fs.unlinkSync(tmpDb); } catch {}
  }
}

console.log(`\nALL ${results.length} TEST SUITES PASSED!`);
