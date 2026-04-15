# Number ONE HSP Performance Testing App — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a free, browser-based football performance testing app with Google Sheets as the database, including mobile-friendly data entry, team dashboard reports, and individual player reports printable to PDF.

**Architecture:** Single-page HTML app using native ES modules (no bundler). Google Identity Services handles OAuth2 sign-in. `gapi.client.sheets` reads/writes the Google Sheet. Hash-based routing (`#dashboard`, `#entry`, `#team-report`, `#player-report`) switches between four views. All business logic lives in `js/data.js` — the only module with unit tests.

**Tech Stack:** Vanilla HTML/CSS/JS (ES modules), Chart.js 4 (CDN), Google Identity Services + gapi (CDN), Jest + Babel (unit tests), GitHub Pages (hosting)

---

## File Map

| File | Responsibility |
|---|---|
| `index.html` | HTML shell with all four view containers; loads scripts |
| `css/main.css` | CSS variables, reset, layout, sign-in, header, buttons |
| `css/entry.css` | Player strip, entry form, inputs |
| `css/reports.css` | Team report, player report, print CSS |
| `js/config.js` | Constants: client ID, sheet ID, metric definitions |
| `js/auth.js` | Google OAuth2 sign-in/sign-out, access token management |
| `js/sheets.js` | `readSheet(tab)` and `appendRow(tab, values)` wrappers around gapi |
| `js/data.js` | All business logic: load data, find previous session, compute stats, sort |
| `js/router.js` | `getRoute()` and `navigate(path, params)` |
| `js/app.js` | Entry point: init auth, load data, wire hashchange → route → render |
| `js/dashboard.js` | Render dashboard view: clubs, teams, recent sessions |
| `js/entry.js` | Render data entry view: player strip, form, save session |
| `js/report-team.js` | Render team report: summary strip, Chart.js bar charts |
| `js/report-player.js` | Render player report: progress bars, deltas |
| `tests/data.test.js` | Unit tests for all pure functions in data.js |
| `package.json` | Jest + Babel dev dependencies |

---

## Task 1: Google Cloud Setup (Manual — Do This First)

This task has no code. Complete it before writing any files.

- [ ] **Step 1: Create a Google Cloud project**

  Go to https://console.cloud.google.com → New Project → name it "N1HSP Performance App" → Create.

- [ ] **Step 2: Enable the Google Sheets API**

  In the project: APIs & Services → Enable APIs → search "Google Sheets API" → Enable.

- [ ] **Step 3: Create an OAuth 2.0 Client ID**

  APIs & Services → Credentials → Create Credentials → OAuth client ID → Web application.

  Name: "N1HSP App". Leave Authorised redirect URIs blank for now (GitHub Pages URL added in Task 15).

  Copy the **Client ID** — you'll need it for `js/config.js`.

- [ ] **Step 4: Configure the OAuth consent screen**

  APIs & Services → OAuth consent screen → External → fill in App name ("N1HSP Performance Testing"), your email → Save.

  Add yourself as a test user under "Test users".

- [ ] **Step 5: Create the Google Sheet**

  Go to Google Sheets and create a new blank spreadsheet named "N1HSP Performance Data".

  Create five tabs named exactly: `clubs`, `teams`, `players`, `sessions`, `results`.

  Add header rows to each tab (row 1):

  - `clubs`: `id | name | logo_url`
  - `teams`: `id | club_id | name | type`
  - `players`: `id | team_id | name`
  - `sessions`: `id | team_id | date`
  - `results`: `id | session_id | player_id | height | weight | cmj | sprint_20m | mas_min | mas_sec | body_fat_pct | body_fat_mass | skeletal_muscle_mass`

  Copy the **Sheet ID** from the URL: `https://docs.google.com/spreadsheets/d/SHEET_ID_HERE/edit`

- [ ] **Step 6: Add seed data for one club**

  In the `clubs` tab add a row: `club_1 | Connah's Quay Nomads FC | `

  In the `teams` tab add two rows:
  ```
  team_1 | club_1 | Under 19s | Academy
  team_2 | club_1 | First Team | Senior
  ```

  In the `players` tab add a few rows:
  ```
  player_1 | team_1 | Miller Smith
  player_2 | team_1 | Ryley Berry
  player_3 | team_1 | Shayan Dehy
  ```

---

## Task 2: Project Scaffold

**Files:**
- Create: `index.html`
- Create: `css/main.css`
- Create: `package.json`

- [ ] **Step 1: Create `index.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
  <title>N1 HSP Performance Testing</title>
  <link rel="stylesheet" href="css/main.css">
  <link rel="stylesheet" href="css/entry.css">
  <link rel="stylesheet" href="css/reports.css">
  <script src="https://accounts.google.com/gsi/client" async defer></script>
  <script src="https://apis.google.com/js/api.js" async defer></script>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.min.js" defer></script>
</head>
<body>

  <div id="view-signin" class="view">
    <div class="signin-card">
      <div class="brand-lockup">
        <span class="brand-number">NUMBER</span>
        <span class="brand-o1ne">O<span class="brand-one">1</span>NE</span>
        <span class="brand-hsp">HEALTH · STRENGTH · PERFORMANCE</span>
      </div>
      <h1>Performance Testing</h1>
      <button id="btn-signin" class="btn-primary btn-large">Sign in with Google</button>
    </div>
  </div>

  <div id="view-dashboard" class="view hidden">
    <header class="app-header">
      <div class="brand-small">N<span>1</span> HSP</div>
      <button id="btn-signout" class="btn-text">Sign out</button>
    </header>
    <main id="dashboard-content" class="content-area"></main>
  </div>

  <div id="view-entry" class="view hidden">
    <header class="app-header">
      <button class="btn-back" onclick="history.back()">← Back</button>
      <span id="entry-title" class="header-title"></span>
      <button id="btn-save-session" class="btn-primary" disabled>Save</button>
    </header>
    <div id="player-strip-container"></div>
    <main id="entry-form-container" class="content-area"></main>
  </div>

  <div id="view-team-report" class="view hidden">
    <header class="app-header no-print">
      <button class="btn-back" onclick="history.back()">← Back</button>
      <span class="header-title">Team Report</span>
      <button class="btn-primary" onclick="window.print()">Print / PDF</button>
    </header>
    <main id="team-report-content"></main>
  </div>

  <div id="view-player-report" class="view hidden">
    <header class="app-header no-print">
      <button class="btn-back" onclick="history.back()">← Back</button>
      <span class="header-title">Player Report</span>
      <button class="btn-primary" onclick="window.print()">Print / PDF</button>
    </header>
    <main id="player-report-content"></main>
  </div>

  <script type="module" src="js/app.js"></script>
</body>
</html>
```

