import { getData, saveSession, loadAllData } from './data.js';
import { appendRow } from './sheets.js';
import { navigate } from './router.js';

const SAVE_QUEUE_KEY  = 'n1hsp_save_queue';
const DRAFT_PREFIX    = 'n1hsp_draft_';

function showToast(msg, duration = 4000) {
  const t = document.createElement('div');
  t.className = 'save-toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), duration);
}

function teamName(teamId) {
  const teams = getData()?.teams || [];
  return teams.find(t => t.id === teamId)?.name || teamId;
}

function playerCount(resultsMap) {
  return Object.keys(resultsMap || {}).length;
}

function formatTimestamp(ms) {
  if (!ms) return '';
  const d = new Date(ms);
  return d.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });
}

function getDraftKeys() {
  const keys = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(DRAFT_PREFIX)) keys.push(key);
  }
  return keys;
}

function parseDraftKey(key) {
  // n1hsp_draft_${teamId}_${date}  e.g. n1hsp_draft_cq12_2026-05-26
  const rest = key.slice(DRAFT_PREFIX.length); // 'cq12_2026-05-26'
  // date is always last 10 chars YYYY-MM-DD
  const date = rest.slice(-10);
  const teamId = rest.slice(0, rest.length - 11); // remove _YYYY-MM-DD
  return { teamId, date };
}

