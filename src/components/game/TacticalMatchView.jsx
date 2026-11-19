import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { useMatchSession } from '../../contexts/MatchSessionContext.jsx';
import { useToast } from '../../contexts/ToastContext.jsx';
import {
  BesiegerSvg,
  CARD_TYPE,
  CardArtSvg,
  CrownSvg,
  RULE_HINT,
  TACTICAL_COLS,
  WallSvg,
  WardenSvg,
  cardChips,
  cellName,
  describeTacticalEvent,
  targetsFor,
} from '../../game/tacticalData.jsx';
import { fmtMsClock, fmtSecs, manhattan } from '../../utils/format.js';
import { playTone } from '../../utils/sound.js';
import ConfirmModal from '../ConfirmModal.jsx';
import MatchControls from '../MatchControls.jsx';

export default function TacticalMatchView({ match }) {
  const navigate = useNavigate();
  const { prefs } = useAuth();
  const { showToast } = useToast();
  const { finishTacticalToResults, sendSocket } = useMatchSession();

  const st = match.tacticalState;
  const sfxEnabled = prefs?.soundEffects !== false;
  const [selectedUid, setSelectedUid] = useState(null);
  const [pendingAction, setPendingAction] = useState(false);
  const [feedback, setFeedback] = useState('Partida de Cerco Tático iniciada.');
  const [feedbackErr, setFeedbackErr] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [confirmModal, setConfirmModal] = useState(null); // 'menu' | 'resign' | null
  const [clockDisplay, setClockDisplay] = useState({ main: '0:00', sub: 'carregando...', warn: false, draftPct: 100 });

  const clockRef = useRef(null);
  const lastSeqRef = useRef(0);
  const prevWallsRef = useRef(new Set());
  const pendingTimerRef = useRef(null);

  useEffect(() => {
    if (!st) return;
    setPendingAction(false);
    clearTimeout(pendingTimerRef.current);
    clockRef.current = { ...st.clock, receivedAt: performance.now() };

    if (st.over) {
      const timer = setTimeout(() => {
        finishTacticalToResults(st);
      }, 900);
      return () => clearTimeout(timer);
    }

    const fresh = (st.recentEvents || []).filter((e) => (e.seq || 0) > lastSeqRef.current);
    const myName = st.self?.displayName || 'Você';
    const enemyName = st.opponent?.displayName || 'Adversário';
    for (const ev of fresh) {
      const txt = describeTacticalEvent(ev, st, myName, enemyName);
      if (txt && ev.type !== 'turn_end') {
        setFeedback(txt);
        setFeedbackErr(false);
      }
      if (ev.type === 'crown_captured') playTone('crown', sfxEnabled);
      else if (ev.type === 'melee_attack' || ev.type === 'crown_dropped') playTone('hit', sfxEnabled);
      else if (ev.type === 'card_played') playTone('card', sfxEnabled);
      else if (ev.type === 'move') playTone('move', sfxEnabled);
      else if (ev.type === 'turn_start' && ev.side === st.side) playTone('turn', sfxEnabled);
      else if (ev.type === 'crown_protected_hit') {
        playTone('deny', sfxEnabled);
        showToast('🔒 A Coroa está protegida neste turno!');
      }
    }
    lastSeqRef.current = Math.max(lastSeqRef.current, ...(st.recentEvents || []).map((e) => e.seq || 0));
  }, [st, finishTacticalToResults, sfxEnabled, showToast]);

  // Single monotonic clock ticker
  useEffect(() => {
    const timer = setInterval(() => {
      if (!st || !clockRef.current) return;
      const dt = performance.now() - clockRef.current.receivedAt;
      if (st.over) {
        setClockDisplay({ main: fmtMsClock(st.durationMs), sub: 'duração total', warn: false, draftPct: 0 });
        return;
      }
      if (st.phase === 'draft') {
        const frozen = st.frozen || st.tutorialFrozen;
        const rem = Math.max(0, st.draftRemainingMs - (frozen ? 0 : dt));
        setClockDisplay({
          main: fmtMsClock(rem),
          sub: frozen ? 'Draft pausado' : 'tempo do Draft',
          warn: rem <= 3000 && !frozen,
          draftPct: Math.min(100, (rem / (st.rules?.draftMs || 8000)) * 100),
        });
        return;
      }
      const elapsed = clockRef.current.paused ? clockRef.current.elapsedMs : clockRef.current.elapsedMs + dt;
      const remaining = clockRef.current.paused ? clockRef.current.remainingMs : Math.max(0, clockRef.current.remainingMs - dt);
      const secs = Math.ceil(remaining / 1000);
      setClockDisplay({
        main: fmtMsClock(elapsed),
        sub: clockRef.current.paused
          ? `pausado · restam ${secs}s`
          : `limite ${Math.round((clockRef.current.limitMs || 15000) / 1000)}s · restam ${secs}s`,
        warn: !clockRef.current.paused && remaining <= 4000,
        draftPct: 0,
      });
    }, 180);
    return () => clearInterval(timer);
  }, [st]);

  if (!st) {
    return (
      <div className="panel" style={{ margin: 24 }}>
        Aguardando sincronização da partida de Cerco Tático...
      </div>
    );
  }

  const rules = st.rules || { boardSize: 12, targetVp: 3, crownHoldGoal: 3, basePa: 3, crownPaPenalty: 1, turnLimitMs: 15000, draftMs: 8000, draftEveryRounds: 3, visionRadius: 4 };
  const isMyTurn = !st.over && st.phase === 'turn' && st.activeSide === st.side;
  const canAct = isMyTurn && !st.frozen && !st.tutorialFrozen;
  const myName = st.self?.displayName || 'Você';
  const enemyName = st.opponent?.displayName || 'Adversário';
  const selectedCard = selectedUid ? st.myTeam.hand.find((c) => c.uid === selectedUid) || null : null;

  const ctx = {
    n: st.boardSize,
    me: st.myUnit,
    others: st.enemyUnit ? [st.enemyUnit] : [],
    walls: new Set((st.walls || []).map((w) => `${w.x},${w.y}`)),
    myWalls: new Set((st.walls || []).filter((w) => w.owner === st.side).map((w) => `${w.x},${w.y}`)),
    crown: st.crown,
  };

  const validTargets = useMemo(() => {
    if (!canAct) return new Set();
    if (selectedCard) {
      return selectedCard.targetType === 'cell'
        ? new Set(targetsFor(selectedCard.id, ctx).map(([x, y]) => `${x},${y}`))
        : new Set();
    }
    if (st.myTeam.ap >= 1) return new Set(targetsFor('move', ctx).map(([x, y]) => `${x},${y}`));
    return new Set();
  }, [canAct, selectedCard, st]);

  const attackTargetKey =
    canAct && !selectedCard && st.myTeam.ap >= 1 && st.enemyUnit && manhattan(st.myUnit.x, st.myUnit.y, st.enemyUnit.x, st.enemyUnit.y) === 1
      ? `${st.enemyUnit.x},${st.enemyUnit.y}`
      : null;

  const sendAction = (type, payload = {}) => {
    if (!sendSocket(type, payload)) return false;
    setPendingAction(true);
    clearTimeout(pendingTimerRef.current);
    pendingTimerRef.current = setTimeout(() => setPendingAction(false), 3800);
    return true;
  };

  const showError = (msg) => {
    setFeedback(msg);
    setFeedbackErr(true);
    playTone('deny', sfxEnabled);
  };

  const onCellClick = (x, y) => {
    if (st.over) return;
    if (!canAct) {
      showError(st.phase === 'draft' ? 'Escolha uma carta no Draft primeiro.' : `Aguarde: é a vez de ${enemyName}.`);
      return;
    }
    if (pendingAction || st.autoEnding) return;
    const key = `${x},${y}`;
    if (!selectedCard && attackTargetKey === key) {
      playTone('hit', sfxEnabled);
      sendAction('tactical:attack', { x, y });
      return;
    }
    if (!validTargets.has(key)) {
      if (!selectedCard && st.myTeam.ap < 1) showError('Sem PA para mover. Clique em "Encerrar turno".');
      else showError(RULE_HINT[selectedCard ? selectedCard.id : 'move'] || 'Casa inválida.');
      return;
    }
    if (selectedCard) {
      playTone('card', sfxEnabled);
      sendAction('tactical:playCard', { cardUid: selectedCard.uid, target: { x, y } });
      setSelectedUid(null);
    } else {
      sendAction('tactical:move', { x, y });
    }
  };

  const lockReason = (card) => {
    if (st.over) return 'Partida encerrada.';
    if (st.phase === 'draft') return 'Indisponível durante o Draft.';
    if (st.frozen) return 'Partida pausada.';
    if (st.tutorialFrozen) return 'Conclua a dica do tutorial.';
    if (!isMyTurn) return 'Aguarde sua vez.';
    if (st.myTeam.ap < card.cost) return `Requer ${card.cost} PA.`;
    if (card.targetType === 'enemy') {
      if (!st.enemyUnit || manhattan(st.myUnit.x, st.myUnit.y, st.enemyUnit.x, st.enemyUnit.y) > card.range) {
        return `Inimigo fora do alcance (${card.range} casas).`;
      }
      return null;
    }
    if (card.targetType === 'cell' && targetsFor(card.id, ctx).length === 0) return 'Nenhuma casa válida no alcance.';
    return null;
  };

  const wallMap = new Map((st.walls || []).map((w) => [`${w.x},${w.y}`, w]));
  const fluxSet = new Set((st.fluxZones || []).map((z) => `${z.x},${z.y}`));
  const goal = rules.crownHoldGoal || rules.targetVp || 3;

  const tutGuideMap = {
    1: { title: 'Pontos de Ação (PA)', text: `Você recebe ${rules.basePa} PA por turno. Andar 1 casa custa 1 PA. A Coroa está a 2 casas à direita — clique nas casas marcadas para pegá-la!` },
    2: { title: 'Fase de Draft', text: `A cada ${rules.draftEveryRounds} rodadas há um Draft de ${Math.round(rules.draftMs / 1000)}s para escolher 1 de 3 cartas.` },
    3: { title: 'O Poder e o Risco da Coroa', text: `Com a Coroa você pontua ao encerrar o turno (${goal} turnos vencem!), mas perde ${rules.crownPaPenalty} PA base e fica sempre visível.` },
  };

  return (
    <div className="ts-react-scene">
      <header className="ts-top">
        <div className="ts-brand">
          <span className="ts-crown-ic"><CrownSvg /></span>
          <div>
            <h1>Cerco Tático</h1>
            <span>
              {{ cpu: 'Treino vs CrownBot', tutorial: 'Tutorial Guiado', private: 'Sala Privada', rematch: 'Revanche' }[st.kind] || 'Partida Online'} · {myName} vs {enemyName} · Rodada {st.round}
            </span>
          </div>
        </div>

        <div className="ts-turn" data-owner={st.over ? 'none' : st.phase === 'draft' ? 'none' : st.activeSide === st.side ? 'me' : 'enemy'}>
          <i className="ts-turn-dot" />
          <div className="ts-turn-info">
            <span className="ts-turn-label">
              {st.over ? 'Partida encerrada' : st.phase === 'draft' ? 'Fase de Draft' : isMyTurn ? 'Sua vez' : `Vez de ${enemyName}`}
            </span>
            <span className={`ts-limit${clockDisplay.warn ? ' warn' : ''}`}>{clockDisplay.sub}</span>
          </div>
          <strong className="ts-clock">{clockDisplay.main}</strong>
        </div>

        <div className="ts-top-actions">
          <button type="button" className="ts-btn" onClick={() => setRulesOpen(true)}>
            Regras & Cartas
          </button>
          <MatchControls
            onResign={() => setConfirmModal('resign')}
            onReturnMenu={() => setConfirmModal('menu')}
            resignDisabled={st.over}
          />
        </div>
      </header>

      {st.isTutorial && st.tutorialFrozen && !st.over && tutGuideMap[st.tutorialStep] && (
        <div className="ts-tutorial-banner">
          <div>
            <span className="ts-tip-step">Tutorial do Cerco · Etapa {st.tutorialStep} de 3</span>
            <strong>{tutGuideMap[st.tutorialStep].title}</strong>
            <p>{tutGuideMap[st.tutorialStep].text}</p>
          </div>
          <button
            type="button"
            className="ts-btn primary"
            onClick={() => sendSocket('tactical:tutorialStepComplete', { step: st.tutorialStep })}
          >
            Entendi, continuar →
          </button>
        </div>
      )}

      <div className="ts-stage">
        <aside className="ts-side">
          <div className={`ts-player me${!st.over && st.phase === 'turn' && st.activeSide === st.side ? ' active' : ''}`}>
            <div className="ts-player-head">
              <div className="ts-portrait"><div className="ts-fig me-fig idle"><WardenSvg /></div></div>
              <div className="ts-player-id">
                <div className="ts-player-tag">Você · Guardião Azul</div>
                <div className="ts-player-name">{myName}</div>
                <div className="ts-player-sub">@{st.self?.username || 'voce'}</div>
              </div>
            </div>
            <div className="ts-stat">
              <div className="ts-stat-row">
                <span>Pontos de Ação</span>
                <strong>{st.myTeam.ap} PA</strong>
              </div>
              <div className="ts-pips">
                {Array.from({ length: Math.max(rules.basePa, st.myTeam.ap, 1) }, (_, i) => (
                  <i key={i} className={`ts-pip${i < st.myTeam.ap ? ' on' : ''}`} />
                ))}
              </div>
            </div>
            <div className="ts-stat">
              <div className="ts-stat-row">
                <span>Domínio da Coroa</span>
                <strong>{st.myTeam.vp} / {goal} turnos</strong>
              </div>
              <div className="ts-vp-track">
                <div className="ts-vp-fill" style={{ width: `${Math.min(100, (st.myTeam.vp / goal) * 100)}%` }} />
              </div>
            </div>
            <div className="ts-badge">
              <CrownSvg />
              <span>{st.crown.holder === st.side ? `Com a Coroa (${st.myTeam.vp}/${goal})` : 'Sem a Coroa'}</span>
            </div>
            {st.myTeam.challenge && (
              <div className={`ts-challenge-box${st.myTeam.challenge.completed ? ' done' : ''}`}>
                <span>{st.myTeam.challenge.completed ? '✓' : '🎯'} {st.myTeam.challenge.label}</span>
                <strong>{st.myTeam.challenge.progress}/{st.myTeam.challenge.goal}</strong>
              </div>
            )}
          </div>

          <div className={`ts-player enemy${!st.over && st.phase === 'turn' && st.activeSide !== st.side ? ' active' : ''}`}>
            <div className="ts-player-head">
              <div className="ts-portrait"><div className="ts-fig enemy-fig idle"><BesiegerSvg /></div></div>
              <div className="ts-player-id">
                <div className="ts-player-tag">{st.opponentIsBot ? 'CPU · Sitiante Rubi' : 'Adversário · Sitiante Rubi'}</div>
                <div className="ts-player-name">{enemyName}</div>
              </div>
            </div>
            <div className="ts-stat">
              <div className="ts-stat-row">
                <span>Domínio da Coroa</span>
                <strong>{st.enemyTeam.vp} / {goal} turnos</strong>
              </div>
              <div className="ts-vp-track">
                <div className="ts-vp-fill enemy" style={{ width: `${Math.min(100, (st.enemyTeam.vp / goal) * 100)}%` }} />
              </div>
            </div>
            <div className="ts-stat-row"><span>Cartas na mão</span><strong>{st.enemyTeam.handCount}</strong></div>
            <div className="ts-badge fog">
              <span>
                {st.over || st.enemyUnit
                  ? `Visível (${st.enemyUnit?.revealedByCrown ? 'Coroa' : `${manhattan(st.myUnit.x, st.myUnit.y, st.enemyUnit.x, st.enemyUnit.y)} casas`})`
                  : `Oculto pela névoa (> ${rules.visionRadius} casas)`}
              </span>
            </div>
          </div>
        </aside>

        <section className="ts-board-area">
          <div className="ts-board-frame">
            <div className="ts-board" style={{ '--n': st.boardSize }}>
              {Array.from({ length: st.boardSize * st.boardSize }, (_, idx) => {
                const x = idx % st.boardSize;
                const y = Math.floor(idx / st.boardSize);
                const key = `${x},${y}`;
                const isTarget = validTargets.has(key);
                const isAtk = attackTargetKey === key;
                const hasWall = wallMap.has(key);
                const isFlux = fluxSet.has(key);
                const isFog = !st.over && manhattan(st.myUnit.x, st.myUnit.y, x, y) > rules.visionRadius;
                return (
                  <button
                    key={key}
                    type="button"
                    className={`ts-cell ${(x + y) % 2 ? 'd' : 'l'}${isTarget && !selectedCard ? ' move' : ''}${isTarget && selectedCard ? ' target' : ''}${isAtk ? ' attack' : ''}${isFlux ? ' flux-zone' : ''}${isFog ? ' fog' : ''}`}
                    onClick={() => onCellClick(x, y)}
                    aria-label={cellName(x, y)}
                  >
                    {x === 0 && <span className="ts-coord row">{y + 1}</span>}
                    {y === st.boardSize - 1 && <span className="ts-coord col">{TACTICAL_COLS[x]}</span>}
                    {hasWall && <span className="ts-wall-slot"><WallSvg isNew={!prevWallsRef.current.has(key)} /></span>}
                  </button>
                );
              })}

              <div className="ts-layer">
                {st.crown.holder === null && (
                  <div className="ts-crown-free" style={{ transform: `translate(${st.crown.x * 100}%, ${st.crown.y * 100}%)` }}>
                    <CrownSvg />
                  </div>
                )}
                <div className={`ts-token me${!st.over && st.activeSide === st.side ? ' active' : ''}`} style={{ transform: `translate(${st.myUnit.x * 100}%, ${st.myUnit.y * 100}%)` }}>
                  <div className="ts-ring" />
                  <div className="ts-fig me-fig idle"><WardenSvg /></div>
                  {st.crown.holder === st.side && <span className="ts-crown-on"><CrownSvg /></span>}
                </div>
                {st.enemyUnit && (
                  <div className={`ts-token enemy${!st.over && st.activeSide !== st.side ? ' active' : ''}`} style={{ transform: `translate(${st.enemyUnit.x * 100}%, ${st.enemyUnit.y * 100}%)` }}>
                    <div className="ts-ring" />
                    <div className="ts-fig enemy-fig idle"><BesiegerSvg /></div>
                    {st.crown.holder === 1 - st.side && <span className="ts-crown-on"><CrownSvg /></span>}
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className={`ts-feedback${feedbackErr ? ' err' : ''}`}>{feedback}</div>
        </section>

        <aside className="ts-right">
          <div className="ts-box">
            <h3>{selectedCard ? `${selectedCard.name} · ${selectedCard.cost} PA` : canAct ? 'Sua vez' : `Vez de ${enemyName}`}</h3>
            <p className="ts-detail-text">
              {selectedCard
                ? `${selectedCard.desc} ${selectedCard.targetType === 'cell' ? 'Clique em uma casa dourada no tabuleiro.' : 'Confirme em "Usar carta".'}`
                : canAct
                  ? `Você tem ${st.myTeam.ap} PA. Clique numa casa marcada para mover (1 PA) ou selecione uma carta.`
                  : 'Aguarde o adversário concluir a jogada.'}
            </p>
            <div className="ts-detail-btns">
              {selectedCard && (
                <button type="button" className="ts-btn" onClick={() => setSelectedUid(null)}>
                  Cancelar seleção
                </button>
              )}
              {selectedCard && (selectedCard.targetType === 'none' || selectedCard.targetType === 'enemy') && (
                <button
                  type="button"
                  className="ts-btn primary"
                  disabled={pendingAction}
                  onClick={() => {
                    playTone('card', sfxEnabled);
                    sendAction('tactical:playCard', { cardUid: selectedCard.uid });
                    setSelectedUid(null);
                  }}
                >
                  Usar carta
                </button>
              )}
              <button
                type="button"
                className="ts-btn primary"
                disabled={!canAct || pendingAction}
                onClick={() => {
                  setSelectedUid(null);
                  sendAction('tactical:endTurn');
                }}
              >
                Encerrar turno
              </button>
            </div>
          </div>

          <div className="ts-box">
            <h3>Ações Recentes</h3>
            <div className="ts-events-list">
              {[...(st.recentEvents || [])]
                .reverse()
                .filter((e) => e.type !== 'turn_start')
                .slice(0, 7)
                .map((e, i) => (
                  <div key={i} className={`ts-event ${e.side === st.side ? 'me' : e.side !== null ? 'enemy' : ''}`}>
                    {describeTacticalEvent(e, st, myName, enemyName)}
                  </div>
                ))}
            </div>
          </div>

          <div className="ts-box">
            <h3>Tempos por Jogada</h3>
            <div className="ts-times-list">
              {[...(st.turnTimes || [])].reverse().slice(0, 6).map((t, i) => (
                <div key={i} className="ts-time-row">
                  <span>{t.side === st.side ? myName : enemyName} · R{t.round}</span>
                  <strong>{fmtSecs(t.ms)}</strong>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>

      {/* Card Hand Dock */}
      <footer className="ts-hand-dock">
        <div className="ts-hand-head">
          <strong>Mão Tática ({st.myTeam.hand.length} cartas · {st.myTeam.ap} PA)</strong>
          <span className="muted">Draft a cada {rules.draftEveryRounds} rodadas</span>
        </div>
        <div className="ts-hand">
          {st.myTeam.hand.length === 0 ? (
            <div className="ts-empty">Sem cartas na mão. Aguarde o próximo Draft.</div>
          ) : (
            st.myTeam.hand.map((card) => {
              const lock = lockReason(card);
              const selected = selectedUid === card.uid;
              return (
                <button
                  key={card.uid}
                  type="button"
                  className={`ts-card${lock ? ' locked' : ''}${selected ? ' selected' : ''}`}
                  onClick={() => {
                    if (lock) {
                      showError(`${card.name}: ${lock}`);
                      return;
                    }
                    setSelectedUid(selected ? null : card.uid);
                  }}
                >
                  <div className="ts-card-top">
                    <span className="ts-cost">{card.cost}</span>
                    <div>
                      <div className="ts-card-name">{card.name}</div>
                      <div className="ts-card-type">{CARD_TYPE[card.id] || 'Carta'}</div>
                    </div>
                  </div>
                  <div className="ts-card-art"><CardArtSvg id={card.id} /></div>
                  <div className="ts-card-meta">
                    {cardChips(card).slice(1).map((c) => <span key={c} className="ts-chip">{c}</span>)}
                  </div>
                  <div className="ts-card-desc">{card.desc}</div>
                  {lock && <div className="ts-card-lock">{lock}</div>}
                </button>
              );
            })
          )}
        </div>
      </footer>

      {/* Draft Modal */}
      {!st.over && st.phase === 'draft' && (
        <div className="modal-backdrop">
          <div className="modal-card modal-wide">
            <div className="modal-head">
              <h2>Fase de Draft — Escolha 1 Carta</h2>
              <span className="pill">{clockDisplay.main}</span>
            </div>
            <div className="tut-progress-track" style={{ marginBottom: 14 }}>
              <div className="tut-progress-fill" style={{ width: `${clockDisplay.draftPct}%` }} />
            </div>
            {st.myTeam.draftOptions?.length ? (
              <div className="ts-draft-choices">
                {st.myTeam.draftOptions.map((card) => (
                  <button
                    key={card.uid}
                    type="button"
                    className="ts-card"
                    onClick={() => {
                      if (st.tutorialFrozen) {
                        showError('Clique em "Entendi, continuar" no tutorial primeiro.');
                        return;
                      }
                      playTone('card', sfxEnabled);
                      sendAction('tactical:pickDraft', { cardUid: card.uid });
                    }}
                  >
                    <div className="ts-card-top">
                      <span className="ts-cost">{card.cost}</span>
                      <div>
                        <div className="ts-card-name">{card.name}</div>
                        <div className="ts-card-type">{CARD_TYPE[card.id] || 'Carta'}</div>
                      </div>
                    </div>
                    <div className="ts-card-art"><CardArtSvg id={card.id} /></div>
                    <div className="ts-card-desc">{card.desc}</div>
                  </button>
                ))}
              </div>
            ) : (
              <p className="muted">Carta escolhida! Aguardando {enemyName}...</p>
            )}
          </div>
        </div>
      )}

      {/* Quick Rules Modal */}
      {rulesOpen && (
        <div className="modal-backdrop">
          <div className="modal-card modal-wide">
            <div className="modal-head">
              <h2>Regras do Cerco Tático</h2>
              <button type="button" className="icon-close" onClick={() => setRulesOpen(false)}>×</button>
            </div>
            <ul className="rules-list">
              <li>Tabuleiro {rules.boardSize}×{rules.boardSize} com Névoa de Guerra ({rules.visionRadius} casas de alcance).</li>
              <li>Você recebe {rules.basePa} PA por turno. Mover 1 casa ou atacar inimigo adjacente custa 1 PA.</li>
              <li>Quem pisa na Coroa a captura. Ao encerrar um turno com ela, soma +1 turno de domínio ({goal} vencem!).</li>
              <li>Portar a Coroa reduz PA base em −{rules.crownPaPenalty} e revela sua posição no mapa.</li>
            </ul>
            <div className="modal-actions">
              <button type="button" className="primary" onClick={() => setRulesOpen(false)}>Entendi</button>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        open={Boolean(confirmModal)}
        title={confirmModal === 'resign' ? 'Desistir do Cerco Tático?' : 'Voltar ao menu?'}
        message={
          confirmModal === 'resign'
            ? 'Desistir encerra a partida imediatamente como derrota.'
            : st.isTutorial
              ? 'Sair agora encerra o tutorial guiado.'
              : st.opponentIsBot
                ? 'Sair contra a CPU descarta a partida sem registrar derrota.'
                : 'Sair contra outro jogador conta como abandono e concede a vitória ao rival.'
        }
        confirmLabel={confirmModal === 'resign' ? 'Sim, desistir' : 'Sair da partida'}
        onConfirm={() => {
          const action = confirmModal;
          setConfirmModal(null);
          if (action === 'resign') {
            sendSocket('game:resign');
          } else {
            if (!sendSocket('tactical:leave')) navigate('/modes/tactical');
          }
        }}
        onCancel={() => setConfirmModal(null)}
      />
    </div>
  );
}