- [ ] **Step 2: Create `css/main.css`**

```css
:root {
  --teal: #1a6b5c;
  --teal-dark: #0d4a3f;
  --red: #8b0000;
  --red-light: #a00000;
  --green: #2d6a4f;
  --green-light: #52b788;
  --blue-light: #4fc3f7;
  --text: #1a1a1a;
  --text-muted: #666;
  --text-faint: #aaa;
  --bg: #f4f4f4;
  --bg-card: #ffffff;
  --border: #e0e0e0;
  --shadow: 0 1px 4px rgba(0,0,0,0.1);
  --radius: 8px;
  --header-h: 56px;
}

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  background: var(--bg); color: var(--text); font-size: 16px; }

.hidden { display: none !important; }

.view { min-height: 100vh; }

/* Sign-in */
#view-signin {
  display: flex; align-items: center; justify-content: center;
  background: linear-gradient(135deg, var(--teal) 0%, var(--teal-dark) 100%);
}
.signin-card {
  background: white; border-radius: 16px; padding: 48px 40px;
  text-align: center; max-width: 380px; width: 90%;
  box-shadow: 0 8px 32px rgba(0,0,0,0.2);
}
.brand-lockup { margin-bottom: 24px; }
.brand-number { display: block; font-size: 12px; font-weight: 700;
  letter-spacing: 2px; color: var(--text-muted); }
.brand-o1ne { display: block; font-size: 48px; font-weight: 900;
  color: var(--teal); line-height: 1; }
.brand-one { color: var(--red); }
.brand-hsp { display: block; font-size: 10px; letter-spacing: 2px;
  color: var(--text-faint); margin-top: 4px; }
.signin-card h1 { font-size: 20px; margin-bottom: 32px; color: var(--text); }

/* App header */
.app-header {
  position: sticky; top: 0; z-index: 100;
  height: var(--header-h);
  background: var(--teal); color: white;
  display: flex; align-items: center; justify-content: space-between;
  padding: 0 16px; gap: 12px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.15);
}
.brand-small { font-size: 18px; font-weight: 900; color: white; }
.brand-small span { color: var(--red-light); }
.header-title { font-size: 15px; font-weight: 600; flex: 1;
  text-align: center; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* Buttons */
.btn-primary {
  background: var(--red); color: white; border: none;
  padding: 10px 18px; border-radius: 6px; font-size: 14px;
  font-weight: 700; cursor: pointer; white-space: nowrap;
}
.btn-primary:disabled { background: #999; cursor: not-allowed; }
.btn-primary:not(:disabled):hover { background: var(--red-light); }
.btn-large { padding: 14px 32px; font-size: 16px; }
.btn-text { background: none; border: none; color: rgba(255,255,255,0.8);
  font-size: 14px; cursor: pointer; padding: 4px 8px; }
.btn-text:hover { color: white; }
.btn-back { background: none; border: none; color: white;
  font-size: 14px; cursor: pointer; padding: 4px 8px; white-space: nowrap; }

/* Content area */
.content-area { padding: 16px; max-width: 900px; margin: 0 auto; }

/* Cards */
.card {
  background: var(--bg-card); border-radius: var(--radius);
  box-shadow: var(--shadow); padding: 16px; margin-bottom: 12px;
}

/* Loading state */
.loading { text-align: center; padding: 48px; color: var(--text-muted); }
```

- [ ] **Step 3: Create `package.json`**

```json
{
  "name": "n1hsp-performance-app",
  "private": true,
  "scripts": {
    "test": "jest"
  },
  "devDependencies": {
    "@babel/core": "^7.24.0",
    "@babel/preset-env": "^7.24.0",
    "babel-jest": "^29.7.0",
    "jest": "^29.7.0"
  },
  "babel": {
    "presets": [["@babel/preset-env", { "targets": { "node": "current" } }]]
  },
  "jest": {
    "testEnvironment": "node",
    "transform": {
      "^.+\\.js$": "babel-jest"
    }
  }
}
```

- [ ] **Step 4: Install dev dependencies**

```bash
cd /Users/edharper/number-one-hsp-app
npm install
```

Expected: `node_modules/` created, no errors.

- [ ] **Step 5: Create empty CSS files**

```bash
touch css/entry.css css/reports.css
```

- [ ] **Step 6: Commit**

```bash
cd /Users/edharper/number-one-hsp-app
git add index.html css/ package.json package-lock.json
git commit -m "feat: project scaffold, HTML shell, base CSS"
```

---

## Task 3: Config Module

**Files:**
- Create: `js/config.js`

- [ ] **Step 1: Create `js/config.js`**

