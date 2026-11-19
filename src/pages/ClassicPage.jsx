import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import BotDifficultySelector from '../components/BotDifficultySelector.jsx';
import {
  IconAnalysis,
  IconArrowLeft,
  IconArrowRight,
  IconBook,
} from '../components/chess/ClassicIcons.jsx';
import TimeControlSelector from '../components/chess/TimeControlSelector.jsx';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useMatchSession } from '../contexts/MatchSessionContext.jsx';
import { useToast } from '../contexts/ToastContext.jsx';
import { loadClassicRecords } from '../utils/classicStorage.js';
import { resolveClassicControl } from '../utils/constants.js';

function loadSavedChoice() {
  try {
    const raw = sessionStorage.getItem('cf_classic_choice');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export default function ClassicPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { sendSocket, startOfflineMatch, lobby } = useMatchSession();
  const { showToast } = useToast();

  const saved = loadSavedChoice();
  const [category, setCategory] = useState(saved?.category || 'blitz');
  const [timeControl, setTimeControl] = useState(saved?.timeControl || 'blitz3');
  const [customTime, setCustomTime] = useState(saved?.customTime || { minutes: 10, increment: 5 });
  const [cpuDifficulty, setCpuDifficulty] = useState(saved?.cpuDifficulty || 3);
  const [botColor, setBotColor] = useState(saved?.botColor || 'white'); // white | random | black
  const [roomCode, setRoomCode] = useState('');
  const [recentRecords] = useState(() => loadClassicRecords().slice(0, 4));

  useEffect(() => {
    try {
      sessionStorage.setItem(
        'cf_classic_choice',
        JSON.stringify({ category, timeControl, customTime, cpuDifficulty, botColor })
      );
    } catch {
      // ignore
    }
  }, [category, timeControl, customTime, cpuDifficulty, botColor]);

  const resolvedControl = resolveClassicControl(timeControl, customTime);
  const ratings = user?.stats?.classicRatings || { bullet: 1200, blitz: 1200, rapid: 1200, classic: 1200 };
  const activeRating = ratings[resolvedControl.category] || 1200;

  const requireAuth = () => {
    if (!user) {
      showToast('Entre na sua conta para jogar Xadrez Clássico online.', 'warn');
      navigate('/profile');
      return false;
    }
    return true;
  };

  const launchBot = () => {
    const side = botColor === 'random' ? (Math.random() < 0.5 ? 0 : 1) : botColor === 'black' ? 1 : 0;
    startOfflineMatch('offline_classic', {
      mode: 'classic_cpu',
      timeControl,
      customTime: timeControl === 'custom' ? customTime : null,
      category: resolvedControl.category,
      cpuDifficulty,
      playerSide: side,
    });
  };

  return (
    <div className="page-container mode-detail-page classic-redesign classic-hub-page">
      <div className="page-crumb-row">
        <button type="button" className="mini-btn" onClick={() => navigate('/modes')}>
          <IconArrowLeft />
          <span>Central de Modos</span>
        </button>
        <button type="button" className="mini-btn" onClick={() => navigate('/how-to-play?tab=classic')}>
          <IconBook />
          <span>Regras do Xadrez Clássico</span>
        </button>
      </div>

      <header className="classic-editorial-hero">
        <div className="classic-hero-copy">
          <span className="eyebrow">Tabuleiro 8x8 · Regras FIDE · Stockfish 19</span>
          <h1>Xadrez Clássico</h1>
          <p className="muted">
            Partidas oficiais com roque, en passant, escolha de promoção, indicadores de lances legais, setas táticas, relógios com incremento e análise pós-partida.
          </p>
        </div>
        <div className="classic-hero-summary" aria-label="Resumo do ritmo selecionado">
          <span className="classic-summary-label">Ritmo ativo</span>
          <strong className="classic-summary-clock">{resolvedControl.shortLabel}</strong>
          <span className="classic-summary-meta">
            {resolvedControl.label}
            {!resolvedControl.custom && user ? ` · Elo ${activeRating}` : ''}
          </span>
        </div>
      </header>

      <div className="classic-hub-grid">
        <div className="classic-hub-main">
          <section className="classic-section-block" aria-labelledby="tc-heading">
            <div className="classic-section-head">
              <div>
                <h2 id="tc-heading">Controle de tempo</h2>
                <p className="muted">
                  Escolha a cadência para fila online, sala privada, treino contra Stockfish ou duelo local.
                </p>
              </div>
              <span className="classic-tag">{resolvedControl.shortLabel}</span>
            </div>
            <TimeControlSelector
              category={category}
              onCategoryChange={setCategory}
              timeControl={timeControl}
              onTimeControlChange={setTimeControl}
              customTime={customTime}
              onCustomTimeChange={setCustomTime}
              ratings={ratings}
            />
          </section>

          <section className="classic-section-block classic-online-block" aria-labelledby="online-heading">
            <div className="classic-section-head">
              <div>
                <h2 id="online-heading">Partida online</h2>
                <p className="muted">
                  Fila pública separada por ritmo ({resolvedControl.label}) com perspectiva automática para Brancas e Pretas.
                </p>
              </div>
              <span className="classic-tag accent">
                {resolvedControl.custom ? 'Sala privada' : `Ranqueado · Elo ${activeRating}`}
              </span>
            </div>

            {lobby && lobby.mode === 'classic' && (
              <div className="conn-pill" style={{ marginBottom: 12 }} role="status">
                {lobby.statusText}
              </div>
            )}

            <div className="classic-online-actions">
              <button
                type="button"
                className="primary classic-cta-btn"
                disabled={resolvedControl.custom}
                title={resolvedControl.custom ? 'Controles personalizados funcionam em salas privadas, bot ou local' : ''}
                onClick={() => {
                  if (!requireAuth()) return;
                  sendSocket('match:queue', { options: { mode: 'classic', timeControl } });
                }}
              >
                <span>
                  {resolvedControl.custom
                    ? 'Personalizado (use Sala Privada)'
                    : `Buscar oponente (${resolvedControl.shortLabel})`}
                </span>
                <IconArrowRight />
              </button>

              <button
                type="button"
                className="secondary"
                onClick={() => {
                  if (!requireAuth()) return;
                  sendSocket('room:create', {
                    options: {
                      mode: 'classic',
                      timeControl,
                      customTime: timeControl === 'custom' ? customTime : null,
                    },
                  });
                }}
              >
                Criar sala privada ({resolvedControl.shortLabel})
              </button>
            </div>

            <div className="classic-code-join">
              <label htmlFor="classic-room-code" className="classic-inline-label">
                Entrar por código
              </label>
              <div className="code-join-row">
                <input
                  id="classic-room-code"
                  type="text"
                  maxLength={6}
                  placeholder="CÓDIGO"
                  value={roomCode}
                  onChange={(e) => setRoomCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                />
                <button
                  type="button"
                  className="secondary"
                  onClick={() => {
                    if (!requireAuth()) return;
                    if (roomCode.length !== 4 && roomCode.length !== 6) {
                      showToast('Código inválido.', 'warn');
                      return;
                    }
                    sendSocket('room:join', { code: roomCode });
                  }}
                >
                  Entrar
                </button>
              </div>
            </div>
          </section>
        </div>

        <aside className="classic-hub-side">
          <section className="classic-section-block" aria-labelledby="bot-heading">
            <div className="classic-section-head">
              <div>
                <h2 id="bot-heading">Contra Stockfish 19</h2>
                <p className="muted">Motor Stockfish 19 Lite WASM com 5 níveis calibrados.</p>
              </div>
              <span className="classic-tag">Offline</span>
            </div>

            <div style={{ marginTop: 12 }}>
              <BotDifficultySelector value={cpuDifficulty} onChange={setCpuDifficulty} mode="classic" compact />
            </div>

            <div className="color-pick-row" style={{ marginTop: 14 }}>
              <span className="classic-inline-label">Suas peças</span>
              <div className="color-pick-btns" role="group" aria-label="Escolher cor das peças">
                {[
                  ['white', 'Brancas'],
                  ['random', 'Aleatório'],
                  ['black', 'Pretas'],
                ].map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    className={`mini-btn${botColor === id ? ' accent' : ''}`}
                    aria-pressed={botColor === id}
                    onClick={() => setBotColor(id)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ marginTop: 14 }}>
              <button type="button" className="primary full-btn classic-cta-btn" onClick={launchBot}>
                <span>Jogar contra Stockfish</span>
                <IconArrowRight />
              </button>
            </div>
          </section>

          <section className="classic-section-block classic-local-block" aria-labelledby="local-heading">
            <div className="classic-section-head">
              <div>
                <h2 id="local-heading">Duelo local 8x8</h2>
                <p className="muted">
                  Dois jogadores no mesmo aparelho com relógio {resolvedControl.label}, inversão de tabuleiro e revisão pós-partida.
                </p>
              </div>
              <span className="classic-tag">Mesmo aparelho</span>
            </div>
            <div style={{ marginTop: 14 }}>
              <button
                type="button"
                className="secondary full-btn classic-cta-btn"
                onClick={() =>
                  startOfflineMatch('offline_classic', {
                    mode: 'classic_local',
                    timeControl,
                    customTime: timeControl === 'custom' ? customTime : null,
                    category: resolvedControl.category,
                  })
                }
              >
                <span>Iniciar partida local ({resolvedControl.shortLabel})</span>
                <IconArrowRight />
              </button>
            </div>
          </section>
        </aside>
      </div>

      {recentRecords.length > 0 && (
        <section className="classic-section-block classic-recent-block" aria-labelledby="recent-heading">
          <div className="classic-section-head">
            <div>
              <h2 id="recent-heading">Partidas recentes para análise</h2>
              <p className="muted">Histórico local salvo com PGN completo.</p>
            </div>
            <span className="classic-tag">{recentRecords.length} salvas</span>
          </div>
          <div className="recent-analysis-list">
            {recentRecords.map((rec) => (
              <div key={rec.id} className="recent-analysis-item">
                <div className="recent-analysis-meta">
                  <strong>{rec.white} × {rec.black}</strong>
                  <div className="muted" style={{ fontSize: 12 }}>
                    {rec.clockControlLabel} · {rec.resultLabel} · {rec.moves?.length || 0} meios-lances
                  </div>
                </div>
                <button
                  type="button"
                  className="mini-btn accent"
                  onClick={() => navigate(`/analysis/${rec.id}`)}
                >
                  <IconAnalysis />
                  <span>Analisar</span>
                </button>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
