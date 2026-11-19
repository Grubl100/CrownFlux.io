import React from 'react';
import { Outlet } from 'react-router-dom';
import MainNavigation from '../components/MainNavigation.jsx';

export default function LobbyLayout() {
  return (
    <div className="cf-app-shell cf-lobby-shell">
      <MainNavigation />
      <main className="cf-lobby-content">
        <Outlet />
      </main>
    </div>
  );
}
