import { getData, findPreviousSession, getPlayerResult, computeMetricStats,
         sortResultsByMetric, getDisplayValue, getNumericValue, formatMas } from './data.js';
import { METRIC_CONFIG, METRICS_ALL, METRICS_SENIOR } from './config.js';
import { navigate } from './router.js';

export async function renderTeamReport(sessionId) {
  const { clubs, teams, players, sessions, results } = getData();
  const session = sessions.find(s => s.id === sessionId);
  if (!session) {
    document.getElementById('team-report-content').innerHTML = '<p>Session not found.</p>';
    return;
  }

  const team = teams.find(t => t.id === session.team_id);
  const club = clubs.find(c => c.id === team.club_id);
  const teamPlayers = players.filter(p => p.team_id === team.id);
  const sessionResults = results.filter(r => r.session_id === sessionId);
  const metrics = team.type === 'Senior'
    ? [...METRICS_ALL, ...METRICS_SENIOR]
    : [...METRICS_ALL];

  const prevSession = findPreviousSession(sessions, team.id, sessionId);
  const prevResults = prevSession
    ? results.filter(r => r.session_id === prevSession.id)
    : [];

  const container = document.getElementById('team-report-content');
  container.innerHTML = '';

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
        <div class="report-brand-name">NUMBER O<span class="report-brand-one">1</span>NE</div>
        <div class="report-brand-sub">HEALTH · STRENGTH · PERFORMANCE</div>
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
      ? formatMas(Math.floor(stats.avg / 60), Math.round(stats.avg % 60))
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
                  return metric === 'mas'
                    ? formatMas(Math.floor(val / 60), Math.round(val % 60))
                    : `${val} ${cfg.unit}`;
                },
                afterLabel: (ctx) => {
                  const prev = prevValues[ctx.dataIndex];
                  if (prev === null) return '';
                  const diff = cfg.higherIsBetter ? ctx.raw - prev : prev - ctx.raw;
                  const sign = diff >= 0 ? '+' : '';
                  return `vs prev: ${sign}${diff.toFixed(1)}`;
                },
              },
            },
          },
          scales: {
            y: {
              beginAtZero: false,
              ticks: {
                callback: (v) => metric === 'mas'
                  ? formatMas(Math.floor(v / 60), Math.round(v % 60))
                  : v,
              },
            },
            x: { ticks: { font: { size: 11 } } },
          },
        },
        plugins: [{
          id: 'avgAndPrev',
          afterDraw(chart) {
            const { ctx, chartArea, scales } = chart;
            const { top, bottom, left, right } = chartArea;

            // Dashed average line
            const avgY = scales.y.getPixelForValue(stats.avg);
            ctx.save();
            ctx.strokeStyle = '#333';
            ctx.lineWidth = 1.5;
            ctx.setLineDash([6, 4]);
            ctx.beginPath();
            ctx.moveTo(left, avgY);
            ctx.lineTo(right, avgY);
            ctx.stroke();
            ctx.setLineDash([]);

            // Previous score dots
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

  // Individual player report links
  const playerLinks = document.createElement('div');
  playerLinks.style.cssText = 'padding: 16px;';
  playerLinks.innerHTML = `
    <h3 style="margin-bottom:12px;font-size:15px;color:var(--teal)">Individual Player Reports</h3>
    <div style="display:flex;flex-wrap:wrap;gap:8px;">
      ${teamPlayers
        .filter(p => sessionResults.some(r => r.player_id === p.id))
        .map(p => `<a class="player-name-link"
          href="#player-report?playerId=${p.id}&sessionId=${sessionId}">${p.name}</a>`)
        .join('')}
    </div>`;
  container.appendChild(playerLinks);

  // Footer
  container.insertAdjacentHTML('beforeend', `
    <div class="report-footer">
      <strong>NUMBER O1NE HSP</strong> · HEALTH · STRENGTH · PERFORMANCE<br>
      @NumberOneHSP · <a href="mailto:info@NumberOneHSP.com">info@NumberOneHSP.com</a> · www.NumberOneHSP.com
    </div>
  `);
}
