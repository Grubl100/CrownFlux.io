import React from 'react';
import { IconFlag, IconHome } from './chess/ClassicIcons.jsx';

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
          <IconFlag />
          <span>{resignLabel}</span>
        </button>
      )}
      <button type="button" className="mini-btn" onClick={onReturnMenu}>
        <IconHome />
        <span>{menuLabel}</span>
      </button>
    </div>
  );
}
