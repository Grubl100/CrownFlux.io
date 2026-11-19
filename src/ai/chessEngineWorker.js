import { CHESS_STOCKFISH_PROFILES, clampDifficulty } from './aiConfig.js';
import { normalizeEngineScoreToWhite } from './chessAnalysisEngine.js';

// Adaptador UCI assíncrono para Stockfish 19 Lite WASM (NNUE) em Web Worker.
// Licença Stockfish: GPL-3.0 (/stockfish/LICENSE-GPL3.txt).
export class ChessEngineWorker {
  constructor() {
    this.worker = null;
    this.readyPromise = null;
    this.busy = false;
    this.currentResolve = null;
    this.currentReject = null;
    this.readyWaiter = null;
    this.currentInfo = new Map(); // multipv -> { depth, nodes, scoreCp, mate, wdl, pv, exact }
    this.analysisCache = new Map();
    this.engineIdentity = 'Stockfish 19 (WASM NNUE)';
    this.terminated = false;
  }

  init() {
    if (this.terminated) return Promise.reject(new Error('Engine terminated'));
    if (this.readyPromise) return this.readyPromise;
    this.readyPromise = new Promise((resolve, reject) => {
      try {
        const w = new Worker('/stockfish/stockfish-19-lite-single.js');
        this.worker = w;
        const onInitMessage = (ev) => {
          const line = String(ev.data || '').trim();
          if (line.startsWith('id name ')) {
            this.engineIdentity = line.slice('id name '.length).trim() || this.engineIdentity;
          } else if (line === 'uciok') {
            w.postMessage('setoption name UCI_ShowWDL value true');
            w.postMessage('setoption name Hash value 32');
            w.postMessage('isready');
          } else if (line === 'readyok') {
            w.onmessage = (e) => this._handleMessage(String(e.data || '').trim());
            resolve(this);
          }
        };
        w.onmessage = onInitMessage;
        w.onerror = (err) => {
          this.readyPromise = null;
          reject(err instanceof Error ? err : new Error('Stockfish worker failed to load'));
        };
        w.postMessage('uci');
      } catch (err) {
        this.readyPromise = null;
        reject(err);
      }
    });
    return this.readyPromise;
  }

  _handleMessage(line) {
    if (!line) return;

    if (line === 'readyok' && this.readyWaiter) {
      const done = this.readyWaiter;
      this.readyWaiter = null;
      done();
      return;
    }

    if (line.startsWith('info ') && line.includes(' pv ')) {
      const isBound = /\b(lowerbound|upperbound)\b/.test(line);
      const depthMatch = line.match(/\bdepth\s+(\d+)/);
      const nodesMatch = line.match(/\bnodes\s+(\d+)/);
      const mpvMatch = line.match(/\bmultipv\s+(\d+)/);
      const cpMatch = line.match(/\bscore\s+cp\s+(-?\d+)/);
      const mateMatch = line.match(/\bscore\s+mate\s+(-?\d+)/);
      const wdlMatch = line.match(/\bwdl\s+(\d+)\s+(\d+)\s+(\d+)/);
      const pvMatch = line.match(/\bpv\s+(.+)$/);

      if (pvMatch) {
        const mpv = mpvMatch ? Number(mpvMatch[1]) : 1;
        const prev = this.currentInfo.get(mpv);
        const depth = depthMatch ? Number(depthMatch[1]) : (prev?.depth || 0);
        // Não sobrescreve pontuação exata com linha parcial lowerbound/upperbound da mesma ou menor profundidade
        if (isBound && prev?.exact && depth <= prev.depth) {
          return;
        }
        this.currentInfo.set(mpv, {
          multipv: mpv,
          depth,
          nodes: nodesMatch ? Number(nodesMatch[1]) : (prev?.nodes || 0),
          scoreCp: cpMatch ? Number(cpMatch[1]) : null,
          mate: mateMatch ? Number(mateMatch[1]) : null,
          wdl: wdlMatch ? [Number(wdlMatch[1]), Number(wdlMatch[2]), Number(wdlMatch[3])] : null,
          pv: pvMatch[1].trim().split(/\s+/),
          exact: !isBound,
        });
      }
      return;
    }

    if (line.startsWith('bestmove ')) {
      const bestMove = line.split(/\s+/)[1] || null;
      const lines = [...this.currentInfo.values()].sort((a, b) => a.multipv - b.multipv);
      const top = lines[0] || {
        depth: 0,
        nodes: 0,
        scoreCp: 0,
        mate: null,
        wdl: null,
        pv: bestMove ? [bestMove] : [],
      };
      const resolve = this.currentResolve;
      this.busy = false;
      this.currentResolve = null;
      this.currentReject = null;
      this.currentInfo.clear();
      if (resolve) {
        resolve({
          bestMove: bestMove && bestMove !== '(none)' ? bestMove : null,
          depth: top.depth,
          nodes: top.nodes || 0,
          scoreCp: top.scoreCp,
          mate: top.mate,
          wdl: top.wdl || null,
          pv: top.pv,
          lines,
        });
      }
    }
  }

