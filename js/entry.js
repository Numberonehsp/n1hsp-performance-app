import { getData, findPreviousSession, getPlayerResult, getDisplayValue,
         getMetricsForTeamType, saveSession } from './data.js';
import { METRIC_CONFIG } from './config.js';
import { navigate } from './router.js';

let currentTeam = null;
let currentPlayers = [];
let currentPlayerIndex = 0;
let resultsMap = {};     // { [playerId]: { ...fieldValues } }
let skippedSet = new Set();
let previousResults = {}; // { [playerId]: resultRow | null }

export async function renderEntry(teamId, date) {
  const { teams, players, sessions, results } = getData();
  currentTeam = teams.find(t => t.id === teamId);
  if (!currentTeam) { document.getElementById('entry-form-container').innerHTML = '<p>Team not found.</p>'; return; }

  currentPlayers = players.filter(p => p.team_id === teamId);
  resultsMap = {};
  skippedSet = new Set();

  // Find the previous session for this team to show comparison values
  const teamSessions = sessions.filter(s => s.team_id === teamId);
  // There's no currentSessionId yet (session created on save), so we take the latest existing
  const latestPrev = teamSessions.sort((a, b) => b.date.localeCompare(a.date))[0];
  previousResults = {};
  currentPlayers.forEach(p => {
    previousResults[p.id] = latestPrev
      ? getPlayerResult(results, p.id, latestPrev.id)
      : null;
  });

  document.getElementById('entry-title').textContent =
    `${currentTeam.name} — ${date}`;
  document.getElementById('btn-save-session').onclick = () => handleSave(teamId, date);

  renderPlayerStrip();
  selectPlayer(0);
}

function renderPlayerStrip() {
  const strip = document.createElement('div');
  strip.className = 'player-strip';
  strip.id = 'player-strip';
  currentPlayers.forEach((p, i) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'player-chip';
    chip.id = `chip-${p.id}`;
    chip.textContent = shortName(p.name);
    chip.onclick = () => selectPlayer(i);
    strip.appendChild(chip);
  });
  const container = document.getElementById('player-strip-container');
  container.innerHTML = '';
  container.appendChild(strip);
}

function shortName(name) {
  const parts = name.trim().split(' ');
  return parts.length > 1 ? `${parts[0][0]}. ${parts.slice(1).join(' ')}` : name;
}

function selectPlayer(index) {
  currentPlayerIndex = index;
  const player = currentPlayers[index];
  if (!player) return;

  // Update chip states
  currentPlayers.forEach((p, i) => {
    const chip = document.getElementById(`chip-${p.id}`);
    if (!chip) return;
    chip.classList.remove('active', 'done');
    if (i === index) chip.classList.add('active');
    else if (resultsMap[p.id] || skippedSet.has(p.id)) chip.classList.add('done');
  });

  // Scroll active chip into view
  document.getElementById(`chip-${player.id}`)?.scrollIntoView({ inline: 'center', behavior: 'smooth' });

  renderForm(player);
}

function renderForm(player) {
  const metrics = getMetricsForTeamType(currentTeam.type);
  const saved = resultsMap[player.id] || {};
  const prev = previousResults[player.id];
  const doneCount = Object.keys(resultsMap).length + skippedSet.size;

  const form = document.getElementById('entry-form-container');
  form.innerHTML = '';
  const div = document.createElement('div');
  div.className = 'entry-form card';

  div.innerHTML = `
    <div class="entry-player-name">${player.name}</div>
    <div class="entry-progress">Player ${currentPlayerIndex + 1} of ${currentPlayers.length} · ${doneCount} completed</div>
    ${metrics.map(metric => renderMetricField(metric, saved, prev)).join('')}
    <div class="entry-actions">
      <button type="button" class="btn-skip" id="btn-skip-player">Skip (absent)</button>
      <button type="button" class="btn-next-player" id="btn-next-player">
        ${currentPlayerIndex < currentPlayers.length - 1 ? 'Save & Next →' : 'Save & Done ✓'}
      </button>
    </div>
  `;
  form.appendChild(div);

  document.getElementById('btn-skip-player').onclick = () => skipPlayer(player);
  document.getElementById('btn-next-player').onclick = () => savePlayerAndAdvance(player, metrics);
}

function renderMetricField(metric, saved, prev) {
  const cfg = METRIC_CONFIG[metric];
  const prevDisplay = prev ? ` Previous: ${prev.mas_min !== undefined && metric === 'mas'
    ? `${prev.mas_min}:${String(prev.mas_sec).padStart(2,'0')}`
    : (prev[metric] || '—')} ${cfg.unit}` : '';

  if (metric === 'mas') {
    return `
      <div class="metric-group">
        <div class="metric-label">${cfg.label}</div>
        ${prevDisplay ? `<div class="metric-prev">${prevDisplay}</div>` : ''}
        <div class="mas-inputs">
          <input class="metric-input" type="number" id="field-mas_min"
            placeholder="mm" min="0" max="99" value="${saved.mas_min || ''}">
          <span class="mas-sep">:</span>
          <input class="metric-input" type="number" id="field-mas_sec"
            placeholder="ss" min="0" max="59" value="${saved.mas_sec || ''}">
        </div>
      </div>`;
  }

  if (metric === 'body_fat_pct') {
    return `<div class="section-divider">Body Composition</div>` + regularField(metric, cfg, saved, prevDisplay);
  }

  return regularField(metric, cfg, saved, prevDisplay);
}

function regularField(metric, cfg, saved, prevDisplay) {
  return `
    <div class="metric-group">
      <div class="metric-label">${cfg.label}${cfg.unit ? ` (${cfg.unit})` : ''}</div>
      ${prevDisplay ? `<div class="metric-prev">${prevDisplay}</div>` : ''}
      <input class="metric-input" type="number" id="field-${metric}"
        placeholder="Enter value" step="0.1" value="${saved[metric] || ''}">
    </div>`;
}

function readFormValues(metrics) {
  const values = {};
  metrics.forEach(metric => {
    if (metric === 'mas') {
      values.mas_min = document.getElementById('field-mas_min')?.value || '';
      values.mas_sec = document.getElementById('field-mas_sec')?.value || '';
    } else {
      values[metric] = document.getElementById(`field-${metric}`)?.value || '';
    }
  });
  return values;
}

function savePlayerAndAdvance(player, metrics) {
  resultsMap[player.id] = readFormValues(metrics);
  updateSaveButton();
  const next = currentPlayerIndex + 1;
  if (next < currentPlayers.length) {
    selectPlayer(next);
  } else {
    selectPlayer(currentPlayerIndex); // Refresh done state on last player
  }
}

function skipPlayer(player) {
  skippedSet.add(player.id);
  updateSaveButton();
  const next = currentPlayerIndex + 1;
  if (next < currentPlayers.length) selectPlayer(next);
}

function updateSaveButton() {
  const btn = document.getElementById('btn-save-session');
  btn.disabled = Object.keys(resultsMap).length === 0;
}

async function handleSave(teamId, date) {
  const btn = document.getElementById('btn-save-session');
  btn.disabled = true;
  btn.textContent = 'Saving…';
  try {
    const sessionId = await saveSession(teamId, date, resultsMap);
    navigate('team-report', { sessionId });
  } catch (err) {
    console.error(err);
    btn.disabled = false;
    btn.textContent = 'Save';
    alert('Error saving session. Check your internet connection and try again.');
  }
}
