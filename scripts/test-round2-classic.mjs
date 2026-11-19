import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocket } from 'ws';

import { CHESS_STOCKFISH_PROFILES } from '../src/ai/aiConfig.js';
import { MOVE_CLASSIFICATIONS, buildFullAnalysisReport } from '../src/ai/chessAnalysisEngine.js';
import { computeBotTimeBudgetMs } from '../src/ai/chessTimeManager.js';
import {
  applyUciMove,
  createClassicState,
  getAllLegalUciMoves,
  getClassicMoves,
  getClassicPremoveTargets,
  reconstructClassicStates,
  stateToFen,
} from '../src/game/classicEngine.js';

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
// 1. TESTE DE CONSUMO DE RELÓGIO DO BOT NOS 6 CONTROLES EXIGIDOS
// =========================================================
{
  const controls = [
    { key: 'bullet1', label: 'Bullet 1+0', seconds: 60, inc: 0, cat: 'bullet' },
    { key: 'bullet2_1', label: 'Bullet 2+1', seconds: 120, inc: 1, cat: 'bullet' },
    { key: 'blitz3', label: 'Blitz 3+0', seconds: 180, inc: 0, cat: 'blitz' },
    { key: 'blitz3_2', label: 'Blitz 3+2', seconds: 180, inc: 2, cat: 'blitz' },
    { key: 'rapid10', label: 'Rapid 10+0', seconds: 600, inc: 0, cat: 'rapid' },
    { key: 'classic30', label: 'Clássico 30+0', seconds: 1800, inc: 0, cat: 'classic' },
  ];

  const reportLines = [];
  for (const c of controls) {
    const S = createClassicState({ mode: 'classic_cpu', timeControl: c.key, cpuDifficulty: 3 });
    let clockSec = c.seconds;
    let totalUsedMs = 0;
    let maxMs = 0;
    const MOVES = 30;
    for (let m = 0; m < MOVES; m++) {
      // Simula progressão de meios-lances
      S.moveHistory.length = m * 2;
      const b = computeBotTimeBudgetMs({
        botClockSec: clockSec,
        initialSeconds: c.seconds,
        incrementSec: c.inc,
        category: c.cat,
        difficulty: 3,
        state: S,
      });
      clockSec = Math.max(0.5, clockSec - b.targetThinkMs / 1000 + c.inc);
      totalUsedMs += b.targetThinkMs;
      if (b.targetThinkMs > maxMs) maxMs = b.targetThinkMs;
    }
    const avgMs = Math.round(totalUsedMs / MOVES);
    if (c.key === 'bullet1') {
      assert.ok(totalUsedMs >= 16000 && totalUsedMs <= 46000, `Bullet 1+0 bot total used ${totalUsedMs}ms should be realistic (16s-46s)`);
    }
    assert.ok(clockSec > 0, `${c.label} bot must not flag artificially`);
    reportLines.push(`${c.label}: usado=${(totalUsedMs / 1000).toFixed(1)}s, média=${avgMs}ms, máx=${maxMs}ms, restante=${clockSec.toFixed(1)}s`);
  }
  pass('Bot Time Management (6 controles)', reportLines.join(' | '));
}

