import { initAuth, requestSignIn, signOut, getCurrentUserEmail } from './auth.js';
import { loadAllData, getData, saveSession } from './data.js';
import { getRoute, isViewerRoute, getViewerTeamId } from './router.js';
import { initViewer } from './viewer.js';
import { renderDashboard } from './dashboard.js';
import { renderEntry } from './entry.js';
import { renderTeamReport } from './report-team.js';
import { renderPlayerReport } from './report-player.js';
import { renderPrintAll } from './print-all.js';

const SAVE_QUEUE_KEY = 'n1hsp_save_queue';

function showToast(msg) {
  const t = document.createElement('div');
  t.className = 'save-toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 4000);
}

async function retryQueuedSaves() {
  const queue = JSON.parse(localStorage.getItem(SAVE_QUEUE_KEY) || '[]');
  if (!queue.length) return;
  const remaining = [];
  for (const item of queue) {
    try {
      await saveSession(item.teamId, item.date, item.resultsMap);
    } catch {
      remaining.push(item);
    }
  }
  localStorage.setItem(SAVE_QUEUE_KEY, JSON.stringify(remaining));
  if (remaining.length < queue.length) {
    await loadAllData();
    showToast(`${queue.length - remaining.length} queued save(s) uploaded.`);
  }
}

const VIEW_IDS = {
  dashboard: 'view-dashboard',
  entry: 'view-entry',
  'team-report': 'view-team-report',
  'player-report': 'view-player-report',
  'print-all': 'view-print-all',
};

function showView(name) {
  document.getElementById('view-signin').classList.add('hidden');
  Object.values(VIEW_IDS).forEach(id => document.getElementById(id).classList.add('hidden'));
  const id = VIEW_IDS[name];
  if (id) document.getElementById(id).classList.remove('hidden');
}

async function route() {
  const { path, params } = getRoute();
  switch (path) {
    case 'dashboard':
      showView('dashboard');
      await renderDashboard();
      break;
    case 'entry':
      showView('entry');
      await renderEntry(params.teamId, params.date || new Date().toISOString().slice(0, 10));
      break;
    case 'team-report':
      showView('team-report');
      await renderTeamReport(params.sessionId);
      break;
    case 'player-report':
      showView('player-report');
      await renderPlayerReport(params.playerId, params.sessionId);
      break;
    case 'print-all':
      showView('print-all');
      await renderPrintAll(params.sessionId);
      break;
    default:
      navigate('dashboard');
  }
}

async function onSignedIn() {
  document.getElementById('btn-signout').addEventListener('click', signOut);
  document.getElementById('view-signin').classList.add('hidden');

  const loader = document.createElement('div');
  loader.className = 'loading';
  loader.textContent = 'Loading data…';
  document.getElementById('view-dashboard').classList.remove('hidden');
  document.getElementById('dashboard-content').appendChild(loader);

  await loadAllData();
  await retryQueuedSaves();
  loader.remove();

  const admins = getData().admins || [];
  const email = getCurrentUserEmail();
  window.appState = { isAdmin: email ? admins.includes(email) : false };

  if (!window.appState.isAdmin) {
    // Replace the loading screen with a restricted access message
    document.getElementById('dashboard-content').innerHTML = `
      <div class="no-access-card">
        <h2>Access restricted</h2>
        <p>You don't have admin access to this app.</p>
        <p>Contact your N1 HSP administrator to request access.</p>
        <button onclick="document.getElementById('btn-signout').click()" class="btn-secondary">Sign out</button>
      </div>`;
    return;
  }

  window.addEventListener('hashchange', route);
  await route();
}

window.addEventListener('load', () => {
  // Viewer mode — bypass auth entirely
  if (isViewerRoute()) {
    initViewer(getViewerTeamId());
    return;
  }

  // Also handle hash changes that navigate to a viewer route after load
  window.addEventListener('hashchange', () => {
    if (isViewerRoute()) initViewer(getViewerTeamId());
  });

  initAuth(
    () => {
      document.getElementById('view-signin').classList.remove('hidden');
      document.getElementById('btn-signin').addEventListener('click', requestSignIn);
    },
    onSignedIn
  );
});
