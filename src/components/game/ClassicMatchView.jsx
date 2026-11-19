import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getDifficultyName } from '../../ai/aiConfig.js';
import { ChessEngineWorker } from '../../ai/chessEngineWorker.js';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { useMatchSession } from '../../contexts/MatchSessionContext.jsx';
import {
  applyUciMove,
  classicFallbackBotMove,
  createClassicState,
  doClassicMove,
  getClassicMoves,
  handleClassicClick,
  isPromotionMove,
  reconstructClassicStates,
  stateToFen,
  stateToPgn,
  stepClassicState,
} from '../../game/classicEngine.js';
import { drawClassicBoard, viewToBoard } from '../../game/classicRenderer.js';
import { saveClassicRecord } from '../../utils/classicStorage.js';
import { fmtChessClock } from '../../utils/format.js';
import { playTone } from '../../utils/sound.js';
import ChessPromotionDialog from '../chess/ChessPromotionDialog.jsx';
import ConfirmModal from '../ConfirmModal.jsx';
import MatchControls from '../MatchControls.jsx';

const ANNOTATION_COLORS = [
  { id: 'gold', label: 'Dourado', arrow: 'rgba(235, 179, 68, 0.85)', sq: 'rgba(235, 179, 68, 0.42)' },
  { id: 'red', label: 'Vermelho', arrow: 'rgba(224, 86, 86, 0.85)', sq: 'rgba(224, 86, 86, 0.44)' },
  { id: 'green', label: 'Verde', arrow: 'rgba(104, 198, 140, 0.85)', sq: 'rgba(104, 198, 140, 0.42)' },
  { id: 'blue', label: 'Azul', arrow: 'rgba(115, 175, 224, 0.85)', sq: 'rgba(115, 175, 224, 0.42)' },
];

function convertOnlineClassic(onlineData, prevSelId = null) {
  if (!onlineData) return null;
  const grid = Array.from({ length: 8 }, () => Array(8).fill(null));
  const pieces = (onlineData.pieces || []).map((p) => ({
    id: p.id,
    t: p.type,
    o: p.owner,
    x: p.x,
    y: p.y,
  }));
  for (const p of pieces) {
    if (p.x >= 0 && p.y >= 0 && p.x < 8 && p.y < 8) grid[p.y][p.x] = p;
  }
  return {
    mode: 'online',
    classic: true,
    N: 8,
    T: onlineData.T || 0,
    turnOwner: onlineData.turn ?? 0,
    turn: onlineData.turn ?? 0,
    chessClock: onlineData.clocks ? [...onlineData.clocks] : [180, 180],
    initialSeconds: onlineData.options?.seconds || 180,
    chessIncrement: onlineData.options?.increment || 0,
    castle: onlineData.castle || [{ king: true, queen: true }, { king: true, queen: true }],
    enPassant: onlineData.enPassant || null,
    grid,
    pieces,
    sel: prevSelId ? pieces.find((p) => p.id === prevSelId) || null : null,
    over: Boolean(onlineData.over),
    started: true,
    winner: onlineData.winner ?? null,
    reason: onlineData.reason || '',
    checkmatedKingOwner:
      onlineData.over && Number.isInteger(onlineData.winner) && onlineData.reason === 'Xeque-mate.'
        ? 1 - onlineData.winner
        : null,
    lastMove: onlineData.lastMove || null,
    events: onlineData.events || [],
    clockControlLabel: onlineData.options?.label || 'Xadrez Clássico',
    moveHistory: Array.isArray(onlineData.moveHistory) ? onlineData.moveHistory : [],
  };
}

