import { getData } from './data.js';

const ALL_METRICS = [
  { key: 'cmj',                  label: 'Countermovement Jump', shortLabel: 'CMJ',     unit: 'cm', higherBetter: true  },
  { key: 'sprint_20m',           label: '20m Sprint',           shortLabel: 'SPRINT',  unit: 's',  higherBetter: false },
  { key: 'mas',                  label: 'MAS',                  shortLabel: 'MAS',     unit: '',   higherBetter: true  },
  { key: 'body_fat_pct',         label: 'Body Fat %',           shortLabel: 'BF%',     unit: '%',  higherBetter: false, seniorOnly: true },
  { key: 'body_fat_mass',        label: 'Body Fat Mass',        shortLabel: 'BF MASS', unit: 'kg', higherBetter: false, seniorOnly: true },
  { key: 'skeletal_muscle_mass', label: 'Skeletal Muscle Mass', shortLabel: 'SMM',     unit: 'kg', higherBetter: true,  seniorOnly: true },
];

function getMasStr(result) {
  if (!result) return null;
  const min = parseInt(result.mas_min) || 0;
  const sec = parseInt(result.mas_sec) || 0;
  if (!min && !sec) return null;
  return `${min}:${String(sec).padStart(2, '0')}`;
}

function getNumVal(result, metric) {
  if (!result || metric.key === 'mas') return null;
  const v = parseFloat(result[metric.key]);
  return isNaN(v) ? null : v;
}

function numAvg(arr) {
  const valid = arr.filter(v => v !== null);
  if (!valid.length) return null;
  return valid.reduce((a, b) => a + b, 0) / valid.length;
}

function fmtNum(v, decimals = 2) {
  return v !== null && v !== undefined ? parseFloat(v).toFixed(decimals) : '—';
}

function masAvgStr(results) {
  const secs = results
    .map(r => (parseInt(r.mas_min) || 0) * 60 + (parseInt(r.mas_sec) || 0))
    .filter(v => v > 0);
  if (!secs.length) return '—';
  const avg = Math.round(secs.reduce((a, b) => a + b, 0) / secs.length);
  return `${Math.floor(avg / 60)}:${String(avg % 60).padStart(2, '0')}`;
}

function buildCoverPage(team, club, session, currentResults, players) {
  const tested = players.filter(p => currentResults.some(r => r.player_id === p.id)).length;
  const cmjAvg = fmtNum(numAvg(currentResults.map(r => getNumVal(r, ALL_METRICS[0]))), 1);
  const sprintAvg = fmtNum(numAvg(currentResults.map(r => getNumVal(r, ALL_METRICS[1]))), 2);
  const masAvg = masAvgStr(currentResults);

  return `
    <div class="pdf-cover-page pdf-page">
      <div class="pdf-cover-bg">
        ${club?.logo_url ? `<img class="pdf-cover-logo" src="${club.logo_url}" alt="${club.name}">` : ''}
        <div class="pdf-cover-club">${club?.name || ''}</div>
        <div class="pdf-cover-team">${team.name}</div>
        <div class="pdf-cover-divider"></div>
        <div class="pdf-cover-report-label">Performance Testing Report</div>
        <div class="pdf-cover-date">Session: ${session.date}</div>
      </div>
      <div class="pdf-cover-stats">
        <div class="pdf-cover-stat"><div class="pdf-cover-stat-val">${tested}</div><div class="pdf-cover-stat-lbl">Players Tested</div></div>
        <div class="pdf-cover-stat"><div class="pdf-cover-stat-val">${cmjAvg}</div><div class="pdf-cover-stat-lbl">Avg CMJ (cm)</div></div>
        <div class="pdf-cover-stat"><div class="pdf-cover-stat-val">${sprintAvg}s</div><div class="pdf-cover-stat-lbl">Avg 20m Sprint</div></div>
        <div class="pdf-cover-stat"><div class="pdf-cover-stat-val">${masAvg}</div><div class="pdf-cover-stat-lbl">Avg MAS</div></div>
      </div>
    </div>`;
}

