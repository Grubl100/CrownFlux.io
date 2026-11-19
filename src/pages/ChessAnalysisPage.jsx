import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  CLASS_MAP,
  MOVE_CLASSIFICATIONS,
  buildFullAnalysisReport,
  evalToExpectedPoints,
} from '../ai/chessAnalysisEngine.js';
import { ChessEngineWorker } from '../ai/chessEngineWorker.js';
import ChessEvaluationGraph from '../components/chess/ChessEvaluationGraph.jsx';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useToast } from '../contexts/ToastContext.jsx';
import {
  createClassicState,
  doClassicMove,
  getClassicMoves,
  reconstructClassicStates,
  stateToFen,
} from '../game/classicEngine.js';
import { drawClassicBoard, viewToBoard } from '../game/classicRenderer.js';
import {
  getClassicRecord,
  loadClassicAnalysisCache,
  saveClassicAnalysisCache,
} from '../utils/classicStorage.js';

const FILES = 'abcdefgh';

function formatEvalLabel(ev) {
  if (!ev) return '0.0';
  if (ev.terminalWinner === 0) return '1-0';
  if (ev.terminalWinner === 1) return '0-1';
  if (ev.terminalDraw) return '0.0';
  if (ev.mate !== null && ev.mate !== undefined) {
    return ev.mate > 0 ? `#${ev.mate}` : `-#${Math.abs(ev.mate)}`;
  }
  const pawns = (Number(ev.scoreCp) || 0) / 100;
  return `${pawns >= 0 ? '+' : ''}${pawns.toFixed(1)}`;
}

function uciToArrow(uci, color = 'rgba(104, 198, 140, 0.88)') {
  if (!uci || uci.length < 4) return null;
  const x0 = FILES.indexOf(uci[0]);
  const y0 = 8 - Number(uci[1]);
  const x1 = FILES.indexOf(uci[2]);
  const y1 = 8 - Number(uci[3]);
  if (x0 < 0 || y0 < 0 || x1 < 0 || y1 < 0) return null;
  return { x0, y0, x1, y1, color };
}

function buildGridFromPieces(pieces) {
  const grid = Array.from({ length: 8 }, () => Array(8).fill(null));
  for (const p of pieces) {
    if (p.x >= 0 && p.y >= 0 && p.x < 8 && p.y < 8) grid[p.y][p.x] = p;
  }
  return grid;
}