// Parses a deterministic session ID back to { teamId, date }.
// Format: sess_${teamId}_${YYYYMMDD}  e.g. sess_cqws_20260526
function parseSessionId(sessionId) {
  const match = sessionId.match(/^sess_(.+)_(\d{8})$/);
  if (!match) return null;
  const teamId = match[1];
  const raw    = match[2];
  const date   = `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
  return { teamId, date };
}

// Returns session IDs that appear in results rows but have no session row.
function findOrphanedSessionIds(data) {
  const knownIds = new Set(data.sessions.map(s => s.id));
  const orphaned = new Set();
  (data.results || []).forEach(r => {
    if (r.session_id && !knownIds.has(r.session_id)) orphaned.add(r.session_id);
  });
  return [...orphaned];
}

export async function renderRecover() {
  const container = document.getElementById('recover-content');
  container.innerHTML = '';

  // ── Check for orphaned results (results rows with no matching session row) ──
  // This happens when the app wrote result rows but crashed/lost connection before
  // writing the session row (due to the forcedSessionId bug fixed in data.js v2).
  const data = getData();
  const orphanedSessionIds = data ? findOrphanedSessionIds(data) : [];

  const queue  = JSON.parse(localStorage.getItem(SAVE_QUEUE_KEY) || '[]');
  const drafts = getDraftKeys().map(key => {
    try {
      const { teamId, date } = parseDraftKey(key);
      const data = JSON.parse(localStorage.getItem(key) || 'null');
      return { key, teamId, date, data };
    } catch {
      return null;
    }
  }).filter(Boolean);

  const hasAnything = queue.length > 0 || drafts.length > 0 || orphanedSessionIds.length > 0;

  if (!hasAnything) {
    container.innerHTML = `
      <div class="recover-empty">
        <div class="recover-empty-icon">✓</div>
        <h2>No unsaved data found</h2>
        <p>There are no pending uploads or local drafts.</p>
        <button type="button" class="btn-primary" onclick="history.back()">Back to Dashboard</button>
      </div>`;
    return;
  }

  // ── Orphaned session rows (results exist but session row is missing) ────
  if (orphanedSessionIds.length > 0) {
    const section = document.createElement('div');
    section.className = 'recover-section';
    section.innerHTML = `
      <h2 class="recover-section-title">🔧 Missing Session Rows (${orphanedSessionIds.length})</h2>
      <p class="recover-section-desc">Player results were saved but the session record is missing — this causes "Session not found" errors and hides the session from reports. Use <strong>Restore Session Row</strong> to fix each one.</p>`;

    orphanedSessionIds.forEach(sessionId => {
      const parsed = parseSessionId(sessionId);
      const name   = parsed ? teamName(parsed.teamId) : sessionId;
      const date   = parsed ? parsed.date : '?';
      const teams  = data?.teams || [];
      const teamObj = parsed ? teams.find(t => t.id === parsed.teamId) : null;

      // Count result rows for this session to show player count
      const resultCount = (data?.results || []).filter(r => r.session_id === sessionId).length;

      const card = document.createElement('div');
      card.className = 'card recover-card';
      card.innerHTML = `
        <div class="recover-card-header">
          <div>
            <div class="recover-team">${name}</div>
            <div class="recover-meta">${date} · ${resultCount} result row${resultCount !== 1 ? 's' : ''} in Sheets · session row missing</div>
          </div>
          <div class="recover-actions">
            <button type="button" class="btn-primary btn-sm btn-restore-session"
              data-session-id="${sessionId}"
              data-team-id="${parsed?.teamId || ''}"
              data-date="${date}">🔧 Restore Session Row</button>
          </div>
        </div>`;
      section.appendChild(card);
    });

    container.appendChild(section);

    container.querySelectorAll('.btn-restore-session').forEach(btn => {
      btn.addEventListener('click', async () => {
        const { sessionId, teamId, date } = btn.dataset;
        if (!teamId || !date || date === '?') {
          showToast('Could not parse session ID — please add the row manually in Google Sheets.');
          return;
        }
        btn.disabled = true;
        btn.textContent = 'Restoring…';
        try {
          await appendRow('sessions', [sessionId, teamId, date]);
          await loadAllData();
          showToast(`Session row restored for ${teamName(teamId)} — ${date}`);
          await renderRecover();
        } catch (err) {
          console.error(err);
          btn.disabled = false;
          btn.textContent = '🔧 Restore Session Row';
          showToast('Failed to restore — check your connection and try again.', 6000);
        }
      });
    });
  }

  // ── Queued saves (failed uploads waiting to retry) ──────────────────────
  if (queue.length > 0) {
    const section = document.createElement('div');
    section.className = 'recover-section';
    section.innerHTML = `
      <h2 class="recover-section-title">⚠ Pending Uploads (${queue.length})</h2>
      <p class="recover-section-desc">These sessions were saved locally but could not be uploaded. Use <strong>Retry Upload</strong> to send them to Google Sheets now.</p>`;

    queue.forEach((item, idx) => {
      const count = playerCount(item.resultsMap);
      const ts    = formatTimestamp(item.timestamp);
      const card  = document.createElement('div');
      card.className = 'card recover-card';
      card.innerHTML = `
        <div class="recover-card-header">
          <div>
            <div class="recover-team">${teamName(item.teamId)}</div>
            <div class="recover-meta">${item.date} · ${count} player${count !== 1 ? 's' : ''}${ts ? ` · saved ${ts}` : ''}</div>
          </div>
          <div class="recover-actions">
            <button type="button" class="btn-primary btn-sm btn-retry-upload" data-idx="${idx}">↑ Retry Upload</button>
            <button type="button" class="btn-discard btn-sm" data-idx="${idx}" title="Discard this item">Discard</button>
          </div>
        </div>
        <details class="recover-details">
          <summary>View player data</summary>
          <div class="recover-player-list">
            ${Object.keys(item.resultsMap).map(pid => `<div class="recover-player-row">${pid}</div>`).join('')}
          </div>
        </details>`;
      section.appendChild(card);
    });

    container.appendChild(section);

    // Wire retry buttons
    container.querySelectorAll('.btn-retry-upload').forEach(btn => {
      btn.addEventListener('click', async () => {
        const idx  = parseInt(btn.dataset.idx);
        const item = queue[idx];
        btn.disabled = true;
        btn.textContent = 'Uploading…';
        try {
          await saveSession(item.teamId, item.date, item.resultsMap, item.sessionId);
          // Remove from queue
          const currentQueue = JSON.parse(localStorage.getItem(SAVE_QUEUE_KEY) || '[]');
          const filtered = currentQueue.filter(q => !(q.teamId === item.teamId && q.date === item.date));
          localStorage.setItem(SAVE_QUEUE_KEY, JSON.stringify(filtered));
          await loadAllData();
          showToast(`Uploaded ${teamName(item.teamId)} — ${item.date}`);
          // Re-render to reflect state change
          await renderRecover();
        } catch (err) {
          console.error(err);
          btn.disabled = false;
          btn.textContent = '↑ Retry Upload';
          showToast('Upload failed — check your connection and try again.', 6000);
        }
      });
    });

    // Wire discard buttons
    container.querySelectorAll('.btn-discard').forEach(btn => {
      btn.addEventListener('click', () => {
        if (!confirm('Discard this saved session? This cannot be undone.')) return;
        const idx  = parseInt(btn.dataset.idx);
        const item = queue[idx];
        const currentQueue = JSON.parse(localStorage.getItem(SAVE_QUEUE_KEY) || '[]');
        const filtered = currentQueue.filter(q => !(q.teamId === item.teamId && q.date === item.date));
        localStorage.setItem(SAVE_QUEUE_KEY, JSON.stringify(filtered));
        renderRecover();
      });
    });
  }

  // ── Local drafts (auto-saved per-player, not yet uploaded) ───────────────
  if (drafts.length > 0) {
    const section = document.createElement('div');
    section.className = 'recover-section';
    section.innerHTML = `
      <h2 class="recover-section-title">📋 Local Drafts (${drafts.length})</h2>
      <p class="recover-section-desc">These drafts were auto-saved as you entered data. Use <strong>Resume Session</strong> to continue entering data — the draft will reload automatically.</p>`;

    drafts.forEach(({ key, teamId, date, data }) => {
      const count   = playerCount(data?.resultsMap);
      const skipped = (data?.skipped || []).length;
      const ts      = formatTimestamp(data?.savedAt);
      const card    = document.createElement('div');
      card.className = 'card recover-card';
      card.innerHTML = `
        <div class="recover-card-header">
          <div>
            <div class="recover-team">${teamName(teamId)}</div>
            <div class="recover-meta">${date} · ${count} player${count !== 1 ? 's' : ''} entered${skipped ? `, ${skipped} skipped` : ''}${ts ? ` · last saved ${ts}` : ''}</div>
          </div>
          <div class="recover-actions">
            <button type="button" class="btn-resume btn-sm btn-resume-draft"
              data-team-id="${teamId}" data-date="${date}">↩ Resume Session</button>
            <button type="button" class="btn-discard-draft btn-sm" data-key="${key}" title="Discard this draft">Discard</button>
          </div>
        </div>`;
      section.appendChild(card);
    });

    container.appendChild(section);

    // Wire resume buttons
    container.querySelectorAll('.btn-resume-draft').forEach(btn => {
      btn.addEventListener('click', () => {
        navigate('entry', { teamId: btn.dataset.teamId, date: btn.dataset.date });
      });
    });

    // Wire discard draft buttons
    container.querySelectorAll('.btn-discard-draft').forEach(btn => {
      btn.addEventListener('click', () => {
        if (!confirm('Discard this local draft? This cannot be undone.')) return;
        localStorage.removeItem(btn.dataset.key);
        renderRecover();
      });
    });
  }

  // ── Retry All button ────────────────────────────────────────────────────
  if (queue.length > 0) {
    const retryAllRow = document.createElement('div');
    retryAllRow.className = 'recover-retry-all-row';
    retryAllRow.innerHTML = `<button type="button" class="btn-primary" id="btn-retry-all">↑ Retry All Uploads</button>`;
    container.appendChild(retryAllRow);

    document.getElementById('btn-retry-all').addEventListener('click', async () => {
      const btn = document.getElementById('btn-retry-all');
      btn.disabled = true;
      btn.textContent = 'Uploading…';
      const currentQueue = JSON.parse(localStorage.getItem(SAVE_QUEUE_KEY) || '[]');
      const remaining = [];
      let uploaded = 0;
      for (const item of currentQueue) {
        try {
          await saveSession(item.teamId, item.date, item.resultsMap, item.sessionId);
          uploaded++;
        } catch {
          remaining.push(item);
        }
      }
      localStorage.setItem(SAVE_QUEUE_KEY, JSON.stringify(remaining));
      if (uploaded > 0) {
        await loadAllData();
        showToast(`${uploaded} session${uploaded !== 1 ? 's' : ''} uploaded successfully.`);
      }
      if (remaining.length > 0) {
        showToast(`${remaining.length} session${remaining.length !== 1 ? 's' : ''} still failed — check connection.`, 6000);
      }
      await renderRecover();
    });
  }
}