```javascript
// Replace GOOGLE_CLIENT_ID and SHEET_ID with your values from Task 1
export const GOOGLE_CLIENT_ID = 'YOUR_CLIENT_ID.apps.googleusercontent.com';
export const SHEET_ID = 'YOUR_GOOGLE_SHEET_ID';
export const SCOPES = 'https://www.googleapis.com/auth/spreadsheets';

// Metrics present for all team types
export const METRICS_ALL = ['height', 'weight', 'cmj', 'sprint_20m', 'mas'];

// Metrics present for Senior teams only
export const METRICS_SENIOR = ['body_fat_pct', 'body_fat_mass', 'skeletal_muscle_mass'];

// Full metric metadata used by reports and entry form
export const METRIC_CONFIG = {
  height:               { label: 'Height',               unit: 'cm', higherIsBetter: true,  type: 'number' },
  weight:               { label: 'Weight',               unit: 'kg', higherIsBetter: false, type: 'number' },
  cmj:                  { label: 'CMJ',                  unit: 'cm', higherIsBetter: true,  type: 'number' },
  sprint_20m:           { label: '20m Sprint',           unit: 's',  higherIsBetter: false, type: 'number' },
  mas:                  { label: 'MAS Run (1200m)',       unit: '',   higherIsBetter: false, type: 'time'   },
  body_fat_pct:         { label: 'Body Fat %',           unit: '%',  higherIsBetter: false, type: 'number' },
  body_fat_mass:        { label: 'Body Fat Mass',        unit: 'kg', higherIsBetter: false, type: 'number' },
  skeletal_muscle_mass: { label: 'Skeletal Muscle Mass', unit: 'kg', higherIsBetter: true,  type: 'number' },
};
```

- [ ] **Step 2: Create `js/` directory structure**

```bash
mkdir -p js tests
```

- [ ] **Step 3: Commit**

```bash
git add js/config.js
git commit -m "feat: add config module with metric definitions"
```

---

## Task 4: Data Layer + Unit Tests

This is the core logic module. All functions are pure (no DOM, no network) — tested with Jest.

**Files:**
- Create: `js/data.js`
- Create: `tests/data.test.js`

- [ ] **Step 1: Write the failing tests first**

Create `tests/data.test.js`:

```javascript
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
```

- [ ] **Step 2: Run tests — confirm they fail**

```bash
cd /Users/edharper/number-one-hsp-app
npm test
```

Expected: FAIL — `Cannot find module '../js/data.js'`

- [ ] **Step 3: Create `js/data.js`**

```javascript
import { readSheet, appendRow } from './sheets.js';
import { METRICS_ALL, METRICS_SENIOR, METRIC_CONFIG } from './config.js';

let cache = null;

export async function loadAllData() {
  const [clubs, teams, players, sessions, results] = await Promise.all([
    readSheet('clubs'),
    readSheet('teams'),
    readSheet('players'),
    readSheet('sessions'),
    readSheet('results'),
  ]);
  cache = { clubs, teams, players, sessions, results };
  return cache;
}

export function getData() {
  return cache;
}

export function findPreviousSession(sessions, teamId, currentSessionId) {
  const current = sessions.find(s => s.id === currentSessionId);
  if (!current) return null;
  const earlier = sessions
    .filter(s => s.team_id === teamId && s.id !== currentSessionId && s.date < current.date)
    .sort((a, b) => b.date.localeCompare(a.date));
  return earlier[0] ?? null;
}

export function getPlayerResult(results, playerId, sessionId) {
  return results.find(r => r.player_id === playerId && r.session_id === sessionId) ?? null;
}

export function masToSeconds(min, sec) {
  return parseFloat(min) * 60 + parseFloat(sec);
}

export function formatMas(min, sec) {
  return `${parseInt(min)}:${String(parseInt(sec)).padStart(2, '0')}`;
}

export function getNumericValue(result, metric) {
  if (!result) return null;
  if (metric === 'mas') return masToSeconds(result.mas_min, result.mas_sec);
  const v = parseFloat(result[metric]);
  return isNaN(v) ? null : v;
}

export function getDisplayValue(result, metric) {
  if (!result) return '—';
  if (metric === 'mas') {
    if (!result.mas_min && !result.mas_sec) return '—';
    return formatMas(result.mas_min, result.mas_sec);
  }
  return result[metric] || '—';
}

export function computeMetricStats(results, metric) {
  const values = results
    .map(r => getNumericValue(r, metric))
    .filter(v => v !== null);
  if (values.length === 0) return { min: 0, max: 0, avg: 0, count: 0 };
  const sum = values.reduce((a, b) => a + b, 0);
  return { min: Math.min(...values), max: Math.max(...values), avg: sum / values.length, count: values.length };
}

export function sortResultsByMetric(results, metric, higherIsBetter) {
  return [...results].sort((a, b) => {
    const va = getNumericValue(a, metric) ?? 0;
    const vb = getNumericValue(b, metric) ?? 0;
    return higherIsBetter ? vb - va : va - vb;
  });
}

export function getMetricsForTeamType(teamType) {
  return teamType === 'Senior' ? [...METRICS_ALL, ...METRICS_SENIOR] : [...METRICS_ALL];
}

export async function saveSession(teamId, date, resultsMap) {
  // resultsMap: { [playerId]: { height, weight, cmj, sprint_20m, mas_min, mas_sec, ... } }
  const sessionId = `sess_${Date.now()}`;
  await appendRow('sessions', [sessionId, teamId, date]);
  for (const [playerId, r] of Object.entries(resultsMap)) {
    const rowId = `res_${Date.now()}_${playerId}`;
    await appendRow('results', [
      rowId, sessionId, playerId,
      r.height ?? '', r.weight ?? '', r.cmj ?? '', r.sprint_20m ?? '',
      r.mas_min ?? '', r.mas_sec ?? '',
      r.body_fat_pct ?? '', r.body_fat_mass ?? '', r.skeletal_muscle_mass ?? '',
    ]);
  }
  return sessionId;
}
```

- [ ] **Step 4: Run tests — confirm they pass**

```bash
npm test
```

Expected: All 15 tests pass.

- [ ] **Step 5: Commit**

```bash
git add js/data.js tests/data.test.js
git commit -m "feat: data layer with unit tests"
```

---

## Task 5: Sheets API Wrapper

**Files:**
- Create: `js/sheets.js`

- [ ] **Step 1: Create `js/sheets.js`**

```javascript
import { SHEET_ID } from './config.js';

// Read all data rows from a named tab.
// Row 1 is treated as headers; rows 2+ become objects keyed by header.
export async function readSheet(tabName) {
  const response = await gapi.client.sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: tabName,
  });
  const rows = response.result.values || [];
  if (rows.length < 2) return [];
  const [headers, ...dataRows] = rows;
  return dataRows.map(row =>
    Object.fromEntries(headers.map((h, i) => [h, row[i] ?? '']))
  );
}

// Append one row to a named tab.
// values: array in the same column order as the tab headers.
export async function appendRow(tabName, values) {
  await gapi.client.sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: `${tabName}!A1`,
    valueInputOption: 'USER_ENTERED',
    resource: { values: [values] },
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add js/sheets.js
git commit -m "feat: Google Sheets API wrapper"
```

