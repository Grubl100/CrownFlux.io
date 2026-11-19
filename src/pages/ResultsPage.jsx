import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useMatchSession } from '../contexts/MatchSessionContext.jsx';
import { fmtTime } from '../utils/format.js';

export default function ResultsPage() {
  const navigate = useNavigate();
  const { matchResult, clearMatchSession, startOfflineMatch, sendSocket } = useMatchSession();

  if (!matchResult) {
    return (
      <div className="page-container">
        <div className="panel" style={{ maxWidth: 520, margin: '24px auto', textAlign: 'center' }}>
          <h2>Nenhum resultado disponível</h2>
          <p className="muted" style={{ margin: '10px 0 18px' }}>
            Inicie uma partida pela Central de Modos para visualizar o resumo completo ao final.
          </p>
          <button type="button" className="primary" onClick={() => navigate('/modes')}>
            Voltar à Central de Modos
          </button>
        </div>
      </div>
    );
  }

  const handlePlayAgain = () => {
    if (matchResult.isOnline) {
      sendSocket('game:rematch');
      return;
    }
    if (matchResult.isTactical) {
      sendSocket('tactical:startCpu');
      return;
    }
    const cfg = matchResult.replayConfig || { mode: matchResult.mode };
    const kind =
      matchResult.isClassic
        ? 'offline_classic'
        : cfg.mode === 'arena'
          ? 'offline_arena'
          : cfg.mode === 'tutorial'
            ? 'offline_tutorial'
            : 'offline_duel';
    startOfflineMatch(kind, cfg);
  };

  return (
    <div className="page-container">
      <div className={`panel results-hero-card ${matchResult.won ? 'win' : matchResult.draw ? 'draw' : 'loss'}`}>
        <span className="eyebrow">
          {matchResult.winCondition === 'crown'
            ? '👑 Vitória por Soberania Imperial'
            : matchResult.winCondition === 'regicide'
              ? '⚔️ Vitória por Regicídio'
              : 'Resultado da Partida'}
        </span>
        <h1>{matchResult.title}</h1>
        <p className="results-subtitle">{matchResult.subtitle}</p>
        <p className="muted">{matchResult.reason}</p>

        <div className="stats-grid" style={{ marginTop: 20 }}>
          <div className="stat-box">
            <span>Duração</span>
            <strong>{fmtTime(matchResult.duration)}</strong>
          </div>
          <div className="stat-box">
            <span>{matchResult.isTactical ? 'Domínio (PV)' : 'Placar'}</span>
            <strong>{matchResult.myScore} × {matchResult.oppScore}</strong>
          </div>
          {!matchResult.isClassic && !matchResult.isTactical && matchResult.mode !== 'arena' && (
            <div className="stat-box">
              <span>Domínio da Coroa</span>
              <strong>{matchResult.myCrown}% × {matchResult.oppCrown}%</strong>
            </div>
          )}
          {Number.isFinite(matchResult.ratingChange) && (
            <div className="stat-box">
              <span>Variação de Rating</span>
              <strong style={{ color: matchResult.ratingChange >= 0 ? 'var(--green)' : 'var(--red)' }}>
                {matchResult.ratingChange >= 0 ? `+${matchResult.ratingChange}` : matchResult.ratingChange}
              </strong>
            </div>
          )}
        </div>

        {Array.isArray(matchResult.newlyUnlocked) && matchResult.newlyUnlocked.length > 0 && (
          <div className="unlocked-banner">
            <strong>🏆 Novas conquistas desbloqueadas:</strong>
            <div className="unlocked-chips">
              {matchResult.newlyUnlocked.map((a) => (
                <span key={a.id} className="division-pill">{a.icon} {a.title}</span>
              ))}
            </div>
          </div>
        )}

        <div className="modal-actions" style={{ justifyContent: 'center', marginTop: 24 }}>
          {matchResult.isClassic && (
            <button
              type="button"
              className="primary"
              onClick={() => navigate(`/analysis/${matchResult.matchId}`)}
            >
              📊 Analisar Partida
            </button>
          )}
          <button
            type="button"
            className={matchResult.isClassic ? 'secondary' : 'primary'}
            disabled={matchResult.rematchStatus === 'waiting'}
            onClick={handlePlayAgain}
          >
            {matchResult.isOnline
              ? matchResult.rematchStatus === 'waiting'
                ? 'Aguardando revanche...'
                : 'Pedir Revanche'
              : 'Jogar Novamente'}
          </button>
          <button
            type="button"
            className="secondary"
            onClick={() => {
              clearMatchSession();
              navigate(matchResult.isClassic ? '/modes/classic' : '/modes');
            }}
          >
            {matchResult.isClassic ? 'Voltar ao Xadrez Clássico' : 'Voltar à Central de Modos'}
          </button>
        </div>
      </div>
    </div>
  );
}
