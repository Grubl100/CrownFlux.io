import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { getThemeColors } from '../game/duelRenderer.js';
import {
  BesiegerSvg,
  CARD_TYPE,
  CardArtSvg,
  CrownSvg,
  RULE_HINT,
  WallSvg,
  WardenSvg,
  cardChips,
  cellName,
  targetsFor,
} from '../game/tacticalData.jsx';
import { useAuth } from '../contexts/AuthContext.jsx';
import { DIAG, GLYPH, KN, ORTH, TACTICAL_CARDS_FALLBACK } from '../utils/constants.js';

const DEMO_SPECS = {
  P: { val: '1 ponto / XP', cd: '0.9s', range: '1 casa frontal', rule: 'Peão (♟): avança 1 casa à frente e captura na diagonal frontal. Ao alcançar a última linha, vira Rainha (♛).' },
  N: { val: '3 pontos / XP', cd: '1.4s', range: 'Salto em L (2×1)', rule: 'Cavalo (♞): salta em formato de "L" e ignora peças no caminho.' },
  B: { val: '3 pontos / XP', cd: '1.6s', range: 'Diagonais livres', rule: 'Bispo (♝): desliza pelas diagonais livres quantas casas quiser.' },
  R: { val: '5 pontos / XP', cd: '1.8s', range: 'Linhas retas livres', rule: 'Torre (♜): desliza na horizontal ou vertical por casas livres.' },
  Q: { val: '9 pontos / XP', cd: '2.2s', range: 'Retas e diagonais', rule: 'Rainha (♛): combina Torre e Bispo. Peça mais forte, porém com recarga de 2.2s.' },
  K: { val: 'Vitória por Regicídio', cd: '1.1s', range: '1 casa ao redor', rule: 'Rei (♚): move 1 casa em qualquer direção. Se capturado no 1v1, a partida termina!' },
};

