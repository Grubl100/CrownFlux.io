import React from 'react';
import { useNavigate } from 'react-router-dom';
import ModeCard from '../components/ModeCard.jsx';
import { useAuth } from '../contexts/AuthContext.jsx';

export default function ModesPage() {
  const navigate = useNavigate();
  const { user } = useAuth();

  return (
    <div className="page-container modes-hub-page">
      <section className="hub-hero">
        <div className="hub-hero-copy">
          <span className="eyebrow">Central de Modos · Crownflux.io</span>
          <h1>Escolha sua arena de estratégia</h1>
          <p className="muted">
            Domine o tabuleiro pela posse da Coroa Imperial, execute cercos com cartas táticas ou prove sua técnica no Xadrez Clássico.
          </p>
        </div>

        <div className="hub-hero-aside">
          {user ? (
            <div className="hub-player-summary">
              <div className="avatar-badge">{user.avatar || '♟'}</div>
              <div>
                <strong>{user.displayName || user.username}</strong>
                <span>
                  {user.stats?.crownfluxDivisionIcon || '🛡️'} {user.stats?.crownfluxDivision || 'Prata'} ·{' '}
                  <b>{user.stats?.crownfluxRating || 1200} Elo</b>
                </span>
              </div>
              <button type="button" className="mini-btn" onClick={() => navigate('/how-to-play')}>
                📖 Instruções
              </button>
            </div>
          ) : (
            <div className="hub-player-summary">
              <div className="avatar-badge">♛</div>
              <div>
                <strong>Modo Visitante</strong>
                <span>Entre para jogar online e subir no ranking</span>
              </div>
              <button type="button" className="mini-btn accent" onClick={() => navigate('/profile')}>
                Entrar / Criar conta
              </button>
            </div>
          )}
        </div>
      </section>

      <section className="modes-grid" aria-label="Modalidades principais">
        <ModeCard
          featured
          badge="EXPERIÊNCIA PRINCIPAL"
          icon="👑"
          subtitle="ESTRATÉGIA EM TEMPO REAL · 16×16"
          title="Duelo"
          description="A disputa central do Crownflux.io. Controle o Trono Imperial para acumular Domínio da Coroa ou dê o bote no Rei adversário, administrando Energia de Fluxo, regiões estratégicas e doutrinas de combate."
          meta={['1v1 Online Ranqueado', 'Contra Bot (5 Níveis)', '4 Jogadores (Arena)', 'Tutorial Interativo']}
          ctaLabel="Abrir página do Duelo →"
          onClick={() => navigate('/modes/duelo')}
        />

        <div className="modes-secondary-col">
          <ModeCard
            badge="CARTAS & NEBLINA"
            icon="🃏"
            subtitle="TÁTICA POR TURNOS · 12×12"
            title="Cerco Tático"
            description="Partidas táticas por turnos com névoa de guerra, pontos de ação (PA), barreiras de fluxo e draft de cartas a cada 3 rodadas."
            meta={['Online & Fila Rápida', 'Contra CrownBot', 'Tutorial 3 Etapas']}
            ctaLabel="Explorar Cerco Tático →"
            onClick={() => navigate('/modes/tactical')}
          />

          <ModeCard
            badge="TRADICIONAL"
            icon="♟"
            subtitle="XADREZ OFICIAL · 8×8"
            title="Clássico"
            description="Xadrez tradicional puro com relógio por categoria (Bullet, Blitz, Rapid e Clássico), roque, en passant e rating Elo dedicado."
            meta={['Online Ranqueado', 'Contra Bot (5 Níveis)', 'Duelo Local 8×8']}
            ctaLabel="Explorar Clássico →"
            onClick={() => navigate('/modes/classic')}
          />
        </div>
      </section>

      <section className="hub-quick-strip">
        <div className="quick-info-card">
          <strong>🏆 Ranking Competitivo Separado</strong>
          <span className="muted">Classificações independentes para Duelo 1v1, Xadrez Clássico e Cerco Tático.</span>
          <button type="button" className="mini-btn" onClick={() => navigate('/ranking')}>
            Ver Ranking
          </button>
        </div>
        <div className="quick-info-card">
          <strong>📖 Central de Instruções</strong>
          <span className="muted">Aprenda as regras de cada modalidade e teste as peças nos simuladores.</span>
          <button type="button" className="mini-btn" onClick={() => navigate('/how-to-play')}>
            Como Jogar
          </button>
        </div>
      </section>
    </div>
  );
}