---

## Task 6: Auth Module

**Files:**
- Create: `js/auth.js`

- [ ] **Step 1: Create `js/auth.js`**

```javascript
import { GOOGLE_CLIENT_ID, SCOPES } from './config.js';

let tokenClient = null;
let accessToken = null;

// Call once on app load.
// onReady: called when gapi + GIS are loaded and sign-in button is ready.
// onSignedIn: called after the user successfully authenticates.
export function initAuth(onReady, onSignedIn) {
  gapi.load('client', async () => {
    await gapi.client.init({});
    await gapi.client.load('https://sheets.googleapis.com/$discovery/rest?version=v4');

    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: SCOPES,
      callback: (response) => {
        if (response.error) {
          console.error('Auth error:', response.error);
          return;
        }
        accessToken = response.access_token;
        onSignedIn();
      },
    });

    onReady();
  });
}

export function requestSignIn() {
  tokenClient.requestAccessToken({ prompt: '' });
}

export function signOut() {
  if (accessToken) {
    google.accounts.oauth2.revoke(accessToken, () => {});
    accessToken = null;
  }
  window.location.hash = '';
  window.location.reload();
}

export function isSignedIn() {
  return accessToken !== null;
}
```

- [ ] **Step 2: Commit**

```bash
git add js/auth.js
git commit -m "feat: Google OAuth2 auth module"
```

---

## Task 7: Router + App Entry Point

**Files:**
- Create: `js/router.js`
- Create: `js/app.js`

- [ ] **Step 1: Create `js/router.js`**

```javascript
export function getRoute() {
  const hash = window.location.hash.slice(1) || 'dashboard';
  const [path, query] = hash.split('?');
  const params = Object.fromEntries(new URLSearchParams(query || ''));
  return { path, params };
}

export function navigate(path, params = {}) {
  const query = new URLSearchParams(params).toString();
  window.location.hash = query ? `${path}?${query}` : path;
}
```

- [ ] **Step 2: Create `js/app.js`**

```javascript
import { initAuth, requestSignIn, signOut } from './auth.js';
import { loadAllData } from './data.js';
import { getRoute } from './router.js';
import { renderDashboard } from './dashboard.js';
import { renderEntry } from './entry.js';
import { renderTeamReport } from './report-team.js';
import { renderPlayerReport } from './report-player.js';

const VIEW_IDS = {
  dashboard: 'view-dashboard',
  entry: 'view-entry',
  'team-report': 'view-team-report',
  'player-report': 'view-player-report',
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
      // gapi ready — show sign-in screen
      document.getElementById('view-signin').classList.remove('hidden');
      document.getElementById('btn-signin').addEventListener('click', requestSignIn);
    },
    onSignedIn
  );
});
```

- [ ] **Step 3: Commit**

```bash
git add js/router.js js/app.js
git commit -m "feat: router and app entry point"
```

---

## Task 8: Dashboard View

**Files:**
- Create: `js/dashboard.js`
- Modify: `css/main.css` (append dashboard styles)

- [ ] **Step 1: Create `js/dashboard.js`**

```javascript
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
            <div class="team-type badge badge-${team.type.toLowerCase()}">${team.type}</div>
          </div>
          <div class="team-actions">
            <button class="btn-primary btn-sm btn-new-session"
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
                 <summary>All sessions (${teamSessions.length})</summary>
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
```

- [ ] **Step 2: Append dashboard styles to `css/main.css`**

```css
/* Dashboard */
.dashboard-club { margin-bottom: 24px; }
.club-name { font-size: 20px; font-weight: 800; color: var(--teal);
  margin-bottom: 10px; padding-bottom: 6px; border-bottom: 2px solid var(--teal); }
.team-card-header { display: flex; justify-content: space-between;
  align-items: flex-start; margin-bottom: 10px; }
.team-name { font-size: 16px; font-weight: 700; }
.badge { display: inline-block; font-size: 10px; font-weight: 700;
  padding: 2px 8px; border-radius: 20px; margin-top: 4px; text-transform: uppercase; }
.badge-senior { background: var(--teal); color: white; }
.badge-academy { background: #e0f2fe; color: #0369a1; }
.btn-sm { padding: 7px 12px; font-size: 13px; }
.team-last-session { font-size: 13px; color: var(--text-muted); }
.link-view-report { color: var(--teal); text-decoration: none; margin-left: 12px;
  font-weight: 600; font-size: 13px; }
.link-view-report:hover { text-decoration: underline; }
.text-muted { color: var(--text-muted); }
.past-sessions { margin-top: 8px; font-size: 13px; }
.past-sessions summary { cursor: pointer; color: var(--text-muted); }
.past-session-row { display: flex; justify-content: space-between;
  padding: 4px 0; border-bottom: 1px solid var(--border); }
.past-session-row a { color: var(--teal); text-decoration: none; }
```

- [ ] **Step 3: Commit**

```bash
git add js/dashboard.js css/main.css
git commit -m "feat: dashboard view"
```

---

## Task 9: Data Entry View

**Files:**
- Create: `js/entry.js`
- Create: `css/entry.css`

- [ ] **Step 1: Create `css/entry.css`**

