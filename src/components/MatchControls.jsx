import React from 'react';

export default function MatchControls({
  onResign,
  onReturnMenu,
  resignDisabled = false,
  resignLabel = 'Desistir',
  menuLabel = 'Voltar ao menu',
  extraActions = null,
}) {
  return (
    <div className="match-controls-bar">
      {extraActions}
      {onResign && (
        <button
          type="button"
          className="mini-btn danger"
          disabled={resignDisabled}
          onClick={onResign}
        >
          🏳 {resignLabel}
        </button>
      )}
      <button type="button" className="mini-btn" onClick={onReturnMenu}>
        ⌂ {menuLabel}
      </button>
    </div>
  );
}
