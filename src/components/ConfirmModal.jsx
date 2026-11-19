import React, { useEffect } from 'react';

export default function ConfirmModal({
  open,
  title,
  message,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  danger = true,
  onConfirm,
  onCancel,
}) {
  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') onCancel?.();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onCancel]);

  if (!open) return null;
  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel?.();
      }}
    >
      <div className="modal-card">
        <div className="modal-head">
          <h2 id="confirm-modal-title">{title}</h2>
          <button type="button" className="icon-close" onClick={onCancel} aria-label="Fechar diálogo">
            ×
          </button>
        </div>
        <p className="muted" style={{ lineHeight: 1.55, margin: '10px 0 18px' }}>
          {message}
        </p>
        <div className="modal-actions">
          <button type="button" className="secondary" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={danger ? 'danger-btn' : 'primary'}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
