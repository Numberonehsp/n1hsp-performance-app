import { getData } from './data.js';
import { renderPlayerReport } from './report-player.js';

export async function renderPrintAll(sessionId) {
  const container = document.getElementById('print-all-content');
  container.innerHTML = '<p style="padding:24px;text-align:center;color:#666;">Generating reports…</p>';

  if (!getData()) {
    container.innerHTML = '<p style="padding:16px">Data not loaded.</p>';
    return;
  }

  const { teams, players, sessions, results } = getData();
  const session = sessions.find(s => s.id === sessionId);
  if (!session) {
    container.innerHTML = '<p style="padding:16px">Session not found.</p>';
    return;
  }

  const team = teams.find(t => t.id === session.team_id);
  if (!team) {
    container.innerHTML = '<p style="padding:16px">Team not found.</p>';
    return;
  }

  const teamPlayers = players.filter(p => p.team_id === team.id);
  const sessionResults = results.filter(r => r.session_id === sessionId);
  const playersWithResults = teamPlayers
    .filter(p => sessionResults.some(r => r.player_id === p.id));

  container.innerHTML = '';

  // Render each player into its own section div
  for (const player of playersWithResults) {
    const section = document.createElement('div');
    section.className = 'print-player-section';
    container.appendChild(section);
    await renderPlayerReport(player.id, sessionId, section);
  }

  // Auto-trigger print once rendered
  requestAnimationFrame(() => setTimeout(() => window.print(), 400));
}
