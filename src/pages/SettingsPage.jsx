import React from 'react';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useMatchSession } from '../contexts/MatchSessionContext.jsx';
import { useToast } from '../contexts/ToastContext.jsx';

export default function SettingsPage() {
  const { user, prefs, savePreferences } = useAuth();
  const { sendSocket } = useMatchSession();
  const { showToast } = useToast();

  const update = (patch) => {
    savePreferences(patch);
    showToast('Preferência salva.');
  };

  return (
    <div className="page-container">
      <div className="page-head-row">
        <div>
          <span className="eyebrow">Aparência, Áudio & Jogabilidade</span>
          <h1>Configurações</h1>
        </div>
      </div>

      <div className="submode-panels">
        <section className="panel">
          <h3>Aparência & Tema Global</h3>
          <div className="theme-cards-grid" style={{ marginBottom: 16 }}>
            {[
              {
                id: 'blue',
                name: 'Azul Clássico',
                badge: 'Padrão',
                desc: 'Identidade visual azul-ardósia original do Crownflux.io.',
                swatches: ['#12171d', '#1d2630', '#7da3b5', '#cfaf72'],
              },
              {
                id: 'emerald',
                name: 'Verde e Dourado',
                badge: 'Alternativo',
                desc: 'Paleta esmeralda escura com acentos dourados.',
                swatches: ['#141816', '#202723', '#6db38b', '#cfaf72'],
              },
            ].map((t) => {
              const active = (prefs.uiTheme || 'blue') === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  className={`theme-preview-card${active ? ' active' : ''}`}
                  onClick={() => update({ uiTheme: t.id })}
                >
                  <div className="theme-swatches">
                    {t.swatches.map((hex) => (
                      <span key={hex} style={{ background: hex }} />
                    ))}
                  </div>
                  <div className="theme-card-head">
                    <strong>{t.name}</strong>
                    <span className="pill">{t.badge}</span>
                  </div>
                  <small className="muted">{t.desc}</small>
                </button>
              );
            })}
          </div>

          <div className="form-stack">
            <label>
              <span>Tema do Tabuleiro</span>
              <select value={prefs.boardTheme} onChange={(e) => update({ boardTheme: e.target.value })}>
                <option value="imperial">Império Dourado (Padrão)</option>
                <option value="classic">Esmeralda Clássico</option>
                <option value="slate">Ardósia Noturna</option>
                <option value="wood">Madeira Real</option>
              </select>
            </label>
            <label>
              <span>Estilo das Peças</span>
              <select value={prefs.pieceStyle} onChange={(e) => update({ pieceStyle: e.target.value })}>
                <option value="medallion">Medalhão Real</option>
                <option value="heraldic">Heráldico Imperial</option>
                <option value="minimal">Minimalista</option>
              </select>
            </label>
            <label>
              <span>Doutrina Padrão (Duelo 1v1)</span>
              <select value={prefs.doctrine} onChange={(e) => update({ doctrine: e.target.value })}>
                <option value="vanguard">⚔️ Vanguarda · Ofensiva</option>
                <option value="bastion">🛡️ Bastião · Defesa & Controle</option>
                <option value="celerity">🐎 Céleres · Mobilidade & Coroa</option>
              </select>
            </label>
          </div>
        </section>

        <section className="panel">
          <h3>Controles, Animações & Áudio</h3>
          <div className="form-stack">
            {[
              ['showCoords', 'Exibir coordenadas no tabuleiro'],
              ['highlightMoves', 'Destacar movimentos possíveis e último lance'],
              ['autoQueueMove', 'Agendar movimento automático durante a recarga'],
              ['soundEffects', 'Ativar efeitos sonoros (Web Audio)'],
              ['lowTimeSound', 'Alerta sonoro discreto nos últimos 10 segundos do relógio'],
              ['reducedMotion', 'Animações reduzidas'],
              ['confirmResign', 'Confirmar antes de desistir ou sair da partida'],
            ].map(([key, label]) => (
              <label key={key} className="check-row">
                <input
                  type="checkbox"
                  checked={Boolean(prefs[key])}
                  onChange={(e) => update({ [key]: e.target.checked })}
                />
                <span>{label}</span>
              </label>
            ))}
          </div>
        </section>
      </div>

      {user && (
        <section className="panel" style={{ marginTop: 16 }}>
          <h3>Jogadores Bloqueados</h3>
          {!user.blocked?.length ? (
            <p className="muted">Você não bloqueou nenhum jogador.</p>
          ) : (
            <div className="friends-list" style={{ marginTop: 10 }}>
              {user.blocked.map((b) => (
                <div key={b.id} className="friend-item">
                  <span>{b.avatar} @{b.username}</span>
                  <button
                    type="button"
                    className="mini-btn"
                    onClick={() => sendSocket('friend:unblock', { userId: b.id })}
                  >
                    Desbloquear
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
