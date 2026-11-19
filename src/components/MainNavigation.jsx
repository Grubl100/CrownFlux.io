import React from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useMatchSession } from '../contexts/MatchSessionContext.jsx';

export default function MainNavigation() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { friends, incomingRequests, challenges } = useMatchSession();

  const onlineFriendsCount = friends.filter((f) => f.online).length;
  const hasSocialAlerts = incomingRequests.length > 0 || challenges.length > 0;
  const isModesActive =
    location.pathname === '/' || location.pathname.startsWith('/modes');

  return (
    <header className="topbar">
      <button
        type="button"
        className="brand"
        onClick={() => navigate('/modes')}
        aria-label="Ir para Central de Modos"
      >
        <span className="brand-mark">♛</span>
        <span>
          CROWNFLUX<span className="io">.io</span>
        </span>
      </button>

      <nav className="main-nav" aria-label="Navegação principal">
        <NavLink
          to="/modes"
          className={() => `nav-btn ${isModesActive ? ' active' : ''}`}
        >
          <span className="nav-ic">⚔️</span>
          <span>Modos</span>
        </NavLink>

        <NavLink
          to="/friends"
          className={({ isActive }) => `nav-btn${isActive ? ' active' : ''}`}
        >
          <span className="nav-ic">👥</span>
          <span>Amigos</span>
          {onlineFriendsCount > 0 && (
            <span className="nav-badge">{onlineFriendsCount}</span>
          )}
          {hasSocialAlerts && <span className="nav-dot" title="Novas notificações" />}
        </NavLink>

        <NavLink
          to="/ranking"
          className={({ isActive }) => `nav-btn${isActive ? ' active' : ''}`}
        >
          <span className="nav-ic">🏆</span>
          <span>Ranking</span>
        </NavLink>

        <NavLink
          to="/history"
          className={({ isActive }) => `nav-btn${isActive ? ' active' : ''}`}
        >
          <span className="nav-ic">📜</span>
          <span>Histórico</span>
        </NavLink>

        <NavLink
          to="/profile"
          className={({ isActive }) => `nav-btn${isActive ? ' active' : ''}`}
        >
          <span className="nav-ic">🛡️</span>
          <span>Perfil</span>
        </NavLink>

        <NavLink
          to="/settings"
          className={({ isActive }) => `nav-btn${isActive ? ' active' : ''}`}
        >
          <span className="nav-ic">⚙️</span>
          <span>Configurações</span>
        </NavLink>
      </nav>

      <div className="top-right">
        <button
          type="button"
          className="account-pill"
          onClick={() => navigate('/profile')}
        >
          <span className="mini-avatar">{user?.avatar || '♟'}</span>
          <span>{user ? `@${user.username}` : 'Entrar / Conta'}</span>
        </button>
      </div>
    </header>
  );
}
