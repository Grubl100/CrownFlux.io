import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { useMatchSession } from '../../contexts/MatchSessionContext.jsx';
import { useToast } from '../../contexts/ToastContext.jsx';
import {
  activateDuelSkill,
  calcAtt,
  createDuelState,
  handleDuelCellClick,
  setTutorialStep,
  stepDuelState,
  teamDisplayName,
} from '../../game/duelEngine.js';
import { drawDuelBoard } from '../../game/duelRenderer.js';
import { CPU_LEVELS, DOCTRINES_INFO, FAC, GROW, NOME, TUTORIAL_STEPS } from '../../utils/constants.js';
import { fmtTime } from '../../utils/format.js';
import { playTone } from '../../utils/sound.js';
import ConfirmModal from '../ConfirmModal.jsx';
import MatchControls from '../MatchControls.jsx';

function convertOnlineToRenderState(onlineData, prevPieces = []) {
  if (!onlineData) return null;
  const N = 16;
  const prevMap = new Map(prevPieces.map((p) => [p.id, p]));
  const nowT = onlineData.T || 0;
  const pieces = (onlineData.pieces || []).map((p) => {
    const prev = prevMap.get(p.id);
    const moved = prev && (prev.x !== p.x || prev.y !== p.y);
    return {
      id: p.id,
      t: p.type,
      o: p.owner,
      x: p.x,
      y: p.y,
      ready: p.ready,
      cd0: p.cd0 || 1,
      q: null,
      shield: p.shield || 0,
      chargeUntil: p.chargeUntil || 0,
      animFromX: moved ? prev.x : prev?.animFromX ?? p.x,
      animFromY: moved ? prev.y : prev?.animFromY ?? p.y,
      animAt: moved ? nowT : prev?.animAt ?? -10,
      animDur: 0.14,
    };
  });
  const grid = Array.from({ length: N }, () => Array(N).fill(null));
  for (const p of pieces) {
    if (p.x >= 0 && p.y >= 0 && p.x < N && p.y < N) grid[p.y][p.x] = p;
  }
  const teams = (onlineData.teams || []).map((t) => ({
    id: t.id,
    score: t.score || 0,
    xp: t.xp || 0,
    lvl: t.level || 0,
    alive: t.alive !== false,
    kings: t.kings || 0,
    energy: t.energy || 0,
    boostUntil: t.boostUntil || 0,
    aegisCooldownUntil: t.aegisCooldownUntil || 0,
    captures: t.captures || 0,
    doctrine: t.doctrine || 'vanguard',
    crownProgress: t.crownProgress || 0,
  }));

  const state = {
    mode: 'online',
    isArena: false,
    is1v1Rules: true,
    N,
    T: nowT,
    phase: onlineData.phase || 'development',
    crown: onlineData.crown || null,
    zones: onlineData.zones || [],
    grid,
    pieces,
    orbs: onlineData.orbs || [],
    f: teams,
    sel: null,
    over: Boolean(onlineData.over),
    started: true,
    att: null,
    fx: [],
    events: onlineData.events || [],
    lastMove: onlineData.lastMove || null,
  };
  calcAtt(state);
  return state;
}

