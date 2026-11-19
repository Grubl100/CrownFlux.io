import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { useMatchSession } from '../../contexts/MatchSessionContext.jsx';
import {
  createClassicState,
  getClassicMoves,
  handleClassicClick,
  stepClassicState,
} from '../../game/classicEngine.js';
import { drawClassicBoard } from '../../game/classicRenderer.js';
import { CPU_LEVELS, FAC } from '../../utils/constants.js';
import { fmtChessClock } from '../../utils/format.js';
import { playTone } from '../../utils/sound.js';
import ConfirmModal from '../ConfirmModal.jsx';
import MatchControls from '../MatchControls.jsx';

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
  const S = {
    mode: 'online',
    classic: true,
    N: 8,
    T: onlineData.T || 0,
    turnOwner: onlineData.turn ?? 0,
    turn: onlineData.turn ?? 0,
    chessClock: onlineData.clocks || [180, 180],
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
    moveHistory: [],
  };
  return S;
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
  const viewerSide = isOnline ? Number(match.onlineState?.side) || 0 : 0;

  const canvasRef = useRef(null);
  const stateRef = useRef(null);
  const cellRef = useRef(64);
  const dprRef = useRef(1);
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;
  const finishHandledRef = useRef(false);
  const selectedIdRef = useRef(null);

  const [hudTick, setHudTick] = useState(0);
  const [confirmExit, setConfirmExit] = useState(null);

  const emitEvent = useCallback((type, payload) => {
    if (type === 'sound') {
      playTone(payload, prefsRef.current?.soundEffects !== false);
    } else if (type === 'gameover') {
      if (finishHandledRef.current) return;
      finishHandledRef.current = true;
      const S = stateRef.current;
      const oppName = S.mode === 'classic_local'
        ? 'Xadrez Local (Pretas)'
        : `Bot Xadrez (${CPU_LEVELS.find((c) => c.level === S.cpuDifficulty)?.name || 'Normal'})`;
      const isMate = Number.isInteger(S.checkmatedKingOwner);
      recordAndFinishOfflineMatch({
        matchId: match.matchId,
        mode: S.mode,
        difficulty: S.cpuDifficulty || null,
        winner: payload.winner,
        reason: payload.reason,
        duration: S.T,
        myScore: S.f[0]?.score || 0,
        oppScore: S.f[1]?.score || 0,
        opponentName: oppName,
        replayConfig: match.config,
        skipRedirect: isMate, // show checkmate banner directly on board first, with button to open results
      });
    }
  }, [match.matchId, match.config, recordAndFinishOfflineMatch]);

  useEffect(() => {
    finishHandledRef.current = false;
    selectedIdRef.current = null;
    if (!isOnline) {
      const cfg = match.config || {};
      stateRef.current = createClassicState({
        mode: cfg.mode || 'classic_cpu',
        timeControl: cfg.timeControl || 'blitz3',
        cpuDifficulty: cfg.cpuDifficulty || 3,
      });
      setHudTick((t) => t + 1);
    }
    return () => {
      stateRef.current = null;
    };
  }, [match.matchId, isOnline]);

  useEffect(() => {
    if (!isOnline || !match.onlineState) return;
    stateRef.current = convertOnlineClassic(match.onlineState, selectedIdRef.current);
    setHudTick((t) => t + 1);
  }, [isOnline, match.onlineState]);

  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const wide = window.innerWidth > 960;
    const availW = wide ? Math.min(720, window.innerWidth - 360) : window.innerWidth - 24;
    const availH = wide ? window.innerHeight - 130 : Math.min(window.innerHeight * 0.64, 540);
    const size = Math.max(256, Math.min(688, availW, availH));
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

  useEffect(() => {
    let rafId = 0;
    let last = performance.now();
    let hudTimer = 0;
    const tick = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const S = stateRef.current;
      if (S) {
        if (!isOnline && !confirmExit) {
          stepClassicState(S, dt, emitEvent);
        }
        const canvas = canvasRef.current;
        if (canvas) {
          const ctx = canvas.getContext('2d');
          drawClassicBoard(ctx, canvas, S, cellRef.current, dprRef.current, prefsRef.current, viewerSide);
        }
      }
      hudTimer += dt;
      if (hudTimer >= 0.16) {
        hudTimer = 0;
        setHudTick((t) => t + 1);
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [isOnline, confirmExit, emitEvent, viewerSide]);

  const onCanvasPointerDown = (e) => {
    const S = stateRef.current;
    const canvas = canvasRef.current;
    if (!S || !canvas || S.over || confirmExit) return;
    const rect = canvas.getBoundingClientRect();
    const x = Math.floor((e.clientX - rect.left) / cellRef.current);
    const y = Math.floor((e.clientY - rect.top) / cellRef.current);
    if (x < 0 || y < 0 || x >= 8 || y >= 8) return;

    if (isOnline) {
      if (S.turnOwner !== viewerSide) return;
      const q = S.grid[y]?.[x];
      const s = S.sel;
      if (s && getClassicMoves(S, s).some((m) => m[0] === x && m[1] === y)) {
        sendSocket('game:move', { pieceId: s.id, x, y });
        S.sel = null;
        selectedIdRef.current = null;
        setHudTick((t) => t + 1);
        return;
      }
      if (q && q.o === viewerSide) {
        S.sel = q;
        selectedIdRef.current = q.id;
      } else {
        S.sel = null;
        selectedIdRef.current = null;
      }
      setHudTick((t) => t + 1);
      return;
    }

    handleClassicClick(S, x, y, emitEvent);
    selectedIdRef.current = S.sel?.id || null;
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
        emitEvent('gameover', { winner: 1, reason: 'Você desistiu da partida.' });
      }
      return;
    }
    if (modeAction === 'menu') {
      if (isOnline && S && !S.over) sendSocket('game:resign');
      clearMatchSession();
      navigate('/modes/classic');
    }
  };

  const openResultsAfterMate = () => {
    const S = stateRef.current;
    if (!S) return;
    if (isOnline) {
      setActiveMatch(null);
      navigate(`/results/${match.matchId}`);
      return;
    }
    setActiveMatch(null);
    navigate(`/results/${match.matchId}`);
  };

  const S = stateRef.current;
  const oppName = isOnline
    ? match.onlineState?.opponent?.displayName || match.onlineState?.opponent?.username || 'Adversário'
    : S?.mode === 'classic_local'
      ? 'Pretas (Local)'
      : `Bot (${CPU_LEVELS.find((c) => c.level === S?.cpuDifficulty)?.name || 'Normal'})`;
  const activeTurn = S?.turnOwner ?? 0;
  const myCategory = match.onlineState?.options?.category || 'blitz';
  const myRating = user?.stats?.classicRatings?.[myCategory] || 1200;

  return (
    <div className="match-classic-layout">
      <div className="match-topbar">
        <div className="match-topbar-left">
          <span className="mode-pill-tag">
            XADREZ CLÁSSICO 8×8 · {S?.clockControlLabel || 'Blitz'}
            {match.onlineState?.rated ? ' · RANQUEADA' : ''}
          </span>
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

      <div className="match-play-grid">
        <section className="match-board-stage">
          {S?.over && Number.isInteger(S.checkmatedKingOwner) && (
            <div className="classic-mate-banner">
              <strong>
                {S.winner === viewerSide ? '♔ XEQUE-MATE · VOCÊ VENCEU!' : '♚ XEQUE-MATE · DERROTA'}
              </strong>
              <div className="classic-mate-actions">
                <button type="button" className="primary" onClick={openResultsAfterMate}>
                  Ver Resultados
                </button>
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
                      setMatchResult(null);
                      stateRef.current = createClassicState(match.config || {});
                      setHudTick((t) => t + 1);
                    }}
                  >
                    Jogar Novamente
                  </button>
                )}
              </div>
            </div>
          )}

          <div className="board-wrap-react">
            <canvas
              ref={canvasRef}
              onPointerDown={onCanvasPointerDown}
              aria-label="Tabuleiro de Xadrez Clássico 8x8"
            />
          </div>
          <div className="board-footer-hint">
            Regras oficiais do Xadrez Clássico: Roque, En Passant, Promoção, Xeque-mate e Relógio.
          </div>
        </section>

        <aside className="match-hud-sidebar">
          <div className="hud-card">
            <div className="hud-card-head">
              <h3>Relógios & Jogadores</h3>
              <span className="pill">{S?.over ? 'Encerrada' : activeTurn === viewerSide ? 'Sua vez' : 'Vez do rival'}</span>
            </div>
            <div className="chess-clocks-stack">
              {[1 - viewerSide, viewerSide].map((side) => {
                const isMe = side === viewerSide;
                const active = !S?.over && activeTurn === side;
                return (
                  <div key={side} className={`chess-clock-row${active ? ' active' : ''}`}>
                    <div className="chess-clock-who">
                      <span className="dot" style={{ background: FAC[side].col }} />
                      <div>
                        <strong>{isMe ? (isOnline ? `Você · ${myRating}` : 'Brancas / Azul') : oppName}</strong>
                        <small>{side === 0 ? 'Brancas' : 'Pretas'}</small>
                      </div>
                    </div>
                    <strong className="chess-clock-time">
                      {fmtChessClock(S?.chessClock?.[side] || 0)}
                    </strong>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="hud-card">
            <div className="hud-card-head">
              <h3>Histórico de Lances</h3>
            </div>
            <div className="classic-moves-list">
              {(S?.moveHistory?.length ? S.moveHistory : S?.events || []).slice(0, 12).map((item, idx) => (
                <div key={idx} className="classic-move-item">
                  <span>{item.glyph || '♟'} {item.text || item.msg}</span>
                </div>
              ))}
              {(!S?.moveHistory?.length && (!S?.events || S.events.length <= 1)) && (
                <div className="muted" style={{ fontSize: 12.5 }}>Aguardando o primeiro lance...</div>
              )}
            </div>
          </div>
        </aside>
      </div>

      <ConfirmModal
        open={Boolean(confirmExit)}
        title={confirmExit === 'resign' ? 'Abandonar partida de Xadrez?' : 'Sair do Xadrez Clássico?'}
        message={
          confirmExit === 'resign'
            ? 'Desistir contabiliza derrota imediata nesta partida.'
            : 'Sair agora encerrará a partida atual e retornará para a página do Xadrez Clássico.'
        }
        confirmLabel={confirmExit === 'resign' ? 'Sim, desistir' : 'Voltar ao Clássico'}
        onConfirm={handleConfirmExit}
        onCancel={() => setConfirmExit(null)}
      />
    </div>
  );
}
