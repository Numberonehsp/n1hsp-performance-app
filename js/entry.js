import { getData, getPlayerResult, getDisplayValue,
         getMetricsForTeamType, saveSession, deriveSessionId, loadAllData } from './data.js';
import { METRIC_CONFIG } from './config.js';
import { navigate } from './router.js';
import { openAddPlayerModal } from './add-player.js';

const SAVE_QUEUE_KEY  = 'n1hsp_save_queue';
const DRAFT_KEY_PREFIX = 'n1hsp_draft_';

function showToast(msg) {
  const t = document.createElement('div');
  t.className = 'save-toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 4000);
}

let currentTeam = null;
let currentPlayers = [];
let currentPlayerIndex = 0;
let resultsMap = {};      // { [playerId]: { ...fieldValues } }
let preloadedMap = {};    // snapshot of what was loaded from Sheets — used to skip unchanged rows on save
let skippedSet = new Set();
let previousResults = {}; // { [playerId]: resultRow | null }

export async function renderEntry(teamId, date) {
  const { teams, players, sessions, results } = getData();
  currentTeam = teams.find(t => t.id === teamId);
  if (!currentTeam) { document.getElementById('entry-form-container').innerHTML = '<p>Team not found.</p>'; return; }

  currentPlayers = players.filter(p => p.team_id === teamId);
  resultsMap = {};
  preloadedMap = {};
  skippedSet = new Set();
  currentPlayerIndex = 0;

  // Find the previous session for this team to show comparison values
  // There's no currentSessionId yet (session created on save), so we take the latest existing
  const teamSessions = [...sessions
    .filter(s => s.team_id === teamId)]
    .sort((a, b) => b.date.localeCompare(a.date));
  const latestPrev = teamSessions[0];
  previousResults = {};
  currentPlayers.forEach(p => {
    previousResults[p.id] = latestPrev
      ? getPlayerResult(results, p.id, latestPrev.id)
      : null;
  });

  document.getElementById('entry-title').textContent =
    `${currentTeam.name} — ${date}`;
  document.getElementById('btn-save-session').onclick = () => handleSave(teamId, date);

  // If a session already exists in Sheets for this team+date, pre-load its results.
  // This is the "resume" path — players already tested show as done, others are blank.
  const existingSession = sessions.find(s => s.team_id === teamId && s.date === date);
  if (existingSession) {
    const metrics = getMetricsForTeamType(currentTeam.type);
    const allKeys = metrics.flatMap(m => m === 'mas' ? ['mas_min', 'mas_sec'] : [m]);
    // Use last result per player (in case of previous resume+save producing duplicates)
    const sessionResults = results.filter(r => r.session_id === existingSession.id);
    const byPlayer = {};
    sessionResults.forEach(r => { byPlayer[r.player_id] = r; }); // last write wins
    Object.entries(byPlayer).forEach(([playerId, r]) => {
      const snapshot = Object.fromEntries(allKeys.map(k => [k, r[k] ?? '']));
      preloadedMap[playerId] = snapshot;
      resultsMap[playerId] = { ...snapshot };
    });
    const count = Object.keys(preloadedMap).length;
    if (count > 0) showToast(`Resuming session — ${count} player${count !== 1 ? 's' : ''} already saved.`);
    // Clear any local draft since Sheets is the source of truth
    localStorage.removeItem(`${DRAFT_KEY_PREFIX}${teamId}_${date}`);
  } else {
    // No Sheets session yet — restore any locally-saved draft (e.g. after wifi loss before save)
    try {
      const draft = JSON.parse(localStorage.getItem(`${DRAFT_KEY_PREFIX}${teamId}_${date}`) || 'null');
      if (draft) {
        resultsMap = draft.resultsMap || {};
        skippedSet = new Set(draft.skipped || []);
        showToast('Draft restored from local storage.');
      }
    } catch { /* ignore corrupt draft */ }
  }

  renderPlayerStrip();

  if (currentPlayers.length === 0) {
    const form = document.getElementById('entry-form-container');
    form.innerHTML = `
      <div class="entry-form card entry-empty-state">
        <p class="entry-empty-msg">No players found for this team.</p>
        <p class="entry-empty-hint">Check that the <strong>team_id</strong> column in the players tab matches <strong>${teamId}</strong>, or add players below.</p>
        <div class="entry-add-player-row">
          <button type="button" class="btn-add-player-inline" id="btn-add-player-inline">+ Add New Player</button>
        </div>
      </div>`;
    document.getElementById('btn-add-player-inline').onclick = () => openAddPlayerModal(currentTeam.id);
  } else {
    selectPlayer(0);
  }
  updateSaveButton();

  // When a player is added via the modal, refresh the list and jump to the new player
  document.addEventListener('playerAdded', function onPlayerAdded(e) {
    if (e.detail?.teamId !== teamId) return;
    document.removeEventListener('playerAdded', onPlayerAdded);
    const updated = getData().players.filter(p => p.team_id === teamId);
    const newPlayer = updated.find(p => !currentPlayers.some(cp => cp.id === p.id));
    currentPlayers = updated;
    renderPlayerStrip();
    const newIdx = newPlayer ? currentPlayers.findIndex(p => p.id === newPlayer.id) : currentPlayers.length - 1;
    selectPlayer(newIdx >= 0 ? newIdx : currentPlayers.length - 1);
    // Re-attach listener for subsequent adds in the same session
    document.addEventListener('playerAdded', onPlayerAdded);
  });
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
    chip.classList.remove('active', 'done', 'skipped');
    if (i === index) chip.classList.add('active');
    else if (skippedSet.has(p.id)) chip.classList.add('skipped');
    else if (resultsMap[p.id]) chip.classList.add('done');
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
    <div class="entry-add-player-row">
      <button type="button" class="btn-add-player-inline" id="btn-add-player-inline">+ Add New Player</button>
    </div>
  `;
  form.appendChild(div);

  document.getElementById('btn-skip-player').onclick = () => skipPlayer(player);
  document.getElementById('btn-next-player').onclick = () => savePlayerAndAdvance(player, metrics);
  document.getElementById('btn-add-player-inline').onclick = () => openAddPlayerModal(currentTeam.id);
}

function renderMetricField(metric, saved, prev) {
  const cfg = METRIC_CONFIG[metric];
  const prevDisplay = prev
    ? `Previous: ${getDisplayValue(prev, metric)} ${cfg.unit}`
    : '';

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

function saveDraft(teamId, date) {
  try {
    localStorage.setItem(
      `${DRAFT_KEY_PREFIX}${teamId}_${date}`,
      JSON.stringify({ resultsMap, skipped: [...skippedSet], savedAt: Date.now() })
    );
  } catch { /* storage full — ignore */ }
}

function savePlayerAndAdvance(player, metrics) {
  resultsMap[player.id] = readFormValues(metrics);
  updateSaveButton();
  saveDraft(currentTeam.id, document.getElementById('entry-title').textContent.split(' — ')[1]);
  // Advance to next player that isn't already saved or skipped
  let next = currentPlayerIndex + 1;
  while (next < currentPlayers.length &&
         (resultsMap[currentPlayers[next].id] || skippedSet.has(currentPlayers[next].id))) {
    next++;
  }
  if (next < currentPlayers.length) {
    selectPlayer(next);
  } else {
    selectPlayer(currentPlayerIndex); // Refresh done state on last player
  }
}

function skipPlayer(player) {
  skippedSet.add(player.id);
  updateSaveButton();
  // Advance to next player that isn't already saved or skipped
  let next = currentPlayerIndex + 1;
  while (next < currentPlayers.length &&
         (resultsMap[currentPlayers[next].id] || skippedSet.has(currentPlayers[next].id))) {
    next++;
  }
  if (next < currentPlayers.length) selectPlayer(next);
  else selectPlayer(currentPlayerIndex); // all done — stay on current to show state
}

function updateSaveButton() {
  const btn = document.getElementById('btn-save-session');
  // Enable if any data exists (new entries OR pre-loaded from a resumed session)
  btn.disabled = Object.keys(resultsMap).length === 0 && Object.keys(preloadedMap).length === 0;
}

async function handleSave(teamId, date) {
  const btn = document.getElementById('btn-save-session');
  btn.disabled = true;
  btn.textContent = 'Saving…';

  // Pre-compute stable session ID so any queued retry uses the exact same ID
  const { sessions } = getData();
  const existing = sessions.find(s => s.team_id === teamId && s.date === date);
  const sessionId = existing ? existing.id : deriveSessionId(teamId, date);

  // Only write players whose data is new or changed vs what was loaded from Sheets.
  // This avoids duplicate rows when resuming a session.
  const toWrite = {};
  for (const [playerId, data] of Object.entries(resultsMap)) {
    const pre = preloadedMap[playerId];
    if (!pre) {
      toWrite[playerId] = data; // new player
    } else {
      const changed = Object.keys(data).some(k => (data[k] ?? '') !== (pre[k] ?? ''));
      if (changed) toWrite[playerId] = data; // updated values
    }
  }

  try {
    if (Object.keys(toWrite).length > 0) {
      await saveSession(teamId, date, toWrite, sessionId);
    }
    // Clear draft on successful save
    localStorage.removeItem(`${DRAFT_KEY_PREFIX}${teamId}_${date}`);
    await loadAllData();
    navigate('team-report', { sessionId });
  } catch (err) {
    console.error(err);
    // Store sessionId in queue so retries never create a duplicate session row
    const queue = JSON.parse(localStorage.getItem(SAVE_QUEUE_KEY) || '[]');
    // Replace any existing queue item for the same team+date rather than duplicating
    const filtered = queue.filter(q => !(q.teamId === teamId && q.date === date));
    filtered.push({ teamId, date, resultsMap, sessionId, timestamp: Date.now() });
    localStorage.setItem(SAVE_QUEUE_KEY, JSON.stringify(filtered));
    btn.disabled = false;
    btn.textContent = 'Save';
    showToast('No connection — data saved locally and will upload automatically.');
  }
}
