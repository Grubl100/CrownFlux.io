import React from 'react';
import { Outlet } from 'react-router-dom';
import MainNavigation from '../components/MainNavigation.jsx';

export default function ResultsLayout() {
  return (
    <div className="cf-app-shell cf-results-shell">
      <MainNavigation />
      <main className="cf-results-content">
        <Outlet />
      </main>
    </div>
  );
}