export default function DuelMatchView({ match }) {
  const navigate = useNavigate();
  const { prefs } = useAuth();
  const { showToast } = useToast();
  const {
    clearMatchSession,
    recordAndFinishOfflineMatch,
    sendSocket,
  } = useMatchSession();

  const isOnline = match.kind === 'online_duel';
  const isArena = match.kind === 'offline_arena' || match.config?.mode === 'arena';
  const isTutorial = match.kind === 'offline_tutorial' || match.config?.mode === 'tutorial';
  const viewerSide = isOnline ? Number(match.onlineState?.side) || 0 : 0;

  const canvasRef = useRef(null);
  const stateRef = useRef(null);
  const cellRef = useRef(36);
  const dprRef = useRef(1);
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;
  const finishHandledRef = useRef(false);
  const lastDecisiveIdRef = useRef(null);
  const selectedIdRef = useRef(null);

  const [hudTick, setHudTick] = useState(0);
  const [decisiveBanner, setDecisiveBanner] = useState(null);
  const [confirmExit, setConfirmExit] = useState(null); // 'resign' | 'menu' | null
  const [tutorialModalOpen, setTutorialModalOpen] = useState(false);

  const emitEvent = useCallback((type, payload) => {
    if (type === 'sound') {
      playTone(payload, prefsRef.current?.soundEffects !== false);
    } else if (type === 'toast') {
      showToast(payload);
    } else if (type === 'decisive') {
      setDecisiveBanner(payload);
      setTimeout(() => {
        setDecisiveBanner((cur) => (cur?.id === payload.id ? null : cur));
      }, 2800);
    } else if (type === 'gameover') {
      if (finishHandledRef.current) return;
      finishHandledRef.current = true;
      const S = stateRef.current;
      const oppName = S.mode === 'cpu'
        ? `CPU (${CPU_LEVELS.find((c) => c.level === S.cpuDifficulty)?.name || 'Normal'})`
        : S.mode === 'tutorial'
          ? 'Mentor Rubi (Tutorial)'
          : S.mode === 'duel'
            ? 'Duelo Local'
            : 'Arena 4 Jogadores';
      recordAndFinishOfflineMatch({
        matchId: match.matchId,
        mode: S.mode,
        difficulty: S.cpuDifficulty || null,
        winner: payload.winner,
        reason: payload.reason,
        winCondition: payload.winCondition,
        duration: S.T,
        myScore: S.f[0]?.score || 0,
        oppScore: S.f[1]?.score || 0,
        myCrown: S.f[0]?.crownProgress || 0,
        oppCrown: S.f[1]?.crownProgress || 0,
        opponentName: oppName,
        skillsUsed: S.skillsUsedCount || 0,
        oppMaxCrown: S.f[1]?.maxCrownProgress || 0,
        replayConfig: match.config,
      });
    }
  }, [match.matchId, match.config, recordAndFinishOfflineMatch, showToast]);

  // Initialize offline match once per matchId
  useEffect(() => {
    finishHandledRef.current = false;
    selectedIdRef.current = null;
    if (!isOnline) {
      const cfg = match.config || {};
      stateRef.current = createDuelState({
        mode: cfg.mode || (isArena ? 'arena' : isTutorial ? 'tutorial' : 'cpu'),
        cpuDifficulty: cfg.cpuDifficulty || 3,
        doctrine: cfg.doctrine || prefsRef.current?.doctrine || 'vanguard',
      });
      setHudTick((t) => t + 1);
    }
    return () => {
      stateRef.current = null;
    };
  }, [match.matchId, isOnline, isArena, isTutorial]);

  // Sync online match state
  useEffect(() => {
    if (!isOnline || !match.onlineState) return;
    const prevPieces = stateRef.current?.pieces || [];
    const converted = convertOnlineToRenderState(match.onlineState, prevPieces);
    if (selectedIdRef.current) {
      converted.sel = converted.pieces.find((p) => p.id === selectedIdRef.current) || null;
    }
    stateRef.current = converted;

    const dm = match.onlineState.decisiveMoment;
    if (dm && dm.id && dm.id !== lastDecisiveIdRef.current) {
      lastDecisiveIdRef.current = dm.id;
      setDecisiveBanner(dm);
      if (dm.kind === 'gold') playTone('crown', prefsRef.current?.soundEffects !== false);
      setTimeout(() => {
        setDecisiveBanner((cur) => (cur?.id === dm.id ? null : cur));
      }, 2800);
    }
    setHudTick((t) => t + 1);
  }, [isOnline, match.onlineState]);

  // Resize canvas dynamically to keep board huge and centered
  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const wide = window.innerWidth > 960;
    const headerAllowance = isArena ? 74 : 126;
    const tutAllowance = isTutorial ? 105 : 0;
    const availW = wide ? Math.min(820, window.innerWidth - 380) : window.innerWidth - 24;
    const availH = wide
      ? window.innerHeight - headerAllowance - tutAllowance
      : Math.min(window.innerHeight * 0.65, 560);
    const size = Math.max(256, Math.min(784, availW, availH));
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cell = Math.max(16, Math.floor(size / 16));
    const px = cell * 16;
    cellRef.current = cell;
    dprRef.current = dpr;
    canvas.style.width = `${px}px`;
    canvas.style.height = `${px}px`;
    canvas.width = Math.floor(px * dpr);
    canvas.height = Math.floor(px * dpr);
  }, [isArena, isTutorial]);

  useEffect(() => {
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    return () => window.removeEventListener('resize', resizeCanvas);
  }, [resizeCanvas]);

  // Game animation & simulation loop
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
          stepDuelState(S, dt, emitEvent);
        }
        const canvas = canvasRef.current;
        if (canvas) {
          const ctx = canvas.getContext('2d');
          drawDuelBoard(ctx, canvas, S, cellRef.current, dprRef.current, prefsRef.current, viewerSide);
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

  const activeOwner = useCallback(() => {
    const S = stateRef.current;
    if (!S) return 0;
    if (isOnline) return viewerSide;
    if (S.mode === 'duel' && S.sel && S.sel.o >= 0) return S.sel.o;
    return 0;
  }, [isOnline, viewerSide]);

  const handleSkill = useCallback((skill) => {
    const S = stateRef.current;
    if (!S || S.over) return;
    if (isOnline) {
      sendSocket('game:skill', { skill, pieceId: S.sel?.id ?? null });
      return;
    }
    activateDuelSkill(S, activeOwner(), skill, S.sel, emitEvent);
    setHudTick((t) => t + 1);
  }, [isOnline, sendSocket, activeOwner, emitEvent]);

  // Keyboard shortcuts: ESC, 1, 2, 3, Space
  useEffect(() => {
    const onKey = (e) => {
      const editing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target?.tagName);
      if (editing) return;
      const S = stateRef.current;
      if (!S || S.over) return;
      if (e.code === 'Escape') {
        S.sel = null;
        selectedIdRef.current = null;
        setHudTick((t) => t + 1);
      } else if (!isArena && (e.code === 'Digit1' || e.code === 'Numpad1')) {
        e.preventDefault();
        handleSkill('charge');
      } else if (!isArena && (e.code === 'Digit2' || e.code === 'Numpad2')) {
        e.preventDefault();
        handleSkill('aegis');
      } else if (e.code === 'Digit3' || e.code === 'Numpad3' || e.code === 'Space') {
        e.preventDefault();
        handleSkill('surge');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isArena, handleSkill]);

  const onCanvasPointerDown = (e) => {
    const S = stateRef.current;
    const canvas = canvasRef.current;
    if (!S || !canvas || S.over || confirmExit) return;
    const rect = canvas.getBoundingClientRect();
    const x = Math.floor((e.clientX - rect.left) / cellRef.current);
    const y = Math.floor((e.clientY - rect.top) / cellRef.current);
    if (x < 0 || y < 0 || x >= 16 || y >= 16) return;

    if (isOnline) {
      const q = S.grid[y]?.[x];
      const s = S.sel;
      if (s) {
        if (s.ready <= S.T) {
          sendSocket('game:move', { pieceId: s.id, x, y });
          S.sel = null;
          selectedIdRef.current = null;
        } else if (q && q.o === viewerSide) {
          S.sel = q;
          selectedIdRef.current = q.id;
        } else {
          showToast('Essa peça ainda está se recuperando.');
        }
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

    handleDuelCellClick(S, x, y, prefs, emitEvent);
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
        emitEvent('gameover', { winner: 1, reason: 'Você desistiu da partida.' });
      }
      return;
    }
    if (modeAction === 'menu') {
      if (isOnline && S && !S.over) sendSocket('game:resign');
      clearMatchSession();
      navigate(isArena ? '/modes/duelo/4-players' : '/modes/duelo');
    }
  };

  const S = stateRef.current;
  const oppDisplay = isOnline
    ? match.onlineState?.opponent?.displayName || match.onlineState?.opponent?.username || 'Adversário'
    : teamDisplayName(S?.mode || 'cpu', 1);
  const owner = activeOwner();
  const myTeam = S?.f?.[owner] || { score: 0, xp: 0, lvl: 0, energy: 0, alive: true, boostUntil: 0, aegisCooldownUntil: 0, doctrine: 'vanguard', crownProgress: 0 };
  const needXp = 4 + (myTeam.lvl || 0) * 3;
  const teamsToShow = isArena ? [0, 1, 2, 3] : [0, 1];
  const tut = S?.tutorial;
  const tutStepInfo = tut?.active ? TUTORIAL_STEPS.find((s) => s.step === tut.step) || TUTORIAL_STEPS[0] : null;
  const p0Crown = Math.min(100, Math.round(S?.f?.[viewerSide]?.crownProgress || 0));
  const p1Crown = Math.min(100, Math.round(S?.f?.[1 - viewerSide]?.crownProgress || 0));

  return (
    <div className="match-duel-layout">
      <div className="match-topbar">
        <div className="match-topbar-left">
          <span className="mode-pill-tag">
            {isArena ? 'ARENA · 4 JOGADORES' : isTutorial ? 'TUTORIAL · DUELO 1V1' : isOnline ? 'DUELO 1V1 ONLINE' : S?.mode === 'duel' ? 'DUELO LOCAL 1V1' : 'DUELO 1V1 VS BOT'}
          </span>
          {!isArena && S && (
            <span className={`phase-pill${S.phase === 'ascension' ? ' phase-ascension' : ''}`}>
              {S.phase === 'ascension'
                ? 'FASE III · ASCENSÃO IMPERIAL'
                : S.phase === 'confrontation'
                  ? 'FASE II · CONFRONTO PELA COROA'
                  : 'FASE I · DESENVOLVIMENTO'}
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
              navigate(isArena ? '/modes/duelo/4-players' : '/modes/duelo');
            }
          }}
          resignDisabled={!S || S.over}
        />
      </div>

      {!isArena && S?.crown && (
        <div className="crown-status-bar">
          <div className="crown-bar-side">
            <span className="crown-side-label">
              <i className="dot" style={{ background: FAC[viewerSide].col }} />
              {isOnline ? 'Você' : teamDisplayName(S.mode, 0)}
            </span>
            <div className="crown-Dom-track">
              <div className="crown-dom-fill blue" style={{ width: `${p0Crown}%` }} />
            </div>
            <strong className="crown-dom-pct">{p0Crown}%</strong>
          </div>
          <div
            className={`crown-center-badge${
              S.crown.state === 'free' ? ' free' : S.crown.state === 'held' ? (S.crown.owner === viewerSide ? ' held-0' : ' held-1') : ''
            }`}
          >
            <span className="crown-glyph">👑</span>
            <span>
              {S.crown.state === 'sealed'
                ? `COROA SELADA (${Math.max(0, Math.ceil(S.crown.unlockAt - S.T))}s)`
                : S.crown.state === 'free'
                  ? `COROA LIVRE EM (${S.crown.x + 1},${16 - S.crown.y})`
                  : `COM ${S.crown.owner === viewerSide ? 'VOCÊ' : oppDisplay.toUpperCase()}`}
            </span>
          </div>
          <div className="crown-bar-side right">
            <strong className="crown-dom-pct">{p1Crown}%</strong>
            <div className="crown-Dom-track">
              <div className="crown-dom-fill ruby" style={{ width: `${p1Crown}%` }} />
            </div>
            <span className="crown-side-label">
              {oppDisplay}
              <i className="dot" style={{ background: FAC[1 - viewerSide].col }} />
            </span>
          </div>
        </div>
      )}

      {isTutorial && tut?.active && tutStepInfo && (
        <div className="tutorial-top-strip">
          <div className="tut-top">
            <span className="tut-step-badge">Etapa {tutStepInfo.step} de {TUTORIAL_STEPS.length}</span>
            <div className="tut-progress-track">
              <div className="tut-progress-fill" style={{ width: `${Math.round((tutStepInfo.step / TUTORIAL_STEPS.length) * 100)}%` }} />
            </div>
            <div className="tut-controls">
              <button
                type="button"
                className="mini-btn"
                disabled={tut.step <= 1}
                onClick={() => { setTutorialStep(S, tut.step - 1); setHudTick((t) => t + 1); }}
              >
                ◀ Anterior
              </button>
              <button type="button" className="mini-btn" onClick={() => setTutorialModalOpen(true)}>
                📖 Etapas
              </button>
              <button
                type="button"
                className="mini-btn"
                onClick={() => { tut.paused = !tut.paused; setHudTick((t) => t + 1); }}
              >
                {tut.paused ? 'Continuar' : 'Pausar'}
              </button>
              <button
                type="button"
                className="mini-btn"
                onClick={() => {
                  if (tut.step < TUTORIAL_STEPS.length) {
                    setTutorialStep(S, tut.step + 1);
                    setHudTick((t) => t + 1);
                  } else {
                    emitEvent('gameover', { winner: 0, reason: 'Tutorial concluído pelo jogador.' });
                  }
                }}
              >
                Avançar →
              </button>
            </div>
          </div>
          <div className="tut-strip-body">
            <strong>{tutStepInfo.step}. {tutStepInfo.title}</strong>
            <span>{tutStepInfo.text}</span>
            {tut.hint && <div className="tut-hint">{tut.hint}</div>}
          </div>
        </div>
      )}

      <div className="match-play-grid">
        <section className="match-board-stage">
          <div className="board-wrap-react">
            <canvas
              ref={canvasRef}
              onPointerDown={onCanvasPointerDown}
              aria-label="Tabuleiro 16x16 do Crownflux.io"
            />
            {decisiveBanner && (
              <div className={`decisive-banner ${decisiveBanner.kind || 'gold'}`}>
                <span className="decisive-ic">{decisiveBanner.icon || '👑'}</span>
                <div>
                  <strong>{decisiveBanner.title}</strong>
                  <span>{decisiveBanner.subtitle || decisiveBanner.sub}</span>
                </div>
              </div>
            )}
          </div>
          <div className="board-footer-hint">
            {isArena
              ? 'Arena 4 Facções: capture os Reis inimigos para converter exércitos · ESC cancela seleção · ESPAÇO ativa o Surto.'
              : 'Toque numa peça aliada e no destino · [1] Investida · [2] Égide · [3/Espaço] Surto · Conquiste a Coroa Imperial (👑) ou o Rei!'}
          </div>
        </section>

        <aside className="match-hud-sidebar">
          {/* Players / Scores */}
          <div className="hud-card" id="scoreCard">
            <div className="hud-card-head">
              <h3>{isArena ? 'Facções na Arena' : 'Jogadores'}</h3>
              <span className="pill">⏱ {fmtTime(S?.T || 0)}</span>
            </div>
            <div className="hud-player-list">
              {teamsToShow.map((tid) => {
                const f = S?.f?.[tid];
                if (!f) return null;
                const count = S.pieces.filter((p) => p.o === tid).length;
                const isMe = tid === viewerSide;
                const name = isOnline ? (isMe ? 'Você' : oppDisplay) : teamDisplayName(S.mode, tid);
                const docIcon = !isArena ? DOCTRINES_INFO[f.doctrine]?.icon || '⚔️' : '';
                return (
                  <div key={tid} className={`player-row${isMe ? ' me' : ''}`}>
                    <span className="dot" style={{ background: FAC[tid].col }} />
                    <span className="name">{docIcon} {name}</span>
                    {!f.alive ? (
                      <span className="dead">☠ fora</span>
                    ) : (
                      <span className="count">{!isArena ? `👑${Math.round(f.crownProgress || 0)}% · ` : ''}{count}p</span>
                    )}
                    <span className="score">{f.score} pts</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Strategic Regions (Only 1v1 Duel) */}
          {!isArena && S?.zones?.length > 0 && (
            <div className="hud-card">
              <div className="hud-card-head">
                <h3>Regiões Estratégicas</h3>
              </div>
              <div className="zones-hud-strip">
                {S.zones.map((z) => {
                  const cls = z.contested ? 'contested' : z.owner === viewerSide ? 'owned-0' : z.owner >= 0 ? 'owned-1' : '';
                  const ownerLabel = z.contested
                    ? 'Em disputa'
                    : z.owner >= 0
                      ? (z.owner === viewerSide ? 'Você' : oppDisplay)
                      : z.id === 'throne' ? 'Centro' : 'Neutro';
                  return (
                    <div key={z.id} className={`zone-chip ${cls}`} title={`${z.name}: ${z.bonus}`}>
                      <span>{z.icon} {z.short}</span>
                      <strong>{ownerLabel}</strong>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Evolution + Flux Skills */}
          <div className="hud-card" id="progressCard">
            <div className="hud-card-head">
              <h3>{isArena ? 'Sua Evolução' : `Fluxo · ${DOCTRINES_INFO[myTeam.doctrine]?.name || 'Vanguarda'}`}</h3>
              <span className="pill">Nível {myTeam.lvl || 0}</span>
            </div>
            <div className="stat-bar-row">
              <span>XP ({myTeam.xp || 0} / {needXp})</span>
              <span className="muted">Reforço: {NOME[GROW[Math.min(myTeam.lvl || 0, GROW.length - 1)]]}</span>
            </div>
            <div className="bar-track"><div className="bar-fill gold" style={{ width: `${Math.min(100, ((myTeam.xp || 0) / needXp) * 100)}%` }} /></div>

            <div className="stat-bar-row" style={{ marginTop: 10 }}>
              <span>Energia de Fluxo</span>
              <strong>{Math.floor(myTeam.energy || 0)}%</strong>
            </div>
            <div className="bar-track"><div className="bar-fill blue" style={{ width: `${Math.min(100, myTeam.energy || 0)}%` }} /></div>

            {isArena ? (
              <button
                type="button"
                className={`skill-btn surge-only${(myTeam.energy || 0) >= 100 && myTeam.alive ? ' ready' : ''}`}
                disabled={!myTeam.alive || (myTeam.energy || 0) < 100 || (myTeam.boostUntil || 0) > (S?.T || 0)}
                onClick={() => handleSkill('surge')}
              >
                {(myTeam.boostUntil || 0) > (S?.T || 0)
                  ? `🔥 SURTO ATIVO · ${(myTeam.boostUntil - S.T).toFixed(1)}s`
                  : (myTeam.energy || 0) >= 100
                    ? '⚡ ATIVAR SURTO [Espaço]'
                    : `SURTO · ${Math.floor(myTeam.energy || 0)}%`}
              </button>
            ) : (
              <div className="flux-skills-grid">
                <button
                  type="button"
                  className={`skill-btn${myTeam.alive && (myTeam.energy || 0) >= 45 && !S?.over ? ' ready' : ''}`}
                  disabled={!myTeam.alive || (myTeam.energy || 0) < 45 || S?.over}
                  onClick={() => handleSkill('charge')}
                >
                  <div className="skill-top"><strong>⚡ Investida</strong><kbd>1</kbd></div>
                  <small>45% · Zera recarga</small>
                </button>
                <button
                  type="button"
                  className={`skill-btn${myTeam.alive && (myTeam.energy || 0) >= 60 && (myTeam.aegisCooldownUntil || 0) <= (S?.T || 0) && !S?.over ? ' ready' : ''}`}
                  disabled={!myTeam.alive || (myTeam.energy || 0) < 60 || (myTeam.aegisCooldownUntil || 0) > (S?.T || 0) || S?.over}
                  onClick={() => handleSkill('aegis')}
                >
                  <div className="skill-top"><strong>🛡️ Égide Real</strong><kbd>2</kbd></div>
                  <small>
                    {(myTeam.aegisCooldownUntil || 0) > (S?.T || 0)
                      ? `Recarga ${(myTeam.aegisCooldownUntil - S.T).toFixed(1)}s`
                      : '60% · Escudo Real'}
                  </small>
                </button>
                <button
                  type="button"
                  className={`skill-btn${myTeam.alive && (myTeam.energy || 0) >= 100 && !S?.over ? ' ready' : ''}`}
                  disabled={!myTeam.alive || (myTeam.energy || 0) < 100 || S?.over || (myTeam.boostUntil || 0) > (S?.T || 0)}
                  onClick={() => handleSkill('surge')}
                >
                  <div className="skill-top">
                    <strong>
                      {(myTeam.boostUntil || 0) > (S?.T || 0)
                        ? `🔥 SURTO (${(myTeam.boostUntil - S.T).toFixed(1)}s)`
                        : '🔥 Surto Imperial'}
                    </strong>
                    <kbd>Espaço</kbd>
                  </div>
                  <small>{(myTeam.energy || 0) >= 100 ? 'PRONTO · Acelera exército' : `${Math.floor(myTeam.energy || 0)}% / 100%`}</small>
                </button>
              </div>
            )}
          </div>

          {/* Events Feed */}
          <div className="hud-card">
            <div className="hud-card-head">
              <h3>Registro de Batalha</h3>
            </div>
            <div className="feed-list">
              {(S?.events || []).slice(0, 5).map((ev, idx) => (
                <div key={idx} className="feed-item">
                  <i className="feed-mark" />
                  <span dangerouslySetInnerHTML={{ __html: ev.msg }} />
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>

      <ConfirmModal
        open={Boolean(confirmExit)}
        title={confirmExit === 'resign' ? 'Desistir da partida?' : 'Voltar ao menu?'}
        message={
          confirmExit === 'resign'
            ? 'Desistir encerra a partida imediatamente como derrota.'
            : isOnline
              ? 'Você está em uma partida online em andamento. Sair agora encerrará sua participação como desistência.'
              : 'Deseja encerrar a partida atual e voltar para a tela da modalidade?'
        }
        confirmLabel={confirmExit === 'resign' ? 'Sim, desistir' : 'Sair para o menu'}
        onConfirm={handleConfirmExit}
        onCancel={() => setConfirmExit(null)}
      />

      {tutorialModalOpen && (
        <div className="modal-backdrop">
          <div className="modal-card modal-wide">
            <div className="modal-head">
              <h2>Etapas do Tutorial do Duelo</h2>
              <button type="button" className="icon-close" onClick={() => setTutorialModalOpen(false)}>×</button>
            </div>
            <div className="review-list">
              {TUTORIAL_STEPS.map((st) => (
                <div key={st.step} className={`review-step-item${tut?.step === st.step ? ' current' : ''}`}>
                  <div className="review-head">
                    <strong>Etapa {st.step} — {st.title}</strong>
                    <button
                      type="button"
                      className="mini-btn"
                      onClick={() => {
                        setTutorialStep(S, st.step);
                        setTutorialModalOpen(false);
                        setHudTick((t) => t + 1);
                      }}
                    >
                      Ir para etapa
                    </button>
                  </div>
                  <p className="muted">{st.text}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
