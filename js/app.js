import { initAuth, requestSignIn, signOut } from './auth.js';
import { loadAllData } from './data.js';
import { getRoute } from './router.js';
import { renderDashboard } from './dashboard.js';
import { renderEntry } from './entry.js';
import { renderTeamReport } from './report-team.js';
import { renderPlayerReport } from './report-player.js';
import { renderPrintAll } from './print-all.js';

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
  loader.remove();

  window.addEventListener('hashchange', route);
  await route();
}

window.addEventListener('load', () => {
  initAuth(
    () => {
      document.getElementById('view-signin').classList.remove('hidden');
      document.getElementById('btn-signin').addEventListener('click', requestSignIn);
    },
    onSignedIn
  );
});
