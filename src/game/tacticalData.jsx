import React from 'react';
import { fmtSecs, manhattan } from '../utils/format.js';

export const TACTICAL_COLS = 'ABCDEFGHIJKLMNOP';
export const cellName = (x, y) => `${TACTICAL_COLS[x] || x}${y + 1}`;

export const CARD_TYPE = {
  short_teleport: 'Movimento',
  crown_dash: 'Movimento',
  flux_wall: 'Bloqueio',
  flux_siphon: 'Sabotagem',
  kinetic_push: 'Combate',
  royal_charge: 'Avanço',
  transposition: 'Tática',
  stamina_overcharge: 'Energia',
};

export const RULE_HINT = {
  move: 'Movimento: 1 casa para cima, baixo, esquerda ou direita (1 PA), sem parede nem jogador no destino.',
  short_teleport: 'Teleporte Curto: escolha uma casa livre a 1 ou 2 passos de distância (paredes no caminho não bloqueiam).',
  flux_wall: 'Barreira de Fluxo: escolha uma casa vazia a até 4 passos, sem jogadores e que não seja a Coroa livre.',
  crown_dash: 'Impulso Real: destino na mesma linha ou coluna, de 1 a 3 casas, sem parede nem jogador.',
  royal_charge: 'Investida Real: avance até 2 casas em linha reta para empurrar um inimigo adjacente.',
  transposition: 'Transposição: clique em uma Barreira de Fluxo sua a até 5 casas para trocar de posição.',
};

export function cardChips(card) {
  const chips = [`Custo ${card.cost} PA`];
  if (card.id === 'short_teleport') chips.push(`Alcance 1–${card.range}`, 'Alvo: casa livre');
  else if (card.id === 'crown_dash') chips.push(`Linha reta 1–${card.range}`, 'Alvo: casa livre');
  else if (card.id === 'royal_charge') chips.push(`Linha reta 1–${card.range}`, 'Empurra adjacente');
  else if (card.id === 'flux_wall') chips.push(`Alcance 0–${card.range}`, `${card.durationRounds || 2} rodadas`);
  else if (card.id === 'flux_siphon') chips.push('Alvo automático', 'Drena Coroa');
  else if (card.id === 'kinetic_push') chips.push(`Alcance 1–${card.range}`, 'Empurra & derruba Coroa');
  else if (card.id === 'transposition') chips.push(`Alcance 1–${card.range}`, 'Troca com Barreira');
  else if (card.id === 'stamina_overcharge') chips.push('Custo 0 PA', '+2 PA agora / −1 próximo');
  return chips;
}

export function targetsFor(action, ctx) {
  const out = [];
  const occupied = (x, y) => (ctx.me.x === x && ctx.me.y === y) || ctx.others.some((o) => o.x === x && o.y === y);
  const wall = (x, y) => ctx.walls.has(`${x},${y}`);
  for (let y = 0; y < ctx.n; y++) {
    for (let x = 0; x < ctx.n; x++) {
      const d = manhattan(ctx.me.x, ctx.me.y, x, y);
      let ok = false;
      if (action === 'move') ok = d === 1 && !wall(x, y) && !occupied(x, y);
      else if (action === 'short_teleport') ok = d >= 1 && d <= 2 && !wall(x, y) && !occupied(x, y);
      else if (action === 'flux_wall') ok = d <= 4 && !wall(x, y) && !occupied(x, y) && !(ctx.crown.holder === null && ctx.crown.x === x && ctx.crown.y === y);
      else if (action === 'crown_dash') {
        const dx = Math.abs(x - ctx.me.x);
        const dy = Math.abs(y - ctx.me.y);
        ok = ((dx === 0 && dy > 0 && dy <= 3) || (dy === 0 && dx > 0 && dx <= 3)) && !wall(x, y) && !occupied(x, y);
      } else if (action === 'royal_charge') {
        const dx = Math.abs(x - ctx.me.x);
        const dy = Math.abs(y - ctx.me.y);
        ok = ((dx === 0 && dy > 0 && dy <= 2) || (dy === 0 && dx > 0 && dx <= 2)) && !wall(x, y) && !occupied(x, y);
      } else if (action === 'transposition') {
        ok = d >= 1 && d <= 5 && ctx.myWalls && ctx.myWalls.has(`${x},${y}`);
      }
      if (ok) out.push([x, y]);
    }
  }
  return out;
}