export default function ClassicMatchView({ match }) {
  const navigate = useNavigate();
  const { prefs, user } = useAuth();
  const {
    clearMatchSession,
    recordAndFinishOfflineMatch,
    sendSocket,
    setMatchResult,
    setActiveMatch,
  } = useMatchSession();

  const isOnline = match.kind === 'online_classic';
  const cfg = match.config || {};
  const isLocal = !isOnline && cfg.mode === 'classic_local';
  const playerSide = isOnline
    ? Number(match.onlineState?.side) === 1 ? 1 : 0
    : isLocal
      ? 0
      : cfg.playerSide === 1 ? 1 : 0;

  const [localFlip, setLocalFlip] = useState(false);
  const flipped = isLocal ? localFlip : playerSide === 1;

  const canvasRef = useRef(null);
  const stateRef = useRef(null);
  const engineRef = useRef(null);
  const cellRef = useRef(64);
  const dprRef = useRef(1);
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;
  const finishHandledRef = useRef(false);
  const selectedIdRef = useRef(null);
  const lowTimeAlertedRef = useRef(false);
  const onlineSavedRef = useRef(false);

  // Anotações (setas e marcação de casas em coordenadas canônicas 0..7)
  const [annotateMode, setAnnotateMode] = useState(false);
  const [annotateColorIdx, setAnnotateColorIdx] = useState(0);
  const annotationsRef = useRef({ squares: [], arrows: [], previewArrow: null });
  const rightDragStartRef = useRef(null);
  const leftDragRef = useRef(null);

  const [hudTick, setHudTick] = useState(0);
  const [confirmExit, setConfirmExit] = useState(null);
  const [pendingPromo, setPendingPromo] = useState(null);
  const [reviewPly, setReviewPly] = useState(null); // null = ao vivo; número = visualizando lance anterior
  const [botStatus, setBotStatus] = useState('');

  const persistGameForAnalysis = useCallback((S) => {
    if (!S || !S.moveHistory?.length) return;
    const myName = user?.displayName || user?.username || 'Você';
    const oppLabel = isOnline
      ? match.onlineState?.opponent?.displayName || match.onlineState?.opponent?.username || 'Adversário'
      : isLocal
        ? 'Jogador 2 (Pretas)'
        : `Stockfish (${getDifficultyName(S.cpuDifficulty)})`;
    const white = playerSide === 0 ? myName : oppLabel;
    const black = playerSide === 1 ? myName : oppLabel;
    const pgn = stateToPgn(S, { white, black });
    saveClassicRecord({
      id: match.matchId,
      mode: isOnline ? 'classic' : S.mode,
      white,
      black,
      viewerSide: playerSide,
      playerSide,
      result: S.winner,
      resultLabel: S.winner === 0 ? '1-0 (Brancas)' : S.winner === 1 ? '0-1 (Pretas)' : '½-½ (Empate)',
      reason: S.reason || '',
      timeControl: S.timeControl || match.onlineState?.options?.timeControl || 'blitz3',
      clockControlLabel: S.clockControlLabel || 'Xadrez Clássico',
      pgn,
      moves: S.moveHistory.map((m) => ({
        ply: m.ply,
        side: m.side,
        san: m.san || m.text,
        uci: m.uci,
        clockAfter: m.clockAfter,
      })),
      date: new Date().toISOString(),
    });
  }, [isOnline, isLocal, match.matchId, match.onlineState, playerSide, user]);

  const requestStockfishMove = useCallback(async (fen, difficulty) => {
    const S = stateRef.current;
    if (!S || S.over || S.botThinking) return;
    S.botThinking = true;
    setBotStatus(`Stockfish (${getDifficultyName(difficulty)}) pensando...`);
    try {
      if (!engineRef.current) engineRef.current = new ChessEngineWorker();
      const res = await engineRef.current.getBotMove(fen, difficulty);
      const cur = stateRef.current;
      if (!cur || cur.over || cur.turnOwner !== cur.botSide) return;
      const applied = res?.bestMove && applyUciMove(cur, res.bestMove, emitEventRef.current);
      if (!applied) classicFallbackBotMove(cur, emitEventRef.current);
    } catch {
      const cur = stateRef.current;
      if (cur && !cur.over && cur.turnOwner === cur.botSide) {
        classicFallbackBotMove(cur, emitEventRef.current);
      }
    } finally {
      if (stateRef.current) stateRef.current.botThinking = false;
      setBotStatus('');
      setHudTick((t) => t + 1);
    }
  }, []);

  const emitEvent = useCallback((type, payload) => {
    if (type === 'sound') {
      playTone(payload, prefsRef.current?.soundEffects !== false);
    } else if (type === 'requestBotMove') {
      requestStockfishMove(payload.fen, payload.difficulty);
    } else if (type === 'gameover') {
      if (finishHandledRef.current) return;
      finishHandledRef.current = true;
      const S = stateRef.current;
      persistGameForAnalysis(S);
      const oppName = S.mode === 'classic_local'
        ? 'Xadrez Local (Pretas)'
        : `Stockfish (${getDifficultyName(S.cpuDifficulty)})`;
      const relativeWinner = payload.winner === null ? null : payload.winner === playerSide ? 0 : 1;
      recordAndFinishOfflineMatch({
        matchId: match.matchId,
        mode: S.mode,
        difficulty: S.cpuDifficulty || null,
        winner: relativeWinner,
        reason: payload.reason,
        duration: S.T,
        myScore: S.f[playerSide]?.score || 0,
        oppScore: S.f[1 - playerSide]?.score || 0,
        opponentName: oppName,
        replayConfig: match.config,
        skipRedirect: true, // Mantém no tabuleiro com banner de resultado + botão "Analisar Partida"
      });
    }
  }, [match.matchId, match.config, playerSide, persistGameForAnalysis, recordAndFinishOfflineMatch, requestStockfishMove]);

  const emitEventRef = useRef(emitEvent);
  emitEventRef.current = emitEvent;

  // Inicializa partida offline & limpa Stockfish worker ao desmontar
  useEffect(() => {
    finishHandledRef.current = false;
    selectedIdRef.current = null;
    lowTimeAlertedRef.current = false;
    onlineSavedRef.current = false;
    annotationsRef.current = { squares: [], arrows: [], previewArrow: null };
    setReviewPly(null);
    setPendingPromo(null);

    if (!isOnline) {
      stateRef.current = createClassicState({
        mode: cfg.mode || 'classic_cpu',
        timeControl: cfg.timeControl || 'blitz3',
        customTime: cfg.customTime || null,
        cpuDifficulty: cfg.cpuDifficulty || 3,
        playerSide,
      });
      setHudTick((t) => t + 1);
    }
    return () => {
      engineRef.current?.terminate();
      engineRef.current = null;
      stateRef.current = null;
    };
  }, [match.matchId, isOnline]);

  // Sincroniza estado online recebido do servidor
  useEffect(() => {
    if (!isOnline || !match.onlineState) return;
    const prevCount = stateRef.current?.moveHistory?.length || 0;
    const next = convertOnlineClassic(match.onlineState, selectedIdRef.current);
    stateRef.current = next;
    if (next.moveHistory.length > prevCount) {
      const last = next.moveHistory[next.moveHistory.length - 1];
      if (last?.inCheck) playTone('check', prefsRef.current?.soundEffects !== false);
      else if (last?.captured) playTone('capture', prefsRef.current?.soundEffects !== false);
      else playTone('move', prefsRef.current?.soundEffects !== false);
    }
    if (next.over && !onlineSavedRef.current) {
      onlineSavedRef.current = true;
      persistGameForAnalysis(next);
    }
    setHudTick((t) => t + 1);
  }, [isOnline, match.onlineState, persistGameForAnalysis]);

  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const wide = window.innerWidth > 980;
    const availW = wide ? Math.min(680, window.innerWidth - 420) : window.innerWidth - 24;
    const availH = wide ? window.innerHeight - 210 : Math.min(window.innerHeight * 0.58, 520);
    const size = Math.max(256, Math.min(640, availW, availH));
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cell = Math.max(32, Math.floor(size / 8));
    const px = cell * 8;
    cellRef.current = cell;
    dprRef.current = dpr;
    canvas.style.width = `${px}px`;
    canvas.style.height = `${px}px`;
    canvas.width = Math.floor(px * dpr);
    canvas.height = Math.floor(px * dpr);
  }, []);

  useEffect(() => {
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    return () => window.removeEventListener('resize', resizeCanvas);
  }, [resizeCanvas]);

  // Loop de renderização + contagem fluida do relógio + alerta dos 10 segundos
  useEffect(() => {
    let rafId = 0;
    let last = performance.now();
    let hudTimer = 0;

    const tick = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const S = stateRef.current;
      if (S) {
        if (!isOnline && !confirmExit && !pendingPromo) {
          stepClassicState(S, dt, emitEventRef.current);
        } else if (isOnline && !S.over && S.started) {
          // Contagem fluida local sincronizada a cada pacote oficial do servidor
          S.chessClock[S.turnOwner] = Math.max(0, (S.chessClock[S.turnOwner] || 0) - dt);
        }

        // Alerta sonoro controlado na transição para <= 10 segundos (apenas jogador local)
        const localClockSide = isLocal ? S.turnOwner : playerSide;
        const myClock = S.chessClock?.[localClockSide] ?? 999;
        if (!S.over && S.turnOwner === localClockSide) {
          if (myClock <= 10 && myClock > 0 && !lowTimeAlertedRef.current) {
            lowTimeAlertedRef.current = true;
            const soundOn = prefsRef.current?.soundEffects !== false && prefsRef.current?.lowTimeSound !== false;
            playTone('lowtime', soundOn);
          } else if (myClock > 10.5) {
            lowTimeAlertedRef.current = false;
          }
        }

        const canvas = canvasRef.current;
        if (canvas) {
          const ctx = canvas.getContext('2d');
          let drawState = S;
          if (reviewPly !== null && S.moveHistory?.length) {
            const snaps = reconstructClassicStates(S.moveHistory.map((m) => m.uci));
            const snap = snaps[Math.min(reviewPly, snaps.length - 1)];
            if (snap) {
              const g = Array.from({ length: 8 }, () => Array(8).fill(null));
              for (const p of snap.pieces) g[p.y][p.x] = p;
              drawState = {
                ...S,
                grid: g,
                pieces: snap.pieces,
                sel: null,
                lastMove: snap.lastMove,
                turnOwner: snap.turnOwner,
              };
            }
          }
          drawClassicBoard(ctx, canvas, drawState, cellRef.current, dprRef.current, prefsRef.current, playerSide, {
            flipped,
            annotations: annotationsRef.current,
            dragPiece: leftDragRef.current?.active ? leftDragRef.current : null,
          });
        }
      }
      hudTimer += dt;
      if (hudTimer >= 0.12) {
        hudTimer = 0;
        setHudTick((t) => t + 1);
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [isOnline, isLocal, confirmExit, pendingPromo, playerSide, flipped, reviewPly]);

  const getBoardCoords = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const vx = Math.floor(px / cellRef.current);
    const vy = Math.floor(py / cellRef.current);
    if (vx < 0 || vy < 0 || vx >= 8 || vy >= 8) return null;
    const [bx, by] = viewToBoard(vx, vy, flipped);
    return { bx, by, px, py };
  };

  const pickAnnotationColor = (e) => {
    if (e.shiftKey) return ANNOTATION_COLORS[1]; // Red
    if (e.altKey) return ANNOTATION_COLORS[2]; // Green
    if (e.ctrlKey || e.metaKey) return ANNOTATION_COLORS[3]; // Blue
    return ANNOTATION_COLORS[annotateColorIdx] || ANNOTATION_COLORS[0];
  };

  const executeMoveOrPromo = (S, piece, bx, by) => {
    if (isPromotionMove(S, piece, bx, by)) {
      setPendingPromo({ piece, x: bx, y: by });
      return;
    }
    if (isOnline) {
      sendSocket('game:move', { pieceId: piece.id, x: bx, y: by });
      S.sel = null;
      selectedIdRef.current = null;
    } else {
      doClassicMove(S, piece, bx, by, emitEventRef.current, 'Q');
      S.sel = null;
      selectedIdRef.current = null;
    }
  };

  const onCanvasPointerDown = (e) => {
    const S = stateRef.current;
    const coords = getBoardCoords(e);
    if (!S || !coords || confirmExit || pendingPromo) return;

    // Botão direito OU modo Anotar (mobile/tablet) -> setas e marcações
    const isAnnotateGesture = e.button === 2 || (annotateMode && e.button === 0);
    if (isAnnotateGesture) {
      e.preventDefault();
      const colorObj = pickAnnotationColor(e);
      rightDragStartRef.current = { x: coords.bx, y: coords.by, colorObj };
      annotationsRef.current.previewArrow = null;
      return;
    }

    if (e.button !== 0) return;

    // Clique esquerdo limpa marcações temporárias
    if (annotationsRef.current.squares.length || annotationsRef.current.arrows.length) {
      annotationsRef.current = { squares: [], arrows: [], previewArrow: null };
    }

    if (S.over || reviewPly !== null) return;
    const { bx, by, px, py } = coords;
    const canMoveSide = isLocal ? S.turnOwner : playerSide;
    if (S.turnOwner !== canMoveSide) return;

    const q = S.grid[by]?.[bx];
    const s = S.sel;

    if (s && getClassicMoves(S, s).some(([mx, my]) => mx === bx && my === by)) {
      executeMoveOrPromo(S, s, bx, by);
      setHudTick((t) => t + 1);
      return;
    }

    if (q && q.o === canMoveSide) {
      S.sel = q;
      selectedIdRef.current = q.id;
      leftDragRef.current = { piece: q, startX: bx, startY: by, px, py, active: false };
    } else {
      S.sel = null;
      selectedIdRef.current = null;
    }
    setHudTick((t) => t + 1);
  };

  const onCanvasPointerMove = (e) => {
    const coords = getBoardCoords(e);
    if (rightDragStartRef.current && coords) {
      const st = rightDragStartRef.current;
      if (st.x !== coords.bx || st.y !== coords.by) {
        annotationsRef.current.previewArrow = {
          x0: st.x,
          y0: st.y,
          x1: coords.bx,
          y1: coords.by,
          color: st.colorObj.arrow,
        };
      } else {
        annotationsRef.current.previewArrow = null;
      }
      return;
    }
    if (leftDragRef.current && coords) {
      leftDragRef.current.px = coords.px;
      leftDragRef.current.py = coords.py;
      if (coords.bx !== leftDragRef.current.startX || coords.by !== leftDragRef.current.startY) {
        leftDragRef.current.active = true;
      }
    }
  };

  const onCanvasPointerUp = (e) => {
    const coords = getBoardCoords(e);
    if (rightDragStartRef.current) {
      const st = rightDragStartRef.current;
      rightDragStartRef.current = null;
      annotationsRef.current.previewArrow = null;
      if (!coords) return;

      if (st.x === coords.bx && st.y === coords.by) {
        // Toggle marcação da casa
        const idx = annotationsRef.current.squares.findIndex((sq) => sq.x === coords.bx && sq.y === coords.by);
        if (idx >= 0) annotationsRef.current.squares.splice(idx, 1);
        else annotationsRef.current.squares.push({ x: coords.bx, y: coords.by, color: st.colorObj.sq });
      } else {
        // Toggle seta
        const idx = annotationsRef.current.arrows.findIndex(
          (a) => a.x0 === st.x && a.y0 === st.y && a.x1 === coords.bx && a.y1 === coords.by
        );
        if (idx >= 0) annotationsRef.current.arrows.splice(idx, 1);
        else {
          annotationsRef.current.arrows.push({
            x0: st.x,
            y0: st.y,
            x1: coords.bx,
            y1: coords.by,
            color: st.colorObj.arrow,
          });
        }
      }
      setHudTick((t) => t + 1);
      return;
    }

    if (leftDragRef.current) {
      const drag = leftDragRef.current;
      leftDragRef.current = null;
      const S = stateRef.current;
      if (drag.active && S && !S.over && coords) {
        const piece = drag.piece;
        if (getClassicMoves(S, piece).some(([mx, my]) => mx === coords.bx && my === coords.by)) {
          executeMoveOrPromo(S, piece, coords.bx, coords.by);
          setHudTick((t) => t + 1);
        }
      }
    }
  };

  const handlePromoSelect = (choice) => {
    const S = stateRef.current;
    const promo = pendingPromo;
    setPendingPromo(null);
    if (!S || !promo) return;
    if (isOnline) {
      sendSocket('game:move', { pieceId: promo.piece.id, x: promo.x, y: promo.y, promotion: choice });
    } else {
      doClassicMove(S, promo.piece, promo.x, promo.y, emitEventRef.current, choice);
    }
    S.sel = null;
    selectedIdRef.current = null;
    setHudTick((t) => t + 1);
  };

  const handleConfirmExit = () => {
    const modeAction = confirmExit;
    setConfirmExit(null);
    const S = stateRef.current;
    if (modeAction === 'resign') {
      if (isOnline) {
        sendSocket('game:resign');
        return;
      }
      if (S && !S.over) {
        S.over = true;
        S.winner = 1 - playerSide;
        S.reason = 'Você desistiu da partida.';
        emitEventRef.current('gameover', { winner: 1 - playerSide, reason: S.reason });
        setHudTick((t) => t + 1);
      }
      return;
    }
    if (modeAction === 'menu') {
      if (isOnline && S && !S.over) sendSocket('game:resign');
      clearMatchSession();
      navigate('/modes/classic');
    }
  };

  const S = stateRef.current;
  const activeTurn = S?.turnOwner ?? 0;
  const myCategory = match.onlineState?.options?.category || cfg.category || 'blitz';
  const myRating = user?.stats?.classicRatings?.[myCategory] || 1200;
  const oppRating = match.onlineState?.opponent?.stats?.classicRatings?.[myCategory] || null;
  const oppName = isOnline
    ? match.onlineState?.opponent?.displayName || match.onlineState?.opponent?.username || 'Adversário'
    : isLocal
      ? 'Jogador 2 (Pretas)'
      : `Stockfish (${getDifficultyName(S?.cpuDifficulty || cfg.cpuDifficulty || 3)})`;

  const topSide = flipped ? 0 : 1;
  const bottomSide = flipped ? 1 : 0;

  const renderPlayerBar = (side, position) => {
    const isMe = isLocal ? side === 0 : side === playerSide;
    const isActive = !S?.over && activeTurn === side;
    const clockSec = S?.chessClock?.[side] ?? 0;
    const isLowTime = !S?.over && clockSec <= 10;
    const labelName = isMe
      ? (isLocal ? 'Jogador 1 (Brancas)' : user?.displayName || user?.username || 'Você')
      : oppName;
    const avatar = isMe ? (user?.avatar || '♔') : (isOnline ? match.onlineState?.opponent?.avatar || '♚' : '🤖');
    const ratingVal = isMe ? (user ? myRating : null) : oppRating;

    return (
      <div className={`chess-player-bar ${position}${isActive ? ' active-turn' : ''}`}>
        <div className="chess-player-ident">
          <span className="chess-avatar">{avatar}</span>
          <div className="chess-player-meta">
            <div className="chess-player-name-row">
              <strong>{labelName}</strong>
              <span className={`piece-side-badge ${side === 0 ? 'white' : 'black'}`}>
                {side === 0 ? '♔ Brancas' : '♚ Pretas'}
              </span>
              {ratingVal && <span className="chess-elo-pill">{ratingVal}</span>}
            </div>
            <div className="chess-player-sub">
              {isOnline && (
                <span className="conn-dot-inline">
                  <i className="dot on" /> Conectado
                </span>
              )}
              {isActive && <span className="turn-pill-inline">● Pensando</span>}
            </div>
          </div>
        </div>
        <div className={`chess-clock-display${isActive ? ' running' : ''}${isLowTime ? ' low-time' : ''}`}>
          {fmtChessClock(clockSec)}
        </div>
      </div>
    );
  };

  const moves = S?.moveHistory || [];

  return (
    <div className="match-classic-layout">
      <div className="match-topbar">
        <div className="match-topbar-left">
          <span className="mode-pill-tag">
            ♟ XADREZ CLÁSSICO · {S?.clockControlLabel || 'Blitz'}
            {match.onlineState?.rated ? ' · RANQUEADA' : ''}
          </span>
          {botStatus && <span className="conn-pill">{botStatus}</span>}
          {match.connectionMsg && <span className="conn-pill">{match.connectionMsg}</span>}
        </div>
        <MatchControls
          onResign={() => setConfirmExit('resign')}
          onReturnMenu={() => {
            if (S && !S.over) setConfirmExit('menu');
            else {
              clearMatchSession();
              navigate('/modes/classic');
            }
          }}
          resignDisabled={!S || S.over}
        />
      </div>

      <div className="match-play-grid classic-pro-grid">
        <section className="match-board-stage">
          {S?.over && (
            <div className="classic-mate-banner">
              <div>
                <strong>
                  {S.winner === null
                    ? '½–½ EMPATE'
                    : isLocal
                      ? `${S.winner === 0 ? '♔ BRANCAS' : '♚ PRETAS'} VENCERAM!`
                      : S.winner === playerSide
                        ? '🏆 VOCÊ VENCEU!'
                        : '♚ DERROTA'}
                </strong>
                <div className="muted" style={{ fontSize: 13 }}>{S.reason}</div>
              </div>
              <div className="classic-mate-actions">
                {moves.length > 0 && (
                  <button
                    type="button"
                    className="primary"
                    onClick={() => {
                      persistGameForAnalysis(S);
                      setActiveMatch(null);
                      navigate(`/analysis/${match.matchId}`);
                    }}
                  >
                    📊 Analisar Partida
                  </button>
                )}
                {isOnline ? (
                  <button
                    type="button"
                    className="secondary"
                    disabled={match.rematchStatus === 'waiting'}
                    onClick={() => sendSocket('game:rematch')}
                  >
                    {match.rematchStatus === 'waiting' ? 'Aguardando revanche...' : 'Pedir Revanche'}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => {
                      finishHandledRef.current = false;
                      lowTimeAlertedRef.current = false;
                      setMatchResult(null);
                      setReviewPly(null);
                      stateRef.current = createClassicState({
                        mode: cfg.mode || 'classic_cpu',
                        timeControl: cfg.timeControl || 'blitz3',
                        customTime: cfg.customTime || null,
                        cpuDifficulty: cfg.cpuDifficulty || 3,
                        playerSide,
                      });
                      setHudTick((t) => t + 1);
                    }}
                  >
                    Jogar Novamente
                  </button>
                )}
                <button
                  type="button"
                  className="mini-btn"
                  onClick={() => {
                    clearMatchSession();
                    navigate('/modes/classic');
                  }}
                >
                  Voltar ao Clássico
                </button>
              </div>
            </div>
          )}

          {renderPlayerBar(topSide, 'top')}

          <div className="board-wrap-react">
            <canvas
              ref={canvasRef}
              onContextMenu={(e) => e.preventDefault()}
              onPointerDown={onCanvasPointerDown}
              onPointerMove={onCanvasPointerMove}
              onPointerUp={onCanvasPointerUp}
              aria-label="Tabuleiro de Xadrez Clássico 8x8"
            />
          </div>

          {renderPlayerBar(bottomSide, 'bottom')}

          <div className="chess-board-toolbar">
            <button
              type="button"
              className={`mini-btn${annotateMode ? ' accent' : ''}`}
              onClick={() => setAnnotateMode((a) => !a)}
              title="No desktop, use botão direito para marcar casas ou arrastar setas"
            >
              ✎ {annotateMode ? 'Anotando (Toque)' : 'Anotar / Setas'}
            </button>
            <div className="annotate-color-dots">
              {ANNOTATION_COLORS.map((c, idx) => (
                <button
                  key={c.id}
                  type="button"
                  className={`color-dot-btn${annotateColorIdx === idx ? ' active' : ''}`}
                  style={{ background: c.arrow }}
                  title={`Cor de marcação: ${c.label}`}
                  onClick={() => setAnnotateColorIdx(idx)}
                />
              ))}
            </div>
            <button
              type="button"
              className="mini-btn"
              onClick={() => {
                annotationsRef.current = { squares: [], arrows: [], previewArrow: null };
                setHudTick((t) => t + 1);
              }}
            >
              Limpar marcações
            </button>
            {isLocal && (
              <button type="button" className="mini-btn" onClick={() => setLocalFlip((f) => !f)}>
                ⇅ Inverter Tabuleiro
              </button>
            )}
          </div>
        </section>

        <aside className="match-hud-sidebar">
          <div className="hud-card">
            <div className="hud-card-head">
              <h3>Histórico de Lances (SAN)</h3>
              {reviewPly !== null ? (
                <button type="button" className="mini-btn accent" onClick={() => setReviewPly(null)}>
                  Voltar ao vivo
                </button>
              ) : (
                <span className="pill">{moves.length} lances</span>
              )}
            </div>

            <div className="chess-san-table" style={{ maxHeight: 280 }}>
              {!moves.length ? (
                <p className="muted" style={{ fontSize: 12, padding: 8 }}>Nenhum lance registrado ainda.</p>
              ) : (
                Array.from({ length: Math.ceil(moves.length / 2) }, (_, rowIdx) => {
                  const wIdx = rowIdx * 2;
                  const bIdx = rowIdx * 2 + 1;
                  const wMove = moves[wIdx];
                  const bMove = moves[bIdx];
                  const isWLast = (reviewPly === null && wIdx === moves.length - 1) || reviewPly === wIdx + 1;
                  const isBLast = (reviewPly === null && bIdx === moves.length - 1) || reviewPly === bIdx + 1;
                  return (
                    <div key={rowIdx} className="san-row">
                      <span className="san-num">{rowIdx + 1}.</span>
                      <button
                        type="button"
                        className={`san-move-btn${isWLast ? ' active' : ''}`}
                        onClick={() => setReviewPly(wIdx + 1 === moves.length ? null : wIdx + 1)}
                      >
                        {wMove?.san || wMove?.text}
                      </button>
                      <button
                        type="button"
                        disabled={!bMove}
                        className={`san-move-btn${isBLast ? ' active' : ''}`}
                        onClick={() => bMove && setReviewPly(bIdx + 1 === moves.length ? null : bIdx + 1)}
                      >
                        {bMove?.san || bMove?.text || ''}
                      </button>
                    </div>
                  );
                })
              )}
            </div>

            {moves.length > 0 && (
              <div className="analysis-controls-bar" style={{ marginTop: 8 }}>
                <button type="button" className="mini-btn" onClick={() => setReviewPly(0)}>⏮</button>
                <button
                  type="button"
                  className="mini-btn"
                  onClick={() => setReviewPly((p) => Math.max(0, (p === null ? moves.length : p) - 1))}
                >
                  ◀
                </button>
                <button
                  type="button"
                  className="mini-btn"
                  onClick={() => setReviewPly((p) => (p === null || p + 1 >= moves.length ? null : p + 1))}
                >
                  ▶
                </button>
                <button type="button" className="mini-btn" onClick={() => setReviewPly(null)}>⏭</button>
              </div>
            )}
          </div>

          <div className="hud-card">
            <div className="hud-card-head">
              <h3>Ferramentas & Informações</h3>
            </div>
            <p className="muted" style={{ fontSize: 12, lineHeight: 1.5 }}>
              <strong>Dica:</strong> clique com o <strong>botão direito</strong> para marcar casas ou arraste para desenhar setas de previsão (use Shift/Alt/Ctrl para mudar a cor).
            </p>
            {S?.over && moves.length > 0 && (
              <button
                type="button"
                className="primary full-btn"
                style={{ marginTop: 10 }}
                onClick={() => {
                  persistGameForAnalysis(S);
                  setActiveMatch(null);
                  navigate(`/analysis/${match.matchId}`);
                }}
              >
                📊 Abrir Análise Pós-Partida
              </button>
            )}
          </div>
        </aside>
      </div>

      {pendingPromo && (
        <ChessPromotionDialog
          side={pendingPromo.piece.o}
          onSelect={handlePromoSelect}
          onCancel={() => setPendingPromo(null)}
        />
      )}

      <ConfirmModal
        open={Boolean(confirmExit)}
        title={confirmExit === 'resign' ? 'Desistir da partida?' : 'Sair para o menu de Xadrez Clássico?'}
        message={
          confirmExit === 'resign'
            ? 'Desistir encerrará imediatamente a partida e contará vitória para o adversário.'
            : 'Se a partida ainda estiver em andamento, sair contará como desistência.'
        }
        confirmLabel={confirmExit === 'resign' ? 'Confirmar Desistência' : 'Sair da Partida'}
        danger
        onConfirm={handleConfirmExit}
        onCancel={() => setConfirmExit(null)}
      />
    </div>
  );
}
