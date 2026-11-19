import React from 'react';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useToast } from '../contexts/ToastContext.jsx';

export default function RecoveryKeyModal() {
  const { recoveryKeyModal, setRecoveryKeyModal } = useAuth();
  const { showToast } = useToast();

  if (!recoveryKeyModal) return null;

  const copyKey = async () => {
    try {
      await navigator.clipboard.writeText(recoveryKeyModal);
      showToast('Código de recuperação copiado!');
    } catch {
      // ignore
    }
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal-card">
        <div className="modal-head">
          <h2>Código de Recuperação Pessoal</h2>
          <button
            type="button"
            className="icon-close"
            onClick={() => setRecoveryKeyModal('')}
            aria-label="Fechar"
          >
            ×
          </button>
        </div>
        <p className="muted" style={{ lineHeight: 1.48 }}>
          Guarde este código em um local seguro. Ele é armazenado de forma criptografada e permite redefinir sua senha caso você a esqueça.
        </p>
        <div className="recovery-code-box">{recoveryKeyModal}</div>
        <div className="modal-actions">
          <button type="button" className="secondary" onClick={copyKey}>
            Copiar código
          </button>
          <button type="button" className="primary" onClick={() => setRecoveryKeyModal('')}>
            Já anotei
          </button>
        </div>
      </div>
    </div>
  );
}
