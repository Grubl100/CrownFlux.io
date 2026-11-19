import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import FriendList from '../components/FriendList.jsx';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useMatchSession } from '../contexts/MatchSessionContext.jsx';
import { useToast } from '../contexts/ToastContext.jsx';
import { CLASSIC_CONTROLS } from '../utils/constants.js';

export default function FriendsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();
  const {
    friends,
    incomingRequests,
    outgoingRequests,
    challenges,
    dismissChallenge,
    searchResults,
    sendSocket,
  } = useMatchSession();

  const [query, setQuery] = useState('');
  const [challengeTarget, setChallengeTarget] = useState(null);
  const [chalMode, setChalMode] = useState('realtime');
  const [chalPace, setChalPace] = useState('standard');
  const [chalOrbs, setChalOrbs] = useState('normal');
  const [chalTime, setChalTime] = useState(0);
  const [chalClassicControl, setChalClassicControl] = useState('blitz3');

  if (!user) {
    return (
      <div className="page-container">
        <div className="panel notice-banner-box">
          <div>
            <h2>Central de Amigos</h2>
            <p className="muted">
              Conecte-se à sua conta para adicionar amigos, ver quem está online em tempo real e enviar desafios diretos.
            </p>
          </div>
          <button type="button" className="primary" onClick={() => navigate('/profile')}>
            Entrar / Criar Conta
          </button>
        </div>
      </div>
    );
  }

  const handleSearch = (e) => {
    e.preventDefault();
    if (query.trim().length < 2) {
      showToast('Digite pelo menos 2 caracteres para buscar.', 'warn');
      return;
    }
    sendSocket('profile:search', { query: query.trim() });
  };

  const sendChallenge = () => {
    if (!challengeTarget) return;
    const options =
      chalMode === 'classic'
        ? { mode: 'classic', timeControl: chalClassicControl }
        : chalMode === 'tactical_draft'
          ? { mode: 'tactical_draft' }
          : { mode: 'realtime', pace: chalPace, orbs: chalOrbs, timeLimit: Number(chalTime) || 0 };
    sendSocket('challenge:send', { userId: challengeTarget.id, options });
    setChallengeTarget(null);
  };

  return (
    <div className="page-container">
      <div className="page-head-row">
        <div>
          <span className="eyebrow">Social & Desafios</span>
          <h1>Amigos</h1>
        </div>
        <button type="button" className="mini-btn" onClick={() => sendSocket('friends:refresh')}>
          ↻ Atualizar lista
        </button>
      </div>

      {/* Incoming Challenges */}
      {challenges.length > 0 && (
        <section className="panel challenge-inbox-panel">
          <h3>⚔️ Desafios Recebidos ({challenges.length})</h3>
          <div className="friends-list">
            {challenges.map((c) => (
              <div key={c.id} className="friend-item">
                <div className="friend-ident">
                  <span className="avatar-badge">{c.from?.avatar || '⚔️'}</span>
                  <div className="friend-names">
                    <strong>@{c.from?.username || 'jogador'} desafiou você!</strong>
                    <span>{c.summary || 'Partida 1v1'}</span>
                  </div>
                </div>
                <div className="friend-actions">
                  <button
                    type="button"
                    className="primary"
                    onClick={() => {
                      sendSocket('challenge:respond', { challengeId: c.id, accept: true });
                      dismissChallenge(c.id);
                    }}
                  >
                    Aceitar Duelo
                  </button>
                  <button
                    type="button"
                    className="mini-btn danger"
                    onClick={() => {
                      sendSocket('challenge:respond', { challengeId: c.id, accept: false });
                      dismissChallenge(c.id);
                    }}
                  >
                    Recusar
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="friends-layout-grid">
        <section className="panel">
          <FriendList
            friends={friends}
            onSendSocket={sendSocket}
            onOpenChallenge={(friend) => setChallengeTarget(friend)}
          />
        </section>

        <div className="friends-side-col">
          <section className="panel">
            <h3>Pesquisar Jogadores</h3>
            <form onSubmit={handleSearch} className="search-row">
              <input
                type="text"
                placeholder="Buscar @usuario ou nome..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <button type="submit" className="primary">Buscar</button>
            </form>
            <div className="friends-list" style={{ marginTop: 12 }}>
              {searchResults.map((u) => (
                <div key={u.id} className="friend-item">
                  <div className="friend-ident">
                    <span className="avatar-badge">{u.avatar || '♟'}</span>
                    <div className="friend-names">
                      <strong>{u.displayName || u.username} <span className="muted">@{u.username}</span></strong>
                      <span>{u.statusLabel || 'Offline'}</span>
                    </div>
                  </div>
                  <div className="friend-actions">
                    <button type="button" className="mini-btn" onClick={() => navigate(`/profile/${encodeURIComponent(u.username)}`)}>
                      Perfil
                    </button>
                    {u.isFriend ? (
                      <span className="muted" style={{ fontSize: 12 }}>Já é amigo</span>
                    ) : u.requestPending ? (
                      <span className="muted" style={{ fontSize: 12 }}>Pendente</span>
                    ) : (
                      <button type="button" className="mini-btn accent" onClick={() => sendSocket('friend:request', { username: u.username })}>
                        + Adicionar
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="panel">
            <div className="subhead-row">
              <h4>Solicitações Recebidas</h4>
              <span className="pill">{incomingRequests.length}</span>
            </div>
            <div className="friends-list">
              {incomingRequests.length === 0 ? (
                <div className="muted" style={{ fontSize: 12.5 }}>Nenhuma solicitação recebida.</div>
              ) : (
                incomingRequests.map((r) => (
                  <div key={r.id} className="friend-item">
                    <div className="friend-ident">
                      <span className="avatar-badge">{r.from?.avatar || '♟'}</span>
                      <div className="friend-names">
                        <strong>@{r.from?.username}</strong>
                        <span>Quer adicionar você</span>
                      </div>
                    </div>
                    <div className="friend-actions">
                      <button type="button" className="mini-btn accent" onClick={() => sendSocket('friend:respond', { requestId: r.id, accept: true })}>
                        Aceitar
                      </button>
                      <button type="button" className="mini-btn danger" onClick={() => sendSocket('friend:respond', { requestId: r.id, accept: false })}>
                        Recusar
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="subhead-row" style={{ marginTop: 16 }}>
              <h4>Solicitações Enviadas</h4>
              <span className="pill">{outgoingRequests.length}</span>
            </div>
            <div className="friends-list">
              {outgoingRequests.length === 0 ? (
                <div className="muted" style={{ fontSize: 12.5 }}>Nenhuma solicitação pendente.</div>
              ) : (
                outgoingRequests.map((r) => (
                  <div key={r.id} className="friend-item">
                    <div className="friend-ident">
                      <span className="avatar-badge">{r.to?.avatar || '♟'}</span>
                      <div className="friend-names">
                        <strong>@{r.to?.username}</strong>
                        <span>Aguardando resposta</span>
                      </div>
                    </div>
                    <button type="button" className="mini-btn danger" onClick={() => sendSocket('friend:cancel', { requestId: r.id })}>
                      Cancelar
                    </button>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      </div>

      {/* Challenge Config Modal */}
      {challengeTarget && (
        <div className="modal-backdrop">
          <div className="modal-card">
            <div className="modal-head">
              <h2>Desafiar @{challengeTarget.username}</h2>
              <button type="button" className="icon-close" onClick={() => setChallengeTarget(null)}>×</button>
            </div>
            <div className="form-stack">
              <label>
                <span>Modalidade</span>
                <select value={chalMode} onChange={(e) => setChalMode(e.target.value)}>
                  <option value="realtime">👑 Duelo 1v1 (Crownflux)</option>
                  <option value="tactical_draft">🃏 Cerco Tático (Cartas)</option>
                  <option value="classic">♟ Xadrez Clássico</option>
                </select>
              </label>

              {chalMode === 'realtime' && (
                <>
                  <label>
                    <span>Ritmo de Recarga</span>
                    <select value={chalPace} onChange={(e) => setChalPace(e.target.value)}>
                      <option value="standard">Padrão</option>
                      <option value="fast">Rápido (-20% recarga)</option>
                      <option value="tactical">Tático (+25% recarga)</option>
                    </select>
                  </label>
                  <label>
                    <span>Fragmentos Flux</span>
                    <select value={chalOrbs} onChange={(e) => setChalOrbs(e.target.value)}>
                      <option value="normal">Normais</option>
                      <option value="abundant">Abundantes</option>
                      <option value="none">Sem Fragmentos</option>
                    </select>
                  </label>
                  <label>
                    <span>Duração</span>
                    <select value={chalTime} onChange={(e) => setChalTime(Number(e.target.value))}>
                      <option value={0}>Sem limite de tempo</option>
                      <option value={180}>3 minutos</option>
                      <option value={300}>5 minutos</option>
                    </select>
                  </label>
                </>
              )}

              {chalMode === 'classic' && (
                <label>
                  <span>Controle de Tempo</span>
                  <select value={chalClassicControl} onChange={(e) => setChalClassicControl(e.target.value)}>
                    {Object.entries(CLASSIC_CONTROLS).map(([k, v]) => (
                      <option key={k} value={k}>{v.label}</option>
                    ))}
                  </select>
                </label>
              )}
            </div>
            <div className="modal-actions" style={{ marginTop: 16 }}>
              <button type="button" className="secondary" onClick={() => setChallengeTarget(null)}>Cancelar</button>
              <button type="button" className="primary" onClick={sendChallenge}>Enviar Desafio</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
