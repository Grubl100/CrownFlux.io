import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function FriendList({
  friends,
  onSendSocket,
  onOpenChallenge,
}) {
  const navigate = useNavigate();
  const [confirmAction, setConfirmAction] = useState(null);

  const onlineList = friends.filter((f) => f.online && !f.inGame);
  const inGameList = friends.filter((f) => f.online && f.inGame);
  const offlineList = friends.filter((f) => !f.online);

  const renderGroup = (title, list, emptyMsg) => (
    <div className="friends-group">
      <div className="subhead-row">
        <h4>{title}</h4>
        <span className="pill">{list.length}</span>
      </div>
      <div className="friends-list">
        {list.length === 0 ? (
          <div className="muted" style={{ fontSize: 12.5 }}>{emptyMsg}</div>
        ) : (
          list.map((friend) => {
            const statusClass = friend.inGame ? 'in_game' : friend.online ? 'online' : '';
            const statusLabel = friend.inGame ? 'Em partida agora' : friend.online ? 'Disponível para duelo' : 'Offline';
            return (
              <div key={friend.id} className="friend-item">
                <div className="friend-ident">
                  <div className="avatar-badge">{friend.avatar || '♟'}</div>
                  <div className="friend-names">
                    <strong>
                      {friend.displayName || friend.username}{' '}
                      <span className="muted" style={{ fontWeight: 500 }}>@{friend.username}</span>
                    </strong>
                    <span>
                      <i className={`presence-dot ${statusClass}`} />
                      {statusLabel}
                    </span>
                  </div>
                </div>
                <div className="friend-actions">
                  <button
                    type="button"
                    className="mini-btn"
                    onClick={() => navigate(`/profile/${encodeURIComponent(friend.username)}`)}
                  >
                    Perfil
                  </button>
                  {friend.online && !friend.inGame && (
                    <button
                      type="button"
                      className="mini-btn accent"
                      onClick={() => onOpenChallenge(friend)}
                    >
                      ⚔️ Desafiar
                    </button>
                  )}
                  <button
                    type="button"
                    className="mini-btn danger"
                    onClick={() =>
                      setConfirmAction({
                        type: 'remove',
                        friend,
                        label: `Remover @${friend.username}?`,
                      })
                    }
                  >
                    Remover
                  </button>
                  <button
                    type="button"
                    className="mini-btn danger"
                    onClick={() =>
                      setConfirmAction({
                        type: 'block',
                        friend,
                        label: `Bloquear @${friend.username}?`,
                      })
                    }
                  >
                    Bloquear
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );

  return (
    <>
      {renderGroup('Disponíveis Online', onlineList, 'Nenhum amigo disponível online no momento.')}
      {renderGroup('Atualmente em Partida', inGameList, 'Nenhum amigo está em partida agora.')}
      {renderGroup('Offline', offlineList, 'Nenhum amigo offline.')}

      {confirmAction && (
        <div className="modal-backdrop">
          <div className="modal-card">
            <h3>{confirmAction.label}</h3>
            <p className="muted" style={{ margin: '8px 0 16px' }}>
              {confirmAction.type === 'block'
                ? 'Jogadores bloqueados não poderão enviar solicitações ou desafios para você.'
                : 'Você poderá adicioná-lo novamente no futuro buscando pelo nome de usuário.'}
            </p>
            <div className="modal-actions">
              <button type="button" className="secondary" onClick={() => setConfirmAction(null)}>
                Cancelar
              </button>
              <button
                type="button"
                className="danger-btn"
                onClick={() => {
                  onSendSocket(confirmAction.type === 'block' ? 'friend:block' : 'friend:remove', {
                    userId: confirmAction.friend.id,
                  });
                  setConfirmAction(null);
                }}
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
