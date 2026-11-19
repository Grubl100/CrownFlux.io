import React from 'react';
import { GLYPH, NOME } from '../../utils/constants.js';

const OPTIONS = ['Q', 'R', 'B', 'N'];

export default function ChessPromotionDialog({ side = 0, onSelect, onCancel }) {
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Escolher promoção do peão">
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
              <span className="promo-glyph">{GLYPH[t]}</span>
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
