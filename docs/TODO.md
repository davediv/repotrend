# Project TODO List
*Generated from PRD.md on 2026-02-21*

## Executive Summary

RepoTrend is a historical archive for GitHub trending repositories built on Astro + Cloudflare Workers/D1/KV. The project consists of **62 tasks** across **4 phases**, covering infrastructure setup, a daily scraper worker, a browsable frontend with date/week views, dark mode, responsive design, and iterative enhancements (streaks, search, sparklines, charts, comparisons). The codebase currently has Astro scaffolding with the Cloudflare adapter configured but no application logic yet.

---

## Phase 0: Scraper & Data Foundation

### Infrastructure & Environment

- [x] 🟡 **INFRA-P0-001**: Configure Cloudflare D1 database binding in `wrangler.jsonc`
  - **Acceptance Criteria**:
    - `wrangler.jsonc` contains a `d1_databases` binding named `DB`
    - `npm run cf-typegen` generates types that include the D1 binding
    - `Env` interface in `worker-configuration.d.ts` includes `DB: D1Database`
  - **Dependencies**: None
  - **Effort**: Actual ≈ estimated (small config-only change)
  - **Completed**: 2026-02-21
  - **Commit**: N/A (not committed yet)

- [x] 🟡 **INFRA-P0-002**: Configure Cloudflare KV namespace binding in `wrangler.jsonc`
  - **Acceptance Criteria**:
    - `wrangler.jsonc` contains a `kv_namespaces` binding named `CACHE`
    - `npm run cf-typegen` generates types that include the KV binding
    - `Env` interface includes `CACHE: KVNamespace`
  - **Dependencies**: None
  - **Effort**: Actual ≈ estimated (small config-only change)
  - **Completed**: 2026-02-21
  - **Commit**: N/A (not committed yet)

- [x] 🟡 **INFRA-P0-003**: Configure Cloudflare Worker cron trigger in `wrangler.jsonc`
  - **Acceptance Criteria**:
    - `wrangler.jsonc` contains a `triggers.crons` array with at least one schedule (e.g., `"0 6 * * *"` for daily 06:00 UTC)
    - Cron trigger can be tested locally with `wrangler dev --test-scheduled`
  - **Dependencies**: None
  - **Effort**: Actual ≈ estimated (small config-only change)
  - **Completed**: 2026-02-21
  - **Commit**: N/A (not committed yet)

### Database & Data Models

- [x] 🟡 **DB-P0-001**: Create D1 database schema migration for `trending_repos` table
  - **Acceptance Criteria**:
    - Migration SQL file exists at `migrations/0001_create_trending_repos.sql`
    - Table `trending_repos` created with columns: `id` (INTEGER PK AUTOINCREMENT), `repo_owner` (TEXT NOT NULL), `repo_name` (TEXT NOT NULL), `description` (TEXT), `language` (TEXT), `language_color` (TEXT), `total_stars` (INTEGER NOT NULL DEFAULT 0), `forks` (INTEGER NOT NULL DEFAULT 0), `stars_today` (INTEGER NOT NULL DEFAULT 0), `trending_date` (TEXT NOT NULL), `scraped_at` (TEXT NOT NULL)
    - Composite unique constraint on (`repo_owner`, `repo_name`, `trending_date`) enforces deduplication
    - Index on `trending_date` for fast date lookups
    - Index on (`repo_owner`, `repo_name`) for search and streak queries
    - Migration runs successfully via `wrangler d1 migrations apply`
  - **Dependencies**: INFRA-P0-001
  - **Effort**: Actual ≈ estimated (straightforward schema + indexes)
  - **Completed**: 2026-02-21
  - **Commit**: N/A (not committed yet)

- [x] 🟡 **DB-P0-002**: Create seed script for local development with sample trending data
  - **Acceptance Criteria**:
    - Script inserts 25 sample repos across 7 days of trending data
    - Sample data includes variety of languages, star counts, and descriptions
    - Script can be run against local D1 via wrangler
    - Querying `SELECT * FROM trending_repos WHERE trending_date = '2026-02-15'` returns 25 rows
  - **Dependencies**: DB-P0-001
  - **Effort**: Actual ≈ estimated
  - **Completed**: 2026-02-21
  - **Commit**: N/A (not committed yet)

### Scraper Worker

- [x] **FEAT-P0-001**: Implement GitHub trending page HTML fetcher
  - **Success Criteria**:
    - Function fetches `https://github.com/trending?spoken_language_code=en` with appropriate headers
    - User-Agent header set to a realistic browser string
    - Request includes reasonable delay/jitter to avoid rate limiting
    - Returns raw HTML string on success
    - Throws descriptive error on HTTP non-200 responses
    - Handles network timeouts gracefully (30-second max)
  - **Dependencies**: None
  - **Completed**: 2026-02-22
  - **Implementation**: `src/lib/scraper/fetcher.ts` — `fetchTrendingPage()` with 30s AbortController timeout, realistic UA, and `randomDelay()` jitter utility

- [x] **FEAT-P0-002**: Implement HTML parser to extract trending repo data
  - **Success Criteria**:
    - Parses the GitHub trending page HTML and extracts all 25 repos
    - Each parsed repo includes: `repo_owner`, `repo_name`, `description`, `language`, `language_color`, `total_stars`, `forks`, `stars_today`
    - Handles missing optional fields (description, language) gracefully with null values
    - Parses star counts correctly (handles "1,234" comma formatting and "1.2k" abbreviations)
    - Returns typed array of repo objects
    - Throws descriptive error if page structure is unrecognizable
  - **Dependencies**: FEAT-P0-001
  - **Completed**: 2026-02-22
  - **Implementation**: `src/lib/scraper/parser.ts` — `parseTrendingPage()` using `node-html-parser`, extracts all 25 repos via `article.Box-row` selector with `parseFormattedNumber()` utility for comma/k-abbreviated numbers

- [x] **FEAT-P0-003**: Implement D1 persistence layer for scraped data
  - **Success Criteria**:
    - Function accepts an array of parsed repos and a date, and inserts/upserts into `trending_repos`
    - Uses `INSERT OR REPLACE` (or equivalent) keyed on (`repo_owner`, `repo_name`, `trending_date`) for deduplication
    - Sets `scraped_at` to the current UTC timestamp
    - Returns count of rows inserted/updated
    - Handles D1 errors with descriptive logging
  - **Dependencies**: DB-P0-001, FEAT-P0-002
  - **Completed**: 2026-02-22
  - **Implementation**: `src/lib/scraper/persistence.ts` — `persistRepos()` using D1 batch API with `INSERT OR REPLACE` for deduplication, typed error handling

