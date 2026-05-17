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

const toObjects = (rows, keys) =>
  rows.slice(1).map(r => Object.fromEntries(keys.map((k, i) => [k, r[i] || ''])));

async function loadViewerData() {
  const [clubRows, teamRows, playerRows, sessionRows, resultRows] = await Promise.all([
    readSheetPublic('clubs!A:C'),
    readSheetPublic('teams!A:D'),
    readSheetPublic('players!A:C'),
    readSheetPublic('sessions!A:C'),
    readSheetPublic('results!A:M'),
  ]);

  viewerCache.clubs   = toObjects(clubRows,   ['id', 'name', 'logo_url']);
  viewerCache.teams   = toObjects(teamRows,   ['id', 'club_id', 'name', 'type']);
  viewerCache.players = toObjects(playerRows, ['id', 'team_id', 'name']);
  viewerCache.sessions = toObjects(sessionRows, ['id', 'team_id', 'date']);
  viewerCache.results = toObjects(resultRows, [
    'id', 'session_id', 'player_id',
    'height', 'weight', 'cmj', 'sprint_20m',
    'mas_min', 'mas_sec',
    'body_fat_pct', 'body_fat_mass', 'skeletal_muscle_mass',
  ]);
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

// ── Team list view ───────────────────────────────────────────────────────────

function renderTeamView(app, club, team, sessions, selectedSessionId) {
  const sessionId = selectedSessionId || (sessions[0] && sessions[0].id) || null;
  const teamPlayers = viewerCache.players.filter(p => p.team_id === team.id);
  const sessionResults = sessionId
    ? viewerCache.results.filter(r => r.session_id === sessionId)
    : [];

  const sessionOptions = sessions
    .map(s => `<option value="${s.id}"${s.id === sessionId ? ' selected' : ''}>${s.date}</option>`)
    .join('');

  const playerRows = teamPlayers.map(player => {
    const result = sessionResults.find(r => r.player_id === player.id);
    const cmjDisplay = result && parseFloat(result.cmj) > 0
      ? parseFloat(result.cmj).toFixed(1) + ' cm'
      : '—';
    const parts = player.name.trim().split(/\s+/);
    const initials = parts.length >= 2
      ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
      : (player.name.slice(0, 2)).toUpperCase();

    return `
      <div class="viewer-player-row" data-player-id="${player.id}">
        <div class="viewer-avatar">${initials}</div>
        <div class="viewer-player-name">${player.name}</div>
        <div class="viewer-player-score">${cmjDisplay}</div>
        <div class="viewer-chevron">›</div>
      </div>`;
  }).join('');

  app.innerHTML = `
    ${renderViewerHeader(club, team)}
    <div class="viewer-session-bar">
      <span class="viewer-session-label">Session</span>
      <select id="viewer-session-select" class="viewer-session-select">
        ${sessionOptions}
      </select>
    </div>
    <div class="viewer-player-list">
      ${playerRows || '<div style="padding:20px;color:#888;">No players found.</div>'}
    </div>`;

  document.getElementById('viewer-session-select').addEventListener('change', e => {
    renderTeamView(app, club, team, sessions, e.target.value);
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
  return `<span class="viewer-delta ${cls}">${sign}${diff.toFixed(2)}${unit}</span>`;
}

// ── Metric cards ─────────────────────────────────────────────────────────────

function buildMetricCards(team, sessionId, playerId, sessions) {
  const isSenior = (team.type || '').toLowerCase() === 'senior';
  const metricKeys = isSenior ? [...METRICS_ALL, ...METRICS_SENIOR] : [...METRICS_ALL];

  const sessionResults = viewerCache.results.filter(r => r.session_id === sessionId);
  const currResult = sessionResults.find(r => r.player_id === playerId) || null;

  // Previous session: sessions are sorted descending, so index + 1
  const currIdx = sessions.findIndex(s => s.id === sessionId);
  const prevSession = currIdx >= 0 && currIdx + 1 < sessions.length ? sessions[currIdx + 1] : null;
  const prevResults = prevSession
    ? viewerCache.results.filter(r => r.session_id === prevSession.id)
    : [];
  const prevResult = prevResults.find(r => r.player_id === playerId) || null;

  return metricKeys.map(key => {
    const cfg = METRIC_CONFIG[key];
    const displayVal = getDisplayValue(currResult, key);
    const valStr = displayVal !== null
      ? (typeof displayVal === 'number' ? displayVal.toFixed(2) + (cfg.unit ? ' ' + cfg.unit : '') : displayVal)
      : '—';
    const pct = (currResult && displayVal !== null && typeof displayVal === 'number')
      ? getProgressPct(key, displayVal, sessionResults, cfg)
      : 50;
    const deltaHtml = (currResult && typeof displayVal === 'number')
      ? (getDelta(key, displayVal, prevResult, cfg) || '')
      : '';

    return `
      <div class="viewer-metric-card">
        <div class="viewer-metric-top">
          <span class="viewer-metric-label">${cfg.label}</span>
          <span class="viewer-metric-value">${valStr}</span>
          ${deltaHtml}
        </div>
        <div class="viewer-prog-bar">
          <div class="viewer-prog-fill" style="width:${Math.round(Math.min(100, Math.max(0, pct)))}%"></div>
        </div>
      </div>`;
  }).join('');
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
    app.innerHTML = `<div style="padding:32px;text-align:center;color:#c62828;">
      Failed to load data. Please check your API key configuration.<br>
      <small>${err.message}</small>
    </div>`;
    return;
  }

  const team = viewerCache.teams.find(t => t.id === teamId);
  if (!team) {
    app.innerHTML = '<div style="padding:32px;text-align:center;color:#888;">Team not found.</div>';
    return;
  }

  const club = viewerCache.clubs.find(c => c.id === team.club_id) || null;

  // Sessions for this team, newest first
  const sessions = viewerCache.sessions
    .filter(s => s.team_id === team.id)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  if (!sessions.length) {
    app.innerHTML = renderViewerHeader(club, team) +
      '<div style="padding:32px;text-align:center;color:#888;">No sessions yet.</div>';
    return;
  }

  renderTeamView(app, club, team, sessions, sessions[0].id);
}
