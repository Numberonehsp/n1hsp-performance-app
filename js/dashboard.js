import { getData } from './data.js';
import { navigate } from './router.js';
import { openAddPlayerModal } from './add-player.js';

const SAVE_QUEUE_KEY = 'n1hsp_save_queue';
const DRAFT_PREFIX   = 'n1hsp_draft_';

function hasPendingLocalData() {
  const queue = JSON.parse(localStorage.getItem(SAVE_QUEUE_KEY) || '[]');
  if (queue.length > 0) return true;
  for (let i = 0; i < localStorage.length; i++) {
    if ((localStorage.key(i) || '').startsWith(DRAFT_PREFIX)) return true;
  }
  return false;
}

document.addEventListener('playerAdded', () => renderDashboard());

export async function renderDashboard() {
  const { clubs, teams, sessions } = getData();
  const today = new Date().toISOString().slice(0, 10);
  const container = document.getElementById('dashboard-content');
  container.innerHTML = '';

  if (clubs.length === 0) {
    container.innerHTML = '<p class="loading">No clubs found. Add data to your Google Sheet.</p>';
    return;
  }

  const banner = document.createElement('div');
  banner.className = 'info-banner';
  banner.textContent = 'Reload the page to see sessions added by other users.';
  container.appendChild(banner);

  if (hasPendingLocalData()) {
    const recoverBanner = document.createElement('div');
    recoverBanner.className = 'info-banner info-banner-warn';
    recoverBanner.innerHTML = `
      ⚠ You have unsaved session data stored on this device.
      <a href="#recover" class="recover-link">View &amp; upload →</a>`;
    container.appendChild(recoverBanner);
  }

  clubs.forEach(club => {
    const clubTeams = teams.filter(t => t.club_id === club.id);

    const clubEl = document.createElement('div');
    clubEl.className = 'dashboard-club';
    clubEl.innerHTML = `<h2 class="club-name">${club.name}</h2>`;

    clubTeams.forEach(team => {
      const teamSessions = sessions
        .filter(s => s.team_id === team.id)
        .sort((a, b) => b.date.localeCompare(a.date));

      const todaySession = teamSessions.find(s => s.date === today);

      // De-dupe by date — wifi-drop artefacts leave multiple session rows per date.
      // The viewer already merges results; dashboard just needs one entry per date.
      const seenDates = new Set();
      const uniqueSessions = teamSessions.filter(s => {
        if (seenDates.has(s.date)) return false;
        seenDates.add(s.date);
        return true;
      });
      const latestSession = uniqueSessions[0];

      const teamEl = document.createElement('div');
      teamEl.className = 'card team-card';
      teamEl.innerHTML = `
        <div class="team-card-header">
          <div>
            <div class="team-name">${team.name}</div>
            <div class="team-type badge badge-${(team.type || '').toLowerCase()}">${team.type}</div>
          </div>
          <div class="team-actions">
            ${todaySession
              ? `<button type="button" class="btn-resume btn-sm btn-new-session"
                   data-team-id="${team.id}" title="Continue today's session">↩ Resume Today</button>`
              : `<button type="button" class="btn-primary btn-sm btn-new-session"
                   data-team-id="${team.id}">+ New Session</button>`
            }
          </div>
        </div>
        ${latestSession
          ? `<div class="team-last-session">
               Last tested: <strong>${latestSession.date}</strong>
               <a class="link-view-report" href="#team-report?sessionId=${latestSession.id}">View Report →</a>
             </div>
             ${uniqueSessions.length > 1 ? `
               <details class="past-sessions">
                 <summary>Older sessions (${uniqueSessions.length - 1})</summary>
                 ${uniqueSessions.slice(1).map(s =>
                   `<div class="past-session-row">
                     ${s.date}
                     <a href="#team-report?sessionId=${s.id}">View →</a>
                   </div>`
                 ).join('')}
               </details>` : ''}
             `
          : `<div class="team-last-session text-muted">No sessions yet</div>`
        }
      `;
      if (window.appState?.isAdmin) {
        const addBtn = document.createElement('button');
        addBtn.type = 'button';
        addBtn.className = 'btn-link';
        addBtn.textContent = '+ Add Player';
        addBtn.style.cssText = 'margin-top:8px;display:block;padding:4px 0;';
        addBtn.addEventListener('click', () => openAddPlayerModal(team.id));
        teamEl.querySelector('.team-actions').appendChild(addBtn);
      }

      clubEl.appendChild(teamEl);
    });

    container.appendChild(clubEl);
  });

  // Wire up "New Session" buttons
  container.querySelectorAll('.btn-new-session').forEach(btn => {
    btn.addEventListener('click', () => {
      const teamId = btn.dataset.teamId;
      const date = new Date().toISOString().slice(0, 10);
      navigate('entry', { teamId, date });
    });
  });
}
