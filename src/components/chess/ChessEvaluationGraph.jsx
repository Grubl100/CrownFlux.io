import React, { useMemo, useState } from 'react';
import { CLASS_MAP, formatWhiteEvalText } from '../../ai/chessAnalysisEngine.js';

function clampEval(evalEntry) {
  if (!evalEntry) return 0;
  if (evalEntry.terminalWinner === 0) return 800;
  if (evalEntry.terminalWinner === 1) return -800;
  if (evalEntry.terminalDraw) return 0;
  if (evalEntry.mate !== null && evalEntry.mate !== undefined) {
    if (evalEntry.mate === 0) return 0;
    return evalEntry.mate > 0 ? 800 : -800;
  }
  return Math.max(-800, Math.min(800, Number(evalEntry.scoreCp) || 0));
}

function getMarkerColor(cls) {
  if (!cls) return '#8fa6b8';
  return CLASS_MAP[cls]?.color || '#8fa6b8';
}

const LEGEND_CLASSES = [
  { id: 'brilliant', label: 'Brilhante' },
  { id: 'best', label: 'Melhor' },
  { id: 'good', label: 'Bom' },
  { id: 'inaccuracy', label: 'Imprecisão' },
  { id: 'mistake', label: 'Erro' },
  { id: 'blunder', label: 'Erro grave' },
];

