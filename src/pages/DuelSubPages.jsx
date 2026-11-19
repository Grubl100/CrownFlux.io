import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import BotDifficultySelector from '../components/BotDifficultySelector.jsx';
import DoctrineSelector from '../components/DoctrineSelector.jsx';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useMatchSession } from '../contexts/MatchSessionContext.jsx';
import { useToast } from '../contexts/ToastContext.jsx';

export function Duel1v1Page() {
  const navigate = useNavigate();
  const { user, prefs, savePreferences } = useAuth();
  const { sendSocket } = useMatchSession();
  const { showToast } = useToast();
  const [doctrine, setDoctrine] = useState(prefs.doctrine || 'vanguard');
  const [roomCode, setRoomCode] = useState('');

  const handleDoctrineChange = (val) => {
    setDoctrine(val);
    savePreferences({ doctrine: val });
  };

  const requireAuth = () => {
    if (!user) {
      showToast('Entre ou crie uma conta para jogar partidas 1v1 online.', 'warn');
      navigate('/profile');
      return false;
    }
    return true;
  };

  return (
    <div className="page-container mode-detail-page">
      <div className="page-crumb-row">
        <button type="button" className="mini-btn" onClick={() => navigate('/modes/duelo')}>
          ← Voltar para Duelo
        </button>
        <button type="button" className="mini-btn" onClick={() => navigate('/ranking')}>
          🏆 Ver Ranking 1v1
        </button>
      </div>

      <header className="mode-page-hero featured-hero">
        <span className="eyebrow">Duelo 1v1 Online · Ranqueado</span>
        <h1>⚔️ Confronto Competitivo 1v1</h1>
        <p className="muted">
          Sua pontuação Elo Crownflux está em disputa na fila pública. Selecione sua Doutrina Estratégica e escolha como encontrar um oponente.
        </p>
      </header>

      <DoctrineSelector value={doctrine} onChange={handleDoctrineChange} />

      {!user && (
        <div className="notice-banner-box">
          <div>
            <strong>Conta necessária para partidas online</strong>
            <p className="muted">Crie uma conta gratuita em segundos para entrar na fila ranqueada, criar salas privadas e salvar seu Elo.</p>
          </div>
          <button type="button" className="primary" onClick={() => navigate('/profile')}>
            Entrar / Cadastrar
          </button>
        </div>
      )}

      <div className="submode-panels">
        <section className="panel">
          <h3>Fila Pública Ranqueada</h3>
          <p className="muted" style={{ marginBottom: 14 }}>
            Pareamento automático contra outro jogador online valendo pontos no Ranking Crownflux 1v1.
          </p>
          <button
            type="button"
            className="primary full-btn"
            onClick={() => {
              if (!requireAuth()) return;
              sendSocket('match:queue', { options: { mode: 'realtime', doctrine } });
            }}
          >
            BUSCAR ADVERSÁRIO RANQUEADO
          </button>
        </section>

        <section className="panel">
          <h3>Sala Privada & Código</h3>
          <p className="muted" style={{ marginBottom: 14 }}>
            Crie uma sala com código para convidar alguém específico ou digite o código recebido.
          </p>
          <div className="stack-actions">
            <button
              type="button"
              className="secondary full-btn"
              onClick={() => {
                if (!requireAuth()) return;
                sendSocket('room:create', { options: { mode: 'realtime', doctrine } });
              }}
            >
              Criar Sala Privada
            </button>
            <div className="code-join-row">
              <input
                type="text"
                maxLength={6}
                placeholder="CÓDIGO"
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
              />
              <button
                type="button"
                className="primary"
                onClick={() => {
                  if (!requireAuth()) return;
                  if (roomCode.length !== 4 && roomCode.length !== 6) {
                    showToast('Digite um código válido de 4 ou 6 caracteres.', 'warn');
                    return;
                  }
                  sendSocket('room:join', { code: roomCode });
                }}
              >
                Entrar
              </button>
            </div>
            <button type="button" className="mini-btn" onClick={() => navigate('/friends')}>
              👥 Desafiar um amigo online
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}

export function DuelCpuPage() {
  const navigate = useNavigate();
  const { prefs, savePreferences } = useAuth();
  const { startOfflineMatch } = useMatchSession();
  const [difficulty, setDifficulty] = useState(3);
  const [doctrine, setDoctrine] = useState(prefs.doctrine || 'vanguard');

  const launchCpu = (lv = difficulty) => {
    savePreferences({ doctrine });
    startOfflineMatch('offline_duel', { mode: 'cpu', cpuDifficulty: lv, doctrine });
  };

  return (
    <div className="page-container mode-detail-page">
      <div className="page-crumb-row">
        <button type="button" className="mini-btn" onClick={() => navigate('/modes/duelo')}>
          ← Voltar para Duelo
        </button>
      </div>

      <header className="mode-page-hero">
        <span className="eyebrow">Duelo 1v1 · Treinamento Offline</span>
        <h1>🤖 Duelo contra Bot (CPU)</h1>
        <p className="muted">Escolha sua doutrina e o nível de inteligência artificial do adversário.</p>
      </header>

      <DoctrineSelector value={doctrine} onChange={setDoctrine} compact />

      <BotDifficultySelector
        value={difficulty}
        onChange={setDifficulty}
        mode="duel"
        onPlayLevel={(lv) => launchCpu(lv)}
      />
    </div>
  );
}

export function Duel4PlayersPage() {
  const navigate = useNavigate();
  const { startOfflineMatch } = useMatchSession();
  const [difficulty, setDifficulty] = useState(3);

  return (
    <div className="page-container mode-detail-page">
      <div className="page-crumb-row">
        <button type="button" className="mini-btn" onClick={() => navigate('/modes/duelo')}>
          ← Voltar para Duelo
        </button>
      </div>

      <header className="mode-page-hero">
        <span className="eyebrow">Modalidade Alternativa · Arena 4 Facções</span>
        <h1>🛡️ Arena para 4 Jogadores</h1>
        <p className="muted">
          Confronto caótico entre 4 exércitos (Azul, Rubi, Ouro e Violeta) preservando integralmente as regras clássicas da Arena com IA multi-adversário.
        </p>
      </header>

      <div className="panel" style={{ maxWidth: 740, marginBottom: 16 }}>
        <h3>Regras preservadas da Arena 4P</h3>
        <ul className="rules-list" style={{ margin: '12px 0 18px' }}>
          <li>Você comanda a facção <strong>Azul</strong> contra 3 facções controladas por IA específica de Arena (Rubi, Ouro e Violeta).</li>
          <li>Capturar o Rei inimigo converte todo o exército derrotado para o vencedor.</li>
          <li>Facções eliminadas reaparecem após 7 segundos caso haja espaço livre.</li>
          <li>Habilidade única <strong>Surto</strong> liberada em 100% de energia (sem as mecânicas exclusivas do 1v1).</li>
        </ul>
        <h4 style={{ marginBottom: 10 }}>Nível de Inteligência das 3 Facções Rivais</h4>
        <BotDifficultySelector value={difficulty} onChange={setDifficulty} mode="arena" compact />
        <div style={{ marginTop: 16 }}>
          <button
            type="button"
            className="primary"
            onClick={() => startOfflineMatch('offline_arena', { mode: 'arena', cpuDifficulty: difficulty })}
          >
            ENTRAR NA ARENA 4 JOGADORES →
          </button>
        </div>
      </div>
    </div>
  );
}

export function DuelLocalPage() {
  const navigate = useNavigate();
  const { prefs } = useAuth();
  const { startOfflineMatch } = useMatchSession();
  const [doctrine, setDoctrine] = useState(prefs.doctrine || 'vanguard');

  return (
    <div className="page-container mode-detail-page">
      <div className="page-crumb-row">
        <button type="button" className="mini-btn" onClick={() => navigate('/modes/duelo')}>
          ← Voltar para Duelo
        </button>
      </div>

      <header className="mode-page-hero">
        <span className="eyebrow">Mesmo Dispositivo · 2 Jogadores</span>
        <h1>👥 Duelo Local 1v1</h1>
        <p className="muted">
          Enfrente um amigo na mesma tela controlando Azul (embaixo) e Rubi (no topo) com todas as regras da Coroa Imperial.
        </p>
      </header>

      <DoctrineSelector value={doctrine} onChange={setDoctrine} compact />

      <div className="panel" style={{ marginTop: 16, maxWidth: 520 }}>
        <p className="muted" style={{ marginBottom: 14 }}>
          Ambos os jogadores podem mover qualquer peça da própria cor quando estiver fora de recarga. A Coroa desperta após 12 segundos.
        </p>
        <button
          type="button"
          className="primary"
          onClick={() => startOfflineMatch('offline_duel', { mode: 'duel', doctrine })}
        >
          COMEÇAR DUELO LOCAL →
        </button>
      </div>
    </div>
  );
}

export function DuelTutorialPage() {
  const navigate = useNavigate();
  const { startOfflineMatch } = useMatchSession();

  return (
    <div className="page-container mode-detail-page">
      <div className="page-crumb-row">
        <button type="button" className="mini-btn" onClick={() => navigate('/modes/duelo')}>
          ← Voltar para Duelo
        </button>
      </div>

      <header className="mode-page-hero">
        <span className="eyebrow">Aprendizado Prático · 8 Etapas</span>
        <h1>🎓 Tutorial do Duelo Crownflux</h1>
        <p className="muted">
          Domine cada detalhe do modo principal enfrentando o Mentor Rubi em ritmo guiado.
        </p>
      </header>

      <div className="panel" style={{ maxWidth: 680 }}>
        <h3>O que você vai praticar:</h3>
        <ul className="rules-list" style={{ margin: '12px 0 18px' }}>
          <li>Seleção e movimentação de peças com recarga individual.</li>
          <li>Capturas estratégicas, ganho de XP e reforços automáticos ao redor do Rei.</li>
          <li>Disputa pela <strong>Coroa Imperial (👑)</strong> e controle das <strong>3 Regiões Estratégicas</strong>.</li>
          <li>Uso das 3 Habilidades de Fluxo (<strong>Investida</strong>, <strong>Égide Real</strong> e <strong>Surto Imperial</strong>).</li>
        </ul>
        <button
          type="button"
          className="primary"
          onClick={() => startOfflineMatch('offline_tutorial', { mode: 'tutorial' })}
        >
          INICIAR TUTORIAL INTERATIVO →
        </button>
      </div>
    </div>
  );
}
