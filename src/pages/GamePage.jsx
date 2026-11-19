import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import ClassicMatchView from '../components/game/ClassicMatchView.jsx';
import DuelMatchView from '../components/game/DuelMatchView.jsx';
import TacticalMatchView from '../components/game/TacticalMatchView.jsx';
import { useMatchSession } from '../contexts/MatchSessionContext.jsx';

export default function GamePage() {
  const { matchId } = useParams();
  const navigate = useNavigate();
  const { activeMatch } = useMatchSession();

  if (!activeMatch || (matchId && activeMatch.matchId !== matchId)) {
    return (
      <div className="cf-app-shell">
        <div className="page-container" style={{ paddingTop: 48 }}>
          <div className="panel" style={{ maxWidth: 520, margin: '0 auto', textAlign: 'center' }}>
            <h2>Partida não encontrada ou já encerrada</h2>
            <p className="muted" style={{ margin: '10px 0 18px' }}>
              Nenhuma sessão ativa corresponde ao identificador informado. Retorne à Central de Modos para iniciar um novo confronto.
            </p>
            <button type="button" className="primary" onClick={() => navigate('/modes')}>
              Voltar à Central de Modos
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (activeMatch.kind === 'tactical') {
    return <TacticalMatchView match={activeMatch} />;
  }
  if (activeMatch.kind === 'offline_classic' || activeMatch.kind === 'online_classic') {
    return <ClassicMatchView match={activeMatch} />;
  }
  return <DuelMatchView match={activeMatch} />;
}
