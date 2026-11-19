import { getThemeColors } from './duelRenderer.js';
import { classicIsAttacked, getClassicMoves } from './classicEngine.js';
import {
  getChessPieceImage,
  normalizePieceStyle,
  preloadChessPieceStyle,
} from './chessPieceAssets.js';

const FILES = 'abcdefgh';

export function boardToView(x, y, flipped = false) {
  return flipped ? [7 - x, 7 - y] : [x, y];
}

export function viewToBoard(vx, vy, flipped = false) {
  return flipped ? [7 - vx, 7 - vy] : [vx, vy];
}

function drawArrowHead(ctx, tipX, tipY, ux, uy, headLen, headWidth, outlined = false) {
  ctx.beginPath();
  ctx.moveTo(tipX, tipY);
  ctx.lineTo(tipX - ux * headLen - uy * (headWidth / 2), tipY - uy * headLen + ux * (headWidth / 2));
  ctx.lineTo(tipX - ux * headLen + uy * (headWidth / 2), tipY - uy * headLen - ux * (headWidth / 2));
  ctx.closePath();
  if (outlined) {
    ctx.fill();
    ctx.lineWidth = Math.max(2, headWidth * 0.14);
    ctx.stroke();
  } else {
    ctx.fill();
  }
}

function drawArrow(ctx, x0, y0, x1, y1, cell, flipped, options = {}) {
  const color = typeof options === 'string' ? options : options.color || 'rgba(235, 179, 68, 0.86)';
  const dashed = typeof options === 'object' ? Boolean(options.dashed) : false;
  const promotion = typeof options === 'object' ? options.promotion || null : null;
  const pieceType = typeof options === 'object' ? options.pieceType || null : null;

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

  const adx = Math.abs(x1 - x0);
  const ady = Math.abs(y1 - y0);
  const isKnightL = (adx === 2 && ady === 1) || (adx === 1 && ady === 2);

  const headLen = Math.max(12, cell * 0.34);
  const headWidth = Math.max(10, cell * 0.28);
  const startOffset = cell * 0.18;

  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = dashed ? Math.max(3.2, cell * 0.1) : Math.max(4.4, cell * 0.135);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (dashed) ctx.setLineDash([cell * 0.15, cell * 0.11]);

  if (isKnightL) {
    // Seta em L nítida para movimentos de Cavalo (2 casas no eixo maior + 1 no perpendicular)
    const vdx = vx1 - vx0;
    const vdy = vy1 - vy0;
    const horizontalFirst = Math.abs(vdx) === 2;
    const bendX = horizontalFirst ? ex : sx;
    const bendY = horizontalFirst ? sy : ey;

    const u1x = horizontalFirst ? Math.sign(vdx) : 0;
    const u1y = horizontalFirst ? 0 : Math.sign(vdy);
    const u2x = horizontalFirst ? 0 : Math.sign(vdx);
    const u2y = horizontalFirst ? Math.sign(vdy) : 0;

    ctx.beginPath();
    ctx.moveTo(sx + u1x * startOffset, sy + u1y * startOffset);
    ctx.lineTo(bendX, bendY);
    ctx.lineTo(ex - u2x * (headLen * 0.78), ey - u2y * (headLen * 0.78));
    ctx.stroke();

    ctx.setLineDash([]);
    drawArrowHead(ctx, ex, ey, u2x, u2y, headLen, headWidth, false);
  } else {
    const ux = dx / len;
    const uy = dy / len;
    const lineEndX = ex - ux * (headLen * 0.78);
    const lineEndY = ey - uy * (headLen * 0.78);

    ctx.beginPath();
    ctx.moveTo(sx + ux * startOffset, sy + uy * startOffset);
    ctx.lineTo(lineEndX, lineEndY);
    ctx.stroke();

    ctx.setLineDash([]);
    drawArrowHead(ctx, ex, ey, ux, uy, headLen, headWidth, dashed);
  }

  // Selo discreto de promoção associada à seta legal de peão
  if (promotion) {
    const bx = ex + cell * 0.24;
    const by = ey - cell * 0.24;
    const r = Math.max(8, cell * 0.17);
    ctx.beginPath();
    ctx.fillStyle = '#1d242c';
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.8;
    ctx.arc(bx, by, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#eae2d0';
    ctx.font = `700 ${Math.max(9, Math.floor(cell * 0.19))}px system-ui`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(promotion, bx, by + 0.5);
  }

  ctx.restore();
}

// Renderiza uma peça de Xadrez Clássico usando assets vetoriais SVG dedicados
// Suporta exatamente os 3 estilos: 'standard' (Padrão), 'minimal' (Minimalista) e 'medieval' (Medieval).
export function drawStyledChessPiece(
  ctx,
  pieceType,
  owner,
  cx,
  cy,
  cell,
  style = 'standard',
  scale = 1,
  onAssetReady = null
) {
  const normStyle = normalizePieceStyle(style);
  const img = getChessPieceImage(normStyle, pieceType, owner, onAssetReady);
  const drawSize = cell * 0.92 * scale;
  const dx = cx - drawSize / 2;
  const dy = cy - drawSize / 2;

  ctx.save();
  if (img && img.complete && img.naturalWidth > 0) {
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    // Sombra de contato extremamente discreta para assentar a peça sobre a casa sem ocultar detalhes
    ctx.shadowColor = 'rgba(12, 16, 20, 0.22)';
    ctx.shadowBlur = Math.max(1.5, cell * 0.04);
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = Math.max(1, cell * 0.025);
    ctx.drawImage(img, dx, dy, drawSize, drawSize);
  }
  ctx.restore();
}

export function drawPieceStylePreview(canvas, pieceStyle = 'standard', boardTheme = 'imperial') {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const normStyle = normalizePieceStyle(pieceStyle);
  const theme = getThemeColors(boardTheme);
  const cols = 6;
  const rows = 2;
  const cell = 44;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.style.width = `${cols * cell}px`;
  canvas.style.height = `${rows * cell}px`;
  canvas.width = Math.floor(cols * cell * dpr);
  canvas.height = Math.floor(rows * cell * dpr);

  const render = () => {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const order = ['K', 'Q', 'R', 'B', 'N', 'P'];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        ctx.fillStyle = (r + c) % 2 === 1 ? theme.dark : theme.light;
        ctx.fillRect(c * cell, r * cell, cell, cell);
        drawStyledChessPiece(ctx, order[c], r, c * cell + cell / 2, r * cell + cell / 2, cell, normStyle, 1);
      }
    }
  };

  render();
  preloadChessPieceStyle(normStyle, render);
}