export function describeTacticalEvent(ev, st, myName, enemyName) {
  const has = ev.side !== null && ev.side !== undefined;
  const who = has ? (ev.side === st.side ? myName : enemyName) : '';
  const mine = has && ev.side === st.side;
  const d = ev.data || {};
  const rules = st.rules || { crownHoldGoal: 3, turnLimitMs: 15000 };
  switch (ev.type) {
    case 'match_start': return 'Partida iniciada. A Coroa aguarda no tabuleiro.';
    case 'turn_start': return mine ? `Sua vez: ${d.ap} PA disponíveis.` : `Vez de ${who} (${d.ap} PA).`;
    case 'move': return d.to ? `${who} moveu para ${cellName(d.to.x, d.to.y)}.` : `${who} se moveu fora do seu campo de visão.`;
    case 'card_played':
      if (d.cardId === 'flux_siphon') return mine ? `Você usou ${d.cardName}: ${enemyName} começa o próximo turno com −1 PA.` : `${who} usou ${d.cardName}: você começa o próximo turno com −1 PA.`;
      if (d.cardId === 'flux_wall' && d.target) return `${who} ergueu uma ${d.cardName} em ${cellName(d.target.x, d.target.y)}.`;
      if (d.target && Number.isFinite(d.target.x)) return `${who} usou ${d.cardName} até ${cellName(d.target.x, d.target.y)}.`;
      return `${who} usou ${d.cardName}.`;
    case 'crown_protected_hit': return '🔒 Coroa protegida! O ataque empurrou o portador, mas não derrubou a Coroa.';
    case 'challenge_completed': return `🎯 ${who} concluiu o desafio "${d.label}" (+1 carta e +1 PA)!`;
    case 'flux_zone_bonus': return `⚡ ${who} terminou na Zona de Fluxo (+1 PA no próximo turno).`;
    case 'crown_streak_bonus': return `👑 ${who} manteve a Coroa por 2 turnos e comprou ${d.cardName}!`;
    case 'crown_captured': return mine ? `Você capturou a Coroa! Sobreviva por ${rules.crownHoldGoal || 3} turnos para vencer.` : `${who} capturou a Coroa! Ataque-o para derrubá-la.`;
    case 'crown_dropped': return `Coroa derrubada no chão em ${cellName(d.x, d.y)}!`;
    case 'crown_stolen': return `${who} roubou a Coroa em combate corpo a corpo!`;
    case 'melee_attack': return `${who} atacou o adversário em combate corpo a corpo (1 PA).`;
    case 'knockback': return `${who} empurrou o adversário para trás!`;
    case 'crown_vp': return `${who} manteve a Coroa (+1 turno de domínio: ${d.vp}/${d.goal || 3}).`;
    case 'turn_end':
      if (d.reason === 'auto_no_actions') return `${who} ficou sem ações/PA — turno passado automaticamente (${fmtSecs(d.ms)}).`;
      return d.reason === 'timeout' ? `${who} atingiu o limite de ${Math.round((rules.turnLimitMs || 15000) / 1000)}s.` : `${who} encerrou o turno em ${fmtSecs(d.ms)}.`;
    case 'draft_start': return 'Fase de Draft: cada jogador escolhe 1 de 3 cartas.';
    case 'draft_pick': return mine ? `Você adicionou ${d.cardName} à mão.` : `${who} escolheu uma carta.`;
    case 'match_end': return d.reason || 'Partida encerrada.';
    default: return '';
  }
}

export function CrownSvg({ className = '' }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M3 17.5l1.6-9 4.6 4 2.8-7 2.8 7 4.6-4 1.6 9z" />
      <rect x="3" y="18.8" width="18" height="2.4" rx=".6" />
    </svg>
  );
}

export function WallSvg({ isNew = false }) {
  return (
    <svg className={`ts-wall${isNew ? ' new' : ''}`} viewBox="0 0 20 20" preserveAspectRatio="none" aria-hidden="true">
      <rect x="1" y="2" width="18" height="17" rx="1.5" fill="#6e687e" />
      <path d="M1 7.5h18M1 13h18M7 2v5.5M13 2v5.5M4 7.5V13M10 7.5V13M16 7.5V13M7 13v6M13 13v6" stroke="#4a4659" strokeWidth="1" />
      <rect x="1" y="2" width="18" height="1.6" fill="#8a84a0" />
    </svg>
  );
}

