# N1 HSP Performance App — Session Notes

## What This Is
Free web app for Number ONE HSP to record and report physical performance testing data for football players. Built with vanilla JS/HTML/CSS, Google Sheets as database, Google OAuth for auth, deployed on GitHub Pages.

**Live URL:** https://numberonehsp.github.io/n1hsp-performance-app/  
**Google Sheet ID:** `1j_E4xAEBmx8TpumZYTI76PLhQ9E_htud-yCbMqUw9kM`  
**Google Client ID:** `916433882107-hat21936crrnkhgdrmabv1kmlf0a7cbv.apps.googleusercontent.com`

---

## Architecture

### Stack
- Vanilla HTML/CSS/JS with ES modules — no framework, no bundler
- Google Sheets API v4 — free database (5 tabs: clubs, teams, players, sessions, results)
- Google Identity Services (GIS) + gapi — OAuth2
- Chart.js 4 (CDN) — bar charts in team reports
- GitHub Pages — free static hosting

### File Structure
```
js/
  config.js       — constants: client ID, sheet ID, metric definitions
  sheets.js       — readSheet(), appendRow() — raw Sheets API calls
  data.js         — loadAllData(), getData(), saveSession(), pure helpers
  auth.js         — Google OAuth init/sign-in/sign-out
  router.js       — hash-based routing parser
  app.js          — route dispatcher, onSignedIn()
  dashboard.js    — club/team cards, session links
  entry.js        — data entry form, player strip
  report-team.js  — team bar charts, session selector
  report-player.js — individual progress bars
  print-all.js    — renders all player reports for bulk PDF
css/
  main.css        — layout, header, sign-in, buttons
  entry.css       — data entry styles
  reports.css     — report styles + @media print
assests/          — logo files (note: folder name has typo, keep as-is)
  logo-light.jpg  — full colour logo (sign-in card)
  logo-white.png  — white logo (app header, report headers)
  logo-black.png  — black logo
  logo-dark.png   — dark bg logo
  cqn-logo.jpeg   — Connah's Quay Nomads FC club logo
```

### Data Flow
1. Sign-in → `loadAllData()` fetches all 5 Sheets tabs into in-memory `cache`
2. All reads use `getData()` (synchronous, from cache)
3. Save session → `saveSession()` writes to Sheets → `loadAllData()` refreshes cache → navigate
4. Hash routing: `#dashboard`, `#entry`, `#team-report`, `#player-report`, `#print-all`

### Google Sheets Tab Structure
- **clubs:** id, name, logo_url
- **teams:** id, club_id, name, type (Senior/Academy)
- **players:** id, team_id, name
- **sessions:** id, team_id, date
- **results:** id, session_id, player_id, height, weight, cmj, sprint_20m, mas_min, mas_sec, body_fat_pct, body_fat_mass, skeletal_muscle_mass

---

## Key Decisions

- **MAS stored as mas_min + mas_sec** — two separate columns, not seconds
- **Senior vs Academy** — Senior teams get 3 extra body composition metrics (body_fat_pct, body_fat_mass, skeletal_muscle_mass)
- **team_id casing** — Google Sheet players tab must use lowercase IDs (e.g. `team_1` not `Team_1`) to match teams tab
- **No chartjs-plugin-datalabels** — abandoned due to CDN registration issues; bar scores drawn via custom `afterDraw` plugin inside `avgLines` plugin block
- **Asset folder typo** — folder is `assests` not `assets` — do NOT rename, it would break all deployed paths
- **Club logos via GitHub raw URL** — Google Drive URLs blocked by CORS; use `https://raw.githubusercontent.com/numberonehsp/n1hsp-performance-app/main/assests/filename.jpg`

---

## Bugs Fixed This Session

| Bug | Fix |
|-----|-----|
| "Session not found" after save | Added `await loadAllData()` in `entry.js` `handleSave()` after `saveSession()` |
| White bar score labels invisible on white bg | Moved label drawing into `avgLines` plugin's `afterDraw`, positioned at `element.y + 20` |
| Datalabels plugin not registering | Abandoned plugin; replaced with custom canvas drawing |
| X-axis player names covered by next chart | Added `margin-bottom: 24px` to `.chart-section`; reduced x-axis font to 10px at 40° rotation |
| Chrome on iPad save error | Resolved by clearing Chrome cache |
| `team.type.toLowerCase()` crash | Guarded with `(team.type || '').toLowerCase()` |

---

## Current State

### Working
- Sign-in with Google, dashboard, data entry, session save
- Team report: bar charts, current + previous avg dashed lines, blue dots for previous scores, white score labels inside bars, session date dropdown
- Player report: progress bars, deltas, MAS mm:ss formatting
- Print team report: portrait A4, one chart per page, `@page { margin: 10mm }`
- Print player report: single page, compact layout
- Print all players: `#print-all` route renders all player reports, auto-triggers print
- Club logo via GitHub raw URL (CQN logo in place)
- Official Number ONE logo in header (white) and sign-in card (colour)

### Known Issues / Limitations
- Browser print dialog still shows URL/date in headers on some browsers — user must manually uncheck "Headers and Footers" in Chrome print dialog (Safari removes automatically)
- App requires internet connection — no offline save queuing
- Two users can enter data simultaneously safely (writes are independent) but won't see each other's new sessions until page reload

---

## Branding
- Primary: teal `#1a6b5c` / dark teal `#0d4a3f`
- Accent: dark red `#8b0000`
- Sign-in screen: `logo-light.jpg` on white card
- App header: `logo-white.png` on teal header
- Report headers: `logo-white.png` on teal gradient
- Footer text: `NUMBER O1NE HSP · HEALTH · STRENGTH · PERFORMANCE`

---

## Next Steps (Suggested)
1. **Fix x-axis label overlap on print** — still partially covering on some charts; may need to increase `chart-wrapper` print height above 420px or reduce team size threshold
2. **Offline save queue** — store failed saves in localStorage, retry on reconnect
3. **Add more clubs** — user currently has Connah's Quay Nomads only; needs adding more clubs/teams/players to Google Sheet
4. **Academy teams** — not yet tested end-to-end (only 5 metrics, no body comp)
5. **Favicon** — no favicon set, browser shows default
6. **Print headers/footers** — investigate CSS `@page` named pages to separate team (landscape) vs player (portrait) print orientations without JS injection