```css
/* Player strip */
#player-strip-container {
  background: var(--teal-dark);
  padding: 10px 12px 8px;
  overflow-x: auto;
  white-space: nowrap;
  -webkit-overflow-scrolling: touch;
}
.player-strip { display: inline-flex; gap: 6px; }
.player-chip {
  display: inline-block; padding: 6px 12px; border-radius: 20px;
  font-size: 13px; font-weight: 600; cursor: pointer; border: 2px solid transparent;
  background: rgba(255,255,255,0.1); color: rgba(255,255,255,0.7);
  white-space: nowrap; transition: all 0.15s;
}
.player-chip.done { background: var(--green); color: white; border-color: var(--green-light); }
.player-chip.active { background: white; color: var(--teal-dark); border-color: white; }
.player-chip:hover:not(.active) { background: rgba(255,255,255,0.2); }

/* Entry form */
.entry-form { padding-bottom: 40px; }
.entry-player-name {
  font-size: 22px; font-weight: 900; color: var(--teal);
  margin-bottom: 4px; text-transform: uppercase;
}
.entry-progress { font-size: 13px; color: var(--text-muted); margin-bottom: 16px; }

.metric-group { margin-bottom: 16px; }
.metric-label {
  font-size: 12px; font-weight: 700; text-transform: uppercase;
  letter-spacing: 0.5px; color: var(--text-muted); margin-bottom: 4px;
}
.metric-prev { font-size: 11px; color: var(--text-faint); margin-bottom: 4px; }
.metric-input {
  width: 100%; padding: 14px 16px; font-size: 20px; font-weight: 700;
  border: 2px solid var(--border); border-radius: var(--radius);
  background: white; color: var(--text);
  -webkit-appearance: none; appearance: none;
}
.metric-input:focus { outline: none; border-color: var(--teal); }
.mas-inputs { display: flex; align-items: center; gap: 8px; }
.mas-inputs .metric-input { flex: 1; text-align: center; }
.mas-sep { font-size: 24px; font-weight: 900; color: var(--text-muted); }
.section-divider {
  margin: 20px 0 16px; padding-top: 16px;
  border-top: 2px solid var(--teal); font-size: 12px;
  font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: var(--teal);
}
.entry-actions { display: flex; gap: 10px; margin-top: 24px; }
.btn-skip {
  flex: 1; padding: 14px; border: 2px solid var(--border); border-radius: var(--radius);
  background: white; font-size: 15px; font-weight: 600; cursor: pointer; color: var(--text-muted);
}
.btn-skip:hover { border-color: var(--text-muted); }
.btn-next-player {
  flex: 2; padding: 14px; background: var(--teal); color: white;
  border: none; border-radius: var(--radius); font-size: 15px; font-weight: 700; cursor: pointer;
}
.btn-next-player:hover { background: var(--teal-dark); }
```

- [ ] **Step 2: Create `js/entry.js`**

```javascript
import { getData, findPreviousSession, getPlayerResult, getDisplayValue,
         getMetricsForTeamType, saveSession } from './data.js';
import { METRIC_CONFIG } from './config.js';
import { navigate } from './router.js';

let currentTeam = null;
let currentPlayers = [];
let currentPlayerIndex = 0;
let resultsMap = {};     // { [playerId]: { ...fieldValues } }
let skippedSet = new Set();
let previousResults = {}; // { [playerId]: resultRow | null }

export async function renderEntry(teamId, date) {
  const { teams, players, sessions, results } = getData();
  currentTeam = teams.find(t => t.id === teamId);
  if (!currentTeam) { document.getElementById('entry-form-container').innerHTML = '<p>Team not found.</p>'; return; }

  currentPlayers = players.filter(p => p.team_id === teamId);
  resultsMap = {};
  skippedSet = new Set();

  // Find the previous session for this team to show comparison values
  const teamSessions = sessions.filter(s => s.team_id === teamId);
  // There's no currentSessionId yet (session created on save), so we take the latest existing
  const latestPrev = teamSessions.sort((a, b) => b.date.localeCompare(a.date))[0];
  previousResults = {};
  currentPlayers.forEach(p => {
    previousResults[p.id] = latestPrev
      ? getPlayerResult(results, p.id, latestPrev.id)
      : null;
  });

  document.getElementById('entry-title').textContent =
    `${currentTeam.name} — ${date}`;
  document.getElementById('btn-save-session').onclick = () => handleSave(teamId, date);

  renderPlayerStrip();
  selectPlayer(0);
}

function renderPlayerStrip() {
  const strip = document.createElement('div');
  strip.className = 'player-strip';
  strip.id = 'player-strip';
  currentPlayers.forEach((p, i) => {
    const chip = document.createElement('button');
    chip.className = 'player-chip';
    chip.id = `chip-${p.id}`;
    chip.textContent = shortName(p.name);
    chip.onclick = () => selectPlayer(i);
    strip.appendChild(chip);
  });
  const container = document.getElementById('player-strip-container');
  container.innerHTML = '';
  container.appendChild(strip);
}

function shortName(name) {
  const parts = name.trim().split(' ');
  return parts.length > 1 ? `${parts[0][0]}. ${parts.slice(1).join(' ')}` : name;
}

function selectPlayer(index) {
  currentPlayerIndex = index;
  const player = currentPlayers[index];
  if (!player) return;

  // Update chip states
  currentPlayers.forEach((p, i) => {
    const chip = document.getElementById(`chip-${p.id}`);
    if (!chip) return;
    chip.classList.remove('active', 'done');
    if (i === index) chip.classList.add('active');
    else if (resultsMap[p.id] || skippedSet.has(p.id)) chip.classList.add('done');
  });

  // Scroll active chip into view
  document.getElementById(`chip-${player.id}`)?.scrollIntoView({ inline: 'center', behavior: 'smooth' });

  renderForm(player);
}

function renderForm(player) {
  const metrics = getMetricsForTeamType(currentTeam.type);
  const saved = resultsMap[player.id] || {};
  const prev = previousResults[player.id];
  const doneCount = Object.keys(resultsMap).length + skippedSet.size;

  const form = document.getElementById('entry-form-container');
  form.innerHTML = '';
  const div = document.createElement('div');
  div.className = 'entry-form card';

  div.innerHTML = `
    <div class="entry-player-name">${player.name}</div>
    <div class="entry-progress">Player ${currentPlayerIndex + 1} of ${currentPlayers.length} · ${doneCount} completed</div>
    ${metrics.map(metric => renderMetricField(metric, saved, prev)).join('')}
    <div class="entry-actions">
      <button class="btn-skip" id="btn-skip-player">Skip (absent)</button>
      <button class="btn-next-player" id="btn-next-player">
        ${currentPlayerIndex < currentPlayers.length - 1 ? 'Save & Next →' : 'Save & Done ✓'}
      </button>
    </div>
  `;
  form.appendChild(div);

  document.getElementById('btn-skip-player').onclick = () => skipPlayer(player);
  document.getElementById('btn-next-player').onclick = () => savePlayerAndAdvance(player, metrics);
}

function renderMetricField(metric, saved, prev) {
  const cfg = METRIC_CONFIG[metric];
  const prevDisplay = prev ? ` Previous: ${prev.mas_min !== undefined && metric === 'mas'
    ? `${prev.mas_min}:${String(prev.mas_sec).padStart(2,'0')}`
    : (prev[metric] || '—')} ${cfg.unit}` : '';

  if (metric === 'mas') {
    return `
      <div class="metric-group">
        <div class="metric-label">${cfg.label}</div>
        ${prevDisplay ? `<div class="metric-prev">${prevDisplay}</div>` : ''}
        <div class="mas-inputs">
          <input class="metric-input" type="number" id="field-mas_min"
            placeholder="mm" min="0" max="99" value="${saved.mas_min || ''}">
          <span class="mas-sep">:</span>
          <input class="metric-input" type="number" id="field-mas_sec"
            placeholder="ss" min="0" max="59" value="${saved.mas_sec || ''}">
        </div>
      </div>`;
  }

  if (metric === 'body_fat_pct') {
    return `<div class="section-divider">Body Composition</div>` + regularField(metric, cfg, saved, prevDisplay);
  }

  return regularField(metric, cfg, saved, prevDisplay);
}

function regularField(metric, cfg, saved, prevDisplay) {
  return `
    <div class="metric-group">
      <div class="metric-label">${cfg.label}${cfg.unit ? ` (${cfg.unit})` : ''}</div>
      ${prevDisplay ? `<div class="metric-prev">${prevDisplay}</div>` : ''}
      <input class="metric-input" type="number" id="field-${metric}"
        placeholder="Enter value" step="0.1" value="${saved[metric] || ''}">
    </div>`;
}

function readFormValues(metrics) {
  const values = {};
  metrics.forEach(metric => {
    if (metric === 'mas') {
      values.mas_min = document.getElementById('field-mas_min')?.value || '';
      values.mas_sec = document.getElementById('field-mas_sec')?.value || '';
    } else {
      values[metric] = document.getElementById(`field-${metric}`)?.value || '';
    }
  });
  return values;
}

function savePlayerAndAdvance(player, metrics) {
  resultsMap[player.id] = readFormValues(metrics);
  updateSaveButton();
  const next = currentPlayerIndex + 1;
  if (next < currentPlayers.length) {
    selectPlayer(next);
  } else {
    selectPlayer(currentPlayerIndex); // Refresh done state on last player
  }
}

function skipPlayer(player) {
  skippedSet.add(player.id);
  updateSaveButton();
  const next = currentPlayerIndex + 1;
  if (next < currentPlayers.length) selectPlayer(next);
}

function updateSaveButton() {
  const btn = document.getElementById('btn-save-session');
  btn.disabled = Object.keys(resultsMap).length === 0;
}

async function handleSave(teamId, date) {
  const btn = document.getElementById('btn-save-session');
  btn.disabled = true;
  btn.textContent = 'Saving…';
  try {
    const sessionId = await saveSession(teamId, date, resultsMap);
    navigate('team-report', { sessionId });
  } catch (err) {
    console.error(err);
    btn.disabled = false;
    btn.textContent = 'Save';
    alert('Error saving session. Check your internet connection and try again.');
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add js/entry.js css/entry.css
git commit -m "feat: data entry view with player strip and form"
```

