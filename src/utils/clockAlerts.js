// Controlador determinístico de alertas sonoros e tique-taque do relógio (últimos 15s).
// Sincronizado exclusivamente com o estado autoritativo do relógio da partida (sem setInterval paralelo).

export const LOW_TIME_THRESHOLD_SECONDS = 15;
export const CRITICAL_TIME_THRESHOLD_SECONDS = 5;

export function createClockAlertTracker() {
  return {
    lowTimeAlerted: false,
    lastTickSecond: null,
    lastTurnOwner: null,
  };
}

export function resetClockAlertTracker(tracker) {
  if (!tracker) return;
  tracker.lowTimeAlerted = false;
  tracker.lastTickSecond = null;
  tracker.lastTurnOwner = null;
}

/**
 * Avalia o estado atual do relógio e retorna quais sons devem tocar neste frame.
 * Garante: zero duplicação, parada imediata ao trocar turno, pausar, incrementar >15s ou encerrar partida.
 */
export function evaluateClockAlerts(tracker, {
  over = false,
  paused = false,
  isMyTurn = false,
  turnOwner = 0,
  clockSeconds = 0,
  soundEffects = true,
  lowTimeSound = true,
  clockTickSound = true,
} = {}) {
  const events = [];

  if (over || paused || !isMyTurn) {
    tracker.lastTickSecond = null;
    if (over) tracker.lowTimeAlerted = false;
    if (tracker.lastTurnOwner !== turnOwner) {
      tracker.lastTurnOwner = turnOwner;
      tracker.lastTickSecond = null;
      if (clockSeconds > LOW_TIME_THRESHOLD_SECONDS) {
        tracker.lowTimeAlerted = false;
      }
    }
    return events;
  }

  if (tracker.lastTurnOwner !== turnOwner) {
    tracker.lastTurnOwner = turnOwner;
    tracker.lastTickSecond = null;
  }

  // Tempo acima de 15s (ou recuperado via incremento): rearma alerta e limpa tique-taque
  if (clockSeconds > LOW_TIME_THRESHOLD_SECONDS) {
    if (clockSeconds > LOW_TIME_THRESHOLD_SECONDS + 0.25) {
      tracker.lowTimeAlerted = false;
    }
    tracker.lastTickSecond = null;
    return events;
  }

  // Tempo zerado: não toca tique-taque após esgotar
  if (clockSeconds <= 0) {
    tracker.lastTickSecond = null;
    return events;
  }

  const currentSecond = Math.ceil(clockSeconds); // 15, 14, ..., 1

  // Alerta inicial ao cruzar para <= 15s
  if (!tracker.lowTimeAlerted) {
    tracker.lowTimeAlerted = true;
    if (soundEffects && lowTimeSound) {
      events.push('lowtime');
    }
  }

  // Tique-taque exatamente uma vez por segundo (15..1)
  if (currentSecond <= LOW_TIME_THRESHOLD_SECONDS && currentSecond >= 1) {
    if (tracker.lastTickSecond === null || currentSecond < tracker.lastTickSecond) {
      tracker.lastTickSecond = currentSecond;
      if (soundEffects && clockTickSound) {
        events.push(currentSecond <= CRITICAL_TIME_THRESHOLD_SECONDS ? 'tickUrgent' : 'tick');
      }
    } else if (currentSecond > tracker.lastTickSecond) {
      // Incremento ou ressincronização aumentou os segundos dentro de <= 15s: realinha sem duplicar
      tracker.lastTickSecond = currentSecond;
    }
  }

  return events;
}

export function getClockVisualState(clockSeconds, { active = false, over = false } = {}) {
  if (over) return 'ended';
  if (clockSeconds <= CRITICAL_TIME_THRESHOLD_SECONDS && clockSeconds > 0) return 'critical';
  if (clockSeconds <= LOW_TIME_THRESHOLD_SECONDS && clockSeconds > 0) return 'low';
  if (clockSeconds <= 0) return 'expired';
  return active ? 'active' : 'idle';
}