- [x] **FEAT-P0-004**: Implement scheduled cron handler that orchestrates scrape pipeline
  - **Success Criteria**:
    - Exports a `scheduled` event handler in the Worker entry point
    - Handler calls fetch → parse → persist in sequence
    - Logs start time, repo count, and duration on success
    - Logs error details on any failure (fetch, parse, or persist)
    - Does not crash the Worker on transient errors; catches and logs
    - Can be triggered locally with `wrangler dev --test-scheduled`
  - **Dependencies**: FEAT-P0-001, FEAT-P0-002, FEAT-P0-003, INFRA-P0-003
  - **Completed**: 2026-02-22
  - **Implementation**: `src/lib/scraper/pipeline.ts` — `runScrapePipeline()` orchestrates fetch→parse→persist with structured JSON logging; `src/pages/api/cron.ts` — API route exposing the pipeline; `scripts/inject-scheduled.mjs` — post-build script injecting `scheduled` handler into compiled Worker via self-fetch to `/api/cron`

- [x] **FEAT-P0-005**: Add scrape health logging and failure tracking
  - **Success Criteria**:
    - Each scrape attempt logs: timestamp, success/failure, repos captured count, duration in ms
    - Failed scrapes log the error type and message
    - Logs are visible in Cloudflare dashboard (observability is already enabled)
    - Console output is structured (JSON-formatted log lines)
  - **Dependencies**: FEAT-P0-004
  - **Completed**: 2026-02-22
  - **Implementation**: Enhanced `src/lib/scraper/pipeline.ts` — added `scrape_start` log event, ISO 8601 `timestamp` field on all log lines, error type classification (`fetch_error`, `parse_error`, `persist_error`) via stage-level try/catch, and `errorType` in `ScrapeResult`. Updated `scripts/inject-scheduled.mjs` with timestamps on cron handler logs.

---

## Phase 1: Core UI (Daily Browse, Cards, Dark Mode)

### API Endpoints

- [x] **API-P1-001**: Implement API endpoint to fetch trending repos by date
  - **Success Criteria**:
    - `GET /api/trending/[date]` accepts a date string in `YYYY-MM-DD` format
    - Returns JSON array of repos for that date, ordered by `stars_today` descending
    - Returns empty array with 200 status for dates with no data
    - Returns 400 for invalid date formats
    - D1 query uses the `trending_date` index for sub-100ms response
    - Response includes `Content-Type: application/json` header
  - **Dependencies**: DB-P0-001, FEAT-P0-003
  - **Completed**: 2026-02-22
  - **Implementation**: `src/pages/api/trending/[date].ts` — Astro API route with YYYY-MM-DD validation (regex + semantic date check), D1 query using `trending_date` index with `ORDER BY stars_today DESC`, structured error handling for D1 failures

- [x] **API-P1-002**: Implement API endpoint to get available date range
  - **Success Criteria**:
    - `GET /api/dates` returns JSON with `{ earliest: "YYYY-MM-DD", latest: "YYYY-MM-DD", dates: [...] }`
    - `dates` array contains all distinct dates that have data in the archive
    - Response is cacheable (add `Cache-Control` header)
    - Query executes in under 100ms
  - **Dependencies**: DB-P0-001
  - **Completed**: 2026-02-22
  - **Implementation**: `src/pages/api/dates.ts` — Astro API route returning distinct trending dates from D1 with `Cache-Control: public, max-age=300, s-maxage=300`, leverages `idx_trending_repos_trending_date` index for efficient DISTINCT+ORDER BY

- [x] **API-P1-003**: Implement KV caching layer for date-based API responses
  - **Success Criteria**:
    - API checks KV cache before querying D1
    - Cache key format: `trending:{date}` stores serialized JSON
    - Historical dates (not today) are cached indefinitely (immutable data)
    - Today's date cache expires after 1 hour
    - Cache miss falls through to D1 query, then populates cache
    - Cache hit returns data without D1 query (verified via logs)
  - **Dependencies**: INFRA-P0-002, API-P1-001
  - **Completed**: 2026-02-22
  - **Implementation**: Enhanced `src/pages/api/trending/[date].ts` — KV cache check before D1 query with `trending:{date}` key format, 1h TTL for today (UTC) and indefinite for historical dates, empty results skipped to allow backfills, structured JSON logs with level/timestamp for cache hit/miss/error, `Cache-Control` headers (immutable for historical, 5min for today), typed `TrendingRow` interface

### Layout & Navigation

- [x] **UI-P1-001**: Implement base application layout with header, main content area, and footer
  - **Success Criteria**:
    - Replace default Astro Welcome component with application layout
    - Header contains site logo/name "RepoTrend" and tagline "GitHub Trending Archive"
    - Header includes dark mode toggle button (placeholder, wired in UI-P1-006)
    - Footer contains attribution text and link to GitHub repo
    - Main content area accepts slot content from pages
    - Layout uses semantic HTML (`<header>`, `<main>`, `<footer>`, `<nav>`)
    - Max content width constrained (e.g., 1200px) with centered layout
  - **Browser Validation** (chrome-devtools MCP):
    - Navigate to `/` and verify header, main, and footer sections render
    - Verify "RepoTrend" text is visible in the header
    - Verify footer content is visible at the bottom
    - Check Elements tab for semantic HTML tags
    - Check Console for zero JavaScript errors
  - **Dependencies**: None
  - **Completed**: 2026-02-22
  - **Implementation**: `src/layouts/Layout.astro` — Semantic HTML layout with sticky header (logo + tagline + dark mode toggle placeholder), `<main>` with slot, footer with attribution links. Global CSS custom properties for color tokens, scoped styles for layout structure. Removed default Astro Welcome component and assets.

- [x] **UI-P1-002**: Implement date picker component for navigating the archive
  - **Success Criteria**:
    - Date picker renders on the homepage with today's date selected by default
    - Allows selection of any date within the archive range (fetched from API-P1-002)
    - Dates outside the archive range are disabled/greyed out
    - Selecting a date updates the URL to `/trending/YYYY-MM-DD` (deep-linkable)
    - Selecting a date triggers a data fetch for the chosen date
    - Includes previous/next day arrow buttons for quick navigation
    - Date picker is keyboard accessible (arrow keys, Enter to confirm)
  - **Browser Validation** (chrome-devtools MCP):
    - Navigate to `/` and verify date picker renders with today's date
    - Click the date picker and select a past date
    - Verify URL updates to `/trending/YYYY-MM-DD`
    - Click next/previous day arrows and verify date changes
    - Verify dates outside archive range are disabled
    - Check Network tab for API call to `/api/dates`
    - Tab to the date picker and verify keyboard navigation works
  - **Dependencies**: API-P1-002, UI-P1-001
  - **Completed**: 2026-02-22
  - **Implementation**: `src/components/DatePicker.astro` — Astro component with client-side JS controller. Fetches `/api/dates` for archive range, prev/next arrows navigate through available dates (skipping gaps), native `<input type="date">` for calendar picker via `showPicker()`, keyboard accessible (ArrowLeft/ArrowRight + Enter). Shared date utilities extracted to `src/lib/dates.ts`. Minimal `src/pages/trending/[date].astro` route shell for deep-linkable navigation.