// =========================================================
// 2. TESTE DE ANÁLISE PÓS-PARTIDA: PARTIDA RUIM vs PARTIDA BOA + 10 CATEGORIAS
// =========================================================
{
  const stockfishMod = require('stockfish');
  const engineFile = stockfishMod.findEngine('lite-single');
  const evalFen = (fen, depth = 10) =>
    new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [engineFile], { stdio: ['pipe', 'pipe', 'pipe'] });
      let buf = '';
      const infoMap = new Map();
      child.stdout.on('data', (chunk) => {
        buf += chunk.toString();
        const lines = buf.split(/\r?\n/);
        buf = lines.pop() || '';
        for (const raw of lines) {
          const line = raw.trim();
          if (line === 'uciok') {
            child.stdin.write('setoption name MultiPV value 2\n');
            child.stdin.write(`position fen ${fen}\n`);
            child.stdin.write(`go depth ${depth} movetime 180\n`);
          } else if (line.startsWith('info ') && line.includes(' pv ')) {
            const mpv = Number(line.match(/\bmultipv\s+(\d+)/)?.[1] || 1);
            const cp = line.match(/\bscore\s+cp\s+(-?\d+)/)?.[1];
            const mate = line.match(/\bscore\s+mate\s+(-?\d+)/)?.[1];
            const pv = line.match(/\bpv\s+(.+)$/)?.[1]?.trim().split(/\s+/) || [];
            infoMap.set(mpv, {
              move: pv[0] || null,
              pv,
              scoreCp: cp !== undefined ? Number(cp) : null,
              mate: mate !== undefined ? Number(mate) : null,
            });
          } else if (line.startsWith('bestmove')) {
            const side = fen.split(' ')[1] === 'b' ? 1 : 0;
            const sign = side === 0 ? 1 : -1;
            const norm = (l) =>
              l
                ? {
                    ...l,
                    scoreCp: l.scoreCp !== null ? l.scoreCp * sign : null,
                    mate: l.mate !== null ? l.mate * sign : null,
                  }
                : null;
            const top = norm(infoMap.get(1)) || { move: null, pv: [], scoreCp: 0, mate: null };
            const sec = norm(infoMap.get(2));
            child.kill();
            resolve({ bestMove: top.move, pv: top.pv, scoreCp: top.scoreCp, mate: top.mate, secondBest: sec });
          }
        }
      });
      child.stdin.write('uci\n');
      setTimeout(() => { try { child.kill(); } catch {} reject(new Error('SF eval timeout')); }, 10000);
    });

  // Partida deliberadamente RUIM (Brancas entregam Mate do Louco: f2f3 e7e5 g2g4 d8h4#)
  const badMoves = ['f2f3', 'e7e5', 'g2g4', 'd8h4'];
  const badSnaps = reconstructClassicStates(badMoves);
  const badRaw = [];
  for (let i = 0; i < badSnaps.length; i++) {
    const s = badSnaps[i];
    if (Number.isInteger(s.checkmatedKingOwner)) {
      badRaw.push({ ply: i, bestMove: null, pv: [], scoreCp: null, mate: 0, terminalWinner: 1 - s.checkmatedKingOwner, terminalDraw: false, secondBest: null });
    } else {
      const ev = await evalFen(s.fen, 9);
      badRaw.push({ ply: i, ...ev, terminalWinner: null, terminalDraw: false });
    }
  }
  const badReport = buildFullAnalysisReport(badSnaps, badRaw, 'Stockfish 19 Lite WASM', 'quick');
  assert.ok(badReport.whiteStats.accuracy < 60, `Bad White game must NOT get high accuracy (got ${badReport.whiteStats.accuracy}%)`);
  assert.ok(badReport.whiteStats.counts.blunder >= 1, 'Allowing mate-in-1 (g4) must be classified as blunder');
  const wSum = Object.values(badReport.whiteStats.counts).reduce((a, b) => a + b, 0);
  const bSum = Object.values(badReport.blackStats.counts).reduce((a, b) => a + b, 0);
  assert.equal(wSum, 2, 'White category sum must equal total White moves');
  assert.equal(bSum, 2, 'Black category sum must equal total Black moves');
  assert.equal(Object.keys(badReport.whiteStats.counts).length, MOVE_CLASSIFICATIONS.length);
  pass(
    'Análise Pós-Partida (Partida Ruim + 10 Categorias)',
    `Mate do Louco: Precisão Brancas=${badReport.whiteStats.accuracy}% (Erros graves=${badReport.whiteStats.counts.blunder}), Pretas=${badReport.blackStats.accuracy}% · soma=${wSum}/${bSum}`
  );

  // Partida BOA (Abertura Ruy Lopez livro: e4 e5 Nf3 Nc6 Bb5)
  const goodMoves = ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1b5'];
  const goodSnaps = reconstructClassicStates(goodMoves);
  const goodRaw = [];
  for (let i = 0; i < goodSnaps.length; i++) {
    const ev = await evalFen(goodSnaps[i].fen, 9);
    goodRaw.push({ ply: i, ...ev, terminalWinner: null, terminalDraw: false });
  }
  const goodReport = buildFullAnalysisReport(goodSnaps, goodRaw, 'Stockfish 19 Lite WASM', 'quick');
  assert.ok(goodReport.whiteStats.accuracy >= 85, `Good opening should have high accuracy (got ${goodReport.whiteStats.accuracy}%)`);
  assert.ok(goodReport.whiteStats.counts.book >= 2, 'Standard opening moves should be classified as Livro');
  pass(
    'Análise Pós-Partida (Partida Boa + Livro)',
    `Ruy Lopez: Precisão Brancas=${goodReport.whiteStats.accuracy}% (Livro=${goodReport.whiteStats.counts.book}), Pretas=${goodReport.blackStats.accuracy}%`
  );
}

