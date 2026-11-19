import React, { useEffect } from 'react';
import { getChessPieceDataUrl, normalizePieceStyle } from '../../game/chessPieceAssets.js';
import { NOME } from '../../utils/constants.js';

const OPTIONS = ['Q', 'R', 'B', 'N'];

export default function ChessPromotionDialog({ side = 0, pieceStyle = 'standard', onSelect, onCancel }) {
  const normStyle = normalizePieceStyle(pieceStyle);

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === 'Escape') onCancel?.();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onCancel]);

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Escolher promoção do peão"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel?.();
      }}
    >
      <div className="modal-card promo-modal-card">
        <h3>Promover Peão</h3>
        <p className="muted" style={{ marginBottom: 14 }}>
          Escolha a peça para promoção ({side === 0 ? 'Brancas' : 'Pretas'}):
        </p>
        <div className="promo-grid">
          {OPTIONS.map((t) => (
            <button
              key={t}
              type="button"
              className="promo-choice-btn"
              onClick={() => onSelect(t)}
            >
              <img
                src={getChessPieceDataUrl(normStyle, t, side)}
                alt={NOME[t]}
                className="promo-piece-img"
                width={44}
                height={44}
              />
              <span>{NOME[t]}</span>
            </button>
          ))}
        </div>
        <div className="modal-actions" style={{ marginTop: 14 }}>
          <button type="button" className="secondary" onClick={onCancel}>
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
