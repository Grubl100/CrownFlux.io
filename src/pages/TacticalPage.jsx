import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useMatchSession } from '../contexts/MatchSessionContext.jsx';
import { useToast } from '../contexts/ToastContext.jsx';

export default function TacticalPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { sendSocket } = useMatchSession();
  const { showToast } = useToast();
  const [roomCode, setRoomCode] = useState('');

  const requireAuth = () => {
    if (!user) {
      showToast('Entre na sua conta para jogar o Cerco Tático (as partidas rodam no servidor).', 'warn');
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
        <button type="button" className="mini-btn" onClick={() => navigate('/how-to-play?tab=tactical')}>
          📖 Regras & Simulador de Cartas
        </button>
      </div>

      <header className="mode-page-hero">
        <span className="eyebrow">Modalidade Estratégica por Turnos · 12×12</span>
        <h1>🃏 Cerco Tático (Draft de Cartas)</h1>
        <p className="muted">
          Explore um tabuleiro 12×12 com névoa de guerra, administre Pontos de Ação (PA), erga barreiras e conquiste a Coroa por 3 turnos.
        </p>
      </header>

      {!user && (
        <div className="notice-banner-box">
          <div>
            <strong>Requer conta conectada</strong>
            <p className="muted">
              Toda a lógica de névoa de guerra, draft e cartas do Cerco Tático é validada pelo servidor. Faça login para iniciar uma partida, ou teste o simulador interativo no guia.
            </p>
          </div>
          <button type="button" className="primary" onClick={() => navigate('/profile')}>
            Entrar / Cadastrar
          </button>
        </div>
      )}

      <div className="mode-options-grid">
        <article className="option-card priority">
          <div className="option-card-head">
            <span className="option-icon">🌐</span>
            <span className="cf-mode-badge gold">MULTIPLAYER ONLINE</span>
          </div>
          <h2>Partida Online</h2>
          <p className="muted">
            Entre na fila pública de Cerco Tático, crie uma sala privada de 4 caracteres ou entre com código.
          </p>
          <div className="stack-actions" style={{ marginTop: 12 }}>
            <button
              type="button"
              className="primary full-btn"
              onClick={() => {
                if (!requireAuth()) return;
                sendSocket('match:queue', { options: { mode: 'tactical_draft' } });
              }}
            >
              Buscar Oponente Online
            </button>
            <button
              type="button"
              className="secondary full-btn"
              onClick={() => {
                if (!requireAuth()) return;
                sendSocket('room:create', { options: { mode: 'tactical_draft' } });
              }}
            >
              Criar Sala Privada (4 dígitos)
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
                    showToast('Informe o código da sala (4 caracteres).', 'warn');
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
            <span className="cf-mode-badge">TREINO VS IA</span>
          </div>
          <h2>Contra CrownBot (CPU)</h2>
          <p className="muted">
            Enfrente o CrownBot em partida completa com Draft a cada 3 rodadas e disputa pela Coroa. Resultado registrado no histórico.
          </p>
          <div className="option-card-foot" style={{ marginTop: 14 }}>
            <button
              type="button"
              className="primary full-btn"
              onClick={() => {
                if (!requireAuth()) return;
                sendSocket('tactical:startCpu');
              }}
            >
              Jogar vs CrownBot →
            </button>
          </div>
        </article>

        <article className="option-card">
          <div className="option-card-head">
            <span className="option-icon">🎓</span>
            <span className="cf-mode-badge">3 ETAPAS GUIADAS</span>
          </div>
          <h2>Tutorial do Cerco</h2>
          <p className="muted">
            Aprenda Pontos de Ação, Fase de Draft e o risco/recompensa de portar a Coroa sob névoa de guerra.
          </p>
          <div className="option-card-foot" style={{ marginTop: 14 }}>
            <button
              type="button"
              className="secondary full-btn"
              onClick={() => {
                if (!requireAuth()) return;
                sendSocket('tactical:startTutorial');
              }}
            >
              Iniciar Tutorial do Cerco →
            </button>
          </div>
        </article>
      </div>

      <div className="panel muted" style={{ marginTop: 18, fontSize: 13 }}>
        <strong>Nota de arquitetura:</strong> O modo Cerco Tático não possui partida local pass-and-play no mesmo dispositivo porque cada jogador vê apenas a sua névoa de guerra e cartas ocultas servidas pelo servidor. Para jogar com amigos no mesmo grupo, utilize uma Sala Privada ou Desafio na aba <button type="button" className="link-inline" onClick={() => navigate('/friends')}>Amigos</button>.
      </div>
    </div>
  );
}
