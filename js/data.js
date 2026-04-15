import { readSheet, appendRow } from './sheets.js';
import { METRICS_ALL, METRICS_SENIOR, METRIC_CONFIG } from './config.js';

let cache = null;

export async function loadAllData() {
  const [clubs, teams, players, sessions, results] = await Promise.all([
    readSheet('clubs'),
    readSheet('teams'),
    readSheet('players'),
    readSheet('sessions'),
    readSheet('results'),
  ]);
  cache = { clubs, teams, players, sessions, results };
  return cache;
}

export function getData() {
  return cache;
}

export function findPreviousSession(sessions, teamId, currentSessionId) {
  const current = sessions.find(s => s.id === currentSessionId);
  if (!current) return null;
  const earlier = sessions
    .filter(s => s.team_id === teamId && s.id !== currentSessionId && s.date < current.date)
    .sort((a, b) => b.date.localeCompare(a.date));
  return earlier[0] ?? null;
}

export function getPlayerResult(results, playerId, sessionId) {
  return results.find(r => r.player_id === playerId && r.session_id === sessionId) ?? null;
}

export function masToSeconds(min, sec) {
  return parseFloat(min) * 60 + parseFloat(sec);
}

export function formatMas(min, sec) {
  return `${parseInt(min)}:${String(parseInt(sec)).padStart(2, '0')}`;
}

export function getNumericValue(result, metric) {
  if (!result) return null;
  if (metric === 'mas') return masToSeconds(result.mas_min, result.mas_sec);
  const v = parseFloat(result[metric]);
  return isNaN(v) ? null : v;
}

export function getDisplayValue(result, metric) {
  if (!result) return '—';
  if (metric === 'mas') {
    if (!result.mas_min && !result.mas_sec) return '—';
    return formatMas(result.mas_min, result.mas_sec);
  }
  return result[metric] || '—';
}

export function computeMetricStats(results, metric) {
  const values = results
    .map(r => getNumericValue(r, metric))
    .filter(v => v !== null);
  if (values.length === 0) return { min: 0, max: 0, avg: 0, count: 0 };
  const sum = values.reduce((a, b) => a + b, 0);
  return { min: Math.min(...values), max: Math.max(...values), avg: sum / values.length, count: values.length };
}

export function sortResultsByMetric(results, metric, higherIsBetter) {
  return [...results].sort((a, b) => {
    const va = getNumericValue(a, metric) ?? 0;
    const vb = getNumericValue(b, metric) ?? 0;
    return higherIsBetter ? vb - va : va - vb;
  });
}

export function getMetricsForTeamType(teamType) {
  return teamType === 'Senior' ? [...METRICS_ALL, ...METRICS_SENIOR] : [...METRICS_ALL];
}

export async function saveSession(teamId, date, resultsMap) {
  // resultsMap: { [playerId]: { height, weight, cmj, sprint_20m, mas_min, mas_sec, ... } }
  const sessionId = `sess_${Date.now()}`;
  await appendRow('sessions', [sessionId, teamId, date]);
  for (const [playerId, r] of Object.entries(resultsMap)) {
    const rowId = `res_${Date.now()}_${playerId}`;
    await appendRow('results', [
      rowId, sessionId, playerId,
      r.height ?? '', r.weight ?? '', r.cmj ?? '', r.sprint_20m ?? '',
      r.mas_min ?? '', r.mas_sec ?? '',
      r.body_fat_pct ?? '', r.body_fat_mass ?? '', r.skeletal_muscle_mass ?? '',
    ]);
  }
  return sessionId;
}
