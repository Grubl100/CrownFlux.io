import { CHESS_STOCKFISH_PROFILES, clampDifficulty } from './aiConfig.js';

// Adaptador UCI assíncrono para Stockfish 19 Lite WASM em Web Worker.
// Licença Stockfish: GPL-3.0 (/stockfish/LICENSE-GPL3.txt).
export class ChessEngineWorker {
  constructor() {
    this.worker = null;
    this.readyPromise = null;
    this.busy = false;
    this.currentResolve = null;
    this.currentReject = null;
    this.currentInfo = new Map(); // multipv -> { depth, scoreCp, mate, pv }
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
          if (line === 'uciok') {
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
    if (line.startsWith('info ') && line.includes(' pv ')) {
      const depthMatch = line.match(/\bdepth\s+(\d+)/);
      const mpvMatch = line.match(/\bmultipv\s+(\d+)/);
      const cpMatch = line.match(/\bscore\s+cp\s+(-?\d+)/);
      const mateMatch = line.match(/\bscore\s+mate\s+(-?\d+)/);
      const pvMatch = line.match(/\bpv\s+(.+)$/);
      if (pvMatch) {
        const mpv = mpvMatch ? Number(mpvMatch[1]) : 1;
        this.currentInfo.set(mpv, {
          multipv: mpv,
          depth: depthMatch ? Number(depthMatch[1]) : 0,
          scoreCp: cpMatch ? Number(cpMatch[1]) : null,
          mate: mateMatch ? Number(mateMatch[1]) : null,
          pv: pvMatch[1].trim().split(/\s+/),
        });
      }
      return;
    }

    if (line.startsWith('bestmove ')) {
      const bestMove = line.split(/\s+/)[1] || null;
      const lines = [...this.currentInfo.values()].sort((a, b) => a.multipv - b.multipv);
      const top = lines[0] || { depth: 0, scoreCp: 0, mate: null, pv: bestMove ? [bestMove] : [] };
      const resolve = this.currentResolve;
      this.busy = false;
      this.currentResolve = null;
      this.currentReject = null;
      this.currentInfo.clear();
      if (resolve) {
        resolve({
          bestMove: bestMove && bestMove !== '(none)' ? bestMove : null,
          depth: top.depth,
          scoreCp: top.scoreCp,
          mate: top.mate,
          pv: top.pv,
          lines,
        });
      }
    }
  }

  stop() {
    if (this.worker && this.busy) {
      this.worker.postMessage('stop');
    }
  }

  async search(fen, { depth = 12, movetime = 400, skillLevel = 20, limitStrength = false, uciElo = null, multiPv = 1 } = {}) {
    await this.init();
    if (this.busy) {
      this.stop();
      await new Promise((r) => setTimeout(r, 35));
    }
    return new Promise((resolve, reject) => {
      if (!this.worker || this.terminated) return reject(new Error('Engine unavailable'));
      this.busy = true;
      this.currentResolve = resolve;
      this.currentReject = reject;
      this.currentInfo.clear();

      const w = this.worker;
      w.postMessage(`setoption name MultiPV value ${Math.max(1, Math.min(5, multiPv))}`);
      w.postMessage(`setoption name Skill Level value ${Math.max(0, Math.min(20, skillLevel))}`);
      if (limitStrength && uciElo) {
        w.postMessage('setoption name UCI_LimitStrength value true');
        w.postMessage(`setoption name UCI_Elo value ${Math.max(1320, Math.min(3190, uciElo))}`);
      } else {
        w.postMessage('setoption name UCI_LimitStrength value false');
      }
      w.postMessage(`position fen ${fen}`);
      const goCmd = movetime ? `go depth ${depth} movetime ${movetime}` : `go depth ${depth}`;
      w.postMessage(goCmd);
    });
  }

  async getBotMove(fen, difficulty = 3) {
    const level = clampDifficulty(difficulty);
    const cfg = CHESS_STOCKFISH_PROFILES[level] || CHESS_STOCKFISH_PROFILES[3];
    const res = await this.search(fen, {
      depth: cfg.depth,
      movetime: cfg.movetime,
      skillLevel: cfg.skillLevel,
      limitStrength: cfg.limitStrength,
      uciElo: cfg.uciElo,
      multiPv: cfg.multiPv,
    });

    // Nos níveis 1 e 2, seleciona ocasionalmente uma linha secundária legal do MultiPV
    // para simular erros humanos coerentes sem jamais fazer lances ilegais.
    if (cfg.pickTopN > 1 && res.lines.length > 1 && Math.random() < cfg.blunderChance) {
      const pool = res.lines.slice(1, Math.min(cfg.pickTopN, res.lines.length));
      if (pool.length) {
        const picked = pool[Math.floor(Math.random() * pool.length)];
        if (picked?.pv?.[0]) {
          return { ...res, bestMove: picked.pv[0] };
        }
      }
    }
    return res;
  }

  // Avalia uma posição normalizando a pontuação sempre da perspectiva das Brancas (+ = Brancas melhor)
  async evaluateForAnalysis(fen, { depth = 11, movetime = 260 } = {}) {
    const res = await this.search(fen, {
      depth,
      movetime,
      skillLevel: 20,
      limitStrength: false,
      multiPv: 1,
    });
    const sideToMove = fen.split(' ')[1] === 'b' ? 1 : 0;
    const sign = sideToMove === 0 ? 1 : -1;
    return {
      bestMove: res.bestMove,
      pv: res.pv || [],
      depth: res.depth,
      scoreCp: res.scoreCp !== null ? res.scoreCp * sign : null,
      mate: res.mate !== null ? res.mate * sign : null,
    };
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
    if (this.currentReject) {
      this.currentReject(new Error('Engine terminated'));
      this.currentReject = null;
      this.currentResolve = null;
    }
    this.busy = false;
    this.readyPromise = null;
  }
}
