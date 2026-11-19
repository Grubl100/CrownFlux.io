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

function drawOctagonPath(ctx, cx, cy, r) {
  const step = Math.PI / 4;
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = step * i + Math.PI / 8;
    const px = cx + Math.cos(a) * r;
    const py = cy + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

// Renderiza uma peça de Xadrez Clássico com cores corretas (Brancas = claras, Pretas = escuras)
// e suporte real aos 3 estilos: 'minimal' (Clássico Limpo), 'medallion' (Medalhão Real), 'heraldic' (Heráldico Imperial).
export function drawStyledChessPiece(ctx, pieceType, owner, cx, cy, cell, style = 'medallion', scale = 1) {
  const isWhite = owner === 0;
  const glyph = GLYPH[pieceType] || '♟';
  const rad = cell * 0.41 * scale;

  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  if (style === 'minimal') {
    // Clássico Limpo: peça tradicional diretamente sobre a casa, sem disco
    const fontSize = Math.floor(cell * 0.8 * scale);
    ctx.font = `700 ${fontSize}px "Segoe UI Symbol","Noto Sans Symbols 2","DejaVu Sans",serif`;
    ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
    ctx.shadowBlur = Math.max(2, cell * 0.06);
    ctx.shadowOffsetY = cell * 0.03;

    if (isWhite) {
      ctx.lineWidth = Math.max(2.6, cell * 0.068);
      ctx.strokeStyle = '#182028';
      ctx.strokeText(glyph, cx, cy + cell * 0.02);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(glyph, cx, cy + cell * 0.02);
    } else {
      ctx.lineWidth = Math.max(2.2, cell * 0.055);
      ctx.strokeStyle = '#dce6ef';
      ctx.strokeText(glyph, cx, cy + cell * 0.02);
      ctx.fillStyle = '#141920';
      ctx.fillText(glyph, cx, cy + cell * 0.02);
    }
    ctx.restore();
    return;
  }

  if (style === 'heraldic') {
    // Heráldico Imperial: brasão octogonal com borda dupla real
    ctx.fillStyle = 'rgba(8, 12, 16, 0.38)';
    drawOctagonPath(ctx, cx, cy + cell * 0.04, rad);
    ctx.fill();

    ctx.fillStyle = isWhite ? '#f7f3e6' : '#181f27';
    ctx.strokeStyle = isWhite ? '#b79b64' : '#7da3b5';
    ctx.lineWidth = Math.max(2, cell * 0.045);
    drawOctagonPath(ctx, cx, cy, rad);
    ctx.fill();
    ctx.stroke();

    // Borda interna heráldica
    ctx.strokeStyle = isWhite ? 'rgba(26, 34, 42, 0.25)' : 'rgba(220, 232, 242, 0.28)';
    ctx.lineWidth = 1;
    drawOctagonPath(ctx, cx, cy, rad * 0.82);
    ctx.stroke();

    ctx.font = `700 ${Math.floor(cell * 0.64 * scale)}px Georgia,"Segoe UI Symbol","DejaVu Sans",serif`;
    if (isWhite) {
      ctx.lineWidth = Math.max(2.4, cell * 0.058);
      ctx.strokeStyle = '#1c232b';
      ctx.strokeText(glyph, cx, cy + cell * 0.02);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(glyph, cx, cy + cell * 0.02);
    } else {
      ctx.lineWidth = Math.max(1.8, cell * 0.045);
      ctx.strokeStyle = '#d4e2ee';
      ctx.strokeText(glyph, cx, cy + cell * 0.02);
      ctx.fillStyle = '#10151b';
      ctx.fillText(glyph, cx, cy + cell * 0.02);
    }
    ctx.restore();
    return;
  }

  // Padrão: 'medallion' (Medalhão Real) — disco circular polido com alto contraste entre Brancas e Pretas
  ctx.fillStyle = 'rgba(8, 12, 16, 0.36)';
  ctx.beginPath();
  ctx.arc(cx, cy + cell * 0.04, rad, 0, Math.PI * 2);
  ctx.fill();

  const grad = ctx.createRadialGradient(cx - rad * 0.28, cy - rad * 0.28, rad * 0.1, cx, cy, rad);
  if (isWhite) {
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(1, '#dfd8c7');
  } else {
    grad.addColorStop(0, '#323d4a');
    grad.addColorStop(1, '#141920');
  }
  ctx.fillStyle = grad;
  ctx.strokeStyle = isWhite ? '#7c8791' : '#8aa6b8';
  ctx.lineWidth = Math.max(1.8, cell * 0.04);
  ctx.beginPath();
  ctx.arc(cx, cy, rad, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.font = `700 ${Math.floor(cell * 0.66 * scale)}px "Segoe UI Symbol","Noto Sans Symbols 2","DejaVu Sans",serif`;
  if (isWhite) {
    ctx.lineWidth = Math.max(2.6, cell * 0.062);
    ctx.strokeStyle = '#1b222c';
    ctx.strokeText(glyph, cx, cy + cell * 0.02);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(glyph, cx, cy + cell * 0.02);
  } else {
    ctx.lineWidth = Math.max(1.8, cell * 0.046);
    ctx.strokeStyle = '#dce8f2';
    ctx.strokeText(glyph, cx, cy + cell * 0.02);
    ctx.fillStyle = '#0e1319';
    ctx.fillText(glyph, cx, cy + cell * 0.02);
  }
  ctx.restore();
}

export function drawPieceStylePreview(canvas, pieceStyle = 'medallion', boardTheme = 'imperial') {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const theme = getThemeColors(boardTheme);
  const cols = 6;
  const rows = 2;
  const cell = 44;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.style.width = `${cols * cell}px`;
  canvas.style.height = `${rows * cell}px`;
  canvas.width = Math.floor(cols * cell * dpr);
  canvas.height = Math.floor(rows * cell * dpr);

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const order = ['K', 'Q', 'R', 'B', 'N', 'P'];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      ctx.fillStyle = (r + c) % 2 === 1 ? theme.dark : theme.light;
      ctx.fillRect(c * cell, r * cell, cell, cell);
      drawStyledChessPiece(ctx, order[c], r, c * cell + cell / 2, r * cell + cell / 2, cell, pieceStyle, 1);
    }
  }
}

