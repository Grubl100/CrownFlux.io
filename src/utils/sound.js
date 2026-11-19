let audioCtx = null;

export function playTone(kind, enabled = true) {
  if (!enabled) return;
  try {
    const AudioCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtor) return;
    if (!audioCtx) audioCtx = new AudioCtor();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    const now = audioCtx.currentTime;
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
    };
    const [f0, f1, dur, type, vol] = profiles[kind] || profiles.move;
    osc.type = type;
    osc.frequency.setValueAtTime(f0, now);
    osc.frequency.exponentialRampToValueAtTime(f1, now + dur);
    gainNode.gain.setValueAtTime(vol, now);
    gainNode.gain.exponentialRampToValueAtTime(0.001, now + dur);
    osc.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    osc.start(now);
    osc.stop(now + dur);
  } catch {
    // ignore WebAudio restrictions
  }
}
