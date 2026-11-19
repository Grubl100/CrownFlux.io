import { FAC, GLYPH } from '../utils/constants.js';
import { getDuelMoves } from './duelEngine.js';

export function getThemeColors(boardTheme) {
  if (boardTheme === 'slate') return { light: '#c5ccd1', dark: '#637482', border: '#7b93a6' };
  if (boardTheme === 'wood') return { light: '#dcc9ab', dark: '#967253', border: '#c49a6c' };
  if (boardTheme === 'classic') return { light: '#d2cbb8', dark: '#788a7a', border: '#6e8c76' };
  return { light: '#cfc5b0', dark: '#627566', border: '#c9a66b' };
}

export function drawDuelBoard(ctx, canvas, S, cell, dpr, prefs, viewerSide = 0) {
  if (!S || !ctx || !canvas) return;
  const N = S.N || 16;
  const W = cell * N;
  const theme = getThemeColors(prefs?.boardTheme || 'imperial');
  const reducedMotion = Boolean(prefs?.reducedMotion);

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, W);

  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const inCenterThrone = S.zones?.length && x >= 7 && x <= 8 && y >= 7 && y <= 8;
      ctx.fillStyle = inCenterThrone
        ? ((x + y) % 2 ? '#594f3d' : '#b8a682')
        : ((x + y) % 2 ? theme.dark : theme.light);
      ctx.fillRect(x * cell, y * cell, cell, cell);
      if (prefs?.showCoords !== false && x === 0) {
        ctx.fillStyle = 'rgba(20, 26, 22, 0.55)';
        ctx.font = Math.max(8, Math.floor(cell * 0.21)) + 'px system-ui';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(String(N - y), x * cell + 2, y * cell + 2);
      }
    }
  }

  // Strategic Regions (1v1 Duel)
  if (S.zones?.length) {
    for (const z of S.zones) {
      const zx = z.x0 * cell;
      const zy = z.y0 * cell;
      const zw = (z.x1 - z.x0 + 1) * cell;
      const zh = (z.y1 - z.y0 + 1) * cell;
      ctx.save();
      if (z.contested) {
        ctx.fillStyle = 'rgba(224, 159, 90, 0.24)';
        ctx.strokeStyle = '#e09f5a';
      } else if (z.owner >= 0 && FAC[z.owner]) {
        ctx.fillStyle = FAC[z.owner].col + '2e';
        ctx.strokeStyle = FAC[z.owner].col;
      } else {
        ctx.fillStyle = z.id === 'throne' ? 'rgba(218, 179, 98, 0.16)' : 'rgba(111, 157, 175, 0.13)';
        ctx.strokeStyle = z.id === 'throne' ? 'rgba(218, 179, 98, 0.78)' : 'rgba(214, 196, 156, 0.52)';
      }
      ctx.fillRect(zx, zy, zw, zh);
      ctx.lineWidth = z.id === 'throne' ? 2.2 : 1.6;
      ctx.strokeRect(zx + 1.5, zy + 1.5, zw - 3, zh - 3);

      const br = Math.max(5, cell * 0.22);
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(zx + 1, zy + br); ctx.lineTo(zx + 1, zy + 1); ctx.lineTo(zx + br, zy + 1);
      ctx.moveTo(zx + zw - br, zy + 1); ctx.lineTo(zx + zw - 1, zy + 1); ctx.lineTo(zx + zw - 1, zy + br);
      ctx.moveTo(zx + 1, zy + zh - br); ctx.lineTo(zx + 1, zy + zh - 1); ctx.lineTo(zx + br, zy + zh - 1);
      ctx.moveTo(zx + zw - br, zy + zh - 1); ctx.lineTo(zx + zw - 1, zy + zh - 1); ctx.lineTo(zx + zw - 1, zy + zh - br);
      ctx.stroke();

      if (z.id !== 'throne' || !S.crown || S.crown.state === 'held') {
        ctx.font = Math.max(12, Math.floor(cell * 0.5)) + 'px system-ui';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.globalAlpha = 0.36;
        ctx.fillStyle = '#fff5dc';
        ctx.fillText(z.icon, zx + zw / 2, zy + zh / 2);
      }
      ctx.restore();
    }
  }

  ctx.strokeStyle = theme.border || 'rgba(79, 98, 87, 0.7)';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(0.75, 0.75, W - 1.5, W - 1.5);

  // Imperial Crown on Board
  if (S.crown && S.crown.state !== 'held') {
    const cx = S.crown.x * cell + cell / 2;
    const cy = S.crown.y * cell + cell / 2;
    const pulse = reducedMotion ? 0.94 : 0.88 + Math.sin(S.T * 4.5) * 0.12;
    ctx.save();
    if (S.crown.state === 'sealed') {
      ctx.fillStyle = 'rgba(26, 32, 28, 0.68)';
      ctx.beginPath();
      ctx.arc(cx, cy, cell * 0.44, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(218, 179, 98, 0.7)';
      ctx.lineWidth = 1.8;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.arc(cx, cy, cell * 0.44 * pulse, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.font = Math.max(11, Math.floor(cell * 0.46)) + 'px system-ui';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#d8c292';
      ctx.fillText('👑', cx, cy - cell * 0.08);
      const remUnlock = Math.max(1, Math.ceil(S.crown.unlockAt - S.T));
      ctx.font = `800 ${Math.max(8, Math.floor(cell * 0.24))}px system-ui`;
      ctx.fillStyle = '#ffe596';
      ctx.fillText(remUnlock + 's', cx, cy + cell * 0.26);
    } else if (S.crown.state === 'free') {
      const grad = ctx.createRadialGradient(cx, cy, cell * 0.06, cx, cy, cell * 0.56);
      grad.addColorStop(0, 'rgba(255, 223, 126, 0.72)');
      grad.addColorStop(1, 'rgba(218, 179, 98, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, cell * 0.56 * pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ffdf7e';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.arc(cx, cy, cell * 0.39 * pulse, 0, Math.PI * 2);
      ctx.stroke();
      ctx.font = Math.max(13, Math.floor(cell * 0.58)) + 'px system-ui';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('👑', cx, cy + 1);
    }
    ctx.restore();
  }

  // Flux Orbs
  for (const o of S.orbs || []) {
    const x = o.x * cell + cell / 2;
    const y = o.y * cell + cell / 2;
    const pulse = reducedMotion ? 0.94 : 0.85 + Math.sin(S.T * 4 + o.x) * 0.15;
    ctx.save();
    ctx.fillStyle = '#c49b5a';
    ctx.beginPath();
    ctx.moveTo(x, y - cell * 0.27 * pulse);
    ctx.lineTo(x + cell * 0.22 * pulse, y);
    ctx.lineTo(x, y + cell * 0.27 * pulse);
    ctx.lineTo(x - cell * 0.22 * pulse, y);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#fff0d1';
    ctx.lineWidth = 1.3;
    ctx.stroke();
    ctx.restore();
  }

  if (S.lastBotMove && S.T - S.lastBotMove.t < 3.0) {
    ctx.save();
    ctx.fillStyle = 'rgba(189, 119, 120, 0.24)';
    ctx.strokeStyle = '#e07a7c';
    ctx.lineWidth = 2;
    for (const [bx, by] of [[S.lastBotMove.x0, S.lastBotMove.y0], [S.lastBotMove.x1, S.lastBotMove.y1]]) {
      ctx.fillRect(bx * cell, by * cell, cell, cell);
      ctx.strokeRect(bx * cell + 1.5, by * cell + 1.5, cell - 3, cell - 3);
    }
    ctx.restore();
  }

  // Tutorial Visual Guides
  if (S.mode === 'tutorial' && S.tutorial?.active) {
    const tut = S.tutorial;
    const pulse = 0.42 + Math.sin(S.T * 5) * 0.05;
    ctx.save();
    if (tut.step === 1) {
      for (const p of S.pieces) {
        if (p.t === 'K') {
          ctx.strokeStyle = p.o === 0 ? '#f0c869' : '#e07a7c';
          ctx.lineWidth = 2.6;
          ctx.beginPath();
          ctx.arc(p.x * cell + cell / 2, p.y * cell + cell / 2, cell * (pulse + 0.05), 0, Math.PI * 2);
          ctx.stroke();
        }
      }
    } else if ((tut.step === 2 || tut.step === 3) && !S.sel) {
      ctx.strokeStyle = '#f0c869';
      ctx.lineWidth = 2.2;
      for (const p of S.pieces) {
        if (p.o === 0) {
          ctx.beginPath();
          ctx.arc(p.x * cell + cell / 2, p.y * cell + cell / 2, cell * pulse, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
    } else if (tut.step === 5) {
      const targetP = S.pieces.find((p) => p.id === tut.targetPieceId);
      if (targetP) {
        ctx.strokeStyle = '#f0c869';
        ctx.lineWidth = 2.8;
        ctx.beginPath();
        ctx.arc(targetP.x * cell + cell / 2, targetP.y * cell + cell / 2, cell * (pulse + 0.04), 0, Math.PI * 2);
        ctx.stroke();
      }
      const attP = S.pieces.find((p) => p.id === tut.attackerPieceId);
      if (attP && !S.sel) {
        ctx.strokeStyle = '#6f9daf';
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.arc(attP.x * cell + cell / 2, attP.y * cell + cell / 2, cell * pulse, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  const sel = S.sel;
  const ms = sel ? getDuelMoves(S, sel) : [];
  if (sel) {
    ctx.fillStyle = 'rgba(255, 245, 214, 0.34)';
    ctx.fillRect(sel.x * cell, sel.y * cell, cell, cell);
    ctx.strokeStyle = '#ffdf7e';
    ctx.lineWidth = 2.4;
    ctx.strokeRect(sel.x * cell + 1, sel.y * cell + 1, cell - 2, cell - 2);
  }
  if (prefs?.highlightMoves !== false) {
    for (const [a, b] of ms) {
      const q = S.grid[b][a];
      const cx = a * cell + cell / 2;
      const cy = b * cell + cell / 2;
      ctx.beginPath();
      if (q) {
        ctx.strokeStyle = q.shield > 0 ? '#7fd8ff' : '#e05a5a';
        ctx.lineWidth = 2.7;
        ctx.arc(cx, cy, cell * 0.42, 0, Math.PI * 2);
        ctx.stroke();
      } else if (S.crown && S.crown.state === 'free' && S.crown.x === a && S.crown.y === b) {
        ctx.strokeStyle = '#ffdf7e';
        ctx.lineWidth = 2.8;
        ctx.arc(cx, cy, cell * 0.43, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.fillStyle = 'rgba(20, 30, 23, 0.54)';
        ctx.arc(cx, cy, cell * 0.16, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    if (S.lastMove && S.T - S.lastMove.t < 0.9) {
      ctx.fillStyle = 'rgba(218, 179, 98, 0.22)';
      for (const [x, y] of [[S.lastMove.x0, S.lastMove.y0], [S.lastMove.x1, S.lastMove.y1]]) {
        ctx.fillRect(x * cell, y * cell, cell, cell);
      }
    }
  }

  const pStyle = prefs?.pieceStyle || 'standard';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  for (const p of S.pieces) {
    const isNeutral = p.o < 0;
    const col = !isNeutral ? FAC[p.o].col : '#9aa6b2';
    const isCrownHolder = S.crown && S.crown.state === 'held' && S.crown.holderId === p.id;
    const isSelected = sel && sel.id === p.id;

    let drawX = p.x;
    let drawY = p.y;
    if (!reducedMotion && p.animAt !== undefined && S.T - p.animAt < (p.animDur || 0.14) && S.T >= p.animAt) {
      const prog = (S.T - p.animAt) / (p.animDur || 0.14);
      const ease = 1 - Math.pow(1 - prog, 3);
      drawX = p.animFromX + (p.x - p.animFromX) * ease;
      drawY = p.animFromY + (p.y - p.animFromY) * ease;
    }

    const cx = drawX * cell + cell / 2;
    const cy = drawY * cell + cell / 2;
    const rad = cell * (isNeutral ? 0.35 : 0.43) * (isSelected ? 1.06 : 1);

    ctx.save();
    ctx.fillStyle = 'rgba(10, 14, 12, 0.42)';
    ctx.beginPath();
    ctx.arc(cx, cy + cell * 0.04, rad, 0, Math.PI * 2);
    ctx.fill();

    if ((pStyle === 'heraldic' || pStyle === 'medieval') && !isNeutral) {
      ctx.fillStyle = '#1b221e';
      ctx.strokeStyle = isCrownHolder ? '#ffdf7e' : col;
      ctx.lineWidth = isCrownHolder ? 2.8 : 2.1;
      ctx.beginPath();
      for (let k = 0; k < 8; k++) {
        const ang = (Math.PI / 4) * k + Math.PI / 8;
        const vx = cx + Math.cos(ang) * rad;
        const vy = cy + Math.sin(ang) * rad;
        if (k === 0) ctx.moveTo(vx, vy);
        else ctx.lineTo(vx, vy);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else if (pStyle === 'minimal') {
      ctx.fillStyle = isNeutral ? 'rgba(42, 50, 45, 0.58)' : 'rgba(22, 28, 25, 0.82)';
      ctx.strokeStyle = isCrownHolder ? '#ffdf7e' : col;
      ctx.lineWidth = isNeutral ? 1.3 : 2.2;
      ctx.beginPath();
      ctx.arc(cx, cy, rad, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else {
      const grad = ctx.createRadialGradient(cx - rad * 0.25, cy - rad * 0.25, rad * 0.1, cx, cy, rad);
      if (isNeutral) {
        grad.addColorStop(0, '#4c5750');
        grad.addColorStop(1, '#242b26');
      } else {
        grad.addColorStop(0, '#323e38');
        grad.addColorStop(1, '#161c19');
      }
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, rad, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = isCrownHolder ? '#ffdf7e' : isNeutral ? '#78847d' : col;
      ctx.lineWidth = isCrownHolder ? 2.8 : p.t === 'K' ? 2.4 : 1.9;
      ctx.stroke();
      if (!isNeutral) {
        ctx.strokeStyle = col + '66';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(cx, cy, rad * 0.82, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    if (p.o >= 0 && p.t === 'K') {
      ctx.strokeStyle = '#f0c869';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(cx, cy, cell * 0.46, 0, Math.PI * 2);
      ctx.stroke();
      if (S.att && (S.att[p.y]?.[p.x] & ~(1 << p.o)) !== 0) {
        ctx.strokeStyle = '#ff5468';
        ctx.lineWidth = 2.8;
        ctx.beginPath();
        ctx.arc(cx, cy, cell * 0.5, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    if (isCrownHolder) {
      const cPulse = reducedMotion ? 0.47 : 0.46 + Math.sin(S.T * 6) * 0.03;
      ctx.strokeStyle = '#ffdf7e';
      ctx.lineWidth = 2.3;
      ctx.beginPath();
      ctx.arc(cx, cy, cell * cPulse, 0, Math.PI * 2);
      ctx.stroke();
    }

    if (p.shield > 0) {
      ctx.strokeStyle = '#7fd8ff';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.arc(cx, cy, cell * 0.37, 0, Math.PI * 2);
      ctx.stroke();
    }

    if (p.chargeUntil && p.chargeUntil > S.T) {
      ctx.strokeStyle = '#ffd978';
      ctx.lineWidth = 2;
      ctx.setLineDash([3, 2]);
      ctx.beginPath();
      ctx.arc(cx, cy, cell * 0.46, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Larger, sharper glyph silhouettes
    ctx.font = Math.floor(cell * (isNeutral ? 0.62 : 0.74)) + 'px "Segoe UI Symbol","Noto Sans Symbols 2","DejaVu Sans",serif';
    ctx.lineWidth = Math.max(2.2, cell * 0.065);
    ctx.strokeStyle = '#0f1411';
    ctx.strokeText(GLYPH[p.t], cx, cy + cell * 0.02);
    ctx.fillStyle = isCrownHolder ? '#ffe699' : p.o === viewerSide ? '#d8edf5' : col;
    if (!isNeutral && p.o !== viewerSide) ctx.fillStyle = col;
    ctx.fillText(GLYPH[p.t], cx, cy + cell * 0.02);

    const rem = p.ready - S.T;
    if (rem > 0 && p.o >= 0) {
      const frac = Math.min(1, rem / (p.cd0 || 1));
      ctx.fillStyle = 'rgba(14, 18, 16, 0.4)';
      ctx.beginPath();
      ctx.arc(cx, cy, rad, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 223, 126, 0.9)';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(cx, cy, rad + 1, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac);
      ctx.stroke();
    }

    if (p.q) {
      ctx.strokeStyle = '#cfaf72';
      ctx.lineWidth = 2;
      ctx.strokeRect(p.q[0] * cell + 3, p.q[1] * cell + 3, cell - 6, cell - 6);
    }

    if (p.o >= 0 && S.f[p.o]?.boostUntil > S.T) {
      ctx.strokeStyle = col + 'dd';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.arc(cx, cy, cell * 0.47, 0, Math.PI * 2);
      ctx.stroke();
    }

    if (isCrownHolder) {
      ctx.font = Math.max(10, Math.floor(cell * 0.36)) + 'px system-ui';
      ctx.fillText('👑', cx + cell * 0.28, cy - cell * 0.28);
    }
    ctx.restore();
  }

  for (const e of S.fx || []) {
    const k = (S.T - e.t) / 0.65;
    ctx.strokeStyle = e.col;
    ctx.globalAlpha = Math.max(0, 1 - k);
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(e.x * cell + cell / 2, e.y * cell + cell / 2, cell * (0.25 + k * (e.big ? 1 : 0.7)), 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
}
