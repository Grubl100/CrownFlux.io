const RECORDS_KEY = 'cf_classic_records_v1';
const MAX_RECORDS = 30;

export function loadClassicRecords() {
  try {
    const raw = localStorage.getItem(RECORDS_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function saveClassicRecord(record) {
  if (!record || !record.id) return;
  try {
    const existing = loadClassicRecords().filter((r) => r.id !== record.id);
    const next = [record, ...existing].slice(0, MAX_RECORDS);
    localStorage.setItem(RECORDS_KEY, JSON.stringify(next));
  } catch {
    // ignore storage quota errors
  }
}

export function getClassicRecord(matchId) {
  if (!matchId) return null;
  return loadClassicRecords().find((r) => r.id === matchId) || null;
}

export function saveClassicAnalysisCache(matchId, analysis) {
  if (!matchId || !analysis) return;
  try {
    sessionStorage.setItem(`cf_classic_analysis_${matchId}`, JSON.stringify(analysis));
  } catch {
    // ignore
  }
}

export function loadClassicAnalysisCache(matchId) {
  if (!matchId) return null;
  try {
    const raw = sessionStorage.getItem(`cf_classic_analysis_${matchId}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
