import React from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import RecoveryKeyModal from '../components/RecoveryKeyModal.jsx';
import { AuthProvider } from '../contexts/AuthContext.jsx';
import { MatchSessionProvider } from '../contexts/MatchSessionContext.jsx';
import { SocketProvider } from '../contexts/SocketContext.jsx';
import { ToastProvider } from '../contexts/ToastContext.jsx';
import LobbyLayout from '../layouts/LobbyLayout.jsx';
import MainLayout from '../layouts/MainLayout.jsx';
import MatchLayout from '../layouts/MatchLayout.jsx';
import ResultsLayout from '../layouts/ResultsLayout.jsx';
import ClassicPage from '../pages/ClassicPage.jsx';
import ChessAnalysisPage from '../pages/ChessAnalysisPage.jsx';
import DuelPage from '../pages/DuelPage.jsx';
import {
  Duel1v1Page,
  Duel4PlayersPage,
  DuelCpuPage,
  DuelLocalPage,
  DuelTutorialPage,
} from '../pages/DuelSubPages.jsx';
import FriendsPage from '../pages/FriendsPage.jsx';
import GamePage from '../pages/GamePage.jsx';
import HistoryPage from '../pages/HistoryPage.jsx';
import HowToPlayPage from '../pages/HowToPlayPage.jsx';
import LobbyPage from '../pages/LobbyPage.jsx';
import ModesPage from '../pages/ModesPage.jsx';
import NotFoundPage from '../pages/NotFoundPage.jsx';
import ProfilePage from '../pages/ProfilePage.jsx';
import RankingPage from '../pages/RankingPage.jsx';
import ResultsPage from '../pages/ResultsPage.jsx';
import SettingsPage from '../pages/SettingsPage.jsx';
import TacticalPage from '../pages/TacticalPage.jsx';

export default function AppRouter() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <SocketProvider>
            <MatchSessionProvider>
              <RecoveryKeyModal />
              <Routes>
                <Route element={<MainLayout />}>
                  <Route path="/" element={<ModesPage />} />
                  <Route path="/modes" element={<ModesPage />} />
                  <Route path="/modes/duelo" element={<DuelPage />} />
                  <Route path="/modes/duelo/1v1" element={<Duel1v1Page />} />
                  <Route path="/modes/duelo/4-players" element={<Duel4PlayersPage />} />
                  <Route path="/modes/duelo/cpu" element={<DuelCpuPage />} />
                  <Route path="/modes/duelo/local" element={<DuelLocalPage />} />
                  <Route path="/modes/duelo/tutorial" element={<DuelTutorialPage />} />
                  <Route path="/modes/tactical" element={<TacticalPage />} />
                  <Route path="/modes/classic" element={<ClassicPage />} />
                  <Route path="/analysis/:matchId" element={<ChessAnalysisPage />} />
                  <Route path="/friends" element={<FriendsPage />} />
                  <Route path="/ranking" element={<RankingPage />} />
                  <Route path="/profile" element={<ProfilePage />} />
                  <Route path="/profile/:username" element={<ProfilePage />} />
                  <Route path="/history" element={<HistoryPage />} />
                  <Route path="/settings" element={<SettingsPage />} />
                  <Route path="/how-to-play" element={<HowToPlayPage />} />
                  <Route path="/404" element={<NotFoundPage />} />
                  <Route path="*" element={<NotFoundPage />} />
                </Route>

                <Route element={<LobbyLayout />}>
                  <Route path="/lobby/:lobbyId" element={<LobbyPage />} />
                </Route>

                <Route element={<MatchLayout />}>
                  <Route path="/game/:matchId" element={<GamePage />} />
                </Route>

                <Route element={<ResultsLayout />}>
                  <Route path="/results/:matchId" element={<ResultsPage />} />
                </Route>

                <Route path="/index.html" element={<Navigate to="/modes" replace />} />
              </Routes>
            </MatchSessionProvider>
          </SocketProvider>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}
