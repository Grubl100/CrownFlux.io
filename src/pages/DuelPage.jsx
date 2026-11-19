import React from 'react';
import { useNavigate } from 'react-router-dom';

export default function DuelPage() {
  const navigate = useNavigate();

  return (
    <div className="page-container mode-detail-page">
      <div className="page-crumb-row">
        <button type="button" className="mini-btn" onClick={() => navigate('/modes')}>
          ← Voltar à Central de Modos
        </button>
        <button type="button" className="mini-btn" onClick={() => navigate('/how-to-play?tab=duel')}>
          📖 Regras do Duelo
        </button>
      </div>

      <header className="mode-page-hero featured-hero">
        <span className="eyebrow">Modalidade Principal · 16×16 em Tempo Real</span>
        <h1>👑 Duelo Crownflux</h1>
        <p className="muted">
          Escolha como deseja entrar na arena. O <strong>Duelo 1v1</strong> é o modo competitivo prioritário — vença capturando o Rei adversário ou alcançando 100% de Domínio com a Coroa Imperial.
        </p>
      </header>

      <section className="mode-options-grid">
        <article
          className="option-card priority"
          onClick={() => navigate('/modes/duelo/1v1')}
          role="button"
          tabIndex={0}
        >
          <div className="option-card-head">
            <span className="option-icon">⚔️</span>
            <span className="cf-mode-badge gold">MODO COMPETITIVO PRINCIPAL</span>
          </div>
          <h2>1v1 Online</h2>
          <p className="muted">
            Enfrente outros jogadores na fila pública ranqueada, crie uma sala privada com código ou desafie amigos com Doutrinas e Habilidades de Fluxo.
          </p>
          <div className="option-card-foot">
            <span className="cf-mode-cta">Configurar 1v1 Online →</span>
          </div>
        </article>

        <article
          className="option-card"
          onClick={() => navigate('/modes/duelo/cpu')}
          role="button"
          tabIndex={0}
        >
          <div className="option-card-head">
            <span className="option-icon">🤖</span>
            <span className="cf-mode-badge">5 NÍVEIS DE IA</span>
          </div>
          <h2>Contra Bot (CPU)</h2>
          <p className="muted">
            Treine estratégias contra inteligência artificial do nível Iniciante ao Especialista, disputando a Coroa Imperial e Regiões Estratégicas.
          </p>
          <div className="option-card-foot">
            <span className="cf-mode-cta">Escolher dificuldade →</span>
          </div>
        </article>

        <article
          className="option-card"
          onClick={() => navigate('/modes/duelo/4-players')}
          role="button"
          tabIndex={0}
        >
          <div className="option-card-head">
            <span className="option-icon">🛡️</span>
            <span className="cf-mode-badge">MODO ALTERNATIVO</span>
          </div>
          <h2>4 Jogadores (Arena)</h2>
          <p className="muted">
            Batalha clássica com quatro facções simultâneas (Azul, Rubi, Ouro e Violeta), preservando a conversão de exércitos ao capturar um Rei.
          </p>
          <div className="option-card-foot">
            <span className="cf-mode-cta">Preparar Arena 4P →</span>
          </div>
        </article>

        <article
          className="option-card"
          onClick={() => navigate('/modes/duelo/local')}
          role="button"
          tabIndex={0}
        >
          <div className="option-card-head">
            <span className="option-icon">👥</span>
            <span className="cf-mode-badge">MESMO DISPOSITIVO</span>
          </div>
          <h2>Duelo Local 1v1</h2>
          <p className="muted">
            Jogue com outra pessoa no mesmo computador ou tela, com todas as mecânicas da Coroa Imperial e controle territorial.
          </p>
          <div className="option-card-foot">
            <span className="cf-mode-cta">Configurar Duelo Local →</span>
          </div>
        </article>

        <article
          className="option-card"
          onClick={() => navigate('/modes/duelo/tutorial')}
          role="button"
          tabIndex={0}
        >
          <div className="option-card-head">
            <span className="option-icon">🎓</span>
            <span className="cf-mode-badge">8 ETAPAS GUIADAS</span>
          </div>
          <h2>Tutorial Interativo</h2>
          <p className="muted">
            Aprenda passo a passo movimentação, recarga individual, capturas, Coroa Imperial e habilidades de Fluxo contra o Mentor Rubi.
          </p>
          <div className="option-card-foot">
            <span className="cf-mode-cta">Iniciar Tutorial →</span>
          </div>
        </article>
      </section>
    </div>
  );
}
