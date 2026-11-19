import React, { useEffect } from 'react';
import { IconAnalysis, IconArrowRight } from './ClassicIcons.jsx';

export default function ChessResultModal({
  open,
  outcome = 'draw', // 'win' | 'loss' | 'draw' | 'white_win' | 'black_win'
  title,
  reason,
  scoreText,
  whiteName,
  blackName,
  clockControlLabel,
  moveCount = 0,
  isOnline = false,
  rematchWaiting = false,
  canAnalyze = true,
  onRematch,
  onNewMatch,
  onAnalyze,
  onClose,
}) {
  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="modal-backdrop result-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="classic-result-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div className={`modal-card chess-result-modal outcome-${outcome}`}>
        <div className="chess-result-head">
          <span className={`chess-result-score-pill outcome-${outcome}`}>{scoreText}</span>
          <button
            type="button"
            className="icon-close"
            onClick={onClose}
            aria-label="Fechar janela de resultado"
          >
            ×
          </button>
        </div>

        <h2 id="classic-result-title" className="chess-result-title">{title}</h2>
        <p className="chess-result-reason">{reason || 'Partida encerrada.'}</p>

        <div className="chess-result-players">
          <div className="chess-result-player-row">
            <span className="piece-side-badge white">Brancas</span>
            <strong>{whiteName}</strong>
          </div>
          <div className="chess-result-player-row">
            <span className="piece-side-badge black">Pretas</span>
            <strong>{blackName}</strong>
          </div>
          <div className="chess-result-meta muted">
            <span>{clockControlLabel}</span>
            <span>{moveCount} {moveCount === 1 ? 'lance' : 'lances'}</span>
          </div>
        </div>

        <div className="chess-result-actions">
          <button
            type="button"
            className="primary full-btn classic-cta-btn"
            disabled={isOnline && rematchWaiting}
            onClick={onRematch}
          >
            <span>{isOnline && rematchWaiting ? 'Aguardando revanche...' : 'Revanche'}</span>
            {!(isOnline && rematchWaiting) && <IconArrowRight />}
          </button>

          <button
            type="button"
            className="secondary full-btn classic-cta-btn"
            disabled={!canAnalyze}
            onClick={onAnalyze}
          >
            <IconAnalysis />
            <span>Analisar partida</span>
          </button>

          <button
            type="button"
            className="mini-btn full-btn classic-cta-btn"
            onClick={onNewMatch}
          >
            <span>Nova partida</span>
          </button>
        </div>
      </div>
    </div>
  );
}
