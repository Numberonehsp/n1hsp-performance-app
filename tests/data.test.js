// Mock modules that require browser globals
jest.mock('../js/sheets.js', () => ({
  readSheet: jest.fn(),
  appendRow: jest.fn(),
}));
jest.mock('../js/config.js', () => ({
  METRICS_ALL: ['height', 'weight', 'cmj', 'sprint_20m', 'mas'],
  METRICS_SENIOR: ['body_fat_pct', 'body_fat_mass', 'skeletal_muscle_mass'],
  METRIC_CONFIG: {
    height:     { higherIsBetter: true,  type: 'number' },
    cmj:        { higherIsBetter: true,  type: 'number' },
    sprint_20m: { higherIsBetter: false, type: 'number' },
    mas:        { higherIsBetter: false, type: 'time'   },
  },
}));

const {
  findPreviousSession,
  getPlayerResult,
  computeMetricStats,
  sortResultsByMetric,
  masToSeconds,
  formatMas,
  getDisplayValue,
  getNumericValue,
  getMetricsForTeamType,
} = require('../js/data.js');

describe('findPreviousSession', () => {
  const sessions = [
    { id: 's1', team_id: 't1', date: '2025-01-15' },
    { id: 's2', team_id: 't1', date: '2025-06-01' },
    { id: 's3', team_id: 't1', date: '2025-10-01' },
    { id: 's4', team_id: 't2', date: '2025-05-01' },
  ];

  it('returns the most recent session before currentSessionId for the same team', () => {
    expect(findPreviousSession(sessions, 't1', 's3').id).toBe('s2');
  });

  it('returns null when no earlier session exists', () => {
    expect(findPreviousSession(sessions, 't1', 's1')).toBeNull();
  });

  it('ignores sessions from other teams', () => {
    expect(findPreviousSession(sessions, 't1', 's2').id).toBe('s1');
  });

  it('returns null when currentSessionId not found', () => {
    expect(findPreviousSession(sessions, 't1', 'x99')).toBeNull();
  });
});

describe('getPlayerResult', () => {
  const results = [
    { id: 'r1', player_id: 'p1', session_id: 's1' },
    { id: 'r2', player_id: 'p2', session_id: 's1' },
    { id: 'r3', player_id: 'p1', session_id: 's2' },
  ];

  it('returns the matching result row', () => {
    expect(getPlayerResult(results, 'p1', 's1').id).toBe('r1');
  });

  it('returns null when no match', () => {
    expect(getPlayerResult(results, 'p3', 's1')).toBeNull();
  });
});

describe('masToSeconds', () => {
  it('converts mm:ss to total seconds', () => {
    expect(masToSeconds('4', '03')).toBe(243);
    expect(masToSeconds('4', '30')).toBe(270);
    expect(masToSeconds('5', '00')).toBe(300);
  });
});

describe('formatMas', () => {
  it('pads seconds to two digits', () => {
    expect(formatMas('4', '3')).toBe('4:03');
    expect(formatMas('4', '30')).toBe('4:30');
  });
});

describe('computeMetricStats', () => {
  const results = [
    { cmj: '56.4', mas_min: '4', mas_sec: '03' },
    { cmj: '52.6', mas_min: '4', mas_sec: '30' },
    { cmj: '38.0', mas_min: '4', mas_sec: '06' },
  ];

  it('computes min, max, avg, count for a numeric metric', () => {
    const s = computeMetricStats(results, 'cmj');
    expect(s.min).toBe(38.0);
    expect(s.max).toBe(56.4);
    expect(s.avg).toBeCloseTo(49.0);
    expect(s.count).toBe(3);
  });

  it('handles MAS time correctly', () => {
    const s = computeMetricStats(results, 'mas');
    expect(s.min).toBe(243);   // 4:03
    expect(s.max).toBe(270);   // 4:30
  });

  it('handles empty array', () => {
    expect(computeMetricStats([], 'cmj').count).toBe(0);
  });
});

describe('sortResultsByMetric', () => {
  const results = [
    { player_id: 'p1', cmj: '38.0', sprint_20m: '3.30', mas_min: '4', mas_sec: '30' },
    { player_id: 'p2', cmj: '56.4', sprint_20m: '2.99', mas_min: '4', mas_sec: '03' },
    { player_id: 'p3', cmj: '48.6', sprint_20m: '3.10', mas_min: '4', mas_sec: '15' },
  ];

  it('sorts descending for higherIsBetter metrics (CMJ)', () => {
    const sorted = sortResultsByMetric(results, 'cmj', true);
    expect(sorted.map(r => r.player_id)).toEqual(['p2', 'p3', 'p1']);
  });

  it('sorts ascending for lowerIsBetter metrics (sprint)', () => {
    const sorted = sortResultsByMetric(results, 'sprint_20m', false);
    expect(sorted.map(r => r.player_id)).toEqual(['p2', 'p3', 'p1']);
  });

  it('sorts MAS time ascending (fastest first)', () => {
    const sorted = sortResultsByMetric(results, 'mas', false);
    expect(sorted.map(r => r.player_id)).toEqual(['p2', 'p3', 'p1']);
  });
});

describe('getMetricsForTeamType', () => {
  it('returns base metrics for Academy', () => {
    const m = getMetricsForTeamType('Academy');
    expect(m).toEqual(['height', 'weight', 'cmj', 'sprint_20m', 'mas']);
  });

  it('returns base + senior metrics for Senior', () => {
    const m = getMetricsForTeamType('Senior');
    expect(m).toContain('body_fat_pct');
    expect(m).toContain('skeletal_muscle_mass');
    expect(m.length).toBe(8);
  });
});