  _waitReady() {
    return new Promise((resolve) => {
      if (!this.worker || this.terminated) return resolve();
      this.readyWaiter = resolve;
      this.worker.postMessage('isready');
    });
  }

  async resetForNewAnalysis() {
    await this.init();
    if (this.busy) {
      this.stop();
      await new Promise((r) => setTimeout(r, 35));
    }
    this.worker?.postMessage('ucinewgame');
    this.worker?.postMessage('setoption name Skill Level value 20');
    this.worker?.postMessage('setoption name UCI_LimitStrength value false');
    this.worker?.postMessage('setoption name UCI_ShowWDL value true');
    await this._waitReady();
  }

  stop() {
    if (this.worker && this.busy) {
      this.worker.postMessage('stop');
    }
  }

  async search(fen, {
    uciMoves = null,
    depth = 12,
    movetime = 400,
    skillLevel = 20,
    limitStrength = false,
    uciElo = null,
    multiPv = 1,
  } = {}) {
    await this.init();
    if (this.busy) {
      this.stop();
      await new Promise((r) => setTimeout(r, 35));
    }
    if (!this.worker || this.terminated) throw new Error('Engine unavailable');

    const w = this.worker;
    w.postMessage(`setoption name MultiPV value ${Math.max(1, Math.min(5, multiPv))}`);
    w.postMessage(`setoption name Skill Level value ${Math.max(0, Math.min(20, skillLevel))}`);
    if (limitStrength && uciElo) {
      w.postMessage('setoption name UCI_LimitStrength value true');
      w.postMessage(`setoption name UCI_Elo value ${Math.max(1320, Math.min(3190, uciElo))}`);
    } else {
      w.postMessage('setoption name UCI_LimitStrength value false');
    }
    await this._waitReady();

    return new Promise((resolve, reject) => {
      if (!this.worker || this.terminated) return reject(new Error('Engine unavailable'));
      this.busy = true;
      this.currentResolve = resolve;
      this.currentReject = reject;
      this.currentInfo.clear();

      if (Array.isArray(uciMoves)) {
        const posCmd = uciMoves.length
          ? `position startpos moves ${uciMoves.join(' ')}`
          : 'position startpos';
        w.postMessage(posCmd);
      } else {
        w.postMessage(`position fen ${fen}`);
      }

      const goCmd = movetime ? `go depth ${depth} movetime ${movetime}` : `go depth ${depth}`;
      w.postMessage(goCmd);
    });
  }