- [x] **UI-P1-003**: Implement daily/weekly view toggle
  - **Success Criteria**:
    - Toggle switch or tab UI allows switching between "Daily" and "Weekly" views
    - Active view is visually highlighted
    - Toggling updates the URL path (e.g., `/trending/YYYY-MM-DD` vs `/trending/week/YYYY-MM-DD`)
    - Selected view persists when navigating dates
    - Toggle is keyboard accessible
  - **Browser Validation** (chrome-devtools MCP):
    - Navigate to `/` and verify "Daily" view is active by default
    - Click "Weekly" toggle and verify view switches
    - Verify URL updates to reflect weekly view
    - Click "Daily" toggle and verify it switches back
    - Check that toggle is focusable and activatable via keyboard
  - **Dependencies**: UI-P1-001
  - **Completed**: 2026-02-22
  - **Implementation**: `src/components/ViewToggle.astro` — Segmented nav control with Daily/Weekly links, `aria-current` for active state, proper `<nav>` semantics. `src/components/Toolbar.astro` — Shared toolbar layout wrapper. Enhanced `src/components/DatePicker.astro` with `viewMode` prop for weekly navigation (7-day jumps, Monday normalization). `src/pages/trending/week/[date].astro` — Weekly route with Monday redirect normalization. Added `getMondayOfWeek`, `getSundayOfWeek`, `formatWeekRange` to `src/lib/dates.ts`.

### Repository Card

- [x] **UI-P1-004**: Implement repository card component
  - **Success Criteria**:
    - Card displays: repo full name (`owner/name`) linked to GitHub, description, programming language with colored dot, total stars (formatted with commas), stars gained today, fork count
    - Repo name is an anchor tag linking to `https://github.com/{owner}/{name}`
    - Language color dot uses the `language_color` hex value from the data
    - Missing description shows no description line (no "N/A" placeholder)
    - Missing language shows no language badge
    - Star and fork counts use appropriate icons (star, git-fork SVG icons)
    - Numbers formatted with locale-appropriate separators (e.g., "12,345")
    - Card has consistent padding, border radius, and subtle border/shadow
  - **Browser Validation** (chrome-devtools MCP):
    - Navigate to a date page with data and verify cards render
    - Verify each card shows repo name, description, language dot, stars, forks
    - Click repo name link and verify it opens the correct GitHub URL
    - Verify language color dot matches the expected hex color
    - Verify a card with no description renders without a blank gap
    - Verify a card with no language renders without a language badge
    - Check Console for zero errors
  - **Dependencies**: API-P1-001
  - **Completed**: 2026-02-22
  - **Implementation**: `src/components/RepoCard.astro` — Astro component with rank badge, GitHub-linked repo name, conditional description/language, star/fork/stars-today metadata with SVG icons. `src/lib/format.ts` — shared `formatNumber()` and `sanitizeHexColor()` utilities. Global `.sr-only` class added to Layout.astro for accessibility.

- [x] **UI-P1-005**: Implement repo card list with loading and empty states
  - **Success Criteria**:
    - Card list renders 25 repo cards in a vertical stack for a given date
    - Loading state shows skeleton placeholder cards while data is fetching
    - Empty state shows "No trending data available for this date" message with an illustration or icon
    - Error state shows "Failed to load data. Please try again." with retry button
    - Cards are numbered (rank position 1–25)
  - **Browser Validation** (chrome-devtools MCP):
    - Navigate to a date with data and verify 25 cards render in order
    - Navigate to a date with no data and verify empty state message
    - Throttle network to Slow 3G and reload to observe loading skeletons
    - Verify rank numbers appear on each card (1 through 25)
    - Check Console for zero errors
  - **Dependencies**: UI-P1-004, API-P1-001
  - **Completed**: 2026-02-22
  - **Implementation**: `src/components/RepoCardList.astro` — Client-side fetching from `/api/trending/{date}` with skeleton loading placeholders (5 pulsing cards), empty state with document icon, error state with retry button. Cards rendered via `buildRepoCardHTML()` with XSS-safe `escapeHTML()`, rank badges 1–25, `role="feed"` for accessibility. Integrated into `/`, `/trending/[date]`, and `/trending/week/[date]` pages. Also fixed `sanitizeHexColor` regex to reject invalid 4/5-char hex values.

### Dark Mode

- [x] **UI-P1-006**: Implement dark mode toggle with system preference detection
  - **Success Criteria**:
    - Toggle button in header switches between light and dark mode
    - On first visit, defaults to user's system preference (`prefers-color-scheme`)
    - User preference is persisted to `localStorage` key (e.g., `repotrend-theme`)
    - Theme is applied via a class on `<html>` element (e.g., `class="dark"`)
    - No flash of incorrect theme on page load (inline script in `<head>` reads preference before render)
    - Toggle icon changes to reflect current mode (sun/moon icons)
  - **Browser Validation** (chrome-devtools MCP):
    - Navigate to `/` and verify theme matches system preference
    - Click dark mode toggle and verify page switches to dark mode
    - Refresh the page and verify dark mode persists
    - Click toggle again and verify it switches back to light mode
    - Check Application tab → Local Storage for `repotrend-theme` key
    - Emulate `prefers-color-scheme: dark`, clear localStorage, reload, and verify dark mode auto-applied
  - **Dependencies**: UI-P1-001
  - **Completed**: 2026-02-22
  - **Implementation**: Enhanced `src/layouts/Layout.astro` — Inline `<script is:inline>` in `<head>` reads `localStorage('repotrend-theme')` with `prefers-color-scheme` fallback, adds `class="dark"` to `<html>` before paint (FOUC prevention). Dark mode CSS custom properties (GitHub-style dark palette) on `html.dark` with `color-scheme: dark`. Client `<script>` wires `#theme-toggle` button to toggle `.dark` class, persist to `localStorage`, and update `aria-label`. Sun/moon icon visibility toggled via `:global(html.dark)` scoped selectors.

- [x] **UI-P1-007**: Implement comprehensive dark mode color scheme
  - **Success Criteria**:
    - CSS custom properties define color tokens for both light and dark themes
    - Background colors: dark mode uses dark grays (e.g., `#0d1117`, `#161b22`)
    - Text colors: dark mode uses light text with sufficient contrast (WCAG AA: 4.5:1 ratio)
    - Card backgrounds, borders, and shadows adapt to dark mode
    - Date picker, toggle buttons, and all interactive elements adapt
    - Links maintain distinguishable colors in both modes
    - No hard-coded colors outside the token system
  - **Browser Validation** (chrome-devtools MCP):
    - Toggle to dark mode and verify background changes to dark gray
    - Verify all text is readable against dark background
    - Verify cards have appropriate dark background and border
    - Verify date picker elements are visible in dark mode
    - Toggle to light mode and verify all elements revert
    - Use DevTools accessibility checker for contrast ratios
  - **Dependencies**: UI-P1-006
  - **Completed**: 2026-02-22
  - **Implementation**: Expanded CSS custom property token system in `src/layouts/Layout.astro` with new tokens: `--color-bg-tertiary`, `--color-border-hover`, `--color-shadow`, `--color-shadow-hover`, `--color-stars-today`. Both light and dark themes have organized, commented token blocks. All components updated to use tokens exclusively (zero hard-coded colors). Card shadows adapt via shadow tokens. Extracted shared repo card styles to `src/styles/repo-card.css` eliminating ~130 lines of duplication. Link hover states use `--color-link-hover` token.

