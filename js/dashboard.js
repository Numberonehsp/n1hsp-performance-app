import { getData } from './data.js';
import { navigate } from './router.js';

export async function renderDashboard() {
  const { clubs, teams, sessions } = getData();
  const container = document.getElementById('dashboard-content');
  container.innerHTML = '';

  if (clubs.length === 0) {
    container.innerHTML = '<p class="loading">No clubs found. Add data to your Google Sheet.</p>';
    return;
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
      const latestSession = teamSessions[0];

      const teamEl = document.createElement('div');
      teamEl.className = 'card team-card';
      teamEl.innerHTML = `
        <div class="team-card-header">
          <div>
            <div class="team-name">${team.name}</div>
            <div class="team-type badge badge-${(team.type || '').toLowerCase()}">${team.type}</div>
          </div>
          <div class="team-actions">
            <button type="button" class="btn-primary btn-sm btn-new-session"
              data-team-id="${team.id}">+ New Session</button>
          </div>
        </div>
        ${latestSession
          ? `<div class="team-last-session">
               Last tested: <strong>${latestSession.date}</strong>
               <a class="link-view-report" href="#team-report?sessionId=${latestSession.id}">View Report →</a>
             </div>
             ${teamSessions.length > 1 ? `
               <details class="past-sessions">
                 <summary>Older sessions (${teamSessions.length - 1})</summary>
                 ${teamSessions.slice(1).map(s =>
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