export function WardenSvg() {
  return (
    <svg viewBox="0 0 64 80" aria-hidden="true">
      <path d="M19 29C15 44 13 60 11 76h42c-2-16-4-32-8-47z" fill="#2d4855" />
      <path d="M19 29c-3 15-4.5 31-5.5 47H20c.5-16 1.5-31 3.5-45z" fill="#223a45" />
      <path d="M45 29c3 15 5 31 6 47h-5c-.5-16-2-31-4.5-45z" fill="#26404c" />
      <path d="M24.5 57h6.5v17h-6.5z" fill="#858e89" /><path d="M33 57h6.5v17H33z" fill="#747d78" />
      <path d="M22 29h20l2.5 13-2 16h-21l-2-16z" fill="#a3aca7" />
      <path d="M25 30h14v27l-7 5-7-5z" fill="#4c7d94" />
      <rect x="21.5" y="45" width="21" height="3" rx=".6" fill="#5b4631" />
      <rect x="30.4" y="44.6" width="3.2" height="3.8" rx=".6" fill="#cfaf72" />
      <rect x="47.3" y="9" width="2.6" height="31" rx="1" fill="#e1e5e2" />
      <path d="M7.5 34h17v11c0 8-4 12.5-8.5 15-4.5-2.5-8.5-7-8.5-15z" fill="#3b6679" stroke="#cfaf72" strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M23.5 15c0-8 17-8 17 0v12c-5 3-12 3-17 0z" fill="#c6cdc9" />
      <rect x="25.2" y="18.2" width="13.6" height="2.4" rx="1" fill="#262a28" />
      <path d="M32 8c2-5 7-6.5 11-4.5-3.5.6-6 2.8-7.5 6.6z" fill="#4c7d94" />
    </svg>
  );
}

export function BesiegerSvg() {
  return (
    <svg viewBox="0 0 64 80" aria-hidden="true">
      <rect x="12.6" y="4" width="1.8" height="34" fill="#4a3a2f" />
      <path d="M14.4 5h11l-3 4.5 3 4.5h-11z" fill="#a4585a" stroke="#b79560" strokeWidth=".7" />
      <path d="M18 28c-5 16-6.5 32-8 48h44c-1.5-16-3-32-8-48z" fill="#5a3032" />
      <path d="M21 28h22l3 13-2.5 17H21l-2.5-17z" fill="#6b3b3d" />
      <path d="M26 30h12v26l-6 4.5-6-4.5z" fill="#a4585a" />
      <rect x="20.5" y="47" width="23" height="3" rx=".6" fill="#2c2420" />
      <rect x="30.3" y="46.6" width="3.4" height="3.8" rx=".6" fill="#b79560" />
      <rect x="48.4" y="3" width="2.2" height="72" rx="1" fill="#5c4632" />
      <path d="M50.6 8c7 1.5 9 5 9 9s-2 7.5-9 9z" fill="#cbc5bd" />
      <path d="M22.5 22.5c0-11 19-11 19 0l3.5 3.2c-8 2-18 2-26 0z" fill="#8f8882" />
      <rect x="24.5" y="19.4" width="15" height="2.2" rx="1" fill="#1f1a18" />
    </svg>
  );
}

export function CardArtSvg({ id }) {
  switch (id) {
    case 'short_teleport':
      return <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="33" r="4.5" /><circle cx="37" cy="33" r="4.5" strokeDasharray="3 3" /><path d="M14 26c4-11 16-11 20-1" strokeDasharray="4 3.5" /><path d="M29.5 22.5l4.6 3.2 3.2-4.6" /></svg>;
    case 'flux_siphon':
      return <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><circle cx="37" cy="13" r="5" /><circle cx="11" cy="35" r="4.5" fill="currentColor" fillOpacity=".25" /><path d="M33 17c-5 3-6 8-10 11s-6 3-8 4" /><path d="M15.5 27.5l-1 4.6 4.6.8" /></svg>;
    case 'flux_wall':
      return <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round"><rect x="8" y="12" width="32" height="26" rx="2" /><path d="M8 20.5h32M8 29h32M18 12v8.5M30 12v8.5M13 20.5V29M24 20.5V29M35 20.5V29M18 29v9M30 29v9" /></svg>;
    case 'crown_dash':
      return <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round"><path d="M11 28l2.6-12 6.4 5.5 4-8.5 4 8.5 6.4-5.5L37 28z" /><path d="M11 32.5h26" /><path d="M9 40h26m-4-4 4 4-4 4" /></svg>;
    case 'kinetic_push':
      return <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M10 24h24" /><path d="M26 16l8 8-8 8" /><path d="M38 12v24" /></svg>;
    case 'royal_charge':
      return <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M8 24h26" /><path d="M26 15l9 9-9 9" /><path d="M14 14v20" /></svg>;
    case 'transposition':
      return <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round"><path d="M12 18h20l-5-5" /><path d="M36 30H16l5 5" /></svg>;
    case 'stamina_overcharge':
      return <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M26 6L12 26h12l-2 16 14-20H24z" /></svg>;
    default:
      return null;
  }
}
