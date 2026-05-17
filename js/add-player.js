import { getData, loadAllData } from './data.js';
import { appendRow } from './sheets.js';

export function openAddPlayerModal(preselectedTeamId = null) {
  const modal   = document.getElementById('add-player-modal');
  const teamSel = document.getElementById('add-player-team');
  const nameIn  = document.getElementById('add-player-name');
  const warning = document.getElementById('add-player-warning');

  const teams = getData().teams || [];
  teamSel.innerHTML = teams.map(t =>
    `<option value="${t.id}"${t.id === preselectedTeamId ? ' selected' : ''}>${t.name}</option>`
  ).join('');

  nameIn.value = '';
  warning.style.display = 'none';
  modal.style.display = 'flex';
  setTimeout(() => nameIn.focus(), 50);

  document.getElementById('add-player-cancel').onclick = closeModal;
  document.getElementById('add-player-save').onclick = handleSave;
}

function closeModal() {
  document.getElementById('add-player-modal').style.display = 'none';
}

async function handleSave() {
  const teamId  = document.getElementById('add-player-team').value;
  const name    = document.getElementById('add-player-name').value.trim();
  const warning = document.getElementById('add-player-warning');
  const saveBtn = document.getElementById('add-player-save');

  warning.style.display = 'none';

  if (!name) {
    warning.textContent = 'Please enter a player name.';
    warning.style.display = 'block';
    return;
  }
  if (!teamId) {
    warning.textContent = 'Please select a team.';
    warning.style.display = 'block';
    return;
  }

  const players = getData().players || [];
  const duplicate = players.find(
    p => p.team_id === teamId && p.name.toLowerCase() === name.toLowerCase()
  );
  if (duplicate) {
    warning.textContent = `A player named "${name}" already exists on this team.`;
    warning.style.display = 'block';
    // warn but don't block — let admin proceed if intentional
  }

  const maxId = players.reduce((max, p) => {
    const n = parseInt((p.id || '').replace(/\D/g, '')) || 0;
    return Math.max(max, n);
  }, 0);
  const newId = `player_${maxId + 1}`;

  saveBtn.disabled = true;
  saveBtn.textContent = 'Saving…';

  try {
    await appendRow('players', [newId, teamId, name]);
    await loadAllData();
    closeModal();
    document.dispatchEvent(new CustomEvent('playerAdded', { detail: { teamId } }));
  } catch (e) {
    warning.textContent = `Save failed: ${e.message}`;
    warning.style.display = 'block';
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = 'Save';
  }
}