export default function ChessAnalysisPage() {
  const { matchId } = useParams();
  const navigate = useNavigate();
  const { prefs } = useAuth();
  const { showToast } = useToast();

  const record = useMemo(() => getClassicRecord(matchId), [matchId]);
  const uciMoves = useMemo(() => (record?.moves || []).map((m) => m.uci).filter(Boolean), [record]);
  const snapshots = useMemo(() => reconstructClassicStates(uciMoves), [uciMoves]);

  const [currentPly, setCurrentPly] = useState(0);
  const [flipped, setFlipped] = useState(() => record?.viewerSide === 1 || record?.playerSide === 1);
  const [autoPlay, setAutoPlay] = useState(false);
  const [playSpeedMs, setPlaySpeedMs] = useState(900);

  const [analyzing, setAnalyzing] = useState(false);
  const [analysisMode, setAnalysisMode] = useState('quick'); // quick | complete
  const [progress, setProgress] = useState(0);
  const [analysisError, setAnalysisError] = useState('');
  const [analysisData, setAnalysisData] = useState(() => loadClassicAnalysisCache(matchId));

  const [variationState, setVariationState] = useState(null);
  const [variationEval, setVariationEval] = useState(null);

  const canvasRef = useRef(null);
  const cellRef = useRef(62);
  const dprRef = useRef(1);
  const engineRef = useRef(null);
  const cancelRef = useRef(false);

  useEffect(() => {
    return () => {
      cancelRef.current = true;
      engineRef.current?.terminate();
      engineRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!autoPlay) return undefined;
    if (currentPly >= snapshots.length - 1) {
      setAutoPlay(false);
      return undefined;
    }
    const timer = setTimeout(() => {
      setCurrentPly((p) => Math.min(snapshots.length - 1, p + 1));
    }, playSpeedMs);
    return () => clearTimeout(timer);
  }, [autoPlay, currentPly, snapshots.length, playSpeedMs]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.key === 'ArrowLeft') {
        setAutoPlay(false);
        setVariationState(null);
        setCurrentPly((p) => Math.max(0, p - 1));
      } else if (e.key === 'ArrowRight') {
        setAutoPlay(false);
        setVariationState(null);
        setCurrentPly((p) => Math.min(snapshots.length - 1, p + 1));
      } else if (e.key === 'Home') {
        setAutoPlay(false);
        setVariationState(null);
        setCurrentPly(0);
      } else if (e.key === 'End') {
        setAutoPlay(false);
        setVariationState(null);
        setCurrentPly(snapshots.length - 1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [snapshots.length]);

  const runAnalysis = useCallback(async (mode = 'quick') => {
    if (!snapshots.length || analyzing) return;
    cancelRef.current = false;
    setAnalysisMode(mode);
    setAnalyzing(true);
    setAnalysisError('');
    setProgress(0);

    const depth = mode === 'complete' ? 14 : 10;
    const movetime = mode === 'complete' ? 360 : 180;

    try {
      if (!engineRef.current) engineRef.current = new ChessEngineWorker();
      await engineRef.current.init();

      const rawEvals = [];
      for (let i = 0; i < snapshots.length; i++) {
        if (cancelRef.current) break;
        const snap = snapshots[i];

        // Trata corretamente posições terminais (xeque-mate ou empate) sem depender de bestmove (none)
        if (Number.isInteger(snap.checkmatedKingOwner)) {
          const winner = 1 - snap.checkmatedKingOwner;
          rawEvals.push({
            ply: i,
            bestMove: null,
            pv: [],
            depth,
            scoreCp: null,
            mate: 0,
            terminalWinner: winner,
            terminalDraw: false,
            secondBest: null,
          });
        } else {
          const ev = await engineRef.current.evaluateForAnalysis(snap.fen, { depth, movetime, multiPv: 2 });
          rawEvals.push({ ply: i, ...ev, terminalWinner: null, terminalDraw: false });
        }
        setProgress(Math.round(((i + 1) / snapshots.length) * 100));
      }

      if (cancelRef.current) {
        setAnalyzing(false);
        return;
      }

      const report = buildFullAnalysisReport(snapshots, rawEvals, 'Stockfish 19 Lite WASM', mode);
      setAnalysisData(report);
      saveClassicAnalysisCache(matchId, report);
    } catch (err) {
      setAnalysisError(err?.message || 'Não foi possível concluir a análise com o motor Stockfish.');
    } finally {
      setAnalyzing(false);
    }
  }, [snapshots, analyzing, matchId]);

  const cancelAnalysis = () => {
    cancelRef.current = true;
    engineRef.current?.stop();
    setAnalyzing(false);
  };

  const renderBoard = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !snapshots.length) return;
    const wide = window.innerWidth > 1040;
    const availW = wide ? Math.min(600, window.innerWidth - 520) : window.innerWidth - 36;
    const size = Math.max(256, Math.min(560, availW));
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cell = Math.max(32, Math.floor(size / 8));
    const px = cell * 8;
    cellRef.current = cell;
    dprRef.current = dpr;
    canvas.style.width = `${px}px`;
    canvas.style.height = `${px}px`;
    canvas.width = Math.floor(px * dpr);
    canvas.height = Math.floor(px * dpr);

    const ctx = canvas.getContext('2d');
    let renderState;
    if (variationState) {
      renderState = variationState;
    } else {
      const snap = snapshots[Math.min(currentPly, snapshots.length - 1)];
      const pieces = snap.pieces.map((p) => ({ ...p }));
      renderState = {
        grid: buildGridFromPieces(pieces),
        pieces,
        lastMove: snap.lastMove,
        turnOwner: snap.turnOwner,
        sel: null,
        checkmatedKingOwner: snap.checkmatedKingOwner,
      };
    }

    const curEval = analysisData?.evaluations?.[currentPly];
    const engineArrow = !variationState && curEval?.bestBefore && currentPly > 0
      ? uciToArrow(curEval.bestBefore)
      : !variationState && curEval?.bestMove
        ? uciToArrow(curEval.bestMove)
        : null;

    drawClassicBoard(ctx, canvas, renderState, cell, dpr, prefs, flipped ? 1 : 0, {
      flipped,
      annotations: { engineArrow },
    });
  }, [snapshots, currentPly, variationState, analysisData, prefs, flipped]);

  useEffect(() => {
    renderBoard();
    window.addEventListener('resize', renderBoard);
    return () => window.removeEventListener('resize', renderBoard);
  }, [renderBoard]);

  const handleBoardClick = async (e) => {
    const canvas = canvasRef.current;
    if (!canvas || !snapshots.length) return;
    const rect = canvas.getBoundingClientRect();
    const vx = Math.floor((e.clientX - rect.left) / cellRef.current);
    const vy = Math.floor((e.clientY - rect.top) / cellRef.current);
    if (vx < 0 || vy < 0 || vx >= 8 || vy >= 8) return;
    const [bx, by] = viewToBoard(vx, vy, flipped);

    setAutoPlay(false);
    let S = variationState;
    if (!S) {
      S = createClassicState({ mode: 'classic_local', timeControl: 'classic30' });
      for (let i = 0; i < currentPly; i++) {
        const uci = uciMoves[i];
        const fx = FILES.indexOf(uci[0]);
        const fy = 8 - Number(uci[1]);
        const tx = FILES.indexOf(uci[2]);
        const ty = 8 - Number(uci[3]);
        const promo = uci[4] ? uci[4].toUpperCase() : 'Q';
        const pc = S.grid[fy]?.[fx];
        if (pc) doClassicMove(S, pc, tx, ty, null, promo);
      }
      S._variationMoves = [];
    }

    const q = S.grid[by]?.[bx];
    const sel = S.sel;
    if (sel && getClassicMoves(S, sel).some(([mx, my]) => mx === bx && my === by)) {
      doClassicMove(S, sel, bx, by, null, 'Q');
      S.sel = null;
      const lastSan = S.moveHistory[S.moveHistory.length - 1]?.san;
      S._variationMoves = [...(S._variationMoves || []), lastSan];
      setVariationState({ ...S });
      if (!analyzing) {
        try {
          if (!engineRef.current) engineRef.current = new ChessEngineWorker();
          const ev = await engineRef.current.evaluateForAnalysis(stateToFen(S), { depth: 10, movetime: 180, multiPv: 1 });
          setVariationEval(ev);
        } catch {
          // ignore
        }
      }
      return;
    }

    if (q && q.o === S.turnOwner) {
      S.sel = q;
      setVariationState({ ...S });
    } else if (variationState) {
      S.sel = null;
      setVariationState({ ...S });
    }
  };

  if (!record || !uciMoves.length) {
    return (
      <div className="page-container">
        <div className="panel" style={{ maxWidth: 560, margin: '28px auto', textAlign: 'center' }}>
          <h2>Registro de partida não encontrado</h2>
          <p className="muted" style={{ margin: '10px 0 18px' }}>
            Jogue uma partida completa de Xadrez Clássico (contra Bot, Local ou Online) para habilitar a análise pós-partida com Stockfish.
          </p>
          <button type="button" className="primary" onClick={() => navigate('/modes/classic')}>
            Ir para Xadrez Clássico
          </button>
        </div>
      </div>
    );
  }

  const curEval = variationState ? variationEval : analysisData?.evaluations?.[currentPly];
  const evalPct = Math.max(4, Math.min(96, evalToExpectedPoints(curEval)));
  const currentMoveInfo = snapshots[currentPly]?.move;
  const currentClass = curEval?.classification ? CLASS_MAP[curEval.classification] : null;

  return (
    <div className="page-container analysis-page">
      <div className="page-crumb-row">
        <button type="button" className="mini-btn" onClick={() => navigate('/modes/classic')}>
          ← Voltar ao Xadrez Clássico
        </button>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="mini-btn" onClick={() => setFlipped((f) => !f)}>
            ⇅ Inverter Tabuleiro
          </button>
          <button
            type="button"
            className="mini-btn"
            onClick={() => {
              navigator.clipboard?.writeText(record.pgn || '');
              showToast('PGN copiado para a área de transferência!');
            }}
          >
            📋 Copiar PGN
          </button>
        </div>
      </div>

      <header className="mode-page-hero" style={{ marginBottom: 16 }}>
        <span className="eyebrow">Revisão de Partida · Stockfish 19 Lite WASM</span>
        <h1>{record.white || 'Brancas'} × {record.black || 'Pretas'}</h1>
        <p className="muted">
          {record.clockControlLabel || 'Xadrez Clássico'} · Resultado: <strong>{record.resultLabel || record.reason}</strong> · {uciMoves.length} meios-lances
          {analysisData && (
            <> · Modo: <strong>{analysisData.analysisMode === 'complete' ? 'Análise Completa (Prof. 14)' : 'Análise Rápida (Prof. 10)'}</strong></>
          )}
        </p>
      </header>

      <div className="analysis-grid">
        <section className="analysis-board-col">
          <div className="analysis-board-row">
            <div className="eval-bar-vertical" title={`Avaliação: ${formatEvalLabel(curEval)}`}>
              <div className="eval-bar-white" style={{ height: `${evalPct}%` }} />
              <span className="eval-bar-label">{formatEvalLabel(curEval)}</span>
            </div>
            <div className="board-wrap-react">
              <canvas
                ref={canvasRef}
                onClick={handleBoardClick}
                aria-label="Tabuleiro de análise de Xadrez Clássico"
              />
            </div>
          </div>

          <div className="analysis-controls-bar">
            <button type="button" className="mini-btn" onClick={() => { setAutoPlay(false); setVariationState(null); setCurrentPly(0); }}>⏮</button>
            <button type="button" className="mini-btn" onClick={() => { setAutoPlay(false); setVariationState(null); setCurrentPly((p) => Math.max(0, p - 1)); }}>◀</button>
            <button type="button" className="mini-btn accent" onClick={() => { setVariationState(null); setAutoPlay((a) => !a); }}>
              {autoPlay ? '⏸ Pausar' : '▶ Reproduzir'}
            </button>
            <button type="button" className="mini-btn" onClick={() => { setAutoPlay(false); setVariationState(null); setCurrentPly((p) => Math.min(snapshots.length - 1, p + 1)); }}>▶</button>
            <button type="button" className="mini-btn" onClick={() => { setAutoPlay(false); setVariationState(null); setCurrentPly(snapshots.length - 1); }}>⏭</button>
            <select
              className="mini-select"
              value={playSpeedMs}
              onChange={(e) => setPlaySpeedMs(Number(e.target.value))}
              aria-label="Velocidade da reprodução"
            >
              <option value={1500}>0.5x</option>
              <option value={900}>1x</option>
              <option value={450}>2x</option>
            </select>
          </div>

          {variationState && (
            <div className="variation-banner">
              <div>
                <strong>Variação explorada:</strong> {(variationState._variationMoves || []).join(' ')}
                {variationEval && <span className="pill" style={{ marginLeft: 8 }}>Eval {formatEvalLabel(variationEval)}</span>}
              </div>
              <button type="button" className="mini-btn accent" onClick={() => { setVariationState(null); setVariationEval(null); }}>
                Voltar à partida original
              </button>
            </div>
          )}

          <div className="panel" style={{ marginTop: 12 }}>
            <div className="hud-card-head">
              <h3>Gráfico de Avaliação</h3>
              <span className="muted" style={{ fontSize: 12 }}>Clique em qualquer ponto para ir ao lance</span>
            </div>
            <ChessEvaluationGraph
              evaluations={analysisData?.evaluations || []}
              currentPly={currentPly}
              onSelectPly={(ply) => {
                setAutoPlay(false);
                setVariationState(null);
                setCurrentPly(ply);
              }}
            />
          </div>
        </section>

        <aside className="analysis-side-col">
          <div className="panel">
            <div className="hud-card-head" style={{ flexWrap: 'wrap', gap: 8 }}>
              <h3>Motor Stockfish 19</h3>
              {analyzing ? (
                <button type="button" className="mini-btn danger" onClick={cancelAnalysis}>
                  Cancelar ({progress}%)
                </button>
              ) : (
                <div style={{ display: 'flex', gap: 6 }}>
                  <button type="button" className="secondary" style={{ padding: '6px 11px', fontSize: 12 }} onClick={() => runAnalysis('quick')}>
                    Análise Rápida
                  </button>
                  <button type="button" className="primary" style={{ padding: '6px 12px', fontSize: 12 }} onClick={() => runAnalysis('complete')}>
                    Análise Completa
                  </button>
                </div>
              )}
            </div>

            {analyzing && (
              <div style={{ marginTop: 10 }}>
                <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>
                  Analisando ({analysisMode === 'complete' ? 'Completa · Prof. 14' : 'Rápida · Prof. 10'}): {progress}%
                </div>
                <div className="progress-track">
                  <div className="progress-fill" style={{ width: `${progress}%` }} />
                </div>
              </div>
            )}

            {analysisError && <p className="muted" style={{ color: 'var(--red)', marginTop: 8 }}>{analysisError}</p>}

            {analysisData && (
              <>
                <div className="accuracy-grid" style={{ marginTop: 12 }}>
                  <div className="accuracy-card">
                    <span className="muted">Precisão Brancas</span>
                    <strong>{analysisData.whiteStats.accuracy}%</strong>
                    <small>{analysisData.whiteStats.totalMoves} lances analisados</small>
                  </div>
                  <div className="accuracy-card">
                    <span className="muted">Precisão Pretas</span>
                    <strong>{analysisData.blackStats.accuracy}%</strong>
                    <small>{analysisData.blackStats.totalMoves} lances analisados</small>
                  </div>
                </div>

                {/* Tabela completa com todas as 10 classificações (inclusive 0) */}
                <div className="classification-summary-table" style={{ marginTop: 12 }}>
                  <div className="cls-sum-head">
                    <span>Classificação</span>
                    <span>Brancas</span>
                    <span>Pretas</span>
                  </div>
                  {MOVE_CLASSIFICATIONS.map((cat) => (
                    <div key={cat.id} className="cls-sum-row">
                      <span className="cls-sum-label">
                        <i className="cls-badge-dot" style={{ background: cat.color }}>{cat.badge}</i>
                        {cat.label}
                      </span>
                      <strong>{analysisData.whiteStats?.counts?.[cat.id] ?? 0}</strong>
                      <strong>{analysisData.blackStats?.counts?.[cat.id] ?? 0}</strong>
                    </div>
                  ))}
                </div>
              </>
            )}

            {currentMoveInfo && (
              <div className="ply-detail-box" style={{ marginTop: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                  <strong>
                    Lance {Math.ceil(currentPly / 2)}{currentMoveInfo.side === 0 ? '.' : '...'} {currentMoveInfo.san}
                  </strong>
                  {currentClass && (
                    <span className="class-pill" style={{ background: currentClass.color }}>
                      {currentClass.badge} {currentClass.label}
                    </span>
                  )}
                </div>
                {curEval?.bestBefore && curEval.bestBefore !== currentMoveInfo.uci && (
                  <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                    Melhor alternativa: <strong>{curEval.bestBefore}</strong>
                    {curEval.pvBefore?.length > 1 ? ` · Linha: ${curEval.pvBefore.slice(0, 5).join(' ')}` : ''}
                  </p>
                )}
              </div>
            )}
          </div>

          {analysisData?.decisiveMoments?.length > 0 && (
            <div className="panel" style={{ marginTop: 12 }}>
              <h3 style={{ marginBottom: 8 }}>Momentos Decisivos</h3>
              <div className="decisive-list">
                {analysisData.decisiveMoments.map((m) => (
                  <button
                    key={m.ply}
                    type="button"
                    className="decisive-item-btn"
                    onClick={() => {
                      setAutoPlay(false);
                      setVariationState(null);
                      setCurrentPly(m.ply);
                    }}
                  >
                    <span>
                      {Math.ceil(m.ply / 2)}{m.side === 0 ? '.' : '...'} <strong>{m.san}</strong>
                    </span>
                    <span style={{ color: CLASS_MAP[m.classification]?.color, fontWeight: 700 }}>
                      {CLASS_MAP[m.classification]?.badge} {CLASS_MAP[m.classification]?.label}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="panel" style={{ marginTop: 12 }}>
            <h3 style={{ marginBottom: 8 }}>Histórico Completo (SAN)</h3>
            <div className="chess-san-table">
              {Array.from({ length: Math.ceil(uciMoves.length / 2) }, (_, rowIdx) => {
                const wPly = rowIdx * 2 + 1;
                const bPly = rowIdx * 2 + 2;
                const wSnap = snapshots[wPly];
                const bSnap = snapshots[bPly];
                const wEval = analysisData?.evaluations?.[wPly];
                const bEval = analysisData?.evaluations?.[bPly];
                return (
                  <div key={rowIdx} className="san-row">
                    <span className="san-num">{rowIdx + 1}.</span>
                    <button
                      type="button"
                      className={`san-move-btn${currentPly === wPly ? ' active' : ''}`}
                      onClick={() => { setAutoPlay(false); setVariationState(null); setCurrentPly(wPly); }}
                    >
                      <span>{wSnap?.move?.san || ''}</span>
                      {wEval?.classification && (
                        <i style={{ color: CLASS_MAP[wEval.classification]?.color }}>
                          {CLASS_MAP[wEval.classification]?.badge}
                        </i>
                      )}
                    </button>
                    <button
                      type="button"
                      disabled={!bSnap}
                      className={`san-move-btn${currentPly === bPly ? ' active' : ''}`}
                      onClick={() => bSnap && (setAutoPlay(false), setVariationState(null), setCurrentPly(bPly))}
                    >
                      <span>{bSnap?.move?.san || ''}</span>
                      {bEval?.classification && (
                        <i style={{ color: CLASS_MAP[bEval.classification]?.color }}>
                          {CLASS_MAP[bEval.classification]?.badge}
                        </i>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
