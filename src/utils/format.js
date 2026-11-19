import { CLASSIC_CONTROLS } from './constants.js';

export function fmtTime(s) {
  const sec = Math.max(0, Math.floor(s || 0));
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}

export function fmtChessClock(s) {
  const sec = Math.max(0, Math.ceil(s || 0));
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}

export function fmtMsClock(ms) {
  return fmtTime((ms || 0) / 1000);
}

export function fmtSecs(ms) {
  return `${(Math.max(0, ms || 0) / 1000).toFixed(1)}s`;
}

export function cheb(a, b, c, d) {
  return Math.max(Math.abs(a - c), Math.abs(b - d));
}

export function manhattan(ax, ay, bx, by) {
  return Math.abs(ax - bx) + Math.abs(ay - by);
}

export function rand(n) {
  return Math.floor(Math.random() * n);
}

export function safeGet(key, fallback = 0) {
  try {
    const val = Number(localStorage.getItem(key));
    return Number.isFinite(val) ? val : fallback;
  } catch {
    return fallback;
  }
}

export function safeSet(key, val) {
  try {
    localStorage.setItem(key, String(val));
  } catch {
    // ignore storage errors
  }
}

export function getModeLabel(g) {
  if (!g) return 'Partida';
  if (g.mode === 'classic') {
    const tcLabel = CLASSIC_CONTROLS[g.timeControl]?.label;
    return `Xadrez Clássico${tcLabel ? ` · ${tcLabel}` : ''}`;
  }
  if (g.mode === 'classic_cpu') return 'Xadrez vs Bot';
  if (g.mode === 'classic_local') return 'Xadrez Local';
  if (g.mode === 'cpu') return 'Duelo vs Bot';
  if (g.mode === 'tutorial') return 'Tutorial Duelo';
  if (g.mode === 'duel') return 'Duelo Local';
  if (g.mode === 'arena') return 'Arena 4 Jogadores';
  if (g.mode === 'tactical_cpu') return 'Cerco Tático vs Bot';
  if (g.mode === 'tactical') return 'Cerco Tático Online';
  return 'Duelo 1v1 Online';
}

export function getModeCategory(mode) {
  if (mode === 'classic' || mode === 'classic_cpu' || mode === 'classic_local') return 'classic';
  if (mode === 'tactical' || mode === 'tactical_cpu' || mode === 'tactical_draft') return 'tactical';
  if (mode === 'arena') return 'arena';
  return 'duel';
}
