import { GLYPH } from '../utils/constants.js';
import { getThemeColors } from './duelRenderer.js';
import { classicIsAttacked, getClassicMoves } from './classicEngine.js';

const FILES = 'abcdefgh';

export function boardToView(x, y, flipped = false) {
  return flipped ? [7 - x, 7 - y] : [x, y];
}

export function viewToBoard(vx, vy, flipped = false) {
  return flipped ? [7 - vx, 7 - vy] : [vx, vy];
}

function drawArrow(ctx, x0, y0, x1, y1, cell, flipped, color = 'rgba(235, 179, 68, 0.84)', dashed = false) {
  const [vx0, vy0] = boardToView(x0, y0, flipped);
  const [vx1, vy1] = boardToView(x1, y1, flipped);
  const sx = vx0 * cell + cell / 2;
  const sy = vy0 * cell + cell / 2;
  const ex = vx1 * cell + cell / 2;
  const ey = vy1 * cell + cell / 2;
  const dx = ex - sx;
  const dy = ey - sy;
  const len = Math.hypot(dx, dy);
  if (len < 4) return;

  const ux = dx / len;
  const uy = dy / len;
  const headLen = Math.max(12, cell * 0.34);
  const headWidth = Math.max(10, cell * 0.28);
  const startOffset = cell * 0.18;
  const lineEndX = ex - ux * (headLen * 0.78);
  const lineEndY = ey - uy * (headLen * 0.78);

  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = Math.max(4, cell * 0.13);
  ctx.lineCap = 'round';
  if (dashed) ctx.setLineDash([cell * 0.14, cell * 0.1]);

  ctx.beginPath();
  ctx.moveTo(sx + ux * startOffset, sy + uy * startOffset);
  ctx.lineTo(lineEndX, lineEndY);
  ctx.stroke();

  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(ex, ey);
  ctx.lineTo(ex - ux * headLen - uy * (headWidth / 2), ey - uy * headLen + ux * (headWidth / 2));
  ctx.lineTo(ex - ux * headLen + uy * (headWidth / 2), ey - uy * headLen - ux * (headWidth / 2));
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

export function drawClassicBoard(ctx, canvas, S, cell, dpr, prefs, viewerSide = 0, options = {}) {
  if (!S || !ctx || !canvas) return;
  const N = 8;
  const W = cell * N;
  const flipped = typeof options.flipped === 'boolean' ? options.flipped : viewerSide === 1;
  const theme = getThemeColors(prefs?.boardTheme || 'imperial');
  const annotations = options.annotations || null;
  const dragPiece = options.dragPiece || null;
  const onlineMovesFn = typeof options === 'function' ? options : options.onlineMovesFn || null;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, W);

  // 1. Casas + coordenadas respeitando a perspectiva individual
  for (let vy = 0; vy < N; vy++) {
    for (let vx = 0; vx < N; vx++) {
      const [bx, by] = viewToBoard(vx, vy, flipped);
      const isDark = (bx + by) % 2 === 1;
      ctx.fillStyle = isDark ? theme.dark : theme.light;
      ctx.fillRect(vx * cell, vy * cell, cell, cell);

      if (prefs?.showCoords !== false) {
        ctx.fillStyle = isDark ? 'rgba(244, 240, 228, 0.72)' : 'rgba(22, 28, 34, 0.65)';
        ctx.font = `700 ${Math.max(9, Math.floor(cell * 0.19))}px system-ui`;
        if (vx === 0) {
          ctx.textAlign = 'left';
          ctx.textBaseline = 'top';
          ctx.fillText(String(8 - by), vx * cell + 3, vy * cell + 3);
        }
        if (vy === 7) {
          ctx.textAlign = 'right';
          ctx.textBaseline = 'bottom';
          ctx.fillText(FILES[bx], (vx + 1) * cell - 3, (vy + 1) * cell - 2);
        }
      }
    }
  }

  ctx.strokeStyle = theme.border || 'rgba(79, 98, 112, 0.7)';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(0.75, 0.75, W - 1.5, W - 1.5);

  // 2. Destaque do último lance
  if (S.lastMove) {
    ctx.fillStyle = 'rgba(232, 189, 86, 0.34)';
    for (const [lx, ly] of [[S.lastMove.x0, S.lastMove.y0], [S.lastMove.x1, S.lastMove.y1]]) {
      const [vx, vy] = boardToView(lx, ly, flipped);
      ctx.fillRect(vx * cell, vy * cell, cell, cell);
    }
  }

  // 3. Marcações manuais de casas (botão direito / modo anotar)
  if (annotations?.squares?.length) {
    for (const sq of annotations.squares) {
      const [vx, vy] = boardToView(sq.x, sq.y, flipped);
      ctx.fillStyle = sq.color || 'rgba(224, 92, 92, 0.45)';
      ctx.fillRect(vx * cell, vy * cell, cell, cell);
    }
  }

  // 4. Peça selecionada + movimentos legais
  const sel = S.sel;
  const ms = sel ? (onlineMovesFn ? onlineMovesFn(sel) : getClassicMoves(S, sel)) : [];
  if (sel) {
    const [svx, svy] = boardToView(sel.x, sel.y, flipped);
    ctx.fillStyle = 'rgba(255, 245, 214, 0.36)';
    ctx.fillRect(svx * cell, svy * cell, cell, cell);
    ctx.strokeStyle = '#ffdf7e';
    ctx.lineWidth = 2.4;
    ctx.strokeRect(svx * cell + 1, svy * cell + 1, cell - 2, cell - 2);
  }

  if (prefs?.highlightMoves !== false) {
    for (const [a, b] of ms) {
      const [vx, vy] = boardToView(a, b, flipped);
      const q = S.grid?.[b]?.[a];
      const cx = vx * cell + cell / 2;
      const cy = vy * cell + cell / 2;
      ctx.beginPath();
      if (q) {
        ctx.strokeStyle = 'rgba(224, 82, 82, 0.88)';
        ctx.lineWidth = Math.max(3, cell * 0.065);
        ctx.arc(cx, cy, cell * 0.43, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.fillStyle = 'rgba(18, 26, 32, 0.42)';
        ctx.arc(cx, cy, cell * 0.15, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // 5. Indicação de Rei em xeque
  const activeTurn = S.turnOwner ?? S.turn ?? 0;
  const activeKing = S.pieces.find((p) => p.o === activeTurn && p.t === 'K');
  if (activeKing && S.grid && classicIsAttacked(S, activeKing.x, activeKing.y, 1 - activeTurn)) {
    const [kvx, kvy] = boardToView(activeKing.x, activeKing.y, flipped);
    const grd = ctx.createRadialGradient(
      kvx * cell + cell / 2,
      kvy * cell + cell / 2,
      cell * 0.1,
      kvx * cell + cell / 2,
      kvy * cell + cell / 2,
      cell * 0.55
    );
    grd.addColorStop(0, 'rgba(255, 65, 85, 0.72)');
    grd.addColorStop(1, 'rgba(255, 65, 85, 0)');
    ctx.fillStyle = grd;
    ctx.fillRect(kvx * cell, kvy * cell, cell, cell);
    ctx.strokeStyle = '#ff4d63';
    ctx.lineWidth = 3;
    ctx.strokeRect(kvx * cell + 2, kvy * cell + 2, cell - 4, cell - 4);
  }

  // 6. Peças (Brancas vs Pretas com contraste nítido)
  const drawSinglePiece = (p, cx, cy, scale = 1) => {
    const rad = cell * 0.4 * scale;
    ctx.save();
    ctx.fillStyle = 'rgba(8, 12, 16, 0.36)';
    ctx.beginPath();
    ctx.arc(cx, cy + cell * 0.04, rad, 0, Math.PI * 2);
    ctx.fill();

    const isWhite = p.o === 0;
    ctx.fillStyle = isWhite ? '#f4f0e4' : '#1b222c';
    ctx.strokeStyle = isWhite ? '#9ca6ae' : '#7da3b5';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, rad, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `${Math.floor(cell * 0.68 * scale)}px "Segoe UI Symbol","Noto Sans Symbols 2","DejaVu Sans",serif`;
    ctx.lineWidth = Math.max(1.5, cell * 0.045);
    ctx.strokeStyle = isWhite ? 'rgba(26, 32, 40, 0.85)' : 'rgba(225, 238, 248, 0.65)';
    ctx.strokeText(GLYPH[p.t], cx, cy + cell * 0.02);
    ctx.fillStyle = isWhite ? '#1b222b' : '#e6eff6';
    ctx.fillText(GLYPH[p.t], cx, cy + cell * 0.02);
    ctx.restore();
  };

  for (const p of S.pieces) {
    if (dragPiece && dragPiece.piece && dragPiece.piece.id === p.id) continue;
    const [vx, vy] = boardToView(p.x, p.y, flipped);
    drawSinglePiece(p, vx * cell + cell / 2, vy * cell + cell / 2, 1);
  }

  // 7. Seta do motor (apenas na página de Análise Pós-Partida!)
  if (annotations?.engineArrow) {
    const ea = annotations.engineArrow;
    drawArrow(ctx, ea.x0, ea.y0, ea.x1, ea.y1, cell, flipped, ea.color || 'rgba(104, 198, 140, 0.86)', false);
  }

  // 8. Setas manuais desenhadas pelo jogador + prévia de arraste
  if (annotations?.arrows?.length) {
    for (const ar of annotations.arrows) {
      drawArrow(ctx, ar.x0, ar.y0, ar.x1, ar.y1, cell, flipped, ar.color || 'rgba(235, 179, 68, 0.84)', Boolean(ar.dashed));
    }
  }
  if (annotations?.previewArrow) {
    const pa = annotations.previewArrow;
    drawArrow(ctx, pa.x0, pa.y0, pa.x1, pa.y1, cell, flipped, pa.color || 'rgba(235, 179, 68, 0.55)', true);
  }

  // 9. Peça sendo arrastada por cima de tudo
  if (dragPiece?.piece) {
    drawSinglePiece(dragPiece.piece, dragPiece.px, dragPiece.py, 1.1);
  }

  // 10. Selo de Xeque-mate (#)
  if (Number.isInteger(S.checkmatedKingOwner)) {
    const king = S.pieces.find((p) => p.o === S.checkmatedKingOwner && p.t === 'K');
    if (king) {
      const [kvx, kvy] = boardToView(king.x, king.y, flipped);
      const mx = (kvx + 0.78) * cell;
      const my = (kvy + 0.22) * cell;
      ctx.save();
      ctx.fillStyle = '#c94250';
      ctx.beginPath();
      ctx.arc(mx, my, cell * 0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = `800 ${Math.max(10, Math.floor(cell * 0.32))}px system-ui`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('#', mx, my);
      ctx.restore();
    }
  }
}