### Pages & Routing

- [x] **UI-P1-008**: Implement homepage route (`/`) that displays today's trending data
  - **Success Criteria**:
    - `/` route renders the Layout with date picker (set to today) and card list
    - On page load, fetches today's trending data from API
    - If today has no data yet (scraper hasn't run), shows most recent available date
    - Page title is "RepoTrend — GitHub Trending Archive"
    - Meta description is set for SEO
  - **Browser Validation** (chrome-devtools MCP):
    - Navigate to `/` and verify page loads with trending data
    - Verify page title in browser tab reads "RepoTrend — GitHub Trending Archive"
    - Verify date picker shows today's date (or most recent)
    - Check Network tab for API requests
    - Verify page loads within acceptable time
  - **Dependencies**: UI-P1-001, UI-P1-002, UI-P1-005, API-P1-001
  - **Completed**: 2026-02-22
  - **Implementation**: `src/pages/index.astro` — SSR homepage with D1 query to find most recent available date (fallback from today), passes `effectiveDate` to DatePicker/ViewToggle/RepoCardList components. Uses Layout default title "RepoTrend — GitHub Trending Archive" and SEO meta description. Structured JSON error logging on D1 failure with graceful fallback to today's date.

- [x] **UI-P1-009**: Implement date-specific route (`/trending/[date]`) for historical browsing
  - **Success Criteria**:
    - Dynamic route `/trending/YYYY-MM-DD` renders trending data for the specified date
    - Date picker auto-selects the date from the URL
    - Invalid date format in URL shows 404 page
    - Page title includes the date (e.g., "Trending Feb 15, 2026 — RepoTrend")
    - URL is shareable and produces the correct view when visited directly
    - Previous/next navigation arrows in date picker update the URL
  - **Browser Validation** (chrome-devtools MCP):
    - Navigate to `/trending/2026-02-15` and verify data for that date loads
    - Verify date picker shows Feb 15, 2026 selected
    - Verify page title includes the date
    - Navigate to `/trending/invalid-date` and verify 404 page appears
    - Click next-day arrow and verify URL changes to `/trending/2026-02-16`
    - Copy URL, open in new tab, verify same view loads
  - **Dependencies**: UI-P1-008, API-P1-001
  - **Completed**: 2026-02-22
  - **Implementation**: `src/pages/trending/[date].astro` — SSR route with `isValidBrowseDate` validation (rewrites to 404 for invalid dates), `formatDateDisplay` for date-aware page title, passes date to DatePicker/ViewToggle/RepoCardList. `src/pages/404.astro` — Custom 404 page with proper status code, accessible design, and homepage navigation link.

### Responsive Design

- [x] **UI-P1-010**: Implement responsive layout for mobile (375px), tablet (768px), and desktop (1440px)
  - **Success Criteria**:
    - At 375px: single-column layout; header stacks vertically if needed; date picker is full-width; cards are full-width; touch targets ≥ 44px
    - At 768px: comfortable spacing; cards may have side padding; date picker inline
    - At 1440px: centered max-width container; comfortable card width; header elements inline
    - No horizontal scrolling at any viewport width from 375px to 2560px
    - Font sizes scale appropriately (base 14-16px mobile, 16px desktop)
    - Navigation and date picker fully usable on mobile
  - **Browser Validation** (chrome-devtools MCP):
    - Set viewport to 375px width and verify single-column layout
    - Verify no horizontal scroll bar appears
    - Verify date picker is usable at 375px
    - Verify touch target sizes are at least 44px (inspect via Elements panel)
    - Set viewport to 768px and verify tablet layout
    - Set viewport to 1440px and verify desktop layout
    - Set viewport to 2560px and verify no layout breakage
  - **Dependencies**: UI-P1-001, UI-P1-004, UI-P1-002
  - **Completed**: 2026-02-22
  - **Implementation**: Added responsive breakpoints across all components. Mobile (≤640px): toolbar stacks vertically, date picker and view toggle expand full-width, touch targets enlarged to 44px (theme toggle, nav buttons, date display, view toggle via `min-height`), reduced padding/gaps for tighter layouts, smaller rank badges and font sizes. Tablet (641–1024px): increased main content padding. Desktop: unchanged (existing 1200px max-width centered layout). Added `overflow-x: hidden` on html/body and `overflow-wrap: break-word` on repo names/descriptions to prevent horizontal scroll. Skeleton loading states updated to match mobile card dimensions.

### Performance

- [x] **UI-P1-011**: Optimize page load performance to meet Core Web Vitals targets
  - **Success Criteria**:
    - LCP < 2 seconds on simulated 3G connection
    - CLS < 0.1 on all pages
    - Total JS payload < 50KB gzipped for initial page load
    - Historical date pages use SSG (static HTML) where possible
    - Today's page uses SSR with minimal client-side JavaScript
    - No render-blocking resources that delay LCP
    - Images (if any) are lazy-loaded below the fold
  - **Browser Validation** (chrome-devtools MCP):
    - Run a performance trace with `performance_start_trace` (reload=true, autoStop=true)
    - Verify LCP < 2s in the trace results
    - Verify CLS < 0.1 in the trace results
    - Check Network tab for total JS bundle size < 50KB gzipped
    - Emulate Slow 3G and reload page to verify acceptable load time
  - **Dependencies**: UI-P1-008, UI-P1-009
  - **Completed**: 2026-02-22
  - **Implementation**: Migrated repo card rendering from client-side JS fetch to full SSR. Created shared `src/lib/trending.ts` with `TrendingRepo` type and `getTrendingRepos()` query. Rewrote `RepoCardList.astro` to render `RepoCard.astro` components server-side (zero client JS for cards), eliminating the skeleton→content CLS transition and reducing LCP by removing the extra API round-trip. Added `content-visibility: auto` to off-screen cards in `repo-card.css` to skip layout/paint for below-fold content. Semantic HTML improved: `<ol>` list with `<li>` items instead of `role="feed"`. All pages (index, daily, weekly) now query D1 during SSR and pass repos as props. Total client JS remains minimal (~400 bytes for theme toggle + date picker).

---

## Phase 2: Weekly View, Polish & Public Launch

### API Endpoints

- [x] **API-P2-001**: Implement API endpoint to fetch weekly aggregated trending data
  - **Success Criteria**:
    - `GET /api/trending/week/[date]` accepts a date and returns the Monday–Sunday week containing that date
    - Response includes repos ranked by frequency of appearance (days trending), then by total `stars_today` sum
    - Each repo object includes: `appearances` (count of days), `total_stars_gained` (sum of `stars_today`), `max_stars_today`, and latest metadata
    - Partial weeks (e.g., archive starts mid-week) return available data with a `partial: true` flag
    - Returns 400 for invalid date formats
    - Response includes `week_start` and `week_end` date strings
  - **Dependencies**: DB-P0-001, API-P1-001
  - **Completed**: 2026-02-22
  - **Implementation**: `src/pages/api/trending/week/[date].ts` — API route accepting any date, normalizing to Monday–Sunday week range via `getMondayOfWeek`/`getSundayOfWeek`. Uses `getWeeklyTrendingRepos()` from `src/lib/trending.ts` with a single SQL query using window functions (`COUNT`, `SUM`, `MAX`, `ROW_NUMBER`, `COUNT(DISTINCT)`) to aggregate repos by appearance frequency and total stars gained, picking latest metadata per repo. KV caching with `trending:week:{monday}` key format (1h TTL for current week, indefinite for past). Returns `{ week_start, week_end, partial, repos }` with partial-week detection.

### Weekly View UI

- [x] **UI-P2-001**: Implement weekly view page (`/trending/week/[date]`)
  - **Success Criteria**:
    - Route `/trending/week/YYYY-MM-DD` displays the weekly aggregation for the week containing that date
    - Week range (Mon–Sun) is displayed prominently (e.g., "Feb 10 – Feb 16, 2026")
    - Week picker allows navigating to previous/next weeks
    - Repos displayed as cards with aggregate stats: appearance count badge, total stars gained
    - Repos ranked by appearance frequency, then total stars gained
    - Partial week indicator shown when data doesn't span full 7 days
    - Page title includes the week range
  - **Browser Validation** (chrome-devtools MCP):
    - Navigate to `/trending/week/2026-02-15` and verify weekly data loads
    - Verify week range header shows "Feb 10 – Feb 16, 2026" (or appropriate range)
    - Verify repos show appearance count and aggregate star stats
    - Click next week arrow and verify data updates
    - Verify partial week indicator appears for incomplete weeks
    - Check Network tab for correct API call
  - **Dependencies**: API-P2-001, UI-P1-003, UI-P1-004
  - **Completed**: 2026-02-22
  - **Implementation**: Updated `src/pages/trending/week/[date].astro` to use `getWeeklyTrendingRepos` for weekly aggregation with partial-week detection. Extended `src/components/RepoCard.astro` with optional `appearances` prop for weekly appearance count badge. Extended `src/components/RepoCardList.astro` with `weekLabel`/`partial` props for week range header and partial-week indicator. Added `.repo-title-row` and `.appearances-badge` styles to `src/styles/repo-card.css`. Repos ranked by appearance frequency then total stars gained, showing "X days" badge and "Y this week" star totals.

### Accessibility

- [x] **UI-P2-002**: Implement WCAG 2.1 AA accessibility compliance
  - **Success Criteria**:
    - All interactive elements are keyboard navigable (Tab, Enter, Escape, Arrow keys)
    - Focus indicators are visible on all focusable elements
    - All images and icons have appropriate `alt` text or `aria-label`
    - Card structure uses semantic HTML (`<article>`, `<h2>`, `<a>`, `<time>`)
    - Color contrast meets WCAG AA (4.5:1 for normal text, 3:1 for large text) in both themes
    - Date picker is screen-reader accessible with `aria-label` and `role` attributes
    - Dark mode toggle has `aria-label` describing current state
    - Skip-to-content link present for keyboard users
    - Page landmarks defined (`role="banner"`, `role="main"`, `role="contentinfo"`)
  - **Browser Validation** (chrome-devtools MCP):
    - Tab through all interactive elements and verify focus ring visibility
    - Verify skip-to-content link appears on first Tab press
    - Take snapshot and verify ARIA labels on interactive elements
    - Use DevTools accessibility panel to check contrast ratios
    - Verify all `<img>` elements have `alt` attributes
  - **Dependencies**: UI-P1-001, UI-P1-004, UI-P1-006
  - **Completed**: 2026-02-22
  - **Implementation**: Added `aria-hidden="true"` to decorative `.language-dot` in `RepoCard.astro`. Added sr-only "(opens in new tab)" text to external repo links in cards and footer links in `Layout.astro`. Wrapped weekly header in `<time>` element with ISO datetime attribute in `RepoCardList.astro` (new `weekStart` prop). Added `role="status"` to empty state container. Updated GitHub footer link `aria-label` to indicate new tab. Verified all color combinations pass WCAG AA 4.5:1 contrast ratio in both light and dark themes. Pre-existing a11y features confirmed: skip-to-content link, page landmarks, global `focus-visible` styles, dynamic dark mode toggle `aria-label`, date picker with `role="group"` and `aria-label`, semantic HTML (`<article>`, `<h2>`, `<ol>`, `<li>`).

### SEO & Meta

- [x] **UI-P2-003**: Implement SEO-optimized meta tags and Open Graph data
  - **Success Criteria**:
    - Each date page has a unique `<title>` (e.g., "GitHub Trending Repos — Feb 15, 2026 | RepoTrend")
    - Meta description is unique per page and includes the date
    - Open Graph tags (`og:title`, `og:description`, `og:url`, `og:type`) are set
    - Twitter Card meta tags set for social sharing
    - Canonical URL set on each page
    - `robots.txt` allows crawling of trending pages
    - Sitemap generated for all archived dates
  - **Dependencies**: UI-P1-008, UI-P1-009
  - **Completed**: 2026-02-22
  - **Implementation**: Added `site` config to `astro.config.mjs`. Enhanced `src/layouts/Layout.astro` with canonical URL (`<link rel="canonical">`), Open Graph tags (`og:title`, `og:description`, `og:url`, `og:type`, `og:site_name`, `og:locale`), and Twitter Card tags (`twitter:card`, `twitter:title`, `twitter:description`) — all derived from existing `title`/`description` props with `Astro.url`/`Astro.site` for canonical URLs. Added `public/robots.txt` allowing `/trending/` paths and disallowing `/api/`, with sitemap reference. Created `src/pages/sitemap.xml.ts` — dynamic SSR endpoint querying D1 for all archived dates, generating homepage + daily + weekly URLs with proper priorities/changefreq, XML escaping, and 1h cache.

### Error Handling

- [x] **UI-P2-004**: Implement 404 page and error boundary
  - **Success Criteria**:
    - Custom 404 page renders for unknown routes
    - 404 page includes navigation back to homepage
    - 404 page matches the site's design (dark mode, layout)
    - Error boundary catches rendering errors and shows fallback UI
    - Fallback UI includes "Something went wrong" message and retry link
  - **Browser Validation** (chrome-devtools MCP):
    - Navigate to `/nonexistent-page` and verify custom 404 renders
    - Verify 404 page includes link to homepage
    - Verify 404 page respects dark mode setting
    - Check Console for any unhandled errors
  - **Dependencies**: UI-P1-001, UI-P1-006
  - **Completed**: 2026-02-22
  - **Implementation**: Refactored `src/pages/404.astro` to reuse new `src/components/ErrorFallback.astro` — a configurable error UI component with heading, message, icon variant, and optional retry button props. Created `src/middleware.ts` as a global error boundary that catches unhandled rendering errors (returns styled 500 HTML page for page routes, JSON for `/api/` routes). All SSR pages (`index.astro`, `trending/[date].astro`, `trending/week/[date].astro`) updated to show `ErrorFallback` on D1 query failures instead of silently rendering empty results. Extracted structured logging into `src/lib/log.ts` (`logError` helper) to eliminate duplication across all error handlers.

---

## Phase 3: P1 Features (Post-Launch Iteration)

### Trending Streak Indicator

- [x] **API-P3-001**: Implement API logic to calculate trending streaks
  - **Success Criteria**:
    - For a given date's trending repos, calculate the consecutive-day streak for each repo
    - Streak counts backward from the queried date: if a repo appeared on Feb 15, 14, 13 but not 12, streak = 3
    - Query is efficient: uses indexed lookups on (`repo_owner`, `repo_name`, `trending_date`)
    - Streak data is included in the `/api/trending/[date]` response as a `streak` field on each repo
    - Repos with streak = 1 (single day) return `streak: 1`
  - **Dependencies**: API-P1-001, DB-P0-001
  - **Completed**: 2026-02-22
  - **Implementation**: `src/lib/trending.ts` — Added `calculateStreaks()` using INNER JOIN to fetch historical appearance dates within 60-day lookback window, then `consecutiveStreak()` walks backward counting consecutive days. `getTrendingReposWithStreaks()` wrapper encapsulates fetch+streak with non-fatal error handling. `streak` field added to `TrendingRepo` interface. Integrated into `/api/trending/[date]` (with KV caching), homepage SSR, and daily view SSR.

- [x] **UI-P3-001**: Display trending streak badge on repository cards
  - **Success Criteria**:
    - Cards show a streak badge (e.g., ":fire: 5 days") for repos with streak ≥ 2
    - Badge is visually distinct (flame icon + count)
    - Streak of 1 day shows no badge (not interesting for single-day appearances)
    - Badge has a tooltip explaining "Consecutive days on GitHub Trending"
    - Badge is positioned consistently (e.g., top-right of card or in metadata row)
  - **Browser Validation** (chrome-devtools MCP):
    - Navigate to a date page and verify streak badges appear on qualifying cards
    - Verify a repo with streak = 1 shows no streak badge
    - Hover over streak badge and verify tooltip text
    - Verify badge is readable in both light and dark modes
  - **Dependencies**: API-P3-001, UI-P1-004
  - **Completed**: 2026-02-22
  - **Implementation**: Added `streak` prop to `src/components/RepoCard.astro` with flame SVG icon badge in title row for streak ≥ 2, parameterized tooltip with streak count, screen-reader accessible text. `src/components/RepoCardList.astro` passes streak from `TrendingRepo` to `RepoCard` (daily view only). Added `.streak-badge` styles to `src/styles/repo-card.css` with `margin-inline-start: auto` layout pattern. Added `--color-streak`, `--color-streak-bg`, `--color-streak-border` CSS tokens for light and dark themes in `src/layouts/Layout.astro`.

### New Entry Badge

- [ ] **API-P3-002**: Implement API logic to detect first-time trending repos
  - **Success Criteria**:
    - For a given date's trending repos, flag repos that have no prior appearance in the archive
    - Check is a simple query: `SELECT COUNT(*) FROM trending_repos WHERE repo_owner = ? AND repo_name = ? AND trending_date < ?`
    - Result is included in the API response as `is_new_entry: true/false`
    - Performance is acceptable (batch query or efficient per-repo check)
  - **Dependencies**: API-P1-001, DB-P0-001

- [ ] **UI-P3-002**: Display "New" badge on first-time trending repos
  - **Success Criteria**:
    - Cards show a "NEW" badge for repos flagged as `is_new_entry: true`
    - Badge is visually distinct from the streak badge (different color, e.g., green)
    - Badge includes a tooltip: "First time appearing on GitHub Trending"
    - Badge is positioned consistently alongside other badges
  - **Browser Validation** (chrome-devtools MCP):
    - Navigate to a date page and verify "NEW" badges appear on qualifying cards
    - Verify repos that are not new entries do not show the badge
    - Hover over badge and verify tooltip
    - Verify badge is readable in both light and dark modes
  - **Dependencies**: API-P3-002, UI-P1-004

### Full-Text Search

- [ ] **API-P3-003**: Implement search API endpoint across historical data
  - **Success Criteria**:
    - `GET /api/search?q={query}` searches across `repo_owner`, `repo_name`, and `description` fields
    - Uses D1 `LIKE` queries or FTS (if available) for matching
    - Returns results grouped by repo with array of dates the repo appeared
    - Results ordered by relevance (exact name match first, then partial matches)
    - Limits results to 50 per request
    - Returns empty results for queries shorter than 2 characters
    - Response includes total result count
  - **Dependencies**: DB-P0-001

- [ ] **UI-P3-003**: Implement search input in header with results page
  - **Success Criteria**:
    - Search input field in the header with magnifying glass icon
    - Input has placeholder text "Search trending repos..."
    - Debounced input (300ms) triggers search API call
    - Search results page at `/search?q={query}` shows matching repos
    - Each result shows repo name, description, and list of dates it trended
    - Clicking a date in the results navigates to that date's view
    - Empty results show "No repos found for '{query}'" message
    - Search input is accessible (labeled, keyboard navigable)
  - **Browser Validation** (chrome-devtools MCP):
    - Click search input in header and type a repo name
    - Verify search results appear after debounce period
    - Verify results show repo names with trending dates
    - Click a date link in results and verify navigation to date view
    - Search for a nonexistent term and verify "No repos found" message
    - Check Network tab for debounced API calls (not per-keystroke)
    - Tab to search input and verify keyboard interaction works
  - **Dependencies**: API-P3-003, UI-P1-001

### Star Delta Sparkline

- [ ] **API-P3-004**: Implement API logic to return historical star deltas for repos
  - **Success Criteria**:
    - For each repo in a date response, include a `star_history` array of `{ date, stars_today }` objects
    - History includes all dates the repo appeared in the archive (not just consecutive)
    - Array is sorted chronologically (oldest first)
    - Only returned for repos with 2+ days of data
    - Data sourced from existing `trending_repos` table (no additional storage needed)
  - **Dependencies**: API-P1-001, DB-P0-001

- [ ] **UI-P3-004**: Implement sparkline chart on repository cards
  - **Success Criteria**:
    - Small inline SVG sparkline chart rendered on cards for repos with 2+ data points
    - Chart shows daily `stars_today` values over time
    - Chart is 80–120px wide and 20–30px tall (fits within card metadata area)
    - Uses simple polyline SVG (no heavy charting library)
    - Chart color adapts to light/dark mode
    - Tooltip on hover shows the date and star count for each point
    - Repos with fewer than 2 data points show no sparkline
  - **Browser Validation** (chrome-devtools MCP):
    - Navigate to a date page and verify sparklines appear on qualifying cards
    - Verify sparkline is not shown on repos with only 1 day of data
    - Hover over a sparkline point and verify tooltip shows date and stars
    - Toggle dark mode and verify sparkline colors adapt
    - Verify sparklines do not cause layout shift
  - **Dependencies**: API-P3-004, UI-P1-004

### Sort Options

- [ ] **UI-P3-005**: Implement sort dropdown for repo card list
  - **Success Criteria**:
    - Dropdown with options: "Stars Gained Today" (default), "Total Stars", "Alphabetical (A–Z)"
    - Selecting an option immediately re-sorts the displayed cards
    - Sort selection is reflected in the URL as a query parameter (e.g., `?sort=stars_today`)
    - Default sort is "Stars Gained Today" (matches GitHub trending default)
    - Sort persists when navigating between dates
    - Dropdown is keyboard accessible and has appropriate ARIA attributes
  - **Browser Validation** (chrome-devtools MCP):
    - Navigate to a date page and verify default sort is by stars gained today
    - Select "Total Stars" from dropdown and verify cards reorder
    - Select "Alphabetical" and verify cards reorder A–Z
    - Verify URL query parameter updates (e.g., `?sort=total_stars`)
    - Navigate to a different date and verify sort preference persists
    - Tab to dropdown and verify keyboard selection works
  - **Dependencies**: UI-P1-005

---

## Phase 4: P2 Features (Based on User Feedback)

### Language Breakdown Chart

- [ ] **API-P4-001**: Implement API endpoint for language distribution data
  - **Success Criteria**:
    - `GET /api/languages/[date]` returns language breakdown for that date
    - Response format: `[{ language, color, count, percentage }]` sorted by count descending
    - Repos with `null` language are grouped as "Unknown"
    - Percentages sum to 100%
    - Works for both single dates and week ranges (`/api/languages/week/[date]`)
  - **Dependencies**: DB-P0-001, API-P1-001

- [ ] **UI-P4-001**: Implement language breakdown donut/bar chart
  - **Success Criteria**:
    - Chart renders below the date picker area showing language distribution
    - Uses lightweight SVG-based chart (no heavy library like Chart.js)
    - Each language segment uses its GitHub color
    - Interactive tooltips show language name, repo count, and percentage on hover
    - Chart adapts to dark mode
    - Renders for both daily and weekly views
  - **Browser Validation** (chrome-devtools MCP):
    - Navigate to a date page and verify language chart renders
    - Hover over chart segments and verify tooltips
    - Toggle dark mode and verify chart adapts
    - Verify chart colors match GitHub language colors
    - Switch to weekly view and verify chart updates
  - **Dependencies**: API-P4-001, UI-P1-001

### Calendar Heatmap Navigation

- [ ] **UI-P4-002**: Implement calendar heatmap component for archive navigation
  - **Success Criteria**:
    - GitHub-style contribution heatmap showing months of archive data
    - Each day cell is shaded by number of repos captured (0 = empty, 25 = full)
    - Color scale: white/light → green/blue intensity based on data density
    - Clicking a day cell navigates to `/trending/YYYY-MM-DD`
    - Heatmap adapts to dark mode
    - Days with no data are clearly distinguishable (empty/grey)
    - Heatmap is keyboard navigable
    - Shows month and day-of-week labels
  - **Browser Validation** (chrome-devtools MCP):
    - Navigate to the page with the heatmap and verify it renders
    - Verify days with data are colored and days without data are empty
    - Click a colored day and verify navigation to that date's trending view
    - Toggle dark mode and verify heatmap adapts
    - Tab through heatmap cells and verify keyboard navigation
  - **Dependencies**: API-P1-002, UI-P1-001

### Compare Two Dates

- [ ] **API-P4-002**: Implement API endpoint for comparing two dates
  - **Success Criteria**:
    - `GET /api/compare?date1=YYYY-MM-DD&date2=YYYY-MM-DD` returns repos for both dates
    - Response flags repos that appear on both dates, only date1, or only date2
    - Response format: `{ date1_repos: [...], date2_repos: [...], common: [...], only_date1: [...], only_date2: [...] }`
    - Returns 400 if either date is invalid or missing
  - **Dependencies**: API-P1-001

- [ ] **UI-P4-003**: Implement side-by-side date comparison view
  - **Success Criteria**:
    - Route `/compare?date1=YYYY-MM-DD&date2=YYYY-MM-DD` renders comparison view
    - Two-column layout showing each date's trending repos
    - Repos appearing on both dates are visually highlighted (shared color/badge)
    - Each column has its own date picker for selecting dates
    - Stats summary at top: "X repos in common, Y unique to [date1], Z unique to [date2]"
    - On mobile, columns stack vertically with a toggle between dates
  - **Browser Validation** (chrome-devtools MCP):
    - Navigate to `/compare?date1=2026-02-14&date2=2026-02-15`
    - Verify two columns render with each date's data
    - Verify shared repos are highlighted in both columns
    - Verify summary stats are correct
    - Change a date via the column date picker and verify data updates
    - Resize to mobile and verify columns stack vertically
    - Verify dark mode compatibility
  - **Dependencies**: API-P4-002, UI-P1-004

### Pagination

- [ ] **UI-P4-004**: Implement pagination for weekly aggregations exceeding 25 repos
  - **Success Criteria**:
    - When weekly view returns > 25 repos, pagination UI appears at the bottom
    - Shows page numbers and previous/next buttons
    - Default page size is 25 repos
    - URL includes page parameter (e.g., `?page=2`)
    - Pagination is stateless (deep-linkable)
    - Scrolls to top of card list on page change
    - Current page is visually highlighted
  - **Browser Validation** (chrome-devtools MCP):
    - Navigate to a weekly view with > 25 repos
    - Verify pagination controls appear at bottom
    - Click page 2 and verify new repos load
    - Verify URL updates with `?page=2`
    - Click next/previous buttons and verify they work
    - Verify page scrolls to top on page change
  - **Dependencies**: UI-P2-001, API-P2-001

### Scrape Retry Logic

- [ ] **FEAT-P4-001**: Implement scraper retry logic for failed scrapes
  - **Success Criteria**:
    - On scrape failure, the next scheduled cron run detects the gap and retries
    - Retry checks if current date already has data; if not, attempts a fresh scrape
    - Maximum of 3 retry attempts per day before marking the day as a confirmed gap
    - Failed retries are logged with attempt count and error details
    - Successful retry after initial failure is logged as a recovered scrape
  - **Dependencies**: FEAT-P0-004, FEAT-P0-005

---

## Phase 5: Infrastructure, Testing & Documentation

### Analytics

- [ ] **INFRA-P5-001**: Integrate privacy-friendly analytics
  - **Success Criteria**:
    - Cloudflare Web Analytics (or Plausible/Fathom) script added to the layout
    - Tracks page views per date/week route
    - Tracks search query usage (anonymized)
    - Tracks dark mode toggle usage
    - No PII collected or stored
    - Analytics dashboard accessible to the team
  - **Dependencies**: UI-P1-001

### Testing

- [ ] **TEST-P5-001**: Write unit tests for HTML parser (trending page extraction)
  - **Success Criteria**:
    - Tests cover: successful parse of 25 repos, handling of missing fields, handling of malformed HTML
    - Tests use fixture HTML files (snapshot of actual trending page)
    - All tests pass with `npm test`
    - Parser edge cases covered: no description, no language, commas in star counts
    - Minimum 90% coverage of parser module
  - **Dependencies**: FEAT-P0-002

- [ ] **TEST-P5-002**: Write unit tests for D1 persistence layer
  - **Success Criteria**:
    - Tests cover: insert new repos, upsert existing repos (dedup), query by date, query streaks
    - Tests use D1 local/miniflare environment
    - All tests pass with `npm test`
    - Edge cases: empty repo list, duplicate entries, null fields
  - **Dependencies**: FEAT-P0-003

- [ ] **TEST-P5-003**: Write unit tests for API endpoints
  - **Success Criteria**:
    - Tests cover all API routes: `/api/trending/[date]`, `/api/dates`, `/api/trending/week/[date]`, `/api/search`
    - Tests verify correct HTTP status codes, response shapes, and error handling
    - Tests use mock D1 data
    - All tests pass with `npm test`
  - **Dependencies**: API-P1-001, API-P1-002, API-P2-001

- [ ] **TEST-P5-004**: Write integration test for full scrape pipeline
  - **Success Criteria**:
    - End-to-end test: mock HTTP response → parser → D1 insert → API query → verify data
    - Test runs against local Miniflare/Wrangler environment
    - Test verifies 25 repos are stored and queryable after a scrape
    - Test passes with `npm test`
  - **Dependencies**: FEAT-P0-004, API-P1-001

- [ ] **TEST-P5-005**: Write visual regression / E2E tests for critical UI flows
  - **Success Criteria**:
    - E2E tests cover: homepage load, date navigation, weekly view toggle, dark mode toggle, search (P1)
    - Tests use browser automation (Playwright or similar)
    - Tests verify key UI elements are present and interactive
    - All tests pass in CI
  - **Browser Validation** (chrome-devtools MCP):
    - Run E2E tests and verify all pass
    - Manually walk through each critical flow to verify against test expectations
  - **Dependencies**: UI-P1-008, UI-P1-009, UI-P2-001

### Deployment

- [ ] **DEPLOY-P5-001**: Configure production deployment pipeline
  - **Success Criteria**:
    - `npm run deploy` successfully builds Astro and deploys to Cloudflare Pages
    - Worker with cron trigger deploys alongside the site
    - D1 database migrations run before deployment
    - Environment-specific configuration (production vs preview) works correctly
    - Deployment produces no errors in Cloudflare dashboard
  - **Dependencies**: INFRA-P0-001, INFRA-P0-002, INFRA-P0-003, DB-P0-001

- [ ] **DEPLOY-P5-002**: Configure Cloudflare security settings
  - **Success Criteria**:
    - HTTPS enforced on all routes (automatic via Cloudflare)
    - Cloudflare WAF basic rules enabled
    - DDoS protection enabled (default on Cloudflare)
    - Security headers set: `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Content-Security-Policy`
    - No mixed content warnings
  - **Browser Validation** (chrome-devtools MCP):
    - Navigate to production URL
    - Check Security tab for valid SSL certificate
    - Verify no mixed content warnings
    - Check Network tab response headers for security headers
  - **Dependencies**: DEPLOY-P5-001

- [ ] **DEPLOY-P5-003**: Set up monitoring and alerting for scraper health
  - **Success Criteria**:
    - Alert triggers if no scrape succeeds for 24 hours
    - Dashboard shows daily scrape success/failure history
    - Scraper logs are queryable in Cloudflare dashboard
    - Alert delivery method configured (email or webhook)
  - **Dependencies**: FEAT-P0-005, DEPLOY-P5-001

### Documentation

- [ ] **DOC-P5-001**: Write project README with setup and deployment instructions
  - **Success Criteria**:
    - README covers: project overview, tech stack, local development setup, deployment steps
    - Includes prerequisites (Node.js, Wrangler, Cloudflare account)
    - Local development workflow documented (`npm run dev`, D1 local setup)
    - Environment variable requirements documented
    - Contributing guidelines included
  - **Dependencies**: DEPLOY-P5-001

- [ ] **DOC-P5-002**: Document API endpoints with request/response examples
  - **Success Criteria**:
    - All API endpoints documented with: method, path, parameters, request body, response schema, example response
    - Error responses documented
    - Can be maintained in a `docs/API.md` file or inline in README
  - **Dependencies**: API-P1-001, API-P1-002, API-P2-001, API-P3-003

- [ ] **DOC-P5-003**: Create FAQ page content for the site
  - **Success Criteria**:
    - FAQ covers: what is RepoTrend, data sources, update frequency, data scope (English only), how to report issues
    - Content is concise and developer-friendly in tone
    - Can be a static Astro page at `/faq`
  - **Dependencies**: UI-P1-001

---

## Backlog (Future Phases)

### Future Enhancements
- [ ] **FEAT-P6-001**: Support non-English trending pages (i18n data expansion)
  - **Success Criteria**:
    - Scraper can be configured with multiple `spoken_language_code` values
    - UI allows filtering by spoken language
  - **Dependencies**: FEAT-P0-001, UI-P1-002

- [ ] **FEAT-P6-002**: Implement Atom/RSS feed for daily trending updates
  - **Success Criteria**:
    - `/feed.xml` returns valid Atom feed with latest trending repos
    - Feed updates daily with the newest scraped data
    - Feed validates against Atom specification
  - **Dependencies**: API-P1-001

- [ ] **FEAT-P6-003**: Implement "Year in Review" / "Month in Review" data summary page
  - **Success Criteria**:
    - Page shows aggregate stats: most frequently trending repos, language trends, newcomers
    - Content is shareable and SEO-optimized for virality
  - **Dependencies**: DB-P0-001, UI-P1-001

- [ ] **FEAT-P6-004**: Add Open Graph image generation for social sharing
  - **Success Criteria**:
    - Each date page generates a dynamic OG image showing top 3 trending repos
    - Image is served at `/og/YYYY-MM-DD.png`
    - Image renders correctly in Twitter/X, LinkedIn, Slack previews
  - **Dependencies**: UI-P2-003

---

## Summary
- **Total Tasks**: 62
- **Phase 0 (Foundation)**: 10 tasks (5 critical, 3 high, 2 medium)
- **Phase 1 (Core UI)**: 14 tasks (6 critical, 8 high)
- **Phase 2 (Weekly & Polish)**: 4 tasks (3 high, 1 medium)
- **Phase 3 (P1 Features)**: 11 tasks (all high)
- **Phase 4 (P2 Features)**: 7 tasks (all medium)
- **Phase 5 (Infra/Test/Deploy/Docs)**: 12 tasks (4 high, 7 medium, 1 low)
- **Backlog**: 4 tasks (all low)
- **Critical Path**: `INFRA-P0-001 → DB-P0-001 → FEAT-P0-003 → FEAT-P0-004 → API-P1-001 → UI-P1-004 → UI-P1-005 → UI-P1-008 → UI-P1-009 → DEPLOY-P5-001`
- **Key External Dependencies**: GitHub trending page HTML structure stability, Cloudflare D1 performance at scale
- **Key Decisions Needed**: Scrape frequency (once vs twice daily), weekly ranking algorithm, analytics tool selection
