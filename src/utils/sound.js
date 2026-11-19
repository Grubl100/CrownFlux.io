let audioCtx = null;
let lastTickPlayedAt = 0;

function ensureAudioContext() {
  const AudioCtor = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
  if (!AudioCtor) return null;
  if (!audioCtx) audioCtx = new AudioCtor();
  if (audioCtx.state === 'suspended') {
    const p = audioCtx.resume?.();
    if (p && typeof p.catch === 'function') p.catch(() => {});
  }
  return audioCtx;
}

export function playTone(kind, enabled = true) {
  if (!enabled) return false;
  try {
    const ctx = ensureAudioContext();
    if (!ctx || ctx.state === 'closed') return false;

    if (kind === 'tick' || kind === 'tickUrgent') {
      const nowMs = performance.now();
      if (nowMs - lastTickPlayedAt < 250) return false;
      lastTickPlayedAt = nowMs;
    }

    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();
    const now = ctx.currentTime;
    const profiles = {
      move: [290, 380, 0.06, 'sine', 0.04],
      capture: [420, 210, 0.12, 'triangle', 0.06],
      orb: [520, 760, 0.14, 'sine', 0.05],
      boost: [330, 660, 0.22, 'sawtooth', 0.045],
      crown: [523, 880, 0.28, 'triangle', 0.065],
      shield: [400, 620, 0.14, 'sine', 0.05],
      win: [440, 880, 0.3, 'triangle', 0.06],
      turn: [440, 554, 0.2, 'sine', 0.06],
      hit: [150, 80, 0.24, 'sawtooth', 0.07],
      card: [340, 640, 0.16, 'triangle', 0.07],
      deny: [220, 180, 0.09, 'square', 0.03],
      check: [520, 440, 0.12, 'triangle', 0.05],
      lowtime: [440, 349, 0.16, 'triangle', 0.045],
      tick: [980, 740, 0.032, 'triangle', 0.028],
      tickUrgent: [1180, 860, 0.038, 'triangle', 0.038],
    };
    const [f0, f1, dur, type, vol] = profiles[kind] || profiles.move;
    osc.type = type;
    osc.frequency.setValueAtTime(f0, now);
    osc.frequency.exponentialRampToValueAtTime(f1, now + dur);
    gainNode.gain.setValueAtTime(vol, now);
    gainNode.gain.exponentialRampToValueAtTime(0.0008, now + dur);
    osc.connect(gainNode);
    gainNode.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + dur);
    return true;
  } catch {
    return false;
  }
}

export function resetClockTickGuard() {
  lastTickPlayedAt = 0;
}