function buildMetricPage(metric, team, session, currentResults, prevResults, players, pageNum, totalPages) {
  const currNums = players.map(p => {
    const r = currentResults.find(res => res.player_id === p.id);
    return { player: p, r, num: getNumVal(r, metric), masStr: getMasStr(r) };
  });

  const withData = currNums.filter(d => metric.key === 'mas' ? d.masStr !== null : d.num !== null);

  withData.sort((a, b) => {
    if (metric.key === 'mas') return 0;
    return metric.higherBetter ? b.num - a.num : a.num - b.num;
  });

  const nums = withData.map(d => d.num).filter(v => v !== null);
  const prevNums = prevResults
    ? players.map(p => {
        const r = prevResults.find(res => res.player_id === p.id);
        return getNumVal(r, metric);
      }).filter(v => v !== null)
    : [];

  const teamAvgNum = numAvg(nums);
  const prevAvgNum = numAvg(prevNums);
  const teamAvgStr = metric.key === 'mas' ? masAvgStr(currentResults) : fmtNum(teamAvgNum);
  const teamBestNum = nums.length ? (metric.higherBetter ? Math.max(...nums) : Math.min(...nums)) : null;
  const teamLowNum  = nums.length ? (metric.higherBetter ? Math.min(...nums) : Math.max(...nums)) : null;

  let heroDelta = '';
  let heroArrow = '';
  if (metric.key !== 'mas' && teamAvgNum !== null && prevAvgNum !== null) {
    const diff = (teamAvgNum - prevAvgNum).toFixed(2);
    const better = metric.higherBetter ? diff > 0 : diff < 0;
    const sign = diff > 0 ? '+' : '';
    heroDelta = ` · ${sign}${diff}${metric.unit} vs last`;
    heroArrow = better ? '↑' : '↓';
  }

  const maxN = nums.length ? Math.max(...nums) : 1;
  const minN = nums.length ? Math.min(...nums) : 0;

  const rankRows = withData.map((d, i) => {
    const isTop2 = i < 2;
    const pct = (maxN === minN || metric.key === 'mas') ? 50
      : metric.higherBetter
        ? ((d.num - minN) / (maxN - minN)) * 100
        : ((maxN - d.num) / (maxN - minN)) * 100;
    const scoreDisplay = metric.key === 'mas'
      ? d.masStr
      : `${fmtNum(d.num)}${metric.unit}`;
    return `
      <div class="pdf-rank-row${isTop2 ? ' pdf-rank-top' : ''}">
        <div class="pdf-rank-num">${i + 1}</div>
        <div class="pdf-rank-name">${d.player.name}</div>
        <div class="pdf-rank-bar-wrap"><div class="pdf-rank-bar" style="width:${Math.max(0, Math.min(100, pct)).toFixed(1)}%"></div></div>
        <div class="pdf-rank-score">${scoreDisplay}</div>
      </div>`;
  }).join('') || '<div class="pdf-rank-empty">No data recorded for this metric</div>';

  const heroDisplay = metric.key === 'mas' ? masAvgStr(currentResults) : `${teamAvgStr}${metric.unit}`;

  return `
    <div class="pdf-metric-page pdf-page">
      <div class="pdf-metric-header">
        <div class="pdf-metric-wordmark">N1 HSP</div>
        <div class="pdf-metric-team-info">${team.name.toUpperCase()} · ${metric.shortLabel}<br>${session.date}</div>
      </div>
      <div class="pdf-hero">
        <div class="pdf-hero-metric-name">${metric.label}</div>
        <div class="pdf-hero-val">${heroDisplay}</div>
        <div class="pdf-hero-sub">Team Average${heroDelta}</div>
        ${heroArrow ? `<div class="pdf-hero-badge">${heroArrow}</div>` : ''}
      </div>
      <div class="pdf-ranking">${rankRows}</div>
      <div class="pdf-stat-grid">
        <div class="pdf-stat-box"><div class="pdf-stat-lbl">Team Best</div><div class="pdf-stat-val">${metric.key !== 'mas' ? fmtNum(teamBestNum) + metric.unit : masAvgStr(currentResults)}</div></div>
        <div class="pdf-stat-box"><div class="pdf-stat-lbl">Team Avg</div><div class="pdf-stat-val">${teamAvgStr}${metric.key !== 'mas' ? metric.unit : ''}</div></div>
        <div class="pdf-stat-box"><div class="pdf-stat-lbl">Lowest</div><div class="pdf-stat-val">${metric.key !== 'mas' ? fmtNum(teamLowNum) + metric.unit : '—'}</div></div>
        <div class="pdf-stat-box"><div class="pdf-stat-lbl">Tested</div><div class="pdf-stat-val">${withData.length}</div></div>
      </div>
      <div class="pdf-footer">
        <span>NUMBER ONE HSP · HEALTH · STRENGTH · PERFORMANCE</span>
        <span>${metric.shortLabel} · ${pageNum} of ${totalPages}</span>
      </div>
    </div>`;
}

export function printTeamReport(teamId, sessionId, prevSessionId) {
  const team    = (getData().teams    || []).find(t => t.id === teamId);
  const club    = (getData().clubs    || []).find(c => c.id === team?.club_id);
  const players = (getData().players  || []).filter(p => p.team_id === teamId);
  const session = (getData().sessions || []).find(s => s.id === sessionId);
  const currentResults = (getData().results || []).filter(r => r.session_id === sessionId);
  const prevResults    = prevSessionId
    ? (getData().results || []).filter(r => r.session_id === prevSessionId)
    : null;

  if (!team || !session) {
    alert('Cannot generate PDF — team or session not found.');
    return;
  }

  const isSenior = (team.type || '').toLowerCase() === 'senior';
  const metrics  = ALL_METRICS.filter(m => !m.seniorOnly || isSenior);
  const total    = metrics.length + 1; // +1 for cover page

  const pagesHtml = [
    buildCoverPage(team, club, session, currentResults, players),
    ...metrics.map((m, i) =>
      buildMetricPage(m, team, session, currentResults, prevResults, players, i + 2, total)
    ),
  ].join('');

  const base = location.origin + location.pathname.replace(/[^/]*$/, '');
  const win  = window.open('', '_blank');
  if (!win) {
    alert('Popup blocked — please allow popups for this site.');
    return;
  }
  win.document.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${team.name} — Performance Report — ${session.date}</title>
  <link rel="stylesheet" href="${base}css/print-team.css">
</head>
<body class="pdf-body">
${pagesHtml}
<script>window.addEventListener('load', () => window.print());<\/script>
</body>
</html>`);
  win.document.close();
}
