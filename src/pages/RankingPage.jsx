import React, { useEffect, useState } from 'react';
import { apiRequest } from '../api/client.js';
import RankingTable from '../components/RankingTable.jsx';
import { useAuth } from '../contexts/AuthContext.jsx';

export default function RankingPage() {
  const { user } = useAuth();
  const [mode, setMode] = useState('duel');
  const [classicCategory, setClassicCategory] = useState('blitz');
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    const qs = mode === 'classic' ? `mode=classic&category=${classicCategory}` : `mode=${mode}`;
    apiRequest(`/api/ranking?${qs}`)
      .then((data) => {
        if (active) setEntries(data.entries || []);
      })
      .catch(() => {
        if (active) setEntries([]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [mode, classicCategory]);

  return (
    <div className="page-container">
      <div className="page-head-row">
        <div>
          <span className="eyebrow">Classificação Competitiva</span>
          <h1>Ranking Oficial</h1>
          <p className="muted">
            Classificações mantidas separadamente por modalidade. O <strong>Duelo 1v1</strong> é o ranking principal do Crownflux.io.
          </p>
        </div>
      </div>

      <div className="ranking-tabs-row">
        <button
          type="button"
          className={`rank-tab${mode === 'duel' ? ' active' : ''}`}
          onClick={() => setMode('duel')}
        >
          👑 Duelo 1v1 (Principal)
        </button>
        <button
          type="button"
          className={`rank-tab${mode === 'classic' ? ' active' : ''}`}
          onClick={() => setMode('classic')}
        >
          ♟ Xadrez Clássico
        </button>
        <button
          type="button"
          className={`rank-tab${mode === 'tactical' ? ' active' : ''}`}
          onClick={() => setMode('tactical')}
        >
          🃏 Cerco Tático
        </button>

        {mode === 'classic' && (
          <select
            className="rank-cat-select"
            value={classicCategory}
            onChange={(e) => setClassicCategory(e.target.value)}
            aria-label="Categoria de tempo do Xadrez Clássico"
          >
            <option value="bullet">Bullet</option>
            <option value="blitz">Blitz</option>
            <option value="rapid">Rapid</option>
            <option value="classic">Clássico</option>
          </select>
        )}
      </div>

      <RankingTable
        entries={entries}
        mode={mode}
        currentUsername={user?.username}
        loading={loading}
      />
    </div>
  );
}
