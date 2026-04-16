import { getData, findPreviousSession, computeMetricStats,
         sortResultsByMetric, getNumericValue, formatMas } from './data.js';
import { METRIC_CONFIG, METRICS_ALL, METRICS_SENIOR } from './config.js';

export async function renderTeamReport(sessionId) {
  if (!getData()) {
    document.getElementById('team-report-content').innerHTML = '<p>Loading data…</p>';
    return;
  }
  const { clubs, teams, players, sessions, results } = getData();
  const session = sessions.find(s => s.id === sessionId);
  if (!session) {
    document.getElementById('team-report-content').innerHTML = '<p>Session not found.</p>';
    return;
  }

  const team = teams.find(t => t.id === session.team_id);
  if (!team) {
    document.getElementById('team-report-content').innerHTML = '<p>Team not found.</p>';
    return;
  }
  const club = clubs.find(c => c.id === team.club_id);
  if (!club) {
    document.getElementById('team-report-content').innerHTML = '<p>Club not found.</p>';
    return;
  }
  const teamPlayers = players.filter(p => p.team_id === team.id);
  const sessionResults = results.filter(r => r.session_id === sessionId);
  const metrics = team.type === 'Senior'
    ? [...METRICS_ALL, ...METRICS_SENIOR]
    : [...METRICS_ALL];

  const prevSession = findPreviousSession(sessions, team.id, sessionId);
  const prevResults = prevSession
    ? results.filter(r => r.session_id === prevSession.id)
    : [];

  // All sessions for this team, newest first (for dropdown)
  const teamSessions = [...sessions.filter(s => s.team_id === team.id)]
    .sort((a, b) => b.date.localeCompare(a.date));

  const container = document.getElementById('team-report-content');
  container.innerHTML = '';

  // Session selector bar (hidden when printing)
  if (teamSessions.length > 1) {
    const selectorBar = document.createElement('div');
    selectorBar.className = 'session-selector-bar no-print';
    selectorBar.innerHTML = `
      <label for="session-select">Session date:</label>
      <select id="session-select">
        ${teamSessions.map(s =>
          `<option value="${s.id}" ${s.id === sessionId ? 'selected' : ''}>${s.date}</option>`
        ).join('')}
      </select>
    `;
    container.appendChild(selectorBar);
    selectorBar.querySelector('#session-select').addEventListener('change', (e) => {
      window.location.hash = `team-report?sessionId=${e.target.value}`;
    });
  }

  // Header
  container.insertAdjacentHTML('beforeend', `
    <div class="report-header">
      <div style="display:flex;align-items:center;">
        ${club.logo_url ? `<img class="report-club-logo" src="${club.logo_url}" alt="${club.name} logo">` : ''}
        <div class="report-header-text">
          <h1>${club.name}</h1>
          <p>${team.name} · ${session.date}</p>
          <p>Physical Performance Testing</p>
        </div>
      </div>
      <div class="report-brand">
        <img src="assests/logo-white.png" alt="Number ONE HSP" class="report-brand-logo">
      </div>
    </div>
  `);

  // Summary strip
  const strip = document.createElement('div');
  strip.className = 'summary-strip';
  metrics.forEach(metric => {
    const stats = computeMetricStats(sessionResults, metric);
    if (stats.count === 0) return;
    const cfg = METRIC_CONFIG[metric];
    const avgDisplay = metric === 'mas'
      ? (() => { const s = Math.round(stats.avg); return formatMas(Math.floor(s / 60), s % 60); })()
      : stats.avg.toFixed(1);
    strip.insertAdjacentHTML('beforeend', `
      <div class="summary-card">
        <div class="summary-card-label">${cfg.label}</div>
        <div class="summary-card-value">${avgDisplay}</div>
        <div class="summary-card-unit">${cfg.unit || 'avg'}</div>
      </div>
    `);
  });
  container.appendChild(strip);

  // One chart per metric
  metrics.forEach(metric => {
    const cfg = METRIC_CONFIG[metric];
    const sorted = sortResultsByMetric(sessionResults, metric, cfg.higherIsBetter)
      .filter(r => getNumericValue(r, metric) !== null);
    if (sorted.length === 0) return;

    const stats = computeMetricStats(sorted, metric);
    const prevFilteredResults = prevResults.filter(r => getNumericValue(r, metric) !== null);
    const prevStats = prevFilteredResults.length > 0
      ? computeMetricStats(prevFilteredResults, metric)
      : null;

    const playerNames = sorted.map(r => {
      const p = teamPlayers.find(p => p.id === r.player_id);
      return p ? p.name : r.player_id;
    });
    const values = sorted.map(r => getNumericValue(r, metric));
    const prevValues = sorted.map(r => {
      const prev = prevResults.find(pr => pr.player_id === r.player_id);
      return prev ? getNumericValue(prev, metric) : null;
    });

    const section = document.createElement('div');
    section.className = 'chart-section';
    const canvasId = `chart-${metric}`;
    section.innerHTML = `
      <div class="chart-title">${cfg.label}${cfg.unit ? ` (${cfg.unit})` : ''}</div>
      <div class="chart-wrapper"><canvas id="${canvasId}"></canvas></div>
    `;
    container.appendChild(section);

    requestAnimationFrame(() => {
      const ctx = document.getElementById(canvasId).getContext('2d');
      new Chart(ctx, {
        type: 'bar',
        data: {
          labels: playerNames,
          datasets: [{
            label: cfg.label,
            data: values,
            backgroundColor: '#8b0000',
            borderColor: '#8b0000',
            borderWidth: 1,
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: (ctx) => {
                  const val = ctx.raw;
                  if (metric === 'mas') {
                    const s = Math.round(val);
                    return formatMas(Math.floor(s / 60), s % 60);
                  }
                  return `${parseFloat(val.toFixed(2))} ${cfg.unit}`;
                },
                afterLabel: (ctx) => {
                  const prev = prevValues[ctx.dataIndex];
                  if (prev === null) return '';
                  const diff = cfg.higherIsBetter ? ctx.raw - prev : prev - ctx.raw;
                  const sign = diff >= 0 ? '+' : '';
                  return `vs prev: ${sign}${diff.toFixed(2)}`;
                },
              },
            },
            // Scores inside bars, rotated vertically
            datalabels: {
              display: true,
              anchor: 'start',
              align: 'end',
              offset: 4,
              rotation: -90,
              color: 'rgba(255,255,255,0.92)',
              font: { size: 10, weight: 'bold' },
              formatter: (value) => {
                if (metric === 'mas') {
                  const s = Math.round(value);
                  return formatMas(Math.floor(s / 60), s % 60);
                }
                return parseFloat(value.toFixed(2));
              },
            },
          },
          scales: {
            y: {
              beginAtZero: false,
              ticks: {
                // Fix: no excessive decimals on Y axis
                callback: (v) => {
                  if (metric === 'mas') {
                    const s = Math.round(v);
                    return formatMas(Math.floor(s / 60), s % 60);
                  }
                  return parseFloat(v.toFixed(2));
                },
              },
            },
            x: { ticks: { font: { size: 11 } } },
          },
        },
        plugins: [{
          id: 'avgLines',
          afterDraw(chart) {
            const { ctx, chartArea, scales } = chart;
            const { left, right } = chartArea;

            ctx.save();

            // Current session average — dark dashed line
            const avgY = scales.y.getPixelForValue(stats.avg);
            ctx.strokeStyle = '#333';
            ctx.lineWidth = 1.5;
            ctx.setLineDash([6, 4]);
            ctx.beginPath();
            ctx.moveTo(left, avgY);
            ctx.lineTo(right, avgY);
            ctx.stroke();
            const avgLabel = metric === 'mas'
              ? (() => { const s = Math.round(stats.avg); return formatMas(Math.floor(s / 60), s % 60); })()
              : `Avg: ${parseFloat(stats.avg.toFixed(2))}`;
            ctx.fillStyle = '#333';
            ctx.font = 'bold 10px sans-serif';
            ctx.textAlign = 'right';
            ctx.fillText(avgLabel, right - 4, avgY - 4);

            // Previous session average — blue dashed line
            if (prevStats && prevStats.count > 0) {
              const prevAvgY = scales.y.getPixelForValue(prevStats.avg);
              ctx.strokeStyle = '#4fc3f7';
              ctx.lineWidth = 1.5;
              ctx.setLineDash([4, 4]);
              ctx.beginPath();
              ctx.moveTo(left, prevAvgY);
              ctx.lineTo(right, prevAvgY);
              ctx.stroke();
              const prevAvgLabel = metric === 'mas'
                ? (() => { const s = Math.round(prevStats.avg); return formatMas(Math.floor(s / 60), s % 60); })()
                : `Prev avg: ${parseFloat(prevStats.avg.toFixed(2))}`;
              ctx.fillStyle = '#4fc3f7';
              ctx.fillText(prevAvgLabel, right - 4, prevAvgY - 4);
            }

            ctx.setLineDash([]);

            // Previous score dots per player
            prevValues.forEach((prev, i) => {
              if (prev === null) return;
              const meta = chart.getDatasetMeta(0).data[i];
              const x = meta.x;
              const y = scales.y.getPixelForValue(prev);
              ctx.fillStyle = '#4fc3f7';
              ctx.strokeStyle = 'white';
              ctx.lineWidth = 2;
              ctx.beginPath();
              ctx.arc(x, y, 5, 0, Math.PI * 2);
              ctx.fill();
              ctx.stroke();
            });

            ctx.restore();
          },
        }],
      });
    });
  });

  // Individual player links + Print All button
  const playersWithResults = teamPlayers
    .filter(p => sessionResults.some(r => r.player_id === p.id));
  const playerLinks = document.createElement('div');
  playerLinks.className = 'player-links-section';
  playerLinks.innerHTML = `
    <h3 class="player-links-heading">Individual Player Reports</h3>
    <div class="player-links-grid">
      ${playersWithResults
        .map(p => `<a class="player-name-link"
          href="#player-report?playerId=${p.id}&sessionId=${sessionId}">${p.name}</a>`)
        .join('')}
    </div>
    <button type="button" class="btn-primary no-print" id="btn-print-all" style="margin-top:12px;">
      Print All Players (PDF)
    </button>
  `;
  container.appendChild(playerLinks);

  document.getElementById('btn-print-all').addEventListener('click', () => {
    window.location.hash = `print-all?sessionId=${sessionId}`;
  });

  // Footer
  container.insertAdjacentHTML('beforeend', `
    <div class="report-footer">
      <strong>NUMBER O1NE HSP</strong> · HEALTH · STRENGTH · PERFORMANCE<br>
      @NumberOneHSP · <a href="mailto:info@NumberOneHSP.com">info@NumberOneHSP.com</a> · www.NumberOneHSP.com
    </div>
  `);
}
