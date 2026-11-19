import React from 'react';
import { Link } from 'react-router-dom';

export default function RankingTable({ entries, mode, currentUsername, loading }) {
  if (loading) {
    return <div className="panel muted">Carregando classificação competitiva...</div>;
  }
  if (!entries || !entries.length) {
    return (
      <div className="panel muted">
        Nenhum jogador registrado neste ranking ainda. Dispute partidas nesta modalidade para inaugurar a tabela!
      </div>
    );
  }

  return (
    <div className="ranking-table-wrap">
      <table className="ranking-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Jogador</th>
            {mode === 'duel' && <th>Divisão</th>}
            {mode === 'classic' && <th>Classe</th>}
            <th>Pontuação</th>
            {mode === 'classic' && <th>Pico</th>}
            <th>V / D {mode !== 'tactical' ? '/ E' : ''}</th>
            <th>Taxa</th>
            {mode === 'duel' && <th>Coroa / Regicídio</th>}
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => {
            const isMe = currentUsername && entry.username === currentUsername;
            return (
              <tr key={entry.id} className={isMe ? 'me-row' : ''}>
                <td className="rank-col">
                  <span className={`rank-num rank-${entry.rank <= 3 ? entry.rank : 'other'}`}>
                    {entry.rank === 1 ? '🥇' : entry.rank === 2 ? '🥈' : entry.rank === 3 ? '🥉' : entry.rank}
                  </span>
                </td>
                <td>
                  <Link to={`/profile/${encodeURIComponent(entry.username)}`} className="rank-player-link">
                    <span className="mini-avatar">{entry.avatar || '♟'}</span>
                    <div>
                      <strong>{entry.displayName || entry.username}</strong>
                      <small>@{entry.username}</small>
                    </div>
                  </Link>
                </td>
                {mode === 'duel' && (
                  <td>
                    <span className="division-chip">
                      {entry.divisionIcon || '🛡️'} {entry.division || 'Prata'}
                    </span>
                  </td>
                )}
                {mode === 'classic' && (
                  <td>
                    <span className="division-chip">
                      {entry.divisionIcon || '♟'} {entry.division || 'Novo'}
                    </span>
                  </td>
                )}
                <td className="rating-col">
                  <strong>{entry.rating}</strong>
                  {mode === 'classic' && entry.provisional && (
                    <small className="muted" style={{ display: 'block' }}>Provisório</small>
                  )}
                </td>
                {mode === 'classic' && <td><strong>{entry.peak}</strong></td>}
                <td>
                  <span className="wl-text">
                    <b className="win-num">{entry.wins}V</b> / <b className="loss-num">{entry.losses}D</b>
                    {mode !== 'tactical' ? ` / ${entry.draws || 0}E` : ''}
                  </span>
                </td>
                <td>{entry.winRate}%</td>
                {mode === 'duel' && (
                  <td className="muted">
                    👑 {entry.crownWins || 0} · ⚔️ {entry.regicideWins || 0}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
