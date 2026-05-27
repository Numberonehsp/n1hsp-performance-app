import { readSheetPublic } from './sheets.js';
import { METRIC_CONFIG, METRICS_ALL, METRICS_SENIOR } from './config.js';

// Module-level cache populated once per page load
const viewerCache = {
  clubs: [],
  teams: [],
  players: [],
  sessions: [],
  results: [],
};

// Maps every session_id → array of all session_ids sharing the same team+date.
// Built after loadViewerData(). Ensures same-day split sessions are merged in all views.
let mergedSessionIds = {}; // { sessionId: [sessionId, ...sameDay] }

function buildMergedSessionMap() {
  mergedSessionIds = {};
  const byKey = {}; // `${team_id}::${date}` → [session_ids]
  viewerCache.sessions.forEach(s => {
    const key = `${s.team_id}::${s.date}`;
    if (!byKey[key]) byKey[key] = [];
    byKey[key].push(s.id);
  });
  Object.values(byKey).forEach(ids => ids.forEach(id => { mergedSessionIds[id] = ids; }));
}

// Returns all results for a session, including any split sessions on the same day.
function getResultsForSession(sessionId) {
  const ids = mergedSessionIds[sessionId] || [sessionId];
  return viewerCache.results.filter(r => ids.includes(r.session_id));
}

// Returns a single merged result for a player from all matching rows.
// Fields are filled from any row that has a non-empty value, with later rows
// taking precedence for the same field. This handles split sessions caused by
// wifi drops where different metrics landed in different session rows.
function lastResultFor(results, playerId) {
  const matches = results.filter(r => r.player_id === playerId);
  if (matches.length === 0) return null;
  if (matches.length === 1) return matches[0];
  const merged = { ...matches[0] };
  for (let i = 1; i < matches.length; i++) {
    for (const [k, v] of Object.entries(matches[i])) {
      if (v !== '' && v !== null && v !== undefined) merged[k] = v;
    }
  }
  return merged;
}

// Use the sheet's own header row as keys (trimmed), same approach as readSheet().
// Also trims every cell value so whitespace differences don't break comparisons.
// Skips entirely blank rows.
const toObjects = (rows) => {
  if (rows.length < 2) return [];
  const [headers] = rows;
  const keys = headers.map(h => (h || '').toString().trim());
  return rows.slice(1)
    .filter(row => row.some(c => (c || '').toString().trim() !== ''))
    .map(row => Object.fromEntries(keys.map((k, i) => [k, (row[i] ?? '').toString().trim()])));
};

// Ensures objects always have an `id` field regardless of whether the sheet
// column is named `id`, `session_id`, `team_id`, `player_id`, etc.
function normalizeId(obj, ...aliases) {
  if (!obj.id) {
    for (const k of aliases) {
      if (obj[k]) { obj.id = obj[k]; break; }
    }
  }
  return obj;
}

