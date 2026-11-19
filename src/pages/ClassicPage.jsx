import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useMatchSession } from '../contexts/MatchSessionContext.jsx';
import { useToast } from '../contexts/ToastContext.jsx';
import { CLASSIC_CONTROLS, CPU_LEVELS } from '../utils/constants.js';

export default function ClassicPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { sendSocket, startOfflineMatch } = useMatchSession();
  const { showToast } = useToast();

  const [timeControl, setTimeControl] = useState('blitz3');
  const [cpuDifficulty, setCpuDifficulty] = useState(3);
  const [roomCode, setRoomCode] = useState('');

  const requireAuth = () => {
    if (!user) {
      showToast('Entre na sua conta para jogar Xadrez Clássico online.', 'warn');
      navigate('/profile');
      return false;
    }
    return true;
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

      <header className="mode-page-hero">
        <span className="eyebrow">Xadrez Tradicional · Tabuleiro 8×8</span>
        <h1>♟ Xadrez Clássico</h1>
        <p className="muted">
          Regras oficiais independentes do Duelo e do Cerco Tático: roque, en passant, promoção, relógios por categoria e rating Elo próprio.
        </p>
      </header>

      <div className="panel" style={{ marginBottom: 18 }}>
        <div className="classic-config-row">
          <div>
            <strong>Ritmo do Relógio</strong>
            <p className="muted">Aplicado tanto às partidas online quanto contra o Bot e Duelo Local.</p>
          </div>
          <select value={timeControl} onChange={(e) => setTimeControl(e.target.value)}>
            {Object.entries(CLASSIC_CONTROLS).map(([key, ctrl]) => (
              <option key={key} value={key}>{ctrl.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="mode-options-grid">
        <article className="option-card priority">
          <div className="option-card-head">
            <span className="option-icon">🏆</span>
            <span className="cf-mode-badge gold">RANQUEADO POR CATEGORIA</span>
          </div>
          <h2>Partida Online</h2>
          <p className="muted">
            Fila pública ranqueada separada por Bullet, Blitz, Rapid e Clássico, ou salas privadas sem alteração de rating.
          </p>
          <div className="stack-actions" style={{ marginTop: 12 }}>
            <button
              type="button"
              className="primary full-btn"
              onClick={() => {
                if (!requireAuth()) return;
                sendSocket('match:queue', { options: { mode: 'classic', timeControl } });
              }}
            >
              Buscar Oponente Ranqueado
            </button>
            <button
              type="button"
              className="secondary full-btn"
              onClick={() => {
                if (!requireAuth()) return;
                sendSocket('room:create', { options: { mode: 'classic', timeControl } });
              }}
            >
              Criar Sala Privada
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
            <span className="cf-mode-badge">5 DIFICULDADES</span>
          </div>
          <h2>Contra Bot (CPU)</h2>
          <p className="muted">
            Escolha a força do motor local de xadrez e jogue imediatamente sem precisar de fila.
          </p>
          <div className="stack-actions" style={{ marginTop: 12 }}>
            <select value={cpuDifficulty} onChange={(e) => setCpuDifficulty(Number(e.target.value))}>
              {CPU_LEVELS.map((lv) => (
                <option key={lv.level} value={lv.level}>{lv.level}. {lv.name}</option>
              ))}
            </select>
            <button
              type="button"
              className="primary full-btn"
              onClick={() =>
                startOfflineMatch('offline_classic', {
                  mode: 'classic_cpu',
                  timeControl,
                  cpuDifficulty,
                })
              }
            >
              Jogar contra Bot →
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
            Tabuleiro compartilhado para 2 jogadores no mesmo aparelho com relógio alternado e registro de lances.
          </p>
          <div className="option-card-foot" style={{ marginTop: 14 }}>
            <button
              type="button"
              className="secondary full-btn"
              onClick={() =>
                startOfflineMatch('offline_classic', {
                  mode: 'classic_local',
                  timeControl,
                })
              }
            >
              Iniciar Xadrez Local →
            </button>
          </div>
        </article>
      </div>
    </div>
  );
}