export default function HowToPlayPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { prefs } = useAuth();
  const initialTab = ['duel', 'tactical', 'classic'].includes(searchParams.get('tab'))
    ? searchParams.get('tab')
    : 'duel';
  const [tab, setTab] = useState(initialTab);

  // Duel 7x7 piece demo
  const [demoState, setDemoState] = useState({ type: 'P', x: 3, y: 4, enemyX: 4, enemyY: 3 });
  const demoCanvasRef = useRef(null);

  // Tactical 7x7 card demo
  const [tacDemo, setTacDemo] = useState({
    n: 7,
    me: { x: 1, y: 5 },
    crown: { x: 4, y: 2, holder: null },
    walls: new Set(),
    action: 'move',
    ap: 3,
    vp: 0,
    msg: 'Clique numa casa marcada para testar a ação.',
  });

  useEffect(() => {
    const qTab = searchParams.get('tab');
    if (['duel', 'tactical', 'classic'].includes(qTab)) setTab(qTab);
  }, [searchParams]);

  const computeDemoMoves = (st) => {
    const N_DEMO = 7;
    const { type, x, y, enemyX, enemyY } = st;
    const res = [];
    const ok = (a, b) => a >= 0 && b >= 0 && a < N_DEMO && b < N_DEMO;
    const isEnemy = (a, b) => a === enemyX && b === enemyY;
    const addSq = (a, b) => {
      if (!ok(a, b)) return false;
      res.push([a, b]);
      return !isEnemy(a, b);
    };
    if (type === 'R' || type === 'Q') for (const [dx, dy] of ORTH) { let a = x + dx, b = y + dy; while (addSq(a, b)) { a += dx; b += dy; } }
    if (type === 'B' || type === 'Q') for (const [dx, dy] of DIAG) { let a = x + dx, b = y + dy; while (addSq(a, b)) { a += dx; b += dy; } }
    if (type === 'N') for (const [dx, dy] of KN) addSq(x + dx, y + dy);
    if (type === 'K') for (const [dx, dy] of ORTH.concat(DIAG)) addSq(x + dx, y + dy);
    if (type === 'P') {
      if (ok(x, y - 1) && !isEnemy(x, y - 1)) res.push([x, y - 1]);
      for (const s of [-1, 1]) if (ok(x + s, y - 1) && isEnemy(x + s, y - 1)) res.push([x + s, y - 1]);
    }
    return res;
  };

  useEffect(() => {
    if (tab !== 'duel') return;
    const cv = demoCanvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    const c = 36;
    const theme = getThemeColors(prefs.boardTheme);
    ctx.clearRect(0, 0, cv.width, cv.height);
    for (let y = 0; y < 7; y++) {
      for (let x = 0; x < 7; x++) {
        ctx.fillStyle = (x + y) % 2 ? theme.dark : theme.light;
        ctx.fillRect(x * c, y * c, c, c);
      }
    }
    for (const [mx, my] of computeDemoMoves(demoState)) {
      const cx = mx * c + c / 2;
      const cy = my * c + c / 2;
      ctx.beginPath();
      if (mx === demoState.enemyX && my === demoState.enemyY) {
        ctx.strokeStyle = '#c96b6b';
        ctx.lineWidth = 2.5;
        ctx.arc(cx, cy, c * 0.39, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.fillStyle = 'rgba(28, 42, 32, 0.5)';
        ctx.arc(cx, cy, c * 0.16, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '26px "Segoe UI Symbol","Noto Sans Symbols 2",serif';
    const ex = demoState.enemyX * c + c / 2;
    const ey = demoState.enemyY * c + c / 2;
    ctx.fillStyle = '#bd7778';
    ctx.strokeStyle = '#222';
    ctx.lineWidth = 2;
    ctx.strokeText('♟', ex, ey + 1);
    ctx.fillText('♟', ex, ey + 1);

    const px = demoState.x * c + c / 2;
    const py = demoState.y * c + c / 2;
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    ctx.fillRect(demoState.x * c, demoState.y * c, c, c);
    ctx.fillStyle = '#6f9daf';
    ctx.strokeText(GLYPH[demoState.type], px, py + 1);
    ctx.fillText(GLYPH[demoState.type], px, py + 1);
  }, [tab, demoState, prefs.boardTheme]);

  const handleDemoClick = (e) => {
    const cv = demoCanvasRef.current;
    if (!cv) return;
    const r = cv.getBoundingClientRect();
    const gx = Math.floor((e.clientX - r.left) / 36);
    const gy = Math.floor((e.clientY - r.top) / 36);
    if (computeDemoMoves(demoState).some(([a, b]) => a === gx && b === gy)) {
      setDemoState((prev) => ({
        ...prev,
        type: prev.type === 'P' && gy === 0 ? 'Q' : prev.type,
        x: gx,
        y: gy,
        enemyX: gx === prev.enemyX && gy === prev.enemyY ? (gx + 2) % 7 : prev.enemyX,
        enemyY: gx === prev.enemyX && gy === prev.enemyY ? ((gy + 2) % 5) + 1 : prev.enemyY,
      }));
    }
  };

  const tacCost = tacDemo.action === 'move' ? 1 : TACTICAL_CARDS_FALLBACK.find((c) => c.id === tacDemo.action)?.cost ?? 1;
  const tacTargets =
    tacDemo.ap >= tacCost && tacDemo.action !== 'flux_siphon'
      ? new Set(targetsFor(tacDemo.action, { n: 7, me: tacDemo.me, others: [], walls: tacDemo.walls, crown: tacDemo.crown }).map(([x, y]) => `${x},${y}`))
      : new Set();

  return (
    <div className="page-container">
      <div className="page-crumb-row">
        <button type="button" className="mini-btn" onClick={() => navigate('/modes')}>
          ← Voltar à Central de Modos
        </button>
      </div>

      <header className="mode-page-hero">
        <span className="eyebrow">Central de Instruções</span>
        <h1>📖 Como Jogar Crownflux.io</h1>
        <p className="muted">Cada modalidade possui regras e sistemas próprios. Selecione uma aba abaixo para estudar e praticar.</p>
      </header>

      <div className="ranking-tabs-row" style={{ marginBottom: 18 }}>
        {[
          ['duel', '👑 Duelo 1v1 & Arena'],
          ['tactical', '🃏 Cerco Tático'],
          ['classic', '♟ Xadrez Clássico'],
        ].map(([k, label]) => (
          <button
            key={k}
            type="button"
            className={`rank-tab${tab === k ? ' active' : ''}`}
            onClick={() => {
              setTab(k);
              setSearchParams({ tab: k });
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'duel' && (
        <div className="guide-stack">
          <div className="submode-panels">
            <section className="panel">
              <h3>👑 A Coroa Imperial & Dupla Vitória</h3>
              <ul className="rules-list" style={{ marginTop: 10 }}>
                <li><strong>Regicídio (⚔️):</strong> capture o Rei adversário (♚) para vencer na hora.</li>
                <li><strong>Soberania Imperial (👑):</strong> a Coroa desperta no Trono Central (8,9) após 12s.</li>
                <li><strong>Domínio:</strong> manter a Coroa acumula progresso até 100% (+3,5%/s no Trono, +2,5%/s em campo aberto, apenas +0,6%/s recuado na base).</li>
                <li><strong>Contra-ataque:</strong> abater o portador inimigo derruba a Coroa (bloqueio de 3,5s para quem perdeu), reduz -12% do domínio rival e dá +4 XP e +28% Fluxo.</li>
              </ul>
            </section>

            <section className="panel">
              <h3>🏰 Regiões & Habilidades de Fluxo</h3>
              <ul className="rules-list" style={{ marginTop: 10 }}>
                <li><strong>⚡ Santuário de Fluxo:</strong> gera +3% Fluxo/s sob controle incontestado.</li>
                <li><strong>🏰 Fortaleza Real:</strong> concede 1 Escudo Real ao seu Rei a cada 14s de controle.</li>
                <li><strong>[1] Investida (45%):</strong> zera a recarga da peça selecionada.</li>
                <li><strong>[2] Égide Real (60%):</strong> aplica 1 Escudo Real que bloqueia uma captura.</li>
                <li><strong>[3 / Espaço] Surto Imperial (100%):</strong> acelera todo o exército por 6s.</li>
              </ul>
            </section>
          </div>

          <section className="panel">
            <h3>Simulador Interativo de Peças (7×7)</h3>
            <div className="piece-picker-row">
              {['P', 'N', 'B', 'R', 'Q', 'K'].map((t) => (
                <button
                  key={t}
                  type="button"
                  className={`mini-btn${demoState.type === t ? ' accent' : ''}`}
                  onClick={() => setDemoState({ type: t, x: 3, y: 4, enemyX: 4, enemyY: t === 'N' ? 2 : 3 })}
                >
                  {GLYPH[t]} {t === 'P' ? 'Peão' : t === 'N' ? 'Cavalo' : t === 'B' ? 'Bispo' : t === 'R' ? 'Torre' : t === 'Q' ? 'Rainha' : 'Rei'}
                </button>
              ))}
            </div>
            <div className="demo-sim-grid">
              <canvas
                ref={demoCanvasRef}
                width={252}
                height={252}
                onPointerDown={handleDemoClick}
                style={{ borderRadius: 8, cursor: 'pointer', border: '1px solid var(--border)' }}
              />
              <div>
                <p style={{ marginBottom: 10 }}>{DEMO_SPECS[demoState.type].rule}</p>
                <div className="stats-grid">
                  <div className="stat-box"><span>Valor</span><strong>{DEMO_SPECS[demoState.type].val}</strong></div>
                  <div className="stat-box"><span>Recarga</span><strong>{DEMO_SPECS[demoState.type].cd}</strong></div>
                  <div className="stat-box"><span>Alcance</span><strong>{DEMO_SPECS[demoState.type].range}</strong></div>
                </div>
                <button type="button" className="primary" style={{ marginTop: 14 }} onClick={() => navigate('/modes/duelo/tutorial')}>
                  Praticar no Tutorial 1v1 →
                </button>
              </div>
            </div>
          </section>
        </div>
      )}

      {tab === 'tactical' && (
        <div className="guide-stack">
          <section className="panel">
            <div className="tactical-chars-row">
              <div className="tchar-box"><WardenSvg /><div><strong>Guardião Azul</strong><small className="muted">Defende o flanco oeste com escudo real</small></div></div>
              <div className="tchar-box"><BesiegerSvg /><div><strong>Sitiante Rubi</strong><small className="muted">Avança com alabarda e estandarte</small></div></div>
            </div>
            <ul className="rules-list" style={{ marginTop: 12 }}>
              <li>Tabuleiro 12×12 por turnos com limite de 15s por turno e Névoa de Guerra (visão de 4 casas).</li>
              <li>Você começa com 3 PA por turno. Mover 1 casa ou atacar inimigo adjacente custa 1 PA.</li>
              <li>Capture a Coroa e encerre 3 turnos segurando-a para vencer. Quem segura a Coroa perde 1 PA base e fica sempre visível.</li>
              <li>A cada 3 rodadas acontece um Draft de 8s para escolher 1 de 3 cartas.</li>
            </ul>
          </section>

          <section className="panel">
            <h3>Simulador de Cartas e Movimento (7×7)</h3>
            <div className="piece-picker-row">
              <button type="button" className={`mini-btn${tacDemo.action === 'move' ? ' accent' : ''}`} onClick={() => setTacDemo((p) => ({ ...p, action: 'move', msg: RULE_HINT.move }))}>Andar (1 PA)</button>
              {TACTICAL_CARDS_FALLBACK.filter((c) => c.targetType === 'cell').map((c) => (
                <button key={c.id} type="button" className={`mini-btn${tacDemo.action === c.id ? ' accent' : ''}`} onClick={() => setTacDemo((p) => ({ ...p, action: c.id, msg: RULE_HINT[c.id] || c.desc }))}>
                  {c.name} ({c.cost} PA)
                </button>
              ))}
              <button type="button" className="mini-btn" onClick={() => setTacDemo((p) => ({ ...p, ap: p.crown.holder === 0 ? 2 : 3, msg: 'Novo turno iniciado!' }))}>
                Novo Turno
              </button>
            </div>
            <div className="demo-sim-grid">
              <div className="ts-board mini" style={{ '--n': 7 }}>
                {Array.from({ length: 49 }, (_, idx) => {
                  const x = idx % 7;
                  const y = Math.floor(idx / 7);
                  const key = `${x},${y}`;
                  const valid = tacTargets.has(key);
                  return (
                    <button
                      key={key}
                      type="button"
                      className={`ts-cell ${(x + y) % 2 ? 'd' : 'l'}${valid ? (tacDemo.action === 'move' ? ' move' : ' target') : ''}`}
                      onClick={() => {
                        if (!valid) return;
                        setTacDemo((prev) => {
                          const nextWalls = new Set(prev.walls);
                          let nextMe = prev.me;
                          let nextCrown = { ...prev.crown };
                          let msg = `Ação executada em ${cellName(x, y)}.`;
                          if (prev.action === 'flux_wall') {
                            nextWalls.add(key);
                          } else {
                            nextMe = { x, y };
                            if (nextCrown.holder === null && nextCrown.x === x && nextCrown.y === y) {
                              nextCrown.holder = 0;
                              msg = 'Coroa capturada!';
                            }
                          }
                          return { ...prev, ap: prev.ap - tacCost, me: nextMe, crown: nextCrown, walls: nextWalls, msg };
                        });
                      }}
                    >
                      {tacDemo.walls.has(key) && <WallSvg />}
                    </button>
                  );
                })}
                <div className="ts-layer">
                  {tacDemo.crown.holder === null && (
                    <div className="ts-crown-free" style={{ transform: `translate(${tacDemo.crown.x * 100}%, ${tacDemo.crown.y * 100}%)` }}><CrownSvg /></div>
                  )}
                  <div className="ts-token me" style={{ transform: `translate(${tacDemo.me.x * 100}%, ${tacDemo.me.y * 100}%)` }}>
                    <WardenSvg />
                  </div>
                </div>
              </div>
              <div>
                <p><strong>PA: {tacDemo.ap}</strong> · {tacDemo.crown.holder === 0 ? 'Com a Coroa 👑' : 'Sem a Coroa'}</p>
                <p className="muted" style={{ marginTop: 8 }}>{tacDemo.msg}</p>
                <div className="cards-catalog-grid" style={{ marginTop: 14 }}>
                  {TACTICAL_CARDS_FALLBACK.map((c) => (
                    <div key={c.id} className="ts-card static">
                      <div className="ts-card-top">
                        <span className="ts-cost">{c.cost}</span>
                        <div><div className="ts-card-name">{c.name}</div><div className="ts-card-type">{CARD_TYPE[c.id]}</div></div>
                      </div>
                      <div className="ts-card-art"><CardArtSvg id={c.id} /></div>
                      <div className="ts-card-meta">{cardChips(c).slice(1).map((ch) => <span key={ch} className="ts-chip">{ch}</span>)}</div>
                      <div className="ts-card-desc">{c.desc}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>
        </div>
      )}

      {tab === 'classic' && (
        <section className="panel">
          <h3>♟ Regras Oficiais do Xadrez Clássico (8×8)</h3>
          <ul className="rules-list" style={{ marginTop: 12 }}>
            <li><strong>Turnos alternados:</strong> Brancas (embaixo) iniciam a partida; apenas lances legais que não deixam o Rei em xeque são permitidos.</li>
            <li><strong>Movimentos especiais:</strong> suporta Roque pequeno e grande, captura En Passant e promoção automática do Peão à Rainha ao alcançar a oitava fileira.</li>
            <li><strong>Condições de fim de jogo:</strong> Xeque-mate, Afogamento (empate), Material Insuficiente, Regra dos 50 lances e Repetição Tripla.</li>
            <li><strong>Relógio e Rating:</strong> tempos Bullet, Blitz, Rapid e Clássico possuem rating Elo independente na fila pública ranqueada.</li>
          </ul>
          <button type="button" className="primary" style={{ marginTop: 16 }} onClick={() => navigate('/modes/classic')}>
            Ir para Xadrez Clássico →
          </button>
        </section>
      )}
    </div>
  );
}
