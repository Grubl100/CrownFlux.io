import { FAC, GLYPH } from '../utils/constants.js';
import { getThemeColors } from './duelRenderer.js';
import { classicIsAttacked, getClassicMoves } from './classicEngine.js';

export function drawClassicBoard(ctx, canvas, S, cell, dpr, prefs, viewerSide = 0, onlineMovesFn = null) {
  if (!S || !ctx || !canvas) return;
  const N = 8;
  const W = cell * N;
  const theme = getThemeColors(prefs?.boardTheme || 'imperial');

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, W);

  const files = 'abcdefgh';
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      ctx.fillStyle = (x + y) % 2 ? theme.dark : theme.light;
      ctx.fillRect(x * cell, y * cell, cell, cell);
      if (prefs?.showCoords !== false) {
        ctx.fillStyle = 'rgba(20, 26, 22, 0.55)';
        ctx.font = Math.max(9, Math.floor(cell * 0.2)) + 'px system-ui';
        if (x === 0) {
          ctx.textAlign = 'left';
          ctx.textBaseline = 'top';
          ctx.fillText(String(8 - y), x * cell + 3, y * cell + 3);
        }
        if (y === 7) {
          ctx.textAlign = 'right';
          ctx.textBaseline = 'bottom';
          ctx.fillText(files[x], (x + 1) * cell - 3, (y + 1) * cell - 2);
        }
      }
    }
  }

  ctx.strokeStyle = theme.border || 'rgba(79, 98, 87, 0.7)';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(0.75, 0.75, W - 1.5, W - 1.5);

  if (S.lastMove) {
    ctx.fillStyle = 'rgba(218, 179, 98, 0.26)';
    for (const [lx, ly] of [[S.lastMove.x0, S.lastMove.y0], [S.lastMove.x1, S.lastMove.y1]]) {
      ctx.fillRect(lx * cell, ly * cell, cell, cell);
    }
  }

  const sel = S.sel;
  const ms = sel ? (onlineMovesFn ? onlineMovesFn(sel) : getClassicMoves(S, sel)) : [];
  if (sel) {
    ctx.fillStyle = 'rgba(255, 245, 214, 0.34)';
    ctx.fillRect(sel.x * cell, sel.y * cell, cell, cell);
    ctx.strokeStyle = '#ffdf7e';
    ctx.lineWidth = 2.4;
    ctx.strokeRect(sel.x * cell + 1, sel.y * cell + 1, cell - 2, cell - 2);
  }

  if (prefs?.highlightMoves !== false) {
    for (const [a, b] of ms) {
      const q = S.grid[b]?.[a];
      const cx = a * cell + cell / 2;
      const cy = b * cell + cell / 2;
      ctx.beginPath();
      if (q) {
        ctx.strokeStyle = '#e05a5a';
        ctx.lineWidth = 2.8;
        ctx.arc(cx, cy, cell * 0.42, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.fillStyle = 'rgba(20, 30, 23, 0.5)';
        ctx.arc(cx, cy, cell * 0.16, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // Highlight checked King
  const activeTurn = S.turnOwner ?? S.turn ?? 0;
  const activeKing = S.pieces.find((p) => p.o === activeTurn && p.t === 'K');
  if (activeKing && classicIsAttacked(S, activeKing.x, activeKing.y, 1 - activeTurn)) {
    ctx.strokeStyle = '#ff4d63';
    ctx.lineWidth = 3;
    ctx.strokeRect(activeKing.x * cell + 2, activeKing.y * cell + 2, cell - 4, cell - 4);
  }

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const p of S.pieces) {
    const col = FAC[p.o]?.col || '#d8edf5';
    const cx = p.x * cell + cell / 2;
    const cy = p.y * cell + cell / 2;
    const rad = cell * 0.41;

    ctx.save();
    ctx.fillStyle = 'rgba(12, 16, 14, 0.35)';
    ctx.beginPath();
    ctx.arc(cx, cy + cell * 0.03, rad, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = p.o === 0 ? '#1b262c' : '#2c1b1d';
    ctx.strokeStyle = col;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, rad, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.font = Math.floor(cell * 0.72) + 'px "Segoe UI Symbol","Noto Sans Symbols 2","DejaVu Sans",serif';
    ctx.lineWidth = Math.max(2, cell * 0.06);
    ctx.strokeStyle = '#0e1310';
    ctx.strokeText(GLYPH[p.t], cx, cy + cell * 0.02);
    ctx.fillStyle = p.o === viewerSide ? '#e1f2f9' : col;
    if (p.o !== viewerSide) ctx.fillStyle = col;
    ctx.fillText(GLYPH[p.t], cx, cy + cell * 0.02);
    ctx.restore();
  }

  if (Number.isInteger(S.checkmatedKingOwner)) {
    const king = S.pieces.find((p) => p.o === S.checkmatedKingOwner && p.t === 'K');
    if (king) {
      const mx = (king.x + 0.78) * cell;
      const my = (king.y + 0.22) * cell;
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