// Returns the list of metrics visible in the coach viewer for a given team.
// Reads the `hidden_metrics` column from the teams tab (comma-separated metric keys,
// e.g. "weight" or "weight,body_fat_pct"). Hidden metrics are excluded from the
// team ranked list, player scorecards, and the metric selector.
// Only affects the coach/player viewer — the admin team report is unaffected.
function getVisibleMetrics(team) {
  const isSenior = (team.type || '').toLowerCase() === 'senior';
  const all = isSenior ? [...METRICS_ALL, ...METRICS_SENIOR] : [...METRICS_ALL];
  const hidden = new Set(
    (team.hidden_metrics || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
  );
  return hidden.size ? all.filter(m => !hidden.has(m)) : all;
}

async function loadViewerData() {
  const [clubRows, teamRows, playerRows, sessionRows, resultRows] = await Promise.all([
    readSheetPublic('clubs!A:D'),
    readSheetPublic('teams!A:F'),
    readSheetPublic('players!A:D'),
    readSheetPublic('sessions!A:E'),
    readSheetPublic('results!A:N'),
  ]);

  viewerCache.clubs    = toObjects(clubRows).map(o   => normalizeId(o, 'club_id'));
  viewerCache.teams    = toObjects(teamRows).map(o   => normalizeId(o, 'team_id'));
  viewerCache.players  = toObjects(playerRows).map(o => normalizeId(o, 'player_id'));
  viewerCache.sessions = toObjects(sessionRows).map(o => normalizeId(o, 'session_id'));
  viewerCache.results  = toObjects(resultRows);
  buildMergedSessionMap();
}

// Returns (or creates) the viewer root container, hiding all normal views
function getViewerRoot() {
  let root = document.getElementById('viewer-root');
  if (!root) {
    root = document.createElement('div');
    root.id = 'viewer-root';
    document.body.appendChild(root);
  }
  // Hide all existing view divs so viewer sits cleanly on top
  document.querySelectorAll('.view').forEach(el => el.classList.add('hidden'));
  return root;
}

// ── Header ──────────────────────────────────────────────────────────────────

function renderViewerHeader(club, team) {
  const logoHtml = club && club.logo_url
    ? `<img class="viewer-logo" src="${club.logo_url}" alt="${club.name} logo">`
    : '';
  const clubName = club ? club.name : '';
  return `
    <div class="viewer-header">
      ${logoHtml}
      <div>
        <div class="viewer-team-name">${team.name}</div>
        ${clubName ? `<div class="viewer-club-name">${clubName}</div>` : ''}
      </div>
    </div>`;
}

// ── Metric value helpers ─────────────────────────────────────────────────────

/**
 * Returns a numeric value for sorting purposes, or null if no data.
 * For MAS, converts min:sec to total seconds (lower = better, higherIsBetter: false).
 */
function getNumericForSort(result, key) {
  if (!result) return null;
  if (key === 'mas') {
    const min = parseInt(result.mas_min) || 0;
    const sec = parseInt(result.mas_sec) || 0;
    return (min || sec) ? min * 60 + sec : null;
  }
  const v = parseFloat(result[key]);
  return isNaN(v) ? null : v;
}

/**
 * Returns a formatted display string for a metric value.
 * 1 decimal: CMJ, height, weight, body fat metrics
 * 2 decimals: sprint_20m
 * MAS: min:sec
 */
function formatMetricDisplay(result, key, cfg) {
  if (!result) return '—';
  if (key === 'mas') {
    const min = parseInt(result.mas_min) || 0;
    const sec = parseInt(result.mas_sec) || 0;
    return (min || sec) ? `${min}:${String(sec).padStart(2, '0')}` : '—';
  }
  const v = parseFloat(result[key]);
  if (isNaN(v)) return '—';
  const decimals = (key === 'sprint_20m') ? 2 : 1;
  return `${v.toFixed(decimals)}${cfg.unit ? ' ' + cfg.unit : ''}`;
}

// ── Team list view ───────────────────────────────────────────────────────────

function renderTeamView(app, club, team, sessions, selectedSessionId, selectedMetricKey) {
  const sessionId = selectedSessionId || (sessions[0] && sessions[0].id) || null;
  const availableMetrics = getVisibleMetrics(team);
  // If the requested metric has been hidden, fall back to the first visible one
  const metricKey = (selectedMetricKey && availableMetrics.includes(selectedMetricKey))
    ? selectedMetricKey
    : (availableMetrics[0] || 'cmj');

  const teamPlayers = viewerCache.players.filter(p => p.team_id === team.id);
  const sessionResults = sessionId
    ? getResultsForSession(sessionId)
    : [];

  const cfg = METRIC_CONFIG[metricKey];

  // Build session options
  const sessionOptions = sessions
    .map(s => `<option value="${s.id}"${s.id === sessionId ? ' selected' : ''}>${s.date}</option>`)
    .join('');

  // Build metric options
  const metricOptions = availableMetrics
    .map(k => `<option value="${k}"${k === metricKey ? ' selected' : ''}>${METRIC_CONFIG[k].label}</option>`)
    .join('');

  // Compute numeric sort value for each player and sort
  const playersWithValues = teamPlayers.map(player => {
    const result = lastResultFor(sessionResults, player.id);
    const sortVal = getNumericForSort(result, metricKey);
    const displayStr = formatMetricDisplay(result, metricKey, cfg);
    const parts = player.name.trim().split(/\s+/);
    const initials = parts.length >= 2
      ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
      : (player.name.slice(0, 2)).toUpperCase();
    return { player, result, sortVal, displayStr, initials };
  });

  // Sort: players with data come first, ranked by metric value (best first)
  // higherIsBetter: true → descending; false (MAS, sprint) → ascending (lower = better)
  playersWithValues.sort((a, b) => {
    if (a.sortVal === null && b.sortVal === null) return 0;
    if (a.sortVal === null) return 1;
    if (b.sortVal === null) return -1;
    return cfg.higherIsBetter
      ? b.sortVal - a.sortVal
      : a.sortVal - b.sortVal;
  });

  // Team bar stats
  const teamSortVals = playersWithValues.map(p => p.sortVal).filter(v => v !== null);
  const hasTeamRange = teamSortVals.length >= 2;
  const teamMin = hasTeamRange ? Math.min(...teamSortVals) : 0;
  const teamMax = hasTeamRange ? Math.max(...teamSortVals) : 1;
  const teamAvgNum = hasTeamRange
    ? teamSortVals.reduce((a, b) => a + b, 0) / teamSortVals.length
    : 0;
  const range = teamMax - teamMin || 1;
  const avgPct = cfg.higherIsBetter
    ? ((teamAvgNum - teamMin) / range) * 100
    : ((teamMax - teamAvgNum) / range) * 100;

  // Previous session results
  const currIdx = sessions.findIndex(s => s.id === sessionId);
  const prevSession = currIdx >= 0 && currIdx + 1 < sessions.length ? sessions[currIdx + 1] : null;
  const prevResults = prevSession
    ? getResultsForSession(prevSession.id)
    : [];

  const playerRows = playersWithValues.map(({ player, result, displayStr, initials, sortVal }, idx) => {
    const rank = sortVal !== null ? idx + 1 : '—';

    const fillPct = (hasTeamRange && sortVal !== null)
      ? Math.min(100, Math.max(0, cfg.higherIsBetter
          ? ((sortVal - teamMin) / range) * 100
          : ((teamMax - sortVal) / range) * 100))
      : null;

    const prevResult = lastResultFor(prevResults, player.id);
    const prevDisplay = formatMetricDisplay(prevResult, metricKey, cfg);
    const showPrev = prevResult && prevDisplay !== '—';

    const barHtml = fillPct !== null ? `
      <div class="viewer-row-bar-wrap">
        <div class="viewer-row-bar-fill" style="width:${fillPct.toFixed(1)}%"></div>
        <div class="viewer-row-avg-line" style="left:${avgPct.toFixed(1)}%"></div>
      </div>` : '';

    const prevHtml = showPrev ? `<div class="viewer-row-prev">Prev: ${prevDisplay}</div>` : '';

    return `
      <div class="viewer-player-row" data-player-id="${player.id}">
        <div class="viewer-rank">${rank}</div>
        <div class="viewer-avatar">${initials}</div>
        <div class="viewer-player-info">
          <div class="viewer-player-name-score">
            <span class="viewer-player-name">${player.name}</span>
            <span class="viewer-player-score">${displayStr}</span>
          </div>
          ${barHtml}${prevHtml}
        </div>
        <div class="viewer-chevron">›</div>
      </div>`;
  }).join('');

  app.innerHTML = `
    ${renderViewerHeader(club, team)}
    <div class="viewer-control-bar">
      <div class="viewer-control-group">
        <span class="viewer-session-label">Session</span>
        <select id="viewer-session-select" class="viewer-session-select">
          ${sessionOptions}
        </select>
      </div>
      <div class="viewer-control-group">
        <span class="viewer-session-label">Metric</span>
        <select id="viewer-metric-select" class="viewer-session-select">
          ${metricOptions}
        </select>
      </div>
    </div>
    <div class="viewer-player-list">
      ${playerRows || '<div style="padding:20px;color:#888;">No players found.</div>'}
    </div>`;

  document.getElementById('viewer-session-select').addEventListener('change', e => {
    renderTeamView(app, club, team, sessions, e.target.value, metricKey);
  });

  document.getElementById('viewer-metric-select').addEventListener('change', e => {
    renderTeamView(app, club, team, sessions, sessionId, e.target.value);
  });

  app.querySelectorAll('.viewer-player-row').forEach(row => {
    row.addEventListener('click', () => {
      renderPlayerScorecard(app, club, team, sessions, sessionId, row.dataset.playerId);
    });
  });
}

// ── Metric helpers ───────────────────────────────────────────────────────────

function getDisplayValue(result, key) {
  if (!result) return null;
  if (key === 'mas') {
    const min = parseInt(result.mas_min) || 0;
    const sec = parseInt(result.mas_sec) || 0;
    if (!min && !sec) return null;
    return `${min}:${String(sec).padStart(2, '0')}`;
  }
  const v = parseFloat(result[key]);
  return isNaN(v) ? null : v;
}

function getProgressPct(metricKey, value, sessionResults, metricConfig) {
  if (metricKey === 'mas') return 50;
  const values = sessionResults
    .map(r => {
      const v = parseFloat(r[metricKey]);
      return isNaN(v) ? null : v;
    })
    .filter(v => v !== null);

  if (values.length < 2) return 50;
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (min === max) return 50;
  return metricConfig.higherIsBetter
    ? ((value - min) / (max - min)) * 100
    : 100 - ((value - min) / (max - min)) * 100;
}

function getDelta(metricKey, currValue, prevResult, metricConfig) {
  if (metricKey === 'mas') return null;
  const prevValue = prevResult ? parseFloat(prevResult[metricKey]) : NaN;
  if (currValue === null || isNaN(currValue) || isNaN(prevValue)) return null;
  const diff = currValue - prevValue;
  const isImprovement = metricConfig.higherIsBetter ? diff > 0 : diff < 0;
  const sign = diff >= 0 ? '+' : '';
  const unit = metricConfig.unit ? ' ' + metricConfig.unit : '';
  const cls = isImprovement ? 'delta-up' : 'delta-dn';
  const decimals = metricKey === 'sprint_20m' ? 2 : 1;
  return { prevValue, diff, sign, unit, cls, decimals };
}

// ── Team stats helper ─────────────────────────────────────────────────────────

function getTeamStats(sessionResults, key) {
  if (key === 'mas') {
    const secs = sessionResults
      .map(r => getNumericForSort(r, 'mas'))
      .filter(v => v !== null);
    if (!secs.length) return null;
    const minV = Math.min(...secs);
    const maxV = Math.max(...secs);
    const avgV = secs.reduce((a, b) => a + b, 0) / secs.length;
    const fmtSec = s => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
    // For MAS lower = better, so "best" is the lowest time
    return {
      min: fmtSec(minV),
      avg: fmtSec(Math.round(avgV)),
      best: fmtSec(minV),
      worst: fmtSec(maxV),
    };
  }
  const cfg = METRIC_CONFIG[key];
  const vals = sessionResults.map(r => parseFloat(r[key])).filter(v => !isNaN(v));
  if (!vals.length) return null;
  const minV = Math.min(...vals);
  const maxV = Math.max(...vals);
  const avgV = vals.reduce((a, b) => a + b, 0) / vals.length;
  const decimals = key === 'sprint_20m' ? 2 : 1;
  const fmt = v => v.toFixed(decimals) + (cfg.unit ? ' ' + cfg.unit : '');
  return {
    min: fmt(minV),
    avg: fmt(avgV),
    best: fmt(cfg.higherIsBetter ? maxV : minV),
    worst: fmt(cfg.higherIsBetter ? minV : maxV),
  };
}

// ── Metric cards ─────────────────────────────────────────────────────────────

function buildMetricCards(team, sessionId, playerId, sessions) {
  const isSenior = (team.type || '').toLowerCase() === 'senior';
  const visibleMetrics = getVisibleMetrics(team);
  const perfKeys = METRICS_ALL.filter(m => visibleMetrics.includes(m));
  const bodyKeys = isSenior ? METRICS_SENIOR.filter(m => visibleMetrics.includes(m)) : [];

  const sessionResults = getResultsForSession(sessionId);
  const currResult = lastResultFor(sessionResults, playerId);

  // Previous session: sessions are sorted descending, so index + 1
  const currIdx = sessions.findIndex(s => s.id === sessionId);
  const prevSession = currIdx >= 0 && currIdx + 1 < sessions.length ? sessions[currIdx + 1] : null;
  const prevResults = prevSession
    ? getResultsForSession(prevSession.id)
    : [];
  const prevResult = lastResultFor(prevResults, playerId);

  function buildOneCard(key) {
    const cfg = METRIC_CONFIG[key];
    const displayVal = getDisplayValue(currResult, key);
    const valStr = formatMetricDisplay(currResult, key, cfg);

    const pct = (currResult && displayVal !== null && typeof displayVal === 'number')
      ? getProgressPct(key, displayVal, sessionResults, cfg)
      : 50;

    // Delta row with previous raw value
    let deltaHtml = '';
    if (currResult && typeof displayVal === 'number') {
      const delta = getDelta(key, displayVal, prevResult, cfg);
      if (delta) {
        const { prevValue, diff, sign, unit, cls, decimals } = delta;
        const prevStr = prevValue.toFixed(decimals) + unit;
        const diffStr = `${sign}${diff.toFixed(decimals)}${unit}`;
        deltaHtml = `<div class="viewer-metric-delta">Previous: ${prevStr} <span class="${cls}">` +
          (diff >= 0 ? '↑' : '↓') + ` ${diffStr}</span></div>`;
      }
    }

    // Team stats
    const stats = getTeamStats(sessionResults, key);
    const teamStatsHtml = stats
      ? `<div class="viewer-team-stats">
          <span>Team min: ${stats.min}</span>
          <span>Team avg: ${stats.avg}</span>
          <span>Team best: ${stats.best}</span>
        </div>`
      : '';

    return `
      <div class="viewer-metric-card">
        <div class="viewer-metric-top">
          <span class="viewer-metric-label">${cfg.label}</span>
          <span class="viewer-metric-value">${valStr}</span>
        </div>
        ${deltaHtml}
        <div class="viewer-prog-bar">
          <div class="viewer-prog-fill" style="width:${Math.round(Math.min(100, Math.max(0, pct)))}%"></div>
        </div>
        ${teamStatsHtml}
      </div>`;
  }

  let html = '';
  if (isSenior) html += '<div class="viewer-section-header">Performance</div>';
  html += perfKeys.map(key => buildOneCard(key)).join('');
  if (bodyKeys.length) {
    html += '<div class="viewer-section-header">Body Composition</div>';
    html += bodyKeys.map(key => buildOneCard(key)).join('');
  }
  return html;
}

// ── Player scorecard view ─────────────────────────────────────────────────────

function renderPlayerScorecard(app, club, team, sessions, currentSessionId, playerId) {
  const player = viewerCache.players.find(p => p.id === playerId);
  if (!player) return;

  const sessionId = currentSessionId || (sessions[0] && sessions[0].id) || null;

  const sessionOptions = sessions
    .map(s => `<option value="${s.id}"${s.id === sessionId ? ' selected' : ''}>${s.date}</option>`)
    .join('');

  const selectedSession = sessions.find(s => s.id === sessionId);
  const sessionDateStr = selectedSession ? selectedSession.date : '';

  const metricCardsHtml = sessionId
    ? buildMetricCards(team, sessionId, playerId, sessions)
    : '';

  app.innerHTML = `
    <div class="viewer-back-bar">
      <button class="viewer-back-btn" id="viewer-back">← Back to team</button>
      <select id="viewer-scorecard-session" class="viewer-session-select">
        ${sessionOptions}
      </select>
    </div>
    <div class="viewer-player-hero">
      <div class="viewer-player-hero-name">${player.name}</div>
      <div class="viewer-player-hero-sub" id="viewer-hero-sub">${team.name} · ${sessionDateStr}</div>
    </div>
    <div class="viewer-metric-list" id="viewer-metric-list">
      ${metricCardsHtml}
    </div>`;

  document.getElementById('viewer-back').addEventListener('click', () => {
    initViewer(team.id);
  });

  document.getElementById('viewer-scorecard-session').addEventListener('change', e => {
    const newSessionId = e.target.value;
    const newSession = sessions.find(s => s.id === newSessionId);
    const newDateStr = newSession ? newSession.date : '';
    document.getElementById('viewer-hero-sub').textContent = `${team.name} · ${newDateStr}`;
    document.getElementById('viewer-metric-list').innerHTML =
      buildMetricCards(team, newSessionId, playerId, sessions);
  });
}

// ── Public entry point ────────────────────────────────────────────────────────

export async function initViewer(teamId) {
  const app = getViewerRoot();
  app.innerHTML = '<div style="padding:32px;text-align:center;color:#888;">Loading…</div>';

  try {
    await loadViewerData();
  } catch (err) {
    const isRateLimit = err.message && err.message.includes('Too many requests');
    app.innerHTML = `<div style="padding:32px;text-align:center;color:#c62828;">
      ${isRateLimit
        ? `<strong>Too many requests — please wait a moment and refresh the page.</strong><br>
           <small style="color:#888;">This happens when several people open their report links at the same time. It resolves automatically in under a minute.</small>`
        : `Failed to load data.<br><small>${err.message}</small>`
      }
    </div>`;
    return;
  }

  const team = viewerCache.teams.find(t => t.id === teamId);
  if (!team) {
    app.innerHTML = '<div style="padding:32px;text-align:center;color:#888;">Team not found.</div>';
    return;
  }

  const club = viewerCache.clubs.find(c => c.id === team.club_id) || null;

  // Sessions for this team, newest first, de-duped by date so split sessions
  // on the same day appear as one entry (results are merged via getResultsForSession).
  const seen = new Set();
  const sessions = viewerCache.sessions
    .filter(s => s.team_id === team.id)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    .filter(s => { if (seen.has(s.date)) return false; seen.add(s.date); return true; });

  if (!sessions.length) {
    app.innerHTML = renderViewerHeader(club, team) +
      '<div style="padding:32px;text-align:center;color:#888;">No sessions yet.</div>';
    return;
  }

  // Use CMJ as default metric, but fall back to the first visible one if CMJ is hidden
  const defaultMetric = getVisibleMetrics(team).includes('cmj') ? 'cmj' : (getVisibleMetrics(team)[0] || 'cmj');
  renderTeamView(app, club, team, sessions, sessions[0].id, defaultMetric);
}