export function drawClassicBoard(ctx, canvas, S, cell, dpr, prefs, viewerSide = 0, options = {}) {
  if (!S || !ctx || !canvas) return;
  const N = 8;
  const W = cell * N;
  const flipped = typeof options.flipped === 'boolean' ? options.flipped : viewerSide === 1;
  const theme = getThemeColors(prefs?.boardTheme || 'imperial');
  const pieceStyle = prefs?.pieceStyle || 'medallion';
  const annotations = options.annotations || null;
  const premove = options.premove || null;
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

  // 3. Destaque de Premove preparado (visualmente distinto de último lance e anotações!)
  if (premove) {
    ctx.fillStyle = 'rgba(176, 98, 232, 0.42)';
    for (const [px, py] of [[premove.fromX, premove.fromY], [premove.toX, premove.toY]]) {
      const [vx, vy] = boardToView(px, py, flipped);
      ctx.fillRect(vx * cell, vy * cell, cell, cell);
    }
    const [pvx, pvy] = boardToView(premove.toX, premove.toY, flipped);
    ctx.strokeStyle = 'rgba(216, 152, 255, 0.9)';
    ctx.lineWidth = 2.5;
    ctx.strokeRect(pvx * cell + 2, pvy * cell + 2, cell - 4, cell - 4);
  }

  // 4. Marcações manuais de casas
  if (annotations?.squares?.length) {
    for (const sq of annotations.squares) {
      const [vx, vy] = boardToView(sq.x, sq.y, flipped);
      ctx.fillStyle = sq.color || 'rgba(224, 92, 92, 0.45)';
      ctx.fillRect(vx * cell, vy * cell, cell, cell);
    }
  }

  // 5. Peça selecionada + movimentos legais (ou destinos de premove)
  const sel = S.sel;
  const ms = sel
    ? (options.customTargets || (onlineMovesFn ? onlineMovesFn(sel) : getClassicMoves(S, sel)))
    : [];
  if (sel) {
    const [svx, svy] = boardToView(sel.x, sel.y, flipped);
    ctx.fillStyle = options.isPremoveSelect ? 'rgba(176, 98, 232, 0.35)' : 'rgba(255, 245, 214, 0.36)';
    ctx.fillRect(svx * cell, svy * cell, cell, cell);
    ctx.strokeStyle = options.isPremoveSelect ? '#d395ff' : '#ffdf7e';
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
      if (q && !options.isPremoveSelect) {
        ctx.strokeStyle = 'rgba(224, 82, 82, 0.88)';
        ctx.lineWidth = Math.max(3, cell * 0.065);
        ctx.arc(cx, cy, cell * 0.43, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.fillStyle = options.isPremoveSelect ? 'rgba(176, 98, 232, 0.55)' : 'rgba(18, 26, 32, 0.42)';
        ctx.arc(cx, cy, cell * 0.15, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // 6. Indicação de Rei em xeque
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

  // 7. Peças com cores reais (Brancas claras, Pretas escuras) e estilo escolhido
  for (const p of S.pieces) {
    if (dragPiece && dragPiece.piece && dragPiece.piece.id === p.id) continue;
    const [vx, vy] = boardToView(p.x, p.y, flipped);
    drawStyledChessPiece(ctx, p.t, p.o, vx * cell + cell / 2, vy * cell + cell / 2, cell, pieceStyle, 1);
  }

  // 8. Seta de premove preparado
  if (premove) {
    drawArrow(ctx, premove.fromX, premove.fromY, premove.toX, premove.toY, cell, flipped, 'rgba(196, 120, 255, 0.85)', true);
  }

  // 9. Seta do motor (somente na Análise Pós-Partida)
  if (annotations?.engineArrow) {
    const ea = annotations.engineArrow;
    drawArrow(ctx, ea.x0, ea.y0, ea.x1, ea.y1, cell, flipped, ea.color || 'rgba(104, 198, 140, 0.86)', false);
  }

  // 10. Setas manuais + prévia
  if (annotations?.arrows?.length) {
    for (const ar of annotations.arrows) {
      drawArrow(ctx, ar.x0, ar.y0, ar.x1, ar.y1, cell, flipped, ar.color || 'rgba(235, 179, 68, 0.84)', Boolean(ar.dashed));
    }
  }
  if (annotations?.previewArrow) {
    const pa = annotations.previewArrow;
    drawArrow(ctx, pa.x0, pa.y0, pa.x1, pa.y1, cell, flipped, pa.color || 'rgba(235, 179, 68, 0.55)', true);
  }

  // 11. Peça sendo arrastada
  if (dragPiece?.piece) {
    drawStyledChessPiece(ctx, dragPiece.piece.t, dragPiece.piece.o, dragPiece.px, dragPiece.py, cell, pieceStyle, 1.12);
  }

  // 12. Selo de Xeque-mate (#)
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
