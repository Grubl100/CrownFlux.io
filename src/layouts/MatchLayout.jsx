import React from 'react';
import { Outlet } from 'react-router-dom';

export default function MatchLayout() {
  return (
    <div className="cf-match-shell">
      <Outlet />
    </div>
  );
}
