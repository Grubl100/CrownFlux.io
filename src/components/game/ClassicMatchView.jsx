import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getDifficultyName } from '../../ai/aiConfig.js';
import { ChessEngineWorker } from '../../ai/chessEngineWorker.js';
import { computeBotTimeBudgetMs } from '../../ai/chessTimeManager.js';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { useMatchSession } from '../../contexts/MatchSessionContext.jsx';
import { useToast } from '../../contexts/ToastContext.jsx';
import {
  PREMOVE_COST_SECONDS,
  applyUciMove,
  classicCanMate,
  classicFallbackBotMove,
  createClassicState,
  doClassicMove,
  getAllLegalUciMoves,
  getClassicMoves,
  getClassicPremoveTargets,
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
    drawOfferFrom: onlineData.drawOfferFrom ?? null,
    myPremove: onlineData.myPremove || null,
  };
}

export default function ClassicMatchView({ match }) {
  const navigate = useNavigate();
  const { prefs, user } = useAuth();
  const { showToast } = useToast();
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
  const localPremoveRef = useRef(null); // { pieceId, fromX, fromY, toX, toY, promotion }

  // Ferramentas de marcação (separando Seta de Movimento Legal vs Marcação Livre)
  const [annotateMode, setAnnotateMode] = useState(false);
  const [freeAnnotateMode, setFreeAnnotateMode] = useState(false);
  const [annotateColorIdx, setAnnotateColorIdx] = useState(0);
  const annotationsRef = useRef({ squares: [], arrows: [], previewArrow: null });
  const rightDragStartRef = useRef(null);
  const leftDragRef = useRef(null);

  const [hudTick, setHudTick] = useState(0);
  const [confirmExit, setConfirmExit] = useState(null); // 'resign' | 'menu' | 'local_draw'
  const [pendingPromo, setPendingPromo] = useState(null); // { piece, x, y, isPremove }
  const [reviewPly, setReviewPly] = useState(null);
  const [botStatus, setBotStatus] = useState('');
  const [drawChecking, setDrawChecking] = useState(false);

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

  // Executa premove local contra Bot com custo real de 100ms e validação de legalidade
  const tryExecuteLocalPremove = useCallback((S) => {
    const pm = localPremoveRef.current;
    if (!pm || !S || S.over || S.turnOwner !== playerSide) return;
    localPremoveRef.current = null;

    if (S.chessClock[playerSide] <= PREMOVE_COST_SECONDS) {
      S.chessClock[playerSide] = 0;
      const timeoutWinner = classicCanMate(S, 1 - playerSide) ? 1 - playerSide : null;
      S.over = true;
      S.winner = timeoutWinner;
      S.reason = timeoutWinner === null
        ? 'Tempo esgotado sem material suficiente para mate: empate.'
        : 'Tempo esgotado ao executar premove.';
      emitEventRef.current('gameover', { winner: S.winner, reason: S.reason });
      return;
    }

    const piece = S.pieces.find((p) => p.id === pm.pieceId && p.o === playerSide);
    const legal = piece && getClassicMoves(S, piece).some(([mx, my]) => mx === pm.toX && my === pm.toY);
    if (legal) {
      S.chessClock[playerSide] = Math.max(0, S.chessClock[playerSide] - PREMOVE_COST_SECONDS);
      doClassicMove(S, piece, pm.toX, pm.toY, emitEventRef.current, pm.promotion || 'Q');
    } else {
      showToast('Premove cancelado: o movimento deixou de ser legal.', 'warn');
    }
  }, [playerSide, showToast]);

  // Bot com orçamento realista de tempo (descontado do relógio oficial do bot!) e força calibrada
  const requestStockfishMove = useCallback(async (fen, difficulty) => {
    const S = stateRef.current;
    if (!S || S.over || S.botThinking) return;
    S.botThinking = true;
    const startedAt = performance.now();
    setBotStatus(`Stockfish (${getDifficultyName(difficulty)}) pensando...`);

    const budget = computeBotTimeBudgetMs({
      botClockSec: S.chessClock[S.botSide],
      initialSeconds: S.initialSeconds,
      incrementSec: S.chessIncrement,
      category: S.category,
      difficulty,
      state: S,
    });
    const legalUcis = getAllLegalUciMoves(S, S.botSide);

    let chosenUci = null;
    try {
      if (!engineRef.current) engineRef.current = new ChessEngineWorker();
      const res = await engineRef.current.getBotMove(fen, difficulty, {
        searchTimeMs: budget.searchTimeMs,
        legalUciMoves: legalUcis,
      });
      chosenUci = res?.bestMove || null;
    } catch {
      chosenUci = null;
    }

    // Espera o restante do orçamento de pensamento natural enquanto o relógio oficial do bot corre!
    const elapsed = performance.now() - startedAt;
    const remain = budget.targetThinkMs - elapsed;
    if (remain > 25) {
      await new Promise((r) => setTimeout(r, remain));
    }

    const cur = stateRef.current;
    if (!cur || cur.over || cur.turnOwner !== cur.botSide) {
      if (cur) cur.botThinking = false;
      setBotStatus('');
      return;
    }

    const applied = chosenUci && applyUciMove(cur, chosenUci, emitEventRef.current);
    if (!applied) classicFallbackBotMove(cur, emitEventRef.current);
    cur.botThinking = false;
    setBotStatus('');

    // Se o jogador preparou um premove, valida e executa agora!
    if (!cur.over && cur.turnOwner === playerSide && localPremoveRef.current) {
      tryExecuteLocalPremove(cur);
    }
    setHudTick((t) => t + 1);
  }, [playerSide, tryExecuteLocalPremove]);

  const emitEvent = useCallback((type, payload) => {
    if (type === 'sound') {
      playTone(payload, prefsRef.current?.soundEffects !== false);
    } else if (type === 'requestBotMove') {
      requestStockfishMove(payload.fen, payload.difficulty);
    } else if (type === 'gameover') {
      if (finishHandledRef.current) return;
      finishHandledRef.current = true;
      localPremoveRef.current = null;
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
        skipRedirect: true,
      });
    }
  }, [match.matchId, match.config, playerSide, persistGameForAnalysis, recordAndFinishOfflineMatch, requestStockfishMove]);

  const emitEventRef = useRef(emitEvent);
  emitEventRef.current = emitEvent;

  useEffect(() => {
    finishHandledRef.current = false;
    selectedIdRef.current = null;
    lowTimeAlertedRef.current = false;
    onlineSavedRef.current = false;
    localPremoveRef.current = null;
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
    const availW = wide ? Math.min(640, window.innerWidth - 450) : window.innerWidth - 24;
    const availH = wide ? window.innerHeight - 210 : Math.min(window.innerHeight * 0.56, 500);
    const size = Math.max(256, Math.min(624, availW, availH));
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

  // Render loop + relógio oficial + alerta controlado dos 10s
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
          S.chessClock[S.turnOwner] = Math.max(0, (S.chessClock[S.turnOwner] || 0) - dt);
        }

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

          const activePremove = isOnline
            ? (S.myPremove ? { fromX: S.myPremove.fromX, fromY: S.myPremove.fromY, toX: S.myPremove.x, toY: S.myPremove.y } : null)
            : localPremoveRef.current;
          const isPremoveSel = !isLocal && !S.over && S.turnOwner !== playerSide && S.sel?.o === playerSide;
          const customTargets = isPremoveSel ? getClassicPremoveTargets(S, S.sel) : null;

          drawClassicBoard(ctx, canvas, drawState, cellRef.current, dprRef.current, prefsRef.current, playerSide, {
            flipped,
            annotations: annotationsRef.current,
            premove: reviewPly === null ? activePremove : null,
            isPremoveSelect: isPremoveSel,
            customTargets,
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
    if (e.shiftKey) return ANNOTATION_COLORS[1];
    if (e.altKey) return ANNOTATION_COLORS[2];
    if (e.ctrlKey || e.metaKey) return ANNOTATION_COLORS[3];
    return ANNOTATION_COLORS[annotateColorIdx] || ANNOTATION_COLORS[0];
  };

  const cancelActivePremove = () => {
    if (isOnline) {
      if (stateRef.current?.myPremove) sendSocket('game:premove-cancel');
    } else if (localPremoveRef.current) {
      localPremoveRef.current = null;
      setHudTick((t) => t + 1);
    }
  };

  const executeMoveOrPromo = (S, piece, bx, by, isPremove = false) => {
    if (isPromotionMove(S, piece, bx, by)) {
      setPendingPromo({ piece, x: bx, y: by, isPremove });
      return;
    }
    if (isPremove) {
      if (isOnline) {
        sendSocket('game:premove', { pieceId: piece.id, x: bx, y: by, promotion: 'Q' });
      } else {
        localPremoveRef.current = { pieceId: piece.id, fromX: piece.x, fromY: piece.y, toX: bx, toY: by, promotion: 'Q' };
      }
      S.sel = null;
      selectedIdRef.current = null;
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

  const isLegalPieceArrow = (S, x0, y0, x1, y1) => {
    if (freeAnnotateMode) return true;
    const piece = S.grid?.[y0]?.[x0];
    if (!piece) return true; // Casa vazia -> anotação livre de área
    return getClassicMoves(S, piece).some(([mx, my]) => mx === x1 && my === y1);
  };

  const onCanvasPointerDown = (e) => {
    const S = stateRef.current;
    const coords = getBoardCoords(e);
    if (!S || !coords || confirmExit || pendingPromo) return;

    // Botão direito cancela premove se houver um ativo sem arrastar, ou inicia seta/marcação
    const isAnnotateGesture = e.button === 2 || (annotateMode && e.button === 0);
    if (isAnnotateGesture) {
      e.preventDefault();
      if (e.button === 2) cancelActivePremove();
      const colorObj = pickAnnotationColor(e);
      rightDragStartRef.current = { x: coords.bx, y: coords.by, colorObj };
      annotationsRef.current.previewArrow = null;
      return;
    }

    if (e.button !== 0) return;

    if (annotationsRef.current.squares.length || annotationsRef.current.arrows.length) {
      annotationsRef.current = { squares: [], arrows: [], previewArrow: null };
    }

    if (S.over || reviewPly !== null) return;
    const { bx, by, px, py } = coords;
    const q = S.grid[by]?.[bx];
    const s = S.sel;

    // 1. Modo Premove (turno do adversário em partidas Online ou vs Bot)
    if (!isLocal && S.turnOwner !== playerSide) {
      if (s && s.o === playerSide && getClassicPremoveTargets(S, s).some(([mx, my]) => mx === bx && my === by)) {
        executeMoveOrPromo(S, s, bx, by, true);
        setHudTick((t) => t + 1);
        return;
      }
      if (q && q.o === playerSide) {
        S.sel = q;
        selectedIdRef.current = q.id;
        leftDragRef.current = { piece: q, startX: bx, startY: by, px, py, active: false, isPremove: true };
      } else {
        S.sel = null;
        selectedIdRef.current = null;
        cancelActivePremove();
      }
      setHudTick((t) => t + 1);
      return;
    }

    // 2. Turno normal do jogador
    const canMoveSide = isLocal ? S.turnOwner : playerSide;
    if (S.turnOwner !== canMoveSide) return;

    if (s && getClassicMoves(S, s).some(([mx, my]) => mx === bx && my === by)) {
      executeMoveOrPromo(S, s, bx, by, false);
      setHudTick((t) => t + 1);
      return;
    }

    if (q && q.o === canMoveSide) {
      S.sel = q;
      selectedIdRef.current = q.id;
      leftDragRef.current = { piece: q, startX: bx, startY: by, px, py, active: false, isPremove: false };
    } else {
      S.sel = null;
      selectedIdRef.current = null;
    }
    setHudTick((t) => t + 1);
  };

  const onCanvasPointerMove = (e) => {
    const S = stateRef.current;
    const coords = getBoardCoords(e);
    if (rightDragStartRef.current && coords && S) {
      const st = rightDragStartRef.current;
      if (st.x !== coords.bx || st.y !== coords.by) {
        const legal = isLegalPieceArrow(S, st.x, st.y, coords.bx, coords.by);
        annotationsRef.current.previewArrow = {
          x0: st.x,
          y0: st.y,
          x1: coords.bx,
          y1: coords.by,
          color: legal ? st.colorObj.arrow : 'rgba(224, 86, 86, 0.35)',
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
    const S = stateRef.current;
    const coords = getBoardCoords(e);
    if (rightDragStartRef.current) {
      const st = rightDragStartRef.current;
      rightDragStartRef.current = null;
      annotationsRef.current.previewArrow = null;
      if (!coords || !S) return;

      if (st.x === coords.bx && st.y === coords.by) {
        const idx = annotationsRef.current.squares.findIndex((sq) => sq.x === coords.bx && sq.y === coords.by);
        if (idx >= 0) annotationsRef.current.squares.splice(idx, 1);
        else annotationsRef.current.squares.push({ x: coords.bx, y: coords.by, color: st.colorObj.sq });
      } else {
        if (!isLegalPieceArrow(S, st.x, st.y, coords.bx, coords.by)) {
          showToast('Seta bloqueada: movimento ilegal para essa peça. Ative "Marcação Livre" para setas abstratas.', 'warn');
          setHudTick((t) => t + 1);
          return;
        }
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
            dashed: freeAnnotateMode,
          });
        }
      }
      setHudTick((t) => t + 1);
      return;
    }

    if (leftDragRef.current) {
      const drag = leftDragRef.current;
      leftDragRef.current = null;
      if (drag.active && S && !S.over && coords) {
        const piece = drag.piece;
        if (drag.isPremove) {
          if (getClassicPremoveTargets(S, piece).some(([mx, my]) => mx === coords.bx && my === coords.by)) {
            executeMoveOrPromo(S, piece, coords.bx, coords.by, true);
            setHudTick((t) => t + 1);
          }
        } else if (getClassicMoves(S, piece).some(([mx, my]) => mx === coords.bx && my === coords.by)) {
          executeMoveOrPromo(S, piece, coords.bx, coords.by, false);
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
    if (promo.isPremove) {
      if (isOnline) {
        sendSocket('game:premove', { pieceId: promo.piece.id, x: promo.x, y: promo.y, promotion: choice });
      } else {
        localPremoveRef.current = {
          pieceId: promo.piece.id,
          fromX: promo.piece.x,
          fromY: promo.piece.y,
          toX: promo.x,
          toY: promo.y,
          promotion: choice,
        };
      }
      S.sel = null;
      selectedIdRef.current = null;
      setHudTick((t) => t + 1);
      return;
    }
    if (isOnline) {
      sendSocket('game:move', { pieceId: promo.piece.id, x: promo.x, y: promo.y, promotion: choice });
    } else {
      doClassicMove(S, promo.piece, promo.x, promo.y, emitEventRef.current, choice);
    }
    S.sel = null;
    selectedIdRef.current = null;
    setHudTick((t) => t + 1);
  };

  const handleOfferDraw = async () => {
    const S = stateRef.current;
    if (!S || S.over) return;
    if (isOnline) {
      sendSocket('game:draw-offer');
      showToast('Oferta de empate enviada ao adversário.');
      return;
    }
    if (isLocal) {
      setConfirmExit('local_draw');
      return;
    }
    // Contra Bot: avalia a posição com Stockfish para aceitar ou recusar de forma coerente
    if (drawChecking || S.botThinking) return;
    setDrawChecking(true);
    try {
      if (!engineRef.current) engineRef.current = new ChessEngineWorker();
      const ev = await engineRef.current.evaluateForAnalysis(stateToFen(S), { depth: 8, movetime: 180, multiPv: 1 });
      const botSign = S.botSide === 0 ? 1 : -1;
      const botCp = (ev?.scoreCp ?? 0) * botSign;
      const botLosing = (ev?.mate !== null && ev.mate * botSign < 0) || botCp <= -150;
      const deadEqualLate = S.moveHistory.length >= 24 && Math.abs(botCp) <= 35;
      if (botLosing || deadEqualLate) {
        S.over = true;
        S.winner = null;
        S.reason = 'Empate por acordo mútuo (Stockfish aceitou).';
        emitEventRef.current('gameover', { winner: null, reason: S.reason });
        setHudTick((t) => t + 1);
      } else {
        showToast('O bot recusou a oferta de empate e quer continuar jogando.');
      }
    } catch {
      showToast('O bot recusou a oferta de empate.');
    } finally {
      setDrawChecking(false);
    }
  };

  const handleConfirmExit = () => {
    const modeAction = confirmExit;
    setConfirmExit(null);
    const S = stateRef.current;
    if (modeAction === 'local_draw') {
      if (S && !S.over) {
        S.over = true;
        S.winner = null;
        S.reason = 'Empate por acordo mútuo.';
        emitEventRef.current('gameover', { winner: null, reason: S.reason });
        setHudTick((t) => t + 1);
      }
      return;
    }
    if (modeAction === 'resign') {
      if (isOnline) {
        sendSocket('game:resign');
        return;
      }
      if (S && !S.over) {
        const resignWinner = isLocal ? 1 - S.turnOwner : 1 - playerSide;
        S.over = true;
        S.winner = resignWinner;
        S.reason = 'Partida encerrada por desistência.';
        emitEventRef.current('gameover', { winner: resignWinner, reason: S.reason });
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
  const hasActivePremove = Boolean(isOnline ? S?.myPremove : localPremoveRef.current);
  const incomingDrawOffer = isOnline && S && !S.over && S.drawOfferFrom === 1 - playerSide;
  const outgoingDrawOffer = isOnline && S && !S.over && S.drawOfferFrom === playerSide;

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
          {hasActivePremove && (
            <span className="premove-pill">
              ⚡ Premove preparado (0,1s)
              <button type="button" className="link-inline" style={{ marginLeft: 6 }} onClick={cancelActivePremove}>
                Cancelar
              </button>
            </span>
          )}
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
                      localPremoveRef.current = null;
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
              className={`mini-btn${!freeAnnotateMode ? ' accent' : ''}`}
              onClick={() => setFreeAnnotateMode(false)}
              title="Setas partindo de uma peça respeitam apenas seus movimentos legais"
            >
              ♟ Setas Legais
            </button>
            <button
              type="button"
              className={`mini-btn${freeAnnotateMode ? ' accent' : ''}`}
              onClick={() => setFreeAnnotateMode((v) => !v)}
              title="Permite desenhar setas estratégicas livres entre quaisquer casas"
            >
              ✦ Marcação Livre
            </button>
            <button
              type="button"
              className={`mini-btn${annotateMode ? ' accent' : ''}`}
              onClick={() => setAnnotateMode((a) => !a)}
              title="Ative no celular/tablet para desenhar setas com o toque"
            >
              ✎ {annotateMode ? 'Toque: Anotar' : 'Anotar (Toque)'}
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
              Limpar
            </button>
            {isLocal && (
              <button type="button" className="mini-btn" onClick={() => setLocalFlip((f) => !f)}>
                ⇅ Inverter
              </button>
            )}
          </div>
        </section>

        <aside className="match-hud-sidebar classic-right-panel">
          <div className="hud-card classic-history-card">
            <div className="hud-card-head">
              <h3>Histórico de Lances</h3>
              {reviewPly !== null ? (
                <button type="button" className="mini-btn accent" onClick={() => setReviewPly(null)}>
                  Voltar ao vivo
                </button>
              ) : (
                <span className="pill">{moves.length} {moves.length === 1 ? 'lance' : 'lances'}</span>
              )}
            </div>

            <div className="chess-san-table classic-san-large">
              {!moves.length ? (
                <p className="muted" style={{ fontSize: 13, padding: 12 }}>
                  A partida começou. Faça seu lance — durante a vez do adversário você também pode preparar um <strong>premove</strong>!
                </p>
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

            <div className="analysis-controls-bar" style={{ marginTop: 10 }}>
              <button type="button" className="mini-btn" disabled={!moves.length} onClick={() => setReviewPly(0)}>⏮</button>
              <button
                type="button"
                className="mini-btn"
                disabled={!moves.length}
                onClick={() => setReviewPly((p) => Math.max(0, (p === null ? moves.length : p) - 1))}
              >
                ◀
              </button>
              <button
                type="button"
                className="mini-btn"
                disabled={!moves.length}
                onClick={() => setReviewPly((p) => (p === null || p + 1 >= moves.length ? null : p + 1))}
              >
                ▶
              </button>
              <button type="button" className="mini-btn" disabled={!moves.length} onClick={() => setReviewPly(null)}>⏭</button>
            </div>
          </div>

          {incomingDrawOffer && (
            <div className="draw-offer-banner">
              <strong>🤝 {oppName} ofereceu empate</strong>
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button
                  type="button"
                  className="primary"
                  style={{ flex: 1, padding: '7px 10px', fontSize: 13 }}
                  onClick={() => sendSocket('game:draw-respond', { accept: true })}
                >
                  Aceitar Empate
                </button>
                <button
                  type="button"
                  className="secondary"
                  style={{ flex: 1, padding: '7px 10px', fontSize: 13 }}
                  onClick={() => sendSocket('game:draw-respond', { accept: false })}
                >
                  Recusar
                </button>
              </div>
            </div>
          )}

          <div className="hud-card classic-actions-card">
            <div className="classic-action-btns">
              <button
                type="button"
                className="secondary"
                disabled={!S || S.over || outgoingDrawOffer || drawChecking}
                onClick={handleOfferDraw}
              >
                {outgoingDrawOffer ? '⏳ Empate oferecido' : drawChecking ? 'Avaliando...' : '🤝 Oferecer Empate'}
              </button>
              <button
                type="button"
                className="danger-btn"
                disabled={!S || S.over}
                onClick={() => setConfirmExit('resign')}
              >
                🏳️ Desistir
              </button>
            </div>

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
                📊 Abrir Revisão Completa (Stockfish)
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
        title={
          confirmExit === 'local_draw'
            ? 'Confirmar empate por acordo?'
            : confirmExit === 'resign'
              ? 'Desistir da partida?'
              : 'Sair para o menu de Xadrez Clássico?'
        }
        message={
          confirmExit === 'local_draw'
            ? 'Ambos os jogadores concordam em encerrar a partida local empatada (½–½)?'
            : confirmExit === 'resign'
              ? 'Desistir encerrará imediatamente a partida e contará vitória para o adversário.'
              : 'Se a partida ainda estiver em andamento, sair contará como desistência.'
        }
        confirmLabel={
          confirmExit === 'local_draw'
            ? 'Confirmar Empate'
            : confirmExit === 'resign'
              ? 'Confirmar Desistência'
              : 'Sair da Partida'
        }
        danger={confirmExit !== 'local_draw'}
        onConfirm={handleConfirmExit}
        onCancel={() => setConfirmExit(null)}
      />
    </div>
  );
}
