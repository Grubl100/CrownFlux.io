import React from 'react';
import { Outlet } from 'react-router-dom';
import MainNavigation from '../components/MainNavigation.jsx';

export default function MainLayout() {
  return (
    <div className="cf-app-shell">
      <MainNavigation />
      <main className="cf-main-content">
        <Outlet />
      </main>
    </div>
  );
}
