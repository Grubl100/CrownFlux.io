import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import BotDifficultySelector from '../components/BotDifficultySelector.jsx';
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
    <div className="page-container mode-detail-page">
      <div className="page-crumb-row">
        <button type="button" className="mini-btn" onClick={() => navigate('/modes')}>
          ← Voltar à Central de Modos
        </button>
        <button type="button" className="mini-btn" onClick={() => navigate('/how-to-play?tab=classic')}>
          📖 Regras do Xadrez Clássico
        </button>
      </div>

      <header className="mode-page-hero featured-hero">
        <span className="eyebrow">Xadrez Tradicional 8×8 · Regras Oficiais FIDE · Motor Stockfish 19</span>
        <h1>♟ Xadrez Clássico</h1>
        <p className="muted">
          Jogue partidas oficiais com roque, en passant, escolha de promoção, perspectiva individual, setas táticas, relógios com alerta de 10s, análise pós-partida e rating Elo por categoria.
        </p>
      </header>

      <section className="panel" style={{ marginBottom: 20 }}>
        <div className="hud-card-head" style={{ marginBottom: 12 }}>
          <div>
            <h3>Controle de Tempo</h3>
            <p className="muted" style={{ fontSize: 13 }}>
              Selecionado: <strong>{resolvedControl.label}</strong>
              {!resolvedControl.custom && user ? ` · Seu Elo ${resolvedControl.category.toUpperCase()}: ${activeRating}` : ''}
            </p>
          </div>
          <span className="cf-mode-badge gold">{resolvedControl.shortLabel}</span>
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

      <div className="mode-options-grid">
        <article className="option-card priority">
          <div className="option-card-head">
            <span className="option-icon">🏆</span>
            <span className="cf-mode-badge gold">
              {resolvedControl.custom ? 'SALA PRIVADA' : `RANQUEADO · ELO ${activeRating}`}
            </span>
          </div>
          <h2>Partida Online</h2>
          <p className="muted">
            Fila pública separada por ritmo ({resolvedControl.label}) com perspectiva individual automática para Brancas e Pretas.
          </p>
          {lobby && lobby.mode === 'classic' && (
            <div className="conn-pill" style={{ marginTop: 8 }}>
              {lobby.statusText}
            </div>
          )}
          <div className="stack-actions" style={{ marginTop: 12 }}>
            <button
              type="button"
              className="primary full-btn"
              disabled={resolvedControl.custom}
              title={resolvedControl.custom ? 'Controles personalizados são apenas para salas privadas, bot ou local' : ''}
              onClick={() => {
                if (!requireAuth()) return;
                sendSocket('match:queue', { options: { mode: 'classic', timeControl } });
              }}
            >
              {resolvedControl.custom
                ? 'Personalizado (use Sala Privada)'
                : `Buscar Oponente (${resolvedControl.shortLabel})`}
            </button>
            <button
              type="button"
              className="secondary full-btn"
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
              Criar Sala Privada ({resolvedControl.shortLabel})
            </button>
            <div className="code-join-row">
              <input
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
        </article>

        <article className="option-card">
          <div className="option-card-head">
            <span className="option-icon">🤖</span>
            <span className="cf-mode-badge">STOCKFISH 19 · 5 NÍVEIS</span>
          </div>
          <h2>Contra Bot (Stockfish)</h2>
          <p className="muted">
            Motor real Stockfish 19 Lite WASM em Web Worker com 5 níveis calibrados de força.
          </p>
          <div style={{ marginTop: 12 }}>
            <BotDifficultySelector value={cpuDifficulty} onChange={setCpuDifficulty} mode="classic" compact />
          </div>
          <div className="color-pick-row" style={{ marginTop: 10 }}>
            <span className="muted" style={{ fontSize: 12 }}>Suas peças:</span>
            <div className="color-pick-btns">
              {[
                ['white', '♔ Brancas'],
                ['random', '🎲 Aleatório'],
                ['black', '♚ Pretas'],
              ].map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  className={`mini-btn${botColor === id ? ' accent' : ''}`}
                  onClick={() => setBotColor(id)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="option-card-foot" style={{ marginTop: 12 }}>
            <button type="button" className="primary full-btn" onClick={launchBot}>
              Jogar contra Stockfish →
            </button>
          </div>
        </article>

        <article className="option-card">
          <div className="option-card-head">
            <span className="option-icon">👥</span>
            <span className="cf-mode-badge">MESMO DISPOSITIVO</span>
          </div>
          <h2>Duelo Local 8×8</h2>
          <p className="muted">
            Dois jogadores no mesmo aparelho com relógio {resolvedControl.label}, alternância de turnos, botão para inverter tabuleiro e análise pós-partida.
          </p>
          <div className="option-card-foot" style={{ marginTop: 14 }}>
            <button
              type="button"
              className="secondary full-btn"
              onClick={() =>
                startOfflineMatch('offline_classic', {
                  mode: 'classic_local',
                  timeControl,
                  customTime: timeControl === 'custom' ? customTime : null,
                  category: resolvedControl.category,
                })
              }
            >
              Iniciar Xadrez Local ({resolvedControl.shortLabel}) →
            </button>
          </div>
        </article>
      </div>

      {recentRecords.length > 0 && (
        <section className="panel" style={{ marginTop: 18 }}>
          <div className="hud-card-head" style={{ marginBottom: 10 }}>
            <h3>📊 Partidas Recentes para Análise</h3>
            <span className="muted" style={{ fontSize: 12 }}>Salvas localmente com PGN completo</span>
          </div>
          <div className="recent-analysis-list">
            {recentRecords.map((rec) => (
              <div key={rec.id} className="recent-analysis-item">
                <div>
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
                  Analisar →
                </button>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