export function drawClassicBoard(ctx, canvas, S, cell, dpr, prefs, viewerSide = 0, options = {}) {
  if (!S || !ctx || !canvas) return;
  const N = 8;
  const W = cell * N;
  const flipped = typeof options.flipped === 'boolean' ? options.flipped : viewerSide === 1;
  const theme = getThemeColors(prefs?.boardTheme || 'imperial');
  const pieceStyle = normalizePieceStyle(prefs?.pieceStyle || 'standard');
  const annotations = options.annotations || null;
  const premove = options.premove || null;
  const dragPiece = options.dragPiece || null;
  const onAssetReady = options.onAssetReady || null;
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
        ctx.fillStyle = isDark ? 'rgba(238, 233, 222, 0.72)' : 'rgba(24, 30, 36, 0.68)';
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

  // 3. Destaque de Premove preparado
  if (premove) {
    ctx.fillStyle = 'rgba(176, 98, 232, 0.40)';
    for (const [px, py] of [[premove.fromX, premove.fromY], [premove.toX, premove.toY]]) {
      const [vx, vy] = boardToView(px, py, flipped);
      ctx.fillRect(vx * cell, vy * cell, cell, cell);
    }
    const [pvx, pvy] = boardToView(premove.toX, premove.toY, flipped);
    ctx.strokeStyle = 'rgba(216, 152, 255, 0.88)';
    ctx.lineWidth = 2.4;
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
    ctx.fillStyle = options.isPremoveSelect ? 'rgba(176, 98, 232, 0.34)' : 'rgba(235, 200, 112, 0.32)';
    ctx.fillRect(svx * cell, svy * cell, cell, cell);
    ctx.strokeStyle = options.isPremoveSelect ? '#d395ff' : '#d6b25e';
    ctx.lineWidth = 2.2;
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
        ctx.strokeStyle = 'rgba(214, 78, 78, 0.86)';
        ctx.lineWidth = Math.max(3, cell * 0.065);
        ctx.arc(cx, cy, cell * 0.43, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.fillStyle = options.isPremoveSelect ? 'rgba(176, 98, 232, 0.55)' : 'rgba(18, 26, 32, 0.40)';
        ctx.arc(cx, cy, cell * 0.145, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // 5b. Dicas discretas de destinos legais ao arrastar uma Seta Legal de uma peça
  if (annotations?.legalArrowTargets?.length) {
    ctx.save();
    for (const [tx, ty] of annotations.legalArrowTargets) {
      const [vx, vy] = boardToView(tx, ty, flipped);
      const cx = vx * cell + cell / 2;
      const cy = vy * cell + cell / 2;
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(235, 179, 68, 0.55)';
      ctx.lineWidth = Math.max(2, cell * 0.045);
      ctx.arc(cx, cy, cell * 0.22, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
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
    grd.addColorStop(0, 'rgba(226, 62, 78, 0.68)');
    grd.addColorStop(1, 'rgba(226, 62, 78, 0)');
    ctx.fillStyle = grd;
    ctx.fillRect(kvx * cell, kvy * cell, cell, cell);
    ctx.strokeStyle = '#e24658';
    ctx.lineWidth = 2.6;
    ctx.strokeRect(kvx * cell + 2, kvy * cell + 2, cell - 4, cell - 4);
  }

  // 7. Peças vetoriais foscas com alto contraste
  for (const p of S.pieces) {
    if (dragPiece && dragPiece.piece && dragPiece.piece.id === p.id) continue;
    const [vx, vy] = boardToView(p.x, p.y, flipped);
    drawStyledChessPiece(ctx, p.t, p.o, vx * cell + cell / 2, vy * cell + cell / 2, cell, pieceStyle, 1, onAssetReady);
  }

  // 8. Seta de premove preparado
  if (premove) {
    drawArrow(ctx, premove.fromX, premove.fromY, premove.toX, premove.toY, cell, flipped, {
      color: 'rgba(196, 120, 255, 0.85)',
      dashed: true,
    });
  }

  // 9. Seta do motor (somente na Análise Pós-Partida)
  if (annotations?.engineArrow) {
    const ea = annotations.engineArrow;
    drawArrow(ctx, ea.x0, ea.y0, ea.x1, ea.y1, cell, flipped, {
      color: ea.color || 'rgba(104, 198, 140, 0.86)',
      dashed: false,
      pieceType: ea.pieceType || S.grid?.[ea.y0]?.[ea.x0]?.t || null,
    });
  }

  // 10. Setas manuais (Setas de Movimento Legal = sólidas; Anotações Livres = tracejadas + ponta vazada)
  if (annotations?.arrows?.length) {
    for (const ar of annotations.arrows) {
      drawArrow(ctx, ar.x0, ar.y0, ar.x1, ar.y1, cell, flipped, {
        color: ar.color || 'rgba(235, 179, 68, 0.86)',
        dashed: Boolean(ar.dashed),
        promotion: ar.promotion || null,
        pieceType: ar.pieceType || null,
      });
    }
  }
  if (annotations?.previewArrow) {
    const pa = annotations.previewArrow;
    drawArrow(ctx, pa.x0, pa.y0, pa.x1, pa.y1, cell, flipped, {
      color: pa.color || 'rgba(235, 179, 68, 0.62)',
      dashed: Boolean(pa.dashed),
      promotion: pa.promotion || null,
      pieceType: pa.pieceType || null,
    });
  }

  // 10b. Feedback visual discreto para destino inválido ao tentar desenhar seta ilegal
  if (annotations?.invalidTarget) {
    const [ivx, ivy] = boardToView(annotations.invalidTarget.x, annotations.invalidTarget.y, flipped);
    ctx.save();
    ctx.strokeStyle = 'rgba(224, 92, 92, 0.72)';
    ctx.fillStyle = 'rgba(224, 92, 92, 0.16)';
    ctx.lineWidth = 2.2;
    ctx.setLineDash([5, 4]);
    ctx.fillRect(ivx * cell + 3, ivy * cell + 3, cell - 6, cell - 6);
    ctx.strokeRect(ivx * cell + 3, ivy * cell + 3, cell - 6, cell - 6);
    ctx.restore();
  }

  // 11. Peça sendo arrastada
  if (dragPiece?.piece) {
    drawStyledChessPiece(ctx, dragPiece.piece.t, dragPiece.piece.o, dragPiece.px, dragPiece.py, cell, pieceStyle, 1.1, onAssetReady);
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
      ctx.fillStyle = '#f2ede4';
      ctx.font = `800 ${Math.max(10, Math.floor(cell * 0.32))}px system-ui`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('#', mx, my);
      ctx.restore();
    }
  }
}
