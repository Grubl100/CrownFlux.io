import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMatchSession } from '../contexts/MatchSessionContext.jsx';
import { useToast } from '../contexts/ToastContext.jsx';

export default function LobbyPage() {
  const { lobbyId } = useParams();
  const navigate = useNavigate();
  const { lobby, setLobby, sendSocket } = useMatchSession();
  const { showToast } = useToast();

  if (!lobby) {
    return (
      <div className="page-container">
        <div className="panel" style={{ maxWidth: 540, margin: '24px auto', textAlign: 'center' }}>
          <h2>Lobby não encontrado ou encerrado</h2>
          <p className="muted" style={{ margin: '10px 0 18px' }}>
            A sala ({lobbyId}) não está mais ativa. Volte à Central de Modos para iniciar uma nova busca ou criar uma sala.
          </p>
          <button type="button" className="primary" onClick={() => navigate('/modes')}>
            Ir para Central de Modos
          </button>
        </div>
      </div>
    );
  }

  const copyCode = async () => {
    if (!lobby.code) return;
    try {
      await navigator.clipboard.writeText(lobby.code);
      showToast('Código da sala copiado!');
    } catch {
      // ignore
    }
  };

  return (
    <div className="page-container">
      <div className="panel lobby-card">
        <span className="eyebrow">
          {lobby.kind === 'private' ? 'Sala Privada Online' : 'Fila Pública Online'}
        </span>
        <h1>{lobby.kind === 'private' ? 'Aguardando Adversário na Sala' : 'Buscando Adversário...'}</h1>
        <p className="muted">{lobby.statusText}</p>

        {lobby.code && (
          <div className="lobby-code-box">
            <span>Código da Sala</span>
            <strong>{lobby.code}</strong>
            <button type="button" className="mini-btn accent" onClick={copyCode}>
              Copiar Código
            </button>
          </div>
        )}

        <div className="lobby-meta-row">
          <div className="stat-box">
            <span>Modalidade</span>
            <strong>{lobby.summary || lobby.mode || 'Duelo 1v1'}</strong>
          </div>
          <div className="stat-box">
            <span>Status</span>
            <strong>⏳ Aguardando início</strong>
          </div>
        </div>

        <div className="modal-actions" style={{ justifyContent: 'center', marginTop: 22 }}>
          <button
            type="button"
            className="danger-btn"
            onClick={() => {
              if (lobby.kind === 'queue') sendSocket('match:cancel');
              setLobby(null);
              navigate('/modes');
            }}
          >
            Cancelar e Voltar aos Modos
          </button>
        </div>
      </div>
    </div>
  );
}