  async getBotMove(fen, difficulty = 3, { searchTimeMs = null, legalUciMoves = [] } = {}) {
    const level = clampDifficulty(difficulty);
    const cfg = CHESS_STOCKFISH_PROFILES[level] || CHESS_STOCKFISH_PROFILES[3];
    const movetime = searchTimeMs ? Math.min(cfg.movetime, searchTimeMs) : cfg.movetime;

    const res = await this.search(fen, {
      depth: cfg.depth,
      movetime,
      skillLevel: cfg.skillLevel,
      limitStrength: cfg.limitStrength,
      uciElo: cfg.uciElo,
      multiPv: cfg.multiPv,
    });

    if (cfg.weakMoveChance > 0 && legalUciMoves.length > 2 && Math.random() < cfg.weakMoveChance) {
      const topSet = new Set(res.lines.slice(0, 2).map((l) => l.pv?.[0]).filter(Boolean));
      const nonTop = legalUciMoves.filter((u) => !topSet.has(u));
      if (nonTop.length) {
        const chosen = nonTop[Math.floor(Math.random() * nonTop.length)];
        return { ...res, bestMove: chosen };
      }
    }

    if (cfg.suboptimalChance > 0 && res.lines.length > 1 && Math.random() < cfg.suboptimalChance) {
      const bestCp = res.lines[0]?.scoreCp ?? 0;
      const viable = res.lines.slice(1).filter((l) => {
        if (!l.pv?.[0]) return false;
        if (l.mate !== null && l.mate < 0 && level >= 2) return false;
        const drop = bestCp - (l.scoreCp ?? bestCp);
        return drop <= (cfg.maxCpDrop || 300);
      });
      if (viable.length) {
        const picked = viable[Math.floor(Math.random() * viable.length)];
        return { ...res, bestMove: picked.pv[0] };
      }
    }
    return res;
  }

  // Avalia uma posição em FORÇA MÁXIMA (Skill Level 20, sem limite de Elo),
  // normalizando pontuação, mate e WDL sempre para a perspectiva das Brancas (+ = Brancas melhor).
  async evaluateForAnalysis(fen, {
    uciMoves = null,
    depth = 12,
    movetime = 900,
    multiPv = 2,
    useCache = true,
  } = {}) {
    const sideToMove = fen.split(' ')[1] === 'b' ? 1 : 0;
    const cacheKey = `${Array.isArray(uciMoves) ? uciMoves.join(' ') : fen}|d${depth}|m${movetime}|p${multiPv}`;
    if (useCache && this.analysisCache.has(cacheKey)) {
      return this.analysisCache.get(cacheKey);
    }

    const res = await this.search(fen, {
      uciMoves,
      depth,
      movetime,
      skillLevel: 20,
      limitStrength: false,
      multiPv,
    });

    const normalizeLine = (l) => {
      const norm = normalizeEngineScoreToWhite(l, sideToMove);
      return {
        move: l.pv?.[0] || null,
        pv: l.pv || [],
        depth: l.depth || res.depth,
        nodes: l.nodes || res.nodes || 0,
        scoreCp: norm.scoreCp,
        mate: norm.mate,
        wdl: norm.wdl,
      };
    };

    const lines = (res.lines || []).map(normalizeLine);
    const fallbackNorm = normalizeEngineScoreToWhite(res, sideToMove);
    const top = lines[0] || {
      move: res.bestMove,
      pv: res.pv || [],
      depth: res.depth,
      nodes: res.nodes || 0,
      scoreCp: fallbackNorm.scoreCp,
      mate: fallbackNorm.mate,
      wdl: fallbackNorm.wdl,
    };

    const result = {
      bestMove: top.move || res.bestMove,
      pv: top.pv,
      depth: top.depth,
      nodes: top.nodes || res.nodes || 0,
      scoreCp: top.scoreCp,
      mate: top.mate,
      wdl: top.wdl,
      secondBest: lines[1] || null,
    };

    if (useCache) {
      if (this.analysisCache.size > 400) this.analysisCache.clear();
      this.analysisCache.set(cacheKey, result);
    }
    return result;
  }

  terminate() {
    this.terminated = true;
    if (this.worker) {
      try {
        this.worker.postMessage('quit');
        this.worker.terminate();
      } catch {
        // ignore
      }
      this.worker = null;
    }
    if (this.readyWaiter) {
      this.readyWaiter();
      this.readyWaiter = null;
    }
    if (this.currentReject) {
      this.currentReject(new Error('Engine terminated'));
      this.currentReject = null;
      this.currentResolve = null;
    }
    this.busy = false;
    this.readyPromise = null;
  }
}
