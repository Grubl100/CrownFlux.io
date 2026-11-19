import React from 'react';

function clampEval(evalEntry) {
  if (!evalEntry) return 0;
  if (evalEntry.mate !== null && evalEntry.mate !== undefined) {
    return evalEntry.mate > 0 ? 800 : -800;
  }
  return Math.max(-800, Math.min(800, Number(evalEntry.scoreCp) || 0));
}

export default function ChessEvaluationGraph({ evaluations = [], currentPly = 0, onSelectPly }) {
  if (!evaluations.length) {
    return (
      <div className="eval-graph-empty muted">
        Execute a análise com Stockfish para gerar o gráfico de avaliação lance a lance.
      </div>
    );
  }

  const W = 560;
  const H = 136;
  const padX = 10;
  const padY = 10;
  const innerW = W - padX * 2;
  const innerH = H - padY * 2;
  const midY = padY + innerH / 2;

  const points = evaluations.map((ev, idx) => {
    const x = evaluations.length === 1 ? padX : padX + (idx / (evaluations.length - 1)) * innerW;
    const cp = clampEval(ev);
    const y = midY - (cp / 800) * (innerH / 2);
    return { x, y, idx, ev };
  });

  const polyline = points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const areaPath = `M ${points[0].x.toFixed(1)} ${midY} ` +
    points.map((p) => `L ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ') +
    ` L ${points[points.length - 1].x.toFixed(1)} ${midY} Z`;

  const activePoint = points[Math.min(currentPly, points.length - 1)];

  return (
    <div className="eval-graph-wrap">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="eval-graph-svg"
        role="img"
        aria-label="Gráfico de avaliação da partida"
      >
        <rect x={0} y={0} width={W} height={midY} fill="rgba(244, 240, 228, 0.06)" />
        <rect x={0} y={midY} width={W} height={H - midY} fill="rgba(10, 14, 18, 0.28)" />
        <line x1={padX} y1={midY} x2={W - padX} y2={midY} stroke="rgba(255,255,255,0.22)" strokeDasharray="4 4" />
        <path d={areaPath} fill="rgba(125, 163, 181, 0.26)" />
        <polyline fill="none" stroke="var(--accent-strong, #93b8c9)" strokeWidth="2.2" points={polyline} />

        {points.map((p) => {
          const cls = p.ev.classification;
          const dotColor =
            cls === 'blunder'
              ? '#e05a5a'
              : cls === 'mistake'
                ? '#e39648'
                : cls === 'inaccuracy'
                  ? '#e6ca5c'
                  : cls === 'best'
                    ? '#6db38b'
                    : null;
          return (
            <g
              key={p.idx}
              style={{ cursor: 'pointer' }}
              onClick={() => onSelectPly?.(p.idx)}
            >
              <circle cx={p.x} cy={p.y} r={8} fill="transparent" />
              {dotColor && <circle cx={p.x} cy={p.y} r={3.6} fill={dotColor} stroke="#0f1419" strokeWidth="1" />}
            </g>
          );
        })}

        {activePoint && (
          <g>
            <line x1={activePoint.x} y1={padY} x2={activePoint.x} y2={H - padY} stroke="var(--gold)" strokeWidth="1.5" />
            <circle cx={activePoint.x} cy={activePoint.y} r={5} fill="var(--gold)" stroke="#11161c" strokeWidth="1.8" />
          </g>
        )}
      </svg>
    </div>
  );
}
