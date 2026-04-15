# Number ONE HSP — Football Performance Testing App
**Date:** 2026-04-15  
**Status:** Approved

---

## Overview

A free, browser-based web application for recording and reporting physical performance test results for football players. Hosted on GitHub Pages (free). All data stored in a single Google Sheet owned by the operator. No backend server. No ongoing costs.

The app serves two use cases:
1. **On-pitch data entry** — fast, mobile-friendly result entry during a testing session
2. **Report generation** — professional team and individual player reports, printable to PDF

---

## Tech Stack

| Concern | Solution |
|---|---|
| Hosting | GitHub Pages (free, static) |
| Database | Google Sheets (operator-owned) via Sheets API v4 |
| Authentication | Google OAuth2 via Google Identity Services (one-time sign-in) |
| Charts | Chart.js (CDN, free) |
| Languages | Vanilla HTML, CSS, JavaScript — no framework |

---

## Tests & Metrics

### All teams (Senior + Academy)
| Metric | Unit |
|---|---|
| Height | cm |
| Weight | kg |
| Countermovement Jump (CMJ) | cm |
| 20m Sprint | seconds |
| MAS Run 1200m | mm:ss |

### Senior teams only
| Metric | Unit |
|---|---|
| Body Fat % | % |
| Body Fat Mass | kg |
| Skeletal Muscle Mass | kg |

Body composition fields are hidden entirely in the data entry and reports for Academy teams.

---

## Data Structure (Google Sheets)

One Sheets file, five tabs:

### `clubs`
| Column | Type | Notes |
|---|---|---|
| id | string | Unique identifier |
| name | string | e.g. "Connah's Quay Nomads FC" |
| logo_url | string | URL to club badge image |

### `teams`
| Column | Type | Notes |
|---|---|---|
| id | string | Unique identifier |
| club_id | string | Foreign key → clubs.id |
| name | string | e.g. "Under 19s" |
| type | string | "Senior" or "Academy" |

### `players`
| Column | Type | Notes |
|---|---|---|
| id | string | Unique identifier |
| team_id | string | Foreign key → teams.id |
| name | string | Full name |

### `sessions`
| Column | Type | Notes |
|---|---|---|
| id | string | Unique identifier |
| team_id | string | Foreign key → teams.id |
| date | string | ISO date YYYY-MM-DD |

### `results`
| Column | Type | Notes |
|---|---|---|
| id | string | Unique identifier |
| session_id | string | Foreign key → sessions.id |
| player_id | string | Foreign key → players.id |
| height | number | cm |
| weight | number | kg |
| cmj | number | cm |
| sprint_20m | number | seconds |
| mas_min | number | minutes component |
| mas_sec | number | seconds component |
| body_fat_pct | number | % — blank for Academy |
| body_fat_mass | number | kg — blank for Academy |
| skeletal_muscle_mass | number | kg — blank for Academy |

MAS time stored as two columns (mas_min, mas_sec) for readability in the raw Sheet.

The app determines the "previous session" for each player by finding the most recent session for their team prior to the current one, then joins to their result row for that session.

---

## Application Views

### 1. Dashboard
- Lists all clubs, each with their teams
- Shows date of most recent session per team
- Button: "Start New Session" per team
- Button: "View Report" for any completed session

### 2. Data Entry
**Flow:**
1. Select club → select team → confirm date → session created
2. Player selector strip across the top — scrollable row of player name buttons
   - Green tick = result saved
   - Highlighted = currently selected
   - Plain = not yet tested
3. Tapping any player name loads their form instantly
4. "Skip" button records no result for that player (absent)
5. "Save Session" button (active once at least one result entered) writes all data to Sheets and redirects to Team Report

**Form layout (all-on-one-screen):**
- Player name large at top
- Numeric input per metric, large touch targets
- MAS time: two inputs side by side (mm : ss)
- Previous session score shown in grey beneath each input (if exists)
- Senior-only body composition fields shown at bottom for Senior teams, hidden for Academy

### 3. Team Report
**Structure:**
1. Header — club logo, team name, session date, Number ONE HSP branding
2. Summary strip — one stat card per metric showing team average
3. Bar charts — one full-width chart per metric
   - Players sorted best → worst: descending for CMJ, height, weight (highest first); ascending for sprint and MAS time (lowest = fastest = best)
   - Dashed horizontal line at team average
   - Value labelled on each bar
   - Small coloured dot on each bar indicating previous session score (if exists)
4. Footer — Number ONE HSP contact details

**Print behaviour:** "Print / Save PDF" button triggers browser print with print CSS. Each chart renders on its own page. Club branding and footer preserved.

### 4. Player Report
Accessible by clicking a player's name from the Team Report.

**Structure:**
1. Header — player name, club, team, date, Number ONE HSP branding
2. One row per metric:
   - Metric name + current score (large)
   - Horizontal progress bar spanning team min → team max
   - Vertical tick on bar = team average
   - Small circle on bar = previous session score
   - Colour-coded delta: green ↑ (improved), red ↓ (declined) vs previous
   - Raw numbers: current, team average, previous shown as text
3. Senior body composition section (Senior teams only) — same layout
4. Footer — Number ONE HSP contact details

**Access:** Printable individually. Future enhancement: batch-export all player PDFs at once.

---

## Branding

- **Primary colour:** Teal `#1a6b5c`
- **Accent colour:** Dark red `#8b0000`
- **Background:** White / light grey
- **Logo:** Number ONE HSP (top-right on all report pages)
- **Footer:** @NumberOneHSP · info@NumberOneHSP.com · www.NumberOneHSP.com

---

## Constraints

- **100% free** — no paid services, no subscriptions
- **No backend server** — all logic runs in the browser
- **Google account required** — operator signs in once with Google to authorise Sheets access
- **Internet required** — no offline mode (network connectivity assumed during testing)

---

## Out of Scope (v1)

- Batch PDF export for all players at once
- Player login / self-service portal
- Push notifications or email delivery
- Age group benchmarks / normative data comparisons
- Photo upload or video analysis
