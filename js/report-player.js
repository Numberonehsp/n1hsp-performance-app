import { getData, findPreviousSession, getPlayerResult, computeMetricStats,
         getNumericValue, formatMas } from './data.js';
import { METRIC_CONFIG, METRICS_ALL, METRICS_SENIOR } from './config.js';

export async function renderPlayerReport(playerId, sessionId) {
  if (!getData()) {
    document.getElementById('player-report-content').innerHTML = '<p>Loading data…</p>';
    return;
  }

  const { clubs, teams, players, sessions, results } = getData();
  const session = sessions.find(s => s.id === sessionId);
  if (!session) {
    document.getElementById('player-report-content').innerHTML = '<p>Session not found.</p>';
    return;
  }

  const player = players.find(p => p.id === playerId);
  if (!player) {
    document.getElementById('player-report-content').innerHTML = '<p>Player not found.</p>';
    return;
  }
  const team = teams.find(t => t.id === session.team_id);
  if (!team) {
    document.getElementById('player-report-content').innerHTML = '<p>Team not found.</p>';
    return;
  }
  const club = clubs.find(c => c.id === team.club_id);
  if (!club) {
    document.getElementById('player-report-content').innerHTML = '<p>Club not found.</p>';
    return;
  }

  const sessionResults = results.filter(r => r.session_id === sessionId);
  const currentResult = getPlayerResult(results, playerId, sessionId);
  const metrics = team.type === 'Senior'
    ? [...METRICS_ALL, ...METRICS_SENIOR]
    : [...METRICS_ALL];

  const prevSession = findPreviousSession(sessions, team.id, sessionId);
  const prevResult = prevSession ? getPlayerResult(results, playerId, prevSession.id) : null;

  const container = document.getElementById('player-report-content');
  container.innerHTML = '';

  // Header
  container.insertAdjacentHTML('beforeend', `
    <div class="report-header">
      <div style="display:flex;align-items:center;">
        ${club.logo_url ? `<img class="report-club-logo" src="${club.logo_url}" alt="">` : ''}
        <div class="report-header-text">
          <h1>${player ? player.name : 'Player'}</h1>
          <p>${club.name} · ${team.name}</p>
          <p>${session.date}</p>
        </div>
      </div>
      <div class="report-brand">
        <div class="report-brand-name">NUMBER O<span class="report-brand-one">1</span>NE</div>
        <div class="report-brand-sub">HEALTH · STRENGTH · PERFORMANCE</div>
      </div>
    </div>
  `);

  const body = document.createElement('div');

  let inBodyComp = false;
  metrics.forEach(metric => {
    const cfg = METRIC_CONFIG[metric];
    const current = getNumericValue(currentResult, metric);
    if (current === null) return;

    const stats = computeMetricStats(sessionResults, metric);
    if (stats.count === 0) return;

    const prev = getNumericValue(prevResult, metric);

    // Section divider before body composition metrics
    if (metric === 'body_fat_pct' && !inBodyComp) {
      inBodyComp = true;
      body.insertAdjacentHTML('beforeend',
        `<div class="metric-section-header">Body Composition</div>`);
    }

    // Progress bar positions (0–100%)
    const range = stats.max - stats.min || 1;
    const fillPct = Math.max(0, Math.min(100, ((current - stats.min) / range) * 100));
    const avgPct  = Math.max(0, Math.min(100, ((stats.avg  - stats.min) / range) * 100));
    const prevPct = prev !== null
      ? Math.max(0, Math.min(100, ((prev - stats.min) / range) * 100))
      : null;

    // Delta vs previous
    let deltaHtml = '';
    if (prev !== null) {
      const diff = Math.abs(current - prev);
      if (diff > 0.001) {
        const improved = cfg.higherIsBetter ? current > prev : current < prev;
        const sign = improved ? '▲' : '▼';
        const cls  = improved ? 'up' : 'down';
        deltaHtml = `<span class="metric-delta ${cls}">${sign} ${diff.toFixed(1)}</span>`;
      }
    }

    const displayCurrent = metric === 'mas'
      ? formatMas(currentResult.mas_min, currentResult.mas_sec)
      : current;
    const displayPrev = prev !== null && metric === 'mas'
      ? formatMas(prevResult.mas_min, prevResult.mas_sec)
      : prev;

    const fmtStat = (val) => {
      if (metric === 'mas') {
        const s = Math.round(val);
        return formatMas(Math.floor(s / 60), s % 60);
      }
      return val.toFixed(1);
    };

    body.insertAdjacentHTML('beforeend', `
      <div class="metric-row">
        <div class="metric-row-header">
          <span class="metric-row-label">${cfg.label}</span>
          <span>
            <span class="metric-row-score">${displayCurrent}</span>
            <span class="metric-row-unit">${cfg.unit}</span>
            ${deltaHtml}
          </span>
        </div>
        <div class="progress-track">
          <div class="progress-fill" style="width:${fillPct.toFixed(1)}%"></div>
          <div class="progress-avg" style="left:${avgPct.toFixed(1)}%"></div>
          ${prevPct !== null
            ? `<div class="progress-prev" style="left:${prevPct.toFixed(1)}%"></div>`
            : ''}
        </div>
        <div class="metric-row-meta">
          <span>Team min: ${fmtStat(stats.min)}</span>
          <span>Team avg: ${fmtStat(stats.avg)}${prev !== null ? ` · Prev: ${displayPrev}` : ''}</span>
          <span>Team best: ${fmtStat(stats.max)}</span>
        </div>
      </div>
    `);
  });

  container.appendChild(body);

  container.insertAdjacentHTML('beforeend', `
    <div class="report-footer">
      <strong>NUMBER O1NE HSP</strong> · HEALTH · STRENGTH · PERFORMANCE<br>
      @NumberOneHSP · <a href="mailto:info@NumberOneHSP.com">info@NumberOneHSP.com</a> · www.NumberOneHSP.com
    </div>
  `);
}