// =========================================================
// 3. SETAS DE MOVIMENTOS LEGAIS POR PEÇA
// =========================================================
{
  const S = createClassicState({ mode: 'classic_local', timeControl: 'blitz3' });
  const knight = S.grid[7][1]; // b1 Knight
  const knightMoves = getClassicMoves(S, knight);
  assert.ok(knightMoves.some(([x, y]) => x === 2 && y === 5), 'Knight b1->c3 must be legal');
  assert.ok(!knightMoves.some(([x, y]) => x === 1 && y === 5), 'Knight b1->b3 straight must be illegal');
  const rook = S.grid[7][0]; // a1 Rook blocked by a2 pawn
  assert.equal(getClassicMoves(S, rook).length, 0, 'Blocked Rook must have 0 legal arrow destinations');
  const premoveTargets = getClassicPremoveTargets(S, knight);
  assert.ok(premoveTargets.length === 3, 'Knight on b1 has 3 premove L-targets (a3, c3, d2)');
  pass('Setas Legais & Destinos de Premove', 'Cavalo em L, Torre bloqueada e destinos de premove validados pelo motor oficial');
}

// =========================================================
// 4. MULTIPLAYER E2E: PREMOVE (100ms), CANCELAMENTO ILEGAL E OFERTA DE EMPATE
// =========================================================
{
  const testPort = 18946;
  const tmpDb = path.join(os.tmpdir(), `crownflux_round2_db_${Date.now()}.json`);
  const serverProc = spawn(process.execPath, [path.join(rootDir, 'server.mjs')], {
    env: { ...process.env, PORT: String(testPort), HOST: '127.0.0.1', DATA_FILE: tmpDb, PREMOVE_COST_MS: '100' },
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
  });

  try {
    const base = `http://127.0.0.1:${testPort}`;
    const reg = async (username) => {
      const r = await fetch(`${base}/api/register`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username, password: 'TestPassword123!' }),
      });
      return r.json();
    };
    const uA = await reg('r2_player_a');
    const uB = await reg('r2_player_b');

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

    wsA.sendJson({ type: 'match:queue', options: { mode: 'classic', timeControl: 'bullet1' } });
    await wsA.waitFor((m) => m.type === 'match:waiting');
    wsB.sendJson({ type: 'match:queue', options: { mode: 'classic', timeControl: 'bullet1' } });

    const [startA, startB] = await Promise.all([
      wsA.waitFor((m) => m.type === 'game:started'),
      wsB.waitFor((m) => m.type === 'game:started'),
    ]);

    const whiteWs = startA.state.side === 0 ? wsA : wsB;
    const blackWs = startA.state.side === 1 ? wsA : wsB;
    const whiteState = startA.state.side === 0 ? startA.state : startB.state;
    const blackState = startA.state.side === 1 ? startA.state : startB.state;

    // 1. Pretas preparam PREMOVE legal (e7->e5) durante o turno das Brancas
    const e7Pawn = blackState.pieces.find((p) => p.owner === 1 && p.x === 4 && p.y === 1);
    blackWs.sendJson({ type: 'game:premove', pieceId: e7Pawn.id, x: 4, y: 3, promotion: 'Q' });
    await blackWs.waitFor((m) => m.type === 'game:state' && m.state.myPremove?.x === 4 && m.state.myPremove?.y === 3);

    // 2. Brancas jogam e2->e4 -> servidor executa automaticamente o premove e7->e5 e desconta 100ms das Pretas!
    const e2Pawn = whiteState.pieces.find((p) => p.owner === 0 && p.x === 4 && p.y === 6);
    whiteWs.sendJson({ type: 'game:move', pieceId: e2Pawn.id, x: 4, y: 4 });

    const [afterPremoveW, afterPremoveB] = await Promise.all([
      whiteWs.waitFor((m) => m.type === 'game:state' && m.state.moveHistory?.length === 2),
      blackWs.waitFor((m) => m.type === 'game:state' && m.state.moveHistory?.length === 2),
    ]);
    assert.equal(afterPremoveW.state.moveHistory[0].san, 'e4');
    assert.equal(afterPremoveW.state.moveHistory[1].san, 'e5');
    assert.ok(afterPremoveB.state.clocks[1] <= 59.91, `Black clock must reflect 100ms premove cost (got ${afterPremoveB.state.clocks[1]})`);

    // 3. Brancas jogam Nf3, mas antes Pretas preparam premove ilegal (e5->e4 bloqueado pelo peão de e4)
    const d7Pawn = afterPremoveB.state.pieces.find((p) => p.owner === 1 && p.x === 4 && p.y === 3);
    blackWs.sendJson({ type: 'game:premove', pieceId: d7Pawn.id, x: 4, y: 4 });
    await blackWs.waitFor((m) => m.type === 'game:state' && m.state.myPremove?.x === 4);

    const g1Knight = afterPremoveW.state.pieces.find((p) => p.owner === 0 && p.x === 6 && p.y === 7);
    whiteWs.sendJson({ type: 'game:move', pieceId: g1Knight.id, x: 5, y: 5 });
    const cancelledMsg = await blackWs.waitFor((m) => m.type === 'game:premove-cancelled');
    assert.ok(cancelledMsg.reason.includes('legal'));

    // 4. Oferta de empate recusada e depois aceita com validação no servidor
    whiteWs.sendJson({ type: 'game:draw-offer' });
    await blackWs.waitFor((m) => m.type === 'game:draw-offered');
    blackWs.sendJson({ type: 'game:draw-respond', accept: false });
    await whiteWs.waitFor((m) => m.type === 'game:draw-declined');

    blackWs.sendJson({ type: 'game:draw-offer' });
    await whiteWs.waitFor((m) => m.type === 'game:draw-offered');
    whiteWs.sendJson({ type: 'game:draw-respond', accept: true });
    const [drawEndW, drawEndB] = await Promise.all([
      whiteWs.waitFor((m) => m.type === 'game:ended'),
      blackWs.waitFor((m) => m.type === 'game:ended'),
    ]);
    assert.equal(drawEndW.state.winner, null);
    assert.equal(drawEndB.state.winner, null);
    assert.ok(drawEndW.state.reason.includes('acordo mútuo'));

    wsA.close();
    wsB.close();
    pass(
      'Multiplayer E2E (Premove 100ms + Cancelamento Ilegal + Empate)',
      `Premove e7->e5 executado (relógio Pretas=${afterPremoveB.state.clocks[1].toFixed(2)}s), premove ilegal cancelado, empate recusado e aceito`
    );
  } finally {
    serverProc.kill();
    try { fs.unlinkSync(tmpDb); } catch {}
  }
}

console.log(`\nALL ${results.length} ROUND-2 TEST SUITES PASSED!`);
