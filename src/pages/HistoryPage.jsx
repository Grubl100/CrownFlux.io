import React, { useState } from 'react';
import { useMatchSession } from '../contexts/MatchSessionContext.jsx';
import { fmtTime, getModeCategory, getModeLabel } from '../utils/format.js';

export default function HistoryPage() {
  const { history, sendSocket } = useMatchSession();
  const [filter, setFilter] = useState('all');

  const filtered = (history || []).filter((g) => {
    if (filter === 'all') return true;
    return getModeCategory(g.mode) === filter;
  });

  return (
    <div className="page-container">
      <div className="page-head-row">
        <div>
          <span className="eyebrow">Registro de Combates</span>
          <h1>Histórico de Partidas</h1>
        </div>
        <button type="button" className="mini-btn" onClick={() => sendSocket('games:history')}>
          ↻ Atualizar
        </button>
      </div>

      <div className="ranking-tabs-row" style={{ marginBottom: 16 }}>
        {[
          ['all', 'Todas'],
          ['duel', '👑 Duelo'],
          ['tactical', '🃏 Cerco Tático'],
          ['classic', '♟ Clássico'],
          ['arena', '🛡️ Arena 4P'],
        ].map(([k, label]) => (
          <button
            key={k}
            type="button"
            className={`rank-tab${filter === k ? ' active' : ''}`}
            onClick={() => setFilter(k)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="panel">
        {filtered.length === 0 ? (
          <div className="muted">Nenhuma partida registrada nesta categoria ainda.</div>
        ) : (
          <div className="friends-list">
            {filtered.map((g) => {
              const col = g.result === 'Vitória' ? 'var(--green)' : g.result === 'Derrota' ? 'var(--red)' : 'var(--gold)';
              const dateStr = g.createdAt ? new Date(g.createdAt).toLocaleDateString('pt-BR') : '';
              return (
                <div key={g.id} className="friend-item">
                  <div className="friend-ident">
                    <div className="avatar-badge" style={{ color: col, fontWeight: 800 }}>
                      {g.result === 'Vitória' ? '✓' : g.result === 'Derrota' ? '×' : '='}
                    </div>
                    <div className="friend-names">
                      <strong>
                        <span style={{ color: col }}>{g.result}</span> · contra {g.opponent}{' '}
                        <span className="muted">({getModeLabel(g)})</span>
                      </strong>
                      <span>
                        {Array.isArray(g.scores) ? `Placar: ${g.scores[0]} × ${g.scores[1]} · ` : ''}
                        Duração: {fmtTime(g.duration || 0)} · {dateStr} {g.reason ? `· ${g.reason}` : ''}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