export default function ChessEvaluationGraph({
  evaluations = [],
  snapshots = [],
  currentPly = 0,
  onSelectPly,
  whiteName = 'Brancas',
  blackName = 'Pretas',
  viewerSide = 0,
  isLocalTwoPlayer = false,
}) {
  const [hoveredPly, setHoveredPly] = useState(null);

  const W = 580;
  const H = 156;
  const padLeft = 44;
  const padRight = 14;
  const padY = 14;
  const innerW = W - padLeft - padRight;
  const innerH = H - padY * 2;
  const midY = padY + innerH / 2;

  const points = useMemo(() => {
    if (!evaluations.length) return [];
    return evaluations.map((ev, idx) => {
      const x = evaluations.length === 1 ? padLeft : padLeft + (idx / (evaluations.length - 1)) * innerW;
      const cp = clampEval(ev);
      const y = midY - (cp / 800) * (innerH / 2);
      const snap = snapshots[idx];
      const move = snap?.move || null;
      const moverSide = idx === 0 ? null : (ev.moverSide ?? move?.side ?? (idx - 1) % 2);
      const isMyMove = moverSide !== null && (isLocalTwoPlayer ? moverSide === 0 : moverSide === viewerSide);
      return { x, y, idx, ev, move, moverSide, isMyMove };
    });
  }, [evaluations, snapshots, innerW, innerH, midY, viewerSide, isLocalTwoPlayer]);

  if (!evaluations.length) {
    return (
      <div className="eval-graph-empty muted">
        Execute a análise com Stockfish 19 para gerar o gráfico de avaliação lance a lance.
      </div>
    );
  }

  const polyline = points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const areaPath = `M ${points[0].x.toFixed(1)} ${midY} ` +
    points.map((p) => `L ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ') +
    ` L ${points[points.length - 1].x.toFixed(1)} ${midY} Z`;

  const activePoint = points[Math.min(currentPly, points.length - 1)];
  const inspectPly = hoveredPly !== null ? hoveredPly : currentPly;
  const inspected = points[Math.min(inspectPly, points.length - 1)] || null;

  const myLabel = isLocalTwoPlayer
    ? `${whiteName} (Brancas)`
    : `${viewerSide === 0 ? whiteName : blackName} (Você · ${viewerSide === 0 ? 'Brancas' : 'Pretas'})`;
  const oppLabel = isLocalTwoPlayer
    ? `${blackName} (Pretas)`
    : `${viewerSide === 0 ? blackName : whiteName} (${viewerSide === 0 ? 'Pretas' : 'Brancas'})`;

  const inspectedClass = inspected?.ev?.classification ? CLASS_MAP[inspected.ev.classification] : null;
  const inspectedPlayerName = inspected?.moverSide === 0
    ? whiteName
    : inspected?.moverSide === 1
      ? blackName
      : 'Posição inicial';

  return (
    <div className="eval-graph-container">
      <div className="eval-graph-legend-row" aria-label="Legenda de autoria dos lances">
        <span className="eval-legend-author">
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
            <circle cx="6" cy="6" r="4.5" fill="var(--gold)" stroke="#11161c" strokeWidth="1.2" />
          </svg>
          <span>{myLabel}</span>
        </span>
        <span className="eval-legend-author">
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
            <polygon points="6,1 11,6 6,11 1,6" fill="var(--accent-strong)" stroke="#11161c" strokeWidth="1.2" />
          </svg>
          <span>{oppLabel}</span>
        </span>
        <span className="eval-legend-ref muted">Perspectiva fixa: Brancas (+) / Pretas (-)</span>
      </div>

      <div className="eval-graph-wrap">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="eval-graph-svg"
          role="img"
          aria-label="Gráfico de avaliação da partida na perspectiva das Brancas"
          onMouseLeave={() => setHoveredPly(null)}
        >
          {/* Faixas de referência: Brancas (+) acima e Pretas (-) abaixo */}
          <rect x={padLeft} y={padY} width={innerW} height={innerH / 2} fill="rgba(244, 240, 228, 0.07)" />
          <rect x={padLeft} y={midY} width={innerW} height={innerH / 2} fill="rgba(10, 14, 18, 0.30)" />

          {/* Rótulos de eixo (Perspectiva fixa das Brancas) */}
          <text x={padLeft - 6} y={padY + 9} textAnchor="end" className="eval-axis-label">Brancas</text>
          <text x={padLeft - 6} y={midY + 3.5} textAnchor="end" className="eval-axis-label">0.0</text>
          <text x={padLeft - 6} y={H - padY - 2} textAnchor="end" className="eval-axis-label">Pretas</text>

          <line
            x1={padLeft}
            y1={midY}
            x2={W - padRight}
            y2={midY}
            stroke="rgba(255,255,255,0.28)"
            strokeDasharray="4 4"
          />

          <path d={areaPath} fill="rgba(132, 176, 199, 0.22)" />
          <polyline fill="none" stroke="var(--accent-strong, #9cc6db)" strokeWidth="2.1" points={polyline} />

          {/* Linha guia do ponto ativo */}
          {activePoint && (
            <line
              x1={activePoint.x}
              y1={padY}
              x2={activePoint.x}
              y2={H - padY}
              stroke="var(--gold)"
              strokeWidth="1.5"
              strokeDasharray="3 2"
            />
          )}

          {/* Marcadores por lance: Círculo = jogador local, Losango = adversário; Cor = qualidade */}
          {points.map((p) => {
            if (p.idx === 0) return null;
            const color = getMarkerColor(p.ev.classification);
            const isSelected = p.idx === currentPly;
            const isHovered = p.idx === hoveredPly;
            const r = isSelected || isHovered ? 5.2 : 3.8;
            const d = isSelected || isHovered ? 6.2 : 4.6;
            const diamondPoints = `${p.x},${p.y - d} ${p.x + d},${p.y} ${p.x},${p.y + d} ${p.x - d},${p.y}`;

            return (
              <g
                key={p.idx}
                style={{ cursor: 'pointer' }}
                onMouseEnter={() => setHoveredPly(p.idx)}
                onClick={() => {
                  setHoveredPly(p.idx);
                  onSelectPly?.(p.idx);
                }}
              >
                <circle cx={p.x} cy={p.y} r={10} fill="transparent" />
                {p.isMyMove ? (
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={r}
                    fill={color}
                    stroke={isSelected ? '#ffffff' : '#0f1419'}
                    strokeWidth={isSelected ? 1.9 : 1.1}
                  />
                ) : (
                  <polygon
                    points={diamondPoints}
                    fill={color}
                    stroke={isSelected ? '#ffffff' : '#0f1419'}
                    strokeWidth={isSelected ? 1.9 : 1.1}
                  />
                )}
              </g>
            );
          })}
        </svg>
      </div>

      {/* Tooltip persistente / responsivo (funciona no hover no desktop e no toque no celular) */}
      {inspected && inspected.idx > 0 && (
        <div className="eval-tooltip-bar" role="status" aria-live="polite">
          <div className="eval-tooltip-main">
            <span className="eval-tooltip-shape" aria-hidden="true">
              {inspected.isMyMove ? '●' : '◆'}
            </span>
            <strong>
              {Math.ceil(inspected.idx / 2)}
              {inspected.moverSide === 0 ? '.' : '...'} {inspected.move?.san || ''}
            </strong>
            <span className="muted">({inspectedPlayerName})</span>
            {inspectedClass && (
              <span className="class-pill" style={{ background: inspectedClass.color }}>
                {inspectedClass.badge} {inspectedClass.label}
              </span>
            )}
          </div>
          <div className="eval-tooltip-meta">
            <span>
              Avaliação: <strong>{inspected.ev.evalBeforeText || formatWhiteEvalText(evaluations[inspected.idx - 1])}</strong>
              {' -> '}
              <strong>{inspected.ev.evalAfterText || formatWhiteEvalText(inspected.ev)}</strong>
            </span>
            {inspected.ev.bestBeforeSan && inspected.ev.bestBefore !== inspected.move?.uci && (
              <span>
                Melhor: <strong>{inspected.ev.bestBeforeSan}</strong>
              </span>
            )}
          </div>
        </div>
      )}

      <div className="eval-class-legend" aria-label="Cores das classificações">
        {LEGEND_CLASSES.map((item) => (
          <span key={item.id} className="eval-class-chip">
            <i style={{ background: CLASS_MAP[item.id]?.color }} aria-hidden="true" />
            <span>{item.label}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