---

## Task 10: Team Report

**Files:**
- Create: `js/report-team.js`
- Create: `css/reports.css`

- [ ] **Step 1: Create `css/reports.css`**

```css
/* Report shared */
.report-header {
  background: linear-gradient(135deg, var(--teal) 0%, var(--teal-dark) 100%);
  padding: 24px; color: white; display: flex;
  justify-content: space-between; align-items: flex-start;
}
.report-club-logo { width: 60px; height: 60px; object-fit: contain; margin-right: 16px; }
.report-header-text h1 { font-size: 22px; font-weight: 900; }
.report-header-text p { font-size: 14px; opacity: 0.8; margin-top: 2px; }
.report-brand { text-align: right; }
.report-brand-name { font-size: 20px; font-weight: 900; }
.report-brand-one { color: var(--red-light); }
.report-brand-sub { font-size: 9px; letter-spacing: 2px; opacity: 0.7; margin-top: 2px; }

/* Summary strip */
.summary-strip {
  display: flex; flex-wrap: wrap; gap: 10px;
  padding: 16px; background: var(--bg);
}
.summary-card {
  flex: 1; min-width: 80px; background: white; border-radius: var(--radius);
  padding: 12px; text-align: center; box-shadow: var(--shadow);
}
.summary-card-label { font-size: 10px; text-transform: uppercase;
  letter-spacing: 0.5px; color: var(--text-muted); margin-bottom: 4px; }
.summary-card-value { font-size: 20px; font-weight: 900; color: var(--teal); }
.summary-card-unit { font-size: 11px; color: var(--text-faint); }

/* Chart section */
.chart-section { padding: 16px; }
.chart-title {
  font-size: 16px; font-weight: 800; text-transform: uppercase;
  letter-spacing: 0.5px; color: var(--red); margin-bottom: 12px;
}
.chart-wrapper { position: relative; height: 300px; background: white;
  border-radius: var(--radius); padding: 12px; box-shadow: var(--shadow); }

/* Player name link in chart */
.player-name-link { color: var(--teal); cursor: pointer; text-decoration: underline; }

/* Player report progress bars */
.player-report-header { padding: 0 16px 16px; }
.player-report-header h2 { font-size: 24px; font-weight: 900; color: var(--teal); margin-top: 12px; }
.player-report-header p { font-size: 14px; color: var(--text-muted); }

.metric-row { padding: 12px 16px; border-bottom: 1px solid var(--border); }
.metric-row:last-child { border-bottom: none; }
.metric-row-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
.metric-row-label { font-size: 12px; font-weight: 700; text-transform: uppercase;
  letter-spacing: 0.5px; color: var(--text-muted); }
.metric-row-score { font-size: 22px; font-weight: 900; color: var(--text); }
.metric-row-unit { font-size: 13px; color: var(--text-muted); margin-left: 4px; }
.metric-delta { font-size: 13px; font-weight: 700; margin-left: 8px; }
.metric-delta.up { color: var(--green-light); }
.metric-delta.down { color: #e55; }

.progress-track { position: relative; height: 12px; background: #eee;
  border-radius: 6px; margin: 8px 0; overflow: visible; }
.progress-fill { position: absolute; left: 0; height: 100%;
  background: var(--red); border-radius: 6px; }
.progress-avg { position: absolute; top: -4px; width: 3px; height: 20px;
  background: #333; border-radius: 2px; }
.progress-prev { position: absolute; top: -5px; width: 10px; height: 10px;
  background: white; border: 2.5px solid var(--blue-light); border-radius: 50%;
  transform: translateX(-50%); }

.metric-row-meta { display: flex; justify-content: space-between;
  font-size: 11px; color: var(--text-faint); margin-top: 4px; }

/* Section header within player report */
.metric-section-header {
  padding: 10px 16px 6px; font-size: 12px; font-weight: 800;
  text-transform: uppercase; letter-spacing: 1px; color: var(--teal);
  background: #f0faf6; border-top: 2px solid var(--teal);
}

/* Report footer */
.report-footer {
  background: var(--teal-dark); color: white; text-align: center;
  padding: 20px; font-size: 12px; margin-top: 24px;
}
.report-footer a { color: var(--green-light); }

/* Print */
@media print {
  .no-print { display: none !important; }
  body { background: white; }
  .app-header { display: none !important; }
  .chart-wrapper { height: 260px; box-shadow: none; border: 1px solid #ddd; }
  .chart-section { page-break-inside: avoid; page-break-after: always; }
  .chart-section:last-of-type { page-break-after: auto; }
  .metric-row { page-break-inside: avoid; }
  .report-header { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .progress-fill, .progress-avg, .progress-prev { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
}
```

