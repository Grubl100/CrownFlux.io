import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { apiRequest } from '../api/client.js';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useMatchSession } from '../contexts/MatchSessionContext.jsx';
import { useToast } from '../contexts/ToastContext.jsx';
import { ACHIEVEMENTS_CATALOG, AVATARS } from '../utils/constants.js';
import { fmtTime, getModeLabel } from '../utils/format.js';

export default function ProfilePage() {
  const { username: routeUsername } = useParams();
  const navigate = useNavigate();
  const { user, login, register, logout, updateProfile, setRecoveryKeyModal } = useAuth();
  const { sendSocket } = useMatchSession();
  const { showToast } = useToast();

  // Public profile inspection state (when /profile/:username is visited for someone else)
  const isInspectingOther = Boolean(routeUsername && (!user || routeUsername.toLowerCase() !== user.username.toLowerCase()));
  const [inspected, setInspected] = useState(null);
  const [inspectError, setInspectError] = useState('');

  // Auth form state
  const [authUsername, setAuthUsername] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [authMsg, setAuthMsg] = useState('');
  const [resetMode, setResetMode] = useState(false);
  const [resetUser, setResetUser] = useState('');
  const [resetKey, setResetKey] = useState('');
  const [resetPass, setResetPass] = useState('');

  // Own profile edit state
  const [editUsername, setEditUsername] = useState('');
  const [editDisplayName, setEditDisplayName] = useState('');
  const [editBio, setEditBio] = useState('');
  const [editAvatar, setEditAvatar] = useState('♟');
  const [curPass, setCurPass] = useState('');
  const [newPass, setNewPass] = useState('');

  useEffect(() => {
    if (user) {
      setEditUsername(user.username || '');
      setEditDisplayName(user.displayName || '');
      setEditBio(user.bio || '');
      setEditAvatar(user.avatar || '♟');
    }
  }, [user]);

  useEffect(() => {
    if (!isInspectingOther) {
      setInspected(null);
      setInspectError('');
      return;
    }
    let active = true;
    apiRequest(`/api/users/${encodeURIComponent(routeUsername)}`)
      .then((data) => {
        if (active) {
          setInspected(data);
          setInspectError('');
        }
      })
      .catch((err) => {
        if (active) setInspectError(err.message || 'Jogador não encontrado.');
      });
    return () => {
      active = false;
    };
  }, [isInspectingOther, routeUsername]);

  if (isInspectingOther) {
    if (inspectError) {
      return (
        <div className="page-container">
          <div className="panel">
            <h2>Perfil indisponível</h2>
            <p className="muted" style={{ margin: '8px 0 14px' }}>{inspectError}</p>
            <button type="button" className="secondary" onClick={() => navigate('/ranking')}>
              Voltar ao Ranking
            </button>
          </div>
        </div>
      );
    }
    if (!inspected) return <div className="page-container"><div className="panel muted">Carregando perfil...</div></div>;

    const u = inspected.user;
    const s = u.stats || {};
    const unlocked = new Set(s.achievements || []);
    return (
      <div className="page-container">
        <div className="page-crumb-row">
          <button type="button" className="mini-btn" onClick={() => navigate(-1)}>← Voltar</button>
        </div>
        <div className="panel profile-hero-card">
          <div className="avatar-badge large">{u.avatar || '♟'}</div>
          <div style={{ flex: 1 }}>
            <div className="profile-name-row">
              <h1>{u.displayName || u.username}</h1>
              <span className="division-pill">{s.crownfluxDivisionIcon || '🛡️'} {s.crownfluxDivision || 'Prata'} · {s.crownfluxRating || 1200}</span>
            </div>
            <div className="muted">@{u.username} · {u.statusLabel || 'Offline'}</div>
            {u.bio && <p style={{ marginTop: 6 }}>{u.bio}</p>}
          </div>
          {user && !inspected.isFriend && (
            <button type="button" className="primary" onClick={() => sendSocket('friend:request', { username: u.username })}>
              + Adicionar Amigo
            </button>
          )}
        </div>

        <div className="stats-grid" style={{ marginTop: 16 }}>
          <div className="stat-box"><span>Rating 1v1</span><strong>{s.crownfluxRating || 1200}</strong></div>
          <div className="stat-box"><span>Partidas Online</span><strong>{s.games || 0}</strong></div>
          <div className="stat-box"><span>Vitórias</span><strong>{s.wins || 0}</strong></div>
          <div className="stat-box"><span>Vitórias pela Coroa</span><strong>{s.crownWins || 0}</strong></div>
          <div className="stat-box"><span>Regicídios</span><strong>{s.regicideWins || 0}</strong></div>
          <div className="stat-box"><span>Vitórias vs CPU</span><strong>{s.cpuWins || 0}</strong></div>
        </div>

        <div className="panel" style={{ marginTop: 16 }}>
          <h3>Conquistas ({unlocked.size} / {ACHIEVEMENTS_CATALOG.length})</h3>
          <div className="achievements-grid" style={{ marginTop: 12 }}>
            {ACHIEVEMENTS_CATALOG.map((ach) => (
              <div key={ach.id} className={`achievement-card ${unlocked.has(ach.id) ? 'unlocked' : 'locked'}`}>
                <div className="ach-icon">{ach.icon}</div>
                <div className="ach-body">
                  <strong>{ach.title} {unlocked.has(ach.id) ? '✓' : ''}</strong>
                  <span>{ach.desc}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {Array.isArray(inspected.recentGames) && inspected.recentGames.length > 0 && (
          <div className="panel" style={{ marginTop: 16 }}>
            <h3>Partidas Recentes</h3>
            <div className="friends-list" style={{ marginTop: 10 }}>
              {inspected.recentGames.map((g) => (
                <div key={g.id} className="friend-item">
                  <div>
                    <strong>{g.result}</strong> · contra {g.opponent} <span className="muted">({getModeLabel(g)})</span>
                    <div className="muted" style={{ fontSize: 12 }}>Duração: {fmtTime(g.duration)} · {g.reason}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // Guest Auth View
  if (!user) {
    const submitAuth = async (kind) => {
      if (!authUsername.trim() || !authPassword) {
        setAuthMsg('Informe nome de usuário e senha.');
        return;
      }
      setAuthMsg(kind === 'login' ? 'Entrando...' : 'Criando conta...');
      try {
        if (kind === 'login') await login({ username: authUsername.trim(), password: authPassword, rememberMe });
        else await register({ username: authUsername.trim(), password: authPassword, rememberMe });
        showToast('Conectado com sucesso!');
      } catch (err) {
        setAuthMsg(err.message);
      }
    };

    const submitReset = async (e) => {
      e.preventDefault();
      try {
        const res = await apiRequest('/api/password/reset', {
          username: resetUser.trim(),
          recoveryKey: resetKey.trim(),
          newPassword: resetPass,
        });
        showToast(res.message || 'Senha redefinida!');
        setResetMode(false);
      } catch (err) {
        showToast(err.message, 'error');
      }
    };

    return (
      <div className="page-container">
        <div className="auth-cards-grid">
          <section className="panel">
            <span className="eyebrow">Conta Crownflux.io</span>
            <h1>{resetMode ? 'Recuperar Senha' : 'Entrar ou Criar Conta'}</h1>
            <p className="muted" style={{ marginBottom: 14 }}>
              Salve seu Rating Elo, conquistas, amigos, histórico e jogue partidas online em tempo real.
            </p>

            {!resetMode ? (
              <div className="form-stack">
                <label>
                  <span>Usuário (3–18 caracteres)</span>
                  <input type="text" value={authUsername} onChange={(e) => setAuthUsername(e.target.value)} placeholder="ex: rei_estrategico" />
                </label>
                <label>
                  <span>Senha (mín. 8 caracteres)</span>
                  <input type="password" value={authPassword} onChange={(e) => setAuthPassword(e.target.value)} />
                </label>
                <label className="check-row">
                  <input type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} />
                  <span>Lembrar de mim por 30 dias</span>
                </label>
                {authMsg && <div className="muted" style={{ color: 'var(--gold)' }}>{authMsg}</div>}
                <div className="modal-actions" style={{ justifyContent: 'flex-start' }}>
                  <button type="button" className="primary" onClick={() => submitAuth('login')}>Entrar</button>
                  <button type="button" className="secondary" onClick={() => submitAuth('register')}>Criar Conta</button>
                </div>
                <button type="button" className="link-inline" onClick={() => setResetMode(true)}>
                  Esqueci minha senha (usar código de recuperação)
                </button>
              </div>
            ) : (
              <form onSubmit={submitReset} className="form-stack">
                <label>
                  <span>Usuário</span>
                  <input type="text" value={resetUser} onChange={(e) => setResetUser(e.target.value)} />
                </label>
                <label>
                  <span>Código de Recuperação (CFX-XXXX-XXXX)</span>
                  <input type="text" value={resetKey} onChange={(e) => setResetKey(e.target.value)} />
                </label>
                <label>
                  <span>Nova Senha</span>
                  <input type="password" value={resetPass} onChange={(e) => setResetPass(e.target.value)} />
                </label>
                <div className="modal-actions" style={{ justifyContent: 'flex-start' }}>
                  <button type="submit" className="primary">Redefinir Senha</button>
                  <button type="button" className="secondary" onClick={() => setResetMode(false)}>Voltar</button>
                </div>
              </form>
            )}
          </section>
        </div>
      </div>
    );
  }

  // Own Authenticated Profile
  const s = user.stats || {};
  const g = s.games || 0;
  const w = s.wins || 0;
  const rate = g > 0 ? Math.round((w / g) * 100) : 0;
  const unlocked = new Set(s.achievements || []);
  const diffNames = { 0: 'Nenhuma', 1: 'Iniciante', 2: 'Fácil', 3: 'Normal', 4: 'Difícil', 5: 'Especialista' };

  return (
    <div className="page-container">
      <div className="panel profile-hero-card">
        <div className="avatar-badge large">{user.avatar || '♟'}</div>
        <div style={{ flex: 1 }}>
          <div className="profile-name-row">
            <h1>{user.displayName || user.username}</h1>
            <span className="division-pill">
              {s.crownfluxDivisionIcon || '🛡️'} {s.crownfluxDivision || 'Prata'} · {s.crownfluxRating || 1200}
            </span>
          </div>
          <div className="muted">@{user.username}</div>
          <p className="muted" style={{ marginTop: 4 }}>{user.bio || 'Sem frase de perfil definida.'}</p>
        </div>
        <button type="button" className="mini-btn danger" onClick={logout}>Sair da conta</button>
      </div>

      <div className="stats-grid" style={{ marginTop: 16 }}>
        <div className="stat-box"><span>Rating Duelo 1v1</span><strong>{s.crownfluxRating || 1200}</strong></div>
        <div className="stat-box"><span>Divisão</span><strong>{s.crownfluxDivisionIcon || '🛡️'} {s.crownfluxDivision || 'Prata'}</strong></div>
        <div className="stat-box"><span>Partidas Online</span><strong>{g}</strong></div>
        <div className="stat-box"><span>Vitórias / Taxa</span><strong>{w} ({rate}%)</strong></div>
        <div className="stat-box"><span>Vitórias pela Coroa</span><strong>👑 {s.crownWins || 0}</strong></div>
        <div className="stat-box"><span>Regicídios</span><strong>⚔️ {s.regicideWins || 0}</strong></div>
        <div className="stat-box"><span>Vitórias vs CPU</span><strong>{s.cpuWins || 0} ({s.cpuGames || 0})</strong></div>
        <div className="stat-box"><span>Maior CPU Vencida</span><strong>{diffNames[s.highestCpuLevel || 0]}</strong></div>
      </div>

      <div className="panel" style={{ marginTop: 16 }}>
        <h3>Ratings Xadrez Clássico</h3>
        <div className="stats-grid" style={{ marginTop: 10 }}>
          {['bullet', 'blitz', 'rapid', 'classic'].map((cat) => (
            <div key={cat} className="stat-box">
              <span>{cat.toUpperCase()}</span>
              <strong>{s.classicRatings?.[cat] || 1200}</strong>
              <small className="muted">
                Pico {s.classicRatingStats?.[cat]?.peak || s.classicRatings?.[cat] || 1200}
                {(s.classicRatingStats?.[cat]?.games || 0) < 30 ? ' · Provisório' : ''}
              </small>
            </div>
          ))}
        </div>
      </div>

      <div className="panel" style={{ marginTop: 16 }}>
        <div className="page-head-row" style={{ marginBottom: 10 }}>
          <h3>Conquistas</h3>
          <span className="pill">{unlocked.size} / {ACHIEVEMENTS_CATALOG.length}</span>
        </div>
        <div className="achievements-grid">
          {ACHIEVEMENTS_CATALOG.map((ach) => (
            <div key={ach.id} className={`achievement-card ${unlocked.has(ach.id) ? 'unlocked' : 'locked'}`}>
              <div className="ach-icon">{ach.icon}</div>
              <div className="ach-body">
                <strong>{ach.title} {unlocked.has(ach.id) ? '✓' : ''}</strong>
                <span>{ach.desc}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="submode-panels" style={{ marginTop: 16 }}>
        <section className="panel">
          <h3>Personalizar Perfil</h3>
          <div className="form-stack">
            <label>
              <span>Avatar</span>
              <div className="avatar-selector-grid">
                {AVATARS.map((av) => (
                  <button
                    key={av}
                    type="button"
                    className={`avatar-choice${editAvatar === av ? ' selected' : ''}`}
                    onClick={() => setEditAvatar(av)}
                  >
                    {av}
                  </button>
                ))}
              </div>
            </label>
            <label>
              <span>Nome de Usuário (@)</span>
              <input type="text" value={editUsername} onChange={(e) => setEditUsername(e.target.value)} />
            </label>
            <label>
              <span>Nome de Exibição</span>
              <input type="text" value={editDisplayName} onChange={(e) => setEditDisplayName(e.target.value)} />
            </label>
            <label>
              <span>Biografia</span>
              <input type="text" value={editBio} onChange={(e) => setEditBio(e.target.value)} maxLength={120} />
            </label>
            <button
              type="button"
              className="primary"
              onClick={async () => {
                try {
                  await updateProfile({
                    username: editUsername.trim(),
                    displayName: editDisplayName.trim(),
                    bio: editBio.trim(),
                    avatar: editAvatar,
                  });
                  showToast('Perfil atualizado!');
                } catch (err) {
                  showToast(err.message, 'error');
                }
              }}
            >
              Salvar Alterações
            </button>
          </div>
        </section>

        <section className="panel">
          <h3>Segurança da Conta</h3>
          <div className="form-stack">
            <label>
              <span>Senha Atual</span>
              <input type="password" value={curPass} onChange={(e) => setCurPass(e.target.value)} />
            </label>
            <label>
              <span>Nova Senha</span>
              <input type="password" value={newPass} onChange={(e) => setNewPass(e.target.value)} />
            </label>
            <button
              type="button"
              className="secondary"
              onClick={async () => {
                try {
                  const res = await apiRequest('/api/profile/password', { currentPassword: curPass, newPassword: newPass });
                  setCurPass('');
                  setNewPass('');
                  showToast(res.message || 'Senha atualizada!');
                } catch (err) {
                  showToast(err.message, 'error');
                }
              }}
            >
              Alterar Senha
            </button>
            <button
              type="button"
              className="mini-btn"
              onClick={async () => {
                if (!curPass) {
                  showToast('Digite sua senha atual acima para gerar um novo código.', 'warn');
                  return;
                }
                try {
                  const res = await apiRequest('/api/profile/recovery-key', { currentPassword: curPass });
                  if (res.recoveryKey) setRecoveryKeyModal(res.recoveryKey);
                } catch (err) {
                  showToast(err.message, 'error');
                }
              }}
            >
              Gerar Novo Código de Recuperação
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