- [ ] **Step 2: Create `js/report-team.js`**

```javascript
import { getData, findPreviousSession, getPlayerResult, computeMetricStats,
         sortResultsByMetric, getDisplayValue, getNumericValue, formatMas } from './data.js';
import { METRIC_CONFIG, METRICS_ALL, METRICS_SENIOR } from './config.js';
import { navigate } from './router.js';

export async function renderTeamReport(sessionId) {
  const { clubs, teams, players, sessions, results } = getData();
  const session = sessions.find(s => s.id === sessionId);
  if (!session) { document.getElementById('team-report-content').innerHTML = '<p>Session not found.</p>'; return; }

  const team = teams.find(t => t.id === session.team_id);
  const club = clubs.find(c => c.id === team.club_id);
  const teamPlayers = players.filter(p => p.team_id === team.id);
  const sessionResults = results.filter(r => r.session_id === sessionId);
  const metrics = team.type === 'Senior' ? [...METRICS_ALL, ...METRICS_SENIOR] : [...METRICS_ALL];

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

    // Render after DOM insertion
    requestAnimationFrame(() => {
      const ctx = document.getElementById(canvasId).getContext('2d');
      new Chart(ctx, {
        type: 'bar',
        data: {
          labels: playerNames,
          datasets: [
            {
              label: cfg.label,
              data: values,
              backgroundColor: '#8b0000',
              borderColor: '#8b0000',
              borderWidth: 1,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            annotation: {}, // placeholder — average line drawn via annotation plugin below
            tooltip: {
              callbacks: {
                label: (ctx) => {
                  const val = ctx.raw;
                  if (metric === 'mas') return `${formatMas(Math.floor(val/60), Math.round(val%60))}`;
                  return `${val} ${cfg.unit}`;
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
                  ? formatMas(Math.floor(v/60), Math.round(v%60))
                  : v,
              },
            },
            x: { ticks: { font: { size: 11 } } },
          },
        },
        plugins: [{
          // Draw average dashed line and previous-score dots
          id: 'avgAndPrev',
          afterDraw(chart) {
            const { ctx, chartArea, scales } = chart;
            const { top, bottom, left, right } = chartArea;

            // Average line
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

  // Player names as clickable links below charts
  const playerLinks = document.createElement('div');
  playerLinks.style.cssText = 'padding: 16px;';
  playerLinks.innerHTML = `<h3 style="margin-bottom:12px;font-size:15px;color:var(--teal)">Individual Player Reports</h3>
    <div style="display:flex;flex-wrap:wrap;gap:8px;">
      ${teamPlayers
        .filter(p => sessionResults.some(r => r.player_id === p.id))
        .map(p => `<a class="player-name-link" href="#player-report?playerId=${p.id}&sessionId=${sessionId}">${p.name}</a>`)
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
```

- [ ] **Step 3: Commit**

```bash
git add js/report-team.js css/reports.css
git commit -m "feat: team report with Chart.js bar charts and average/prev overlays"
```

---

## Task 11: Player Report

**Files:**
- Create: `js/report-player.js`

- [ ] **Step 1: Create `js/report-player.js`**

```javascript
import { getData, findPreviousSession, getPlayerResult, computeMetricStats,
         getDisplayValue, getNumericValue, formatMas } from './data.js';
import { METRIC_CONFIG, METRICS_ALL, METRICS_SENIOR } from './config.js';

export async function renderPlayerReport(playerId, sessionId) {
  const { clubs, teams, players, sessions, results } = getData();
  const session = sessions.find(s => s.id === sessionId);
  if (!session) { document.getElementById('player-report-content').innerHTML = '<p>Session not found.</p>'; return; }

  const player = players.find(p => p.id === playerId);
  const team = teams.find(t => t.id === session.team_id);
  const club = clubs.find(c => c.id === team.club_id);
  const sessionResults = results.filter(r => r.session_id === sessionId);
  const currentResult = getPlayerResult(results, playerId, sessionId);
  const metrics = team.type === 'Senior' ? [...METRICS_ALL, ...METRICS_SENIOR] : [...METRICS_ALL];

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
          <h1>${player?.name || 'Player'}</h1>
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
    const prev = getNumericValue(prevResult, metric);

    // Section divider before body comp metrics
    if (metric === 'body_fat_pct' && !inBodyComp) {
      inBodyComp = true;
      body.insertAdjacentHTML('beforeend',
        `<div class="metric-section-header">Body Composition</div>`);
    }

    // Progress bar position (0–100%)
    const range = stats.max - stats.min || 1;
    const fillPct = Math.max(0, Math.min(100, ((current - stats.min) / range) * 100));
    const avgPct = Math.max(0, Math.min(100, ((stats.avg - stats.min) / range) * 100));
    const prevPct = prev !== null
      ? Math.max(0, Math.min(100, ((prev - stats.min) / range) * 100))
      : null;

    // Delta
    let deltaHtml = '';
    if (prev !== null) {
      const improved = cfg.higherIsBetter ? current > prev : current < prev;
      const diff = Math.abs(current - prev).toFixed(1);
      const sign = improved ? '▲' : '▼';
      const cls = improved ? 'up' : 'down';
      deltaHtml = `<span class="metric-delta ${cls}">${sign} ${diff}</span>`;
    }

    const displayCurrent = metric === 'mas'
      ? formatMas(currentResult.mas_min, currentResult.mas_sec)
      : current;
    const displayPrev = prev !== null && metric === 'mas'
      ? formatMas(prevResult.mas_min, prevResult.mas_sec)
      : prev;

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
          <div class="progress-fill" style="width:${fillPct}%"></div>
          <div class="progress-avg" style="left:${avgPct}%"></div>
          ${prevPct !== null
            ? `<div class="progress-prev" style="left:${prevPct}%"></div>`
            : ''}
        </div>
        <div class="metric-row-meta">
          <span>Team min: ${stats.min.toFixed(1)}</span>
          <span>Team avg: ${stats.avg.toFixed(1)}${prev !== null ? ` · Prev: ${displayPrev}` : ''}</span>
          <span>Team best: ${stats.max.toFixed(1)}</span>
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
```

- [ ] **Step 2: Commit**

```bash
git add js/report-player.js
git commit -m "feat: player report with progress bars and deltas"
```

---

## Task 12: GitHub Pages Deployment

**Files:**
- Create: `.gitignore`

- [ ] **Step 1: Create `.gitignore`**

```
node_modules/
.superpowers/
```

- [ ] **Step 2: Add your Client ID and Sheet ID to `js/config.js`**

Open `js/config.js` and replace:
- `YOUR_CLIENT_ID.apps.googleusercontent.com` → your actual client ID from Task 1 Step 3
- `YOUR_GOOGLE_SHEET_ID` → your actual sheet ID from Task 1 Step 5

- [ ] **Step 3: Commit everything and push to GitHub**

```bash
cd /Users/edharper/number-one-hsp-app
git add .gitignore js/config.js
git commit -m "feat: configure Google credentials and add gitignore"
```

Go to https://github.com/new — create a new public repository called `n1hsp-performance-app`.

Then:
```bash
git remote add origin https://github.com/YOUR_GITHUB_USERNAME/n1hsp-performance-app.git
git branch -M main
git push -u origin main
```

- [ ] **Step 4: Enable GitHub Pages**

On GitHub: repository Settings → Pages → Source: "Deploy from a branch" → Branch: `main` / `/ (root)` → Save.

Wait ~60 seconds. The app will be live at `https://YOUR_GITHUB_USERNAME.github.io/n1hsp-performance-app/`

- [ ] **Step 5: Add the GitHub Pages URL as an authorised origin in Google Cloud**

Go to Google Cloud Console → APIs & Services → Credentials → your OAuth 2.0 Client ID → Edit.

Under **Authorised JavaScript origins**, add:
`https://YOUR_GITHUB_USERNAME.github.io`

Save. Changes take a few minutes to propagate.

- [ ] **Step 6: Smoke test**

Open `https://YOUR_GITHUB_USERNAME.github.io/n1hsp-performance-app/` in a browser.

Expected:
1. Sign-in screen appears with Number ONE HSP branding
2. Click "Sign in with Google" → Google OAuth popup
3. After sign-in → Dashboard shows your club and teams from the Sheet
4. Click "+ New Session" → Entry view loads with player strip
5. Enter data for two players → click Save
6. Team Report opens showing bar charts
7. Click a player name → Player Report opens with progress bars
8. Click "Print / PDF" → browser print dialog opens with clean layout

---

## Task 13: Post-Deploy — Add Real Club Data

- [ ] **Step 1: Populate your Google Sheet with all clubs, teams, and players**

For each club:
- Add a row to `clubs`: `club_1 | Club Name | logo_url_or_blank`

For each team:
- Add a row to `teams`: `team_1 | club_1 | Under 19s | Academy`

For each player:
- Add a row to `players`: `player_1 | team_1 | Full Name`

Use simple sequential IDs (`club_1`, `club_2`, `team_1`, `team_2`, `player_1`...) — they just need to be unique strings.

- [ ] **Step 2: Reload the app and verify all clubs/teams/players appear on the dashboard**

- [ ] **Step 3: Run a full test session for one team and verify the team report and a player report both look correct**

---

## Self-Review Notes

- All spec requirements covered: dashboard ✓, data entry with player strip ✓, team report with bar charts + average + previous scores ✓, player report with progress bars ✓, Senior-only body comp ✓, print to PDF ✓, free stack ✓
- MAS time handled consistently as `mas_min`/`mas_sec` split throughout data layer, display layer, and forms
- `higherIsBetter` flag in `METRIC_CONFIG` drives both chart sort order and player report delta direction from a single source of truth
- No authentication tokens stored — user must sign in each browser session (GIS does not persist tokens)
