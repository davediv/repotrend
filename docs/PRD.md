# Product Requirement Document — RepoTrend

> **A Historical Archive of GitHub Trending Repositories**

---

| Field | Value |
|-------|-------|
| **Version** | 1.0 |
| **Status** | Draft |
| **Author** | [Product Manager] |
| **Last Updated** | February 21, 2026 |
| **Stakeholders** | Engineering, Design, Product, DevRel |
| **Tech Stack** | Astro · Cloudflare Workers · D1/KV |

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Problem Statement](#2-problem-statement)
3. [Goals & Objectives](#3-goals--objectives)
4. [Target Audience & User Personas](#4-target-audience--user-personas)
5. [User Stories & Use Cases](#5-user-stories--use-cases)
6. [Functional Requirements — Must-Have](#6-functional-requirements--must-have)
7. [Functional Requirements — Nice-to-Have](#7-functional-requirements--nice-to-have)
8. [Non-Functional Requirements](#8-non-functional-requirements)
9. [User Experience & Design](#9-user-experience--design)
10. [Technical Considerations](#10-technical-considerations)
11. [Analytics & Success Metrics](#11-analytics--success-metrics)
12. [Launch & Rollout Plan](#12-launch--rollout-plan)
13. [Timeline & Milestones](#13-timeline--milestones)
14. [Dependencies & Constraints](#14-dependencies--constraints)
15. [Risks & Mitigations](#15-risks--mitigations)
16. [Open Questions & Decisions Needed](#16-open-questions--decisions-needed)
17. [Appendix](#17-appendix)

---

## 1. Executive Summary

RepoTrend is a web application that archives and displays daily GitHub trending repositories, enabling developers, tech leads, and open-source enthusiasts to browse historical trends, spot patterns, and discover notable projects over time. GitHub's trending page is ephemeral — once the day passes, that data is lost forever. RepoTrend solves this by systematically scraping and storing trending data every day, creating a permanent, searchable archive.

The business case is straightforward: developers and tech communities have no reliable way to look back at what was trending on GitHub on any given date. RepoTrend fills this gap with a fast, developer-friendly interface built on Astro and Cloudflare's edge infrastructure. The initial release targets English-language trending repositories across all programming languages.

Success will be measured by archive completeness (99%+ daily scrape success rate), user engagement (daily active users, return visit rate), and page performance (sub-2-second loads). The product is designed for a lean launch with 8 must-have features, followed by iterative enhancements driven by user feedback.

---

## 2. Problem Statement

### 2.1 Background & Context

GitHub's trending page (`github.com/trending`) surfaces the most popular repositories on a given day based on star velocity and other signals. It is one of the most visited pages in the developer ecosystem and serves as a primary discovery mechanism for open-source projects. However, GitHub provides no API for trending data, no historical view, and no way to query what was trending in the past. The page is a live snapshot that refreshes daily with no archive.

### 2.2 Problem Definition

Developers, tech bloggers, engineering managers, and open-source analysts frequently want to answer questions like:

- What was trending on GitHub last Tuesday?
- Which repos have been consistently trending over the past month?
- How has the mix of programming languages on trending changed over time?
- What new projects broke through versus repeat appearances of established repos?

Currently, none of these questions can be answered because the data is transient. Once a trending day passes, the information is permanently lost.

### 2.3 Evidence & Validation

- Multiple community projects have attempted GitHub trending scrapers (e.g., `github-trending-repos`, `trending-daily`), confirming demand for this data.
- Developer forums and social media regularly feature posts asking "what was that repo I saw trending last week?"
- No existing tool provides a polished, browsable interface for historical trending data — most are raw data dumps in GitHub repos with no UI.
- The ephemeral nature of the trending page creates a natural moat: the value of the archive increases with every day of data collected.

---

## 3. Goals & Objectives

### 3.1 Business Objectives

- Establish RepoTrend as the definitive historical archive for GitHub trending data.
- Build a growing, compounding dataset that becomes more valuable over time.
- Create a developer-focused brand that can be expanded with additional GitHub analytics features.

### 3.2 Product Objectives (SMART)

| Objective | Metric | Target | Timeframe |
|-----------|--------|--------|-----------|
| Archive reliability | Daily scrape success rate | ≥99% | First 90 days |
| Data completeness | Days with full trending data | Zero gaps after launch | Ongoing |
| Page performance | Largest Contentful Paint (LCP) | <2 seconds on 3G | At launch |
| User engagement | Weekly return visitors | 30% return rate | Within 3 months |
| Archive depth | Total days archived | 90+ days of history | Within 3 months |

### 3.3 Non-Goals (Out of Scope)

- User accounts, authentication, or personalization (v1 is a public, read-only archive).
- Non-English trending pages (`spoken_language_code` is fixed to English for v1).
- GitHub API integration for supplementary data (e.g., README content, contributor stats).
- Notifications or alerts when specific repos trend.
- Monetization features (ads, premium tiers).

---

## 4. Target Audience & User Personas

### 4.1 Primary Users

#### Persona 1: The Curious Developer

- **Role:** Software engineer (junior to senior), any stack.
- **Goal:** Discover interesting open-source projects and tools they might have missed.
- **Pain Point:** GitHub trending is ephemeral; they forget what they saw days ago.
- **Behavior:** Checks trending daily or weekly, bookmarks repos, shares finds with colleagues.
- **Success Criteria:** Quickly finds and revisits repos from past trending days.

#### Persona 2: The Tech Blogger / Content Creator

- **Role:** Technical writer, YouTube creator, newsletter author.
- **Goal:** Write data-backed content about open-source trends and ecosystem shifts.
- **Pain Point:** No historical data to reference — everything is anecdotal.
- **Behavior:** Looks for patterns (e.g., "Rust repos trending more in Q4"), compares periods.
- **Success Criteria:** Can pull trending data for any date/week and compare across time.

#### Persona 3: The Engineering Manager / Tech Lead

- **Role:** Manages a team, evaluates technology choices.
- **Goal:** Track which tools and frameworks are gaining community traction.
- **Pain Point:** Signal-to-noise is high; needs sustained trends, not one-day spikes.
- **Behavior:** Checks weekly aggregations, looks at trending streaks and language breakdowns.
- **Success Criteria:** Can identify repos with sustained multi-day trending momentum.

### 4.2 Anti-Personas

- GitHub power users who want real-time notifications or API access to trending data.
- Users looking for GitHub analytics on their own repositories (stars over time, traffic, etc.).
- Non-English-speaking users looking for localized trending data (out of scope for v1).

---

## 5. User Stories & Use Cases

### 5.1 Must Have (P0)

| ID | User Story | Acceptance Criteria |
|----|-----------|---------------------|
| US-001 | As a developer, I want to browse trending repos for any past date so I can see what was popular on that day. | Date picker loads trending snapshot; shows 25 repos with metadata; handles dates with no data gracefully. |
| US-002 | As a developer, I want to see weekly aggregated trending data so I can filter out one-day noise. | Weekly view shows repos ranked by frequency of appearance and/or total stars gained across 7 days. |
| US-003 | As a user, I want each repo displayed as a card with name, description, language, stars, and GitHub link. | Card renders all fields; language color dot matches GitHub; name links to repo on GitHub. |
| US-004 | As a mobile user, I want the site to be fully responsive so I can browse on my phone. | All features functional on 375px width; no horizontal scroll; touch targets ≥44px. |
| US-005 | As a user, I want pages to load in under 2 seconds so the experience feels fast. | LCP < 2s on simulated 3G; no layout shift above CLS 0.1. |
| US-006 | As a developer, I want a dark mode toggle so I can browse comfortably at night. | Toggle persists across sessions; respects system preference; all text remains legible. |

### 5.2 Should Have (P1)

| ID | User Story | Acceptance Criteria |
|----|-----------|---------------------|
| US-007 | As a user, I want to see how many consecutive days a repo has been trending. | Streak badge displays on card; updates daily; accurate to scraped data. |
| US-008 | As a user, I want to know when a repo appears on trending for the first time. | "New Entry" badge appears only for repos with no prior appearance in the archive. |
| US-009 | As a user, I want to search across all historical trending data by repo name or keyword. | Full-text search returns results across all dates; results link to the relevant date's snapshot. |
| US-010 | As a user, I want to see a sparkline of daily star gains for each repo. | Sparkline renders on card for repos with 2+ days of data; accurately reflects star deltas. |
| US-011 | As a user, I want to sort the current view by stars gained today, total stars, or alphabetically. | Sort dropdown changes order immediately; default is stars gained today. |

### 5.3 Nice to Have (P2)

| ID | User Story | Acceptance Criteria |
|----|-----------|---------------------|
| US-012 | As a user, I want to see a language breakdown chart for a given day or week. | Chart shows top languages by percentage; interactive tooltip; renders for any date/week. |
| US-013 | As a user, I want a calendar heatmap to navigate the archive visually. | Heatmap shades days by repo count; clicking a day navigates to that date's snapshot. |
| US-014 | As a user, I want to compare trending repos from two different dates side by side. | Side-by-side view loads both dates; highlights repos appearing in both. |
| US-015 | As a user, I want paginated results when viewing large aggregations. | Pagination appears when results exceed 25; page navigation is fast and stateless. |

---

## 6. Functional Requirements — Must-Have

### F-001: Scheduled Daily Scraper

**Priority:** P0 | **Dependency:** None (foundation)

A Cloudflare Worker cron job that fetches and parses `github.com/trending?spoken_language_code=en` once or twice per day, extracting repo metadata and persisting it to Cloudflare D1. GitHub provides no API for trending data and the page is ephemeral — without active archiving, the data is permanently lost.

**Business Rules:**

- Scrape frequency: minimum once per day, ideally twice (morning and evening UTC) to capture churn.
- Data extraction: repo owner, repo name, description, programming language (with hex color), total stars, forks, stars gained today, capture date.
- Deduplication: if the same repo appears in multiple scrapes on the same day, store only the latest data.
- Failure handling: log failures; retry on next scheduled run; never silently skip a day.

**Acceptance Criteria:**

- Cron triggers reliably on schedule.
- All 25 repos from the trending page are captured per scrape.
- Data persists correctly in D1 with no field truncation.
- Failed scrapes produce actionable log entries.

---

### F-002: Structured Data Schema

**Priority:** P0 | **Dependency:** F-001

A well-defined Cloudflare D1 schema that stores all scraped trending data in a normalized, queryable format. Every downstream feature (filtering, search, streaks, charts) depends on a clean schema.

**Required Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `id` | INTEGER (PK) | Auto-incrementing unique identifier |
| `repo_owner` | TEXT | GitHub username or organization |
| `repo_name` | TEXT | Repository name |
| `description` | TEXT (nullable) | Repository description |
| `language` | TEXT (nullable) | Primary programming language |
| `language_color` | TEXT (nullable) | Hex color code for the language |
| `total_stars` | INTEGER | Total star count at time of scrape |
| `forks` | INTEGER | Fork count at time of scrape |
| `stars_today` | INTEGER | Stars gained on trending day |
| `trending_date` | DATE | The date this repo appeared on trending |
| `scraped_at` | DATETIME | Timestamp of when the scrape occurred |

---

### F-003: Browse by Date (Date Picker)

**Priority:** P0 | **Dependency:** F-002, F-005

Users select a specific calendar date to view that day's trending snapshot. This is the app's core value proposition — answering "what was trending on any given day?" — something GitHub itself cannot do.

**Acceptance Criteria:**

- Date picker allows selection of any date within the archive range.
- Selecting a date loads the corresponding trending snapshot within 2 seconds.
- Dates with no data display a clear "No data available" message.
- Today's date is the default view on the homepage.
- URL updates to reflect the selected date (deep-linkable).

---

### F-004: Browse by Week

**Priority:** P0 | **Dependency:** F-002, F-005

Aggregates trending data across a 7-day window, surfacing repos that appeared most frequently or gained the most stars during the week. Weekly views filter out one-day noise and highlight repos with sustained momentum.

**Acceptance Criteria:**

- Week picker selects a Monday–Sunday range.
- Repos ranked by frequency of appearance, then by total stars gained.
- Each repo shows aggregate stats: total appearances, cumulative stars gained.
- Partial weeks (e.g., archive starts mid-week) display available data with a note.

---

### F-005: Repository Card

**Priority:** P0 | **Dependency:** F-002

The atomic UI unit. Each repo displayed as a card showing: owner/name (linked to GitHub), description, programming language with its color dot, total star count, stars gained today, and fork count. Mirrors the familiar GitHub trending layout so users feel immediately oriented.

**Acceptance Criteria:**

- All specified fields render correctly.
- Repo name links to the corresponding GitHub page.
- Language color dot matches GitHub's color scheme.
- Graceful handling of missing fields (e.g., no description, no language).
- Card is responsive and readable on all screen sizes.

---

### F-006: Responsive Design

**Priority:** P0 | **Dependency:** All UI features

Fully usable on mobile, tablet, and desktop. A significant portion of traffic will be mobile developers browsing during commute or downtime.

**Acceptance Criteria:**

- All features functional at 375px, 768px, and 1440px widths.
- No horizontal scrolling on any viewport.
- Touch targets are at least 44px.
- Navigation and date picker are fully usable on mobile.

---

### F-007: Fast Page Loads (Astro SSR/SSG)

**Priority:** P0 | **Dependency:** Architecture

Astro's partial hydration and minimal-JS philosophy means pages load fast by default. Historical date pages can be statically generated; today's page uses SSR. If the app is slower than visiting GitHub directly, users won't come back.

**Acceptance Criteria:**

- LCP < 2 seconds on simulated 3G connection.
- CLS < 0.1 on all pages.
- Total JS payload < 50KB gzipped for initial page load.
- Historical pages served as static HTML where possible.

---

### F-008: Dark Mode

**Priority:** P0 | **Dependency:** F-006

Developer-facing app — dark mode is an expectation, not a luxury. Togglable with system preference detection.

**Acceptance Criteria:**

- Toggle switch in the header.
- Defaults to system preference on first visit.
- User preference persists across sessions (localStorage or cookie).
- All text, cards, charts, and interactive elements remain legible in both modes.
- No flash of incorrect theme on page load.

---

## 7. Functional Requirements — Nice-to-Have

### F-009: Trending Streak Indicator (P1)

Shows how many consecutive days a repo has appeared on the trending page. A repo trending for 5+ days signals genuine community interest, not just a one-day spike. This insight is impossible to get from GitHub's own page.

### F-010: New Entry Badge (P1)

Flags repos appearing on trending for the first time within the dataset. Repeat appearances of established projects are less interesting — new entries are where real discovery happens.

### F-011: Full-Text Search (P1)

Search across all historical data by repo name, owner, or description keywords. Transforms the archive from a passive browse experience into an active discovery tool. Essential as the dataset grows.

### F-012: Star Delta Sparkline (P1)

A small inline chart on each card showing the repo's daily stars gained over the days it appeared in the archive. Visualizes momentum at a glance.

### F-013: Sort Options (P1)

Sort the current view by stars gained today (default), total stars, or alphabetically. Low-effort feature that respects different user intentions.

### F-014: Language Breakdown Chart (P2)

A lightweight chart showing the distribution of programming languages among trending repos for a given day or week. Surfaces macro-level shifts in developer interest over time.

### F-015: Calendar Heatmap Navigation (P2)

A visual calendar where each day is shaded by how many repos were captured, providing an at-a-glance overview of archive coverage and an intuitive navigation method.

### F-016: Compare Two Dates (P2)

Side-by-side view of trending repos on two different dates. Useful for retrospectives and spotting ecosystem evolution. Low implementation cost once date browsing exists.

### F-017: Scrape Reliability & Retry Logic (P2)

If a scheduled scrape fails (GitHub downtime, rate limiting, HTML structure change), the worker retries on the next scheduled run and logs the failure. Prevents silent data gaps.

### F-018: Pagination (P2)

Paginated results for weekly aggregations that exceed 25 repos. Keeps pages fast and scannable.

---

## 8. Non-Functional Requirements

### 8.1 Performance

- Page load (LCP): < 2 seconds on simulated 3G.
- Cumulative Layout Shift (CLS): < 0.1.
- Time to Interactive (TTI): < 3 seconds.
- Total JS bundle: < 50KB gzipped.
- D1 query response time: < 100ms for single-date lookups.

### 8.2 Reliability & Availability

- Target uptime: 99.5% (leveraging Cloudflare's global edge network).
- Scraper uptime: 99% daily success rate within first 90 days.
- Data durability: Cloudflare D1 with daily backups.
- Graceful degradation: if scraper fails, the site continues serving existing data.

### 8.3 Security

- No user authentication required (public, read-only app).
- All traffic served over HTTPS.
- Cloudflare WAF and DDoS protection enabled.
- No PII collected or stored.

### 8.4 Accessibility

- WCAG 2.1 AA compliance target.
- Semantic HTML throughout.
- Keyboard navigation for all interactive elements.
- Sufficient color contrast in both light and dark modes.
- Screen reader-friendly card structure and alt text.

### 8.5 Internationalization

- v1 is English only (both UI and trending data scope).
- Architecture should not preclude future i18n support.

### 8.6 Compatibility

- Supported browsers: Chrome, Firefox, Safari, Edge (last 2 major versions).
- Fully responsive from 375px to 2560px viewport widths.
- Progressive enhancement: core content accessible without JavaScript.

---

## 9. User Experience & Design

### 9.1 UX Principles

1. **Familiar:** Mirror GitHub's trending page layout so users feel immediately oriented.
2. **Fast:** Every interaction should feel instant. Static generation and minimal JS are non-negotiable.
3. **Explorative:** Navigation should encourage browsing across dates and discovering patterns.
4. **Informative:** Surface insights (streaks, new entries, sparklines) that add value beyond raw data.

### 9.2 Key Screens

- **Homepage / Daily View:** Today's trending snapshot as default, with a date picker to navigate history.
- **Weekly View:** Aggregated repos for a selected week, ranked by sustained trending.
- **Search Results:** (P1) List of matching repos across all dates with date context.
- **Compare View:** (P2) Side-by-side date comparison.

### 9.3 User Flows

**Primary Flow — Browse by Date:**

1. User lands on homepage (today's trending data displayed).
2. User clicks the date picker and selects a past date.
3. Page loads that date's trending snapshot.
4. User scans repo cards, clicks a repo name to visit it on GitHub.
5. User toggles to weekly view to see sustained trends.

### 9.4 Content & Messaging

- **Tone:** Technical, concise, developer-friendly. No marketing fluff.
- **Empty states:** Clear messaging when no data is available for a selected date.
- **Error states:** Friendly, actionable error messages with retry options.

---

## 10. Technical Considerations

### 10.1 Architecture Overview

| Component | Technology | Role |
|-----------|-----------|------|
| Frontend | Astro (SSR/SSG) | Renders pages with partial hydration; static for historical dates, SSR for today. |
| Scraper | Cloudflare Worker (Cron) | Fetches and parses `github.com/trending` on schedule; writes to D1. |
| Database | Cloudflare D1 | Primary data store for all scraped trending data. |
| Cache | Cloudflare KV | Optional caching layer for frequently accessed date snapshots. |
| CDN / Hosting | Cloudflare Pages | Serves the Astro frontend globally at the edge. |

### 10.2 Technical Constraints

- GitHub provides no official API for trending data; the scraper must parse HTML, which is fragile and can break if GitHub changes their page structure.
- Cloudflare D1 is still maturing; query performance and storage limits should be monitored.
- Cloudflare Worker cron jobs have execution time limits (typically 30 seconds on free tier) that may constrain scraper complexity.
- Rate limiting: GitHub may block or throttle requests if the scraper is too aggressive.

### 10.3 Technical Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| GitHub changes trending page HTML | Medium | High | Build resilient parser with fallback selectors; monitor for parse failures; alert on structural changes. |
| GitHub blocks scraper IP/User-Agent | Low | High | Use respectful request patterns; rotate User-Agent; add delay between requests. |
| D1 performance degrades at scale | Low | Medium | Implement KV caching for hot queries; index key columns; archive older data if needed. |
| Cloudflare Worker timeout on complex scrapes | Low | Medium | Keep scraper logic minimal; defer processing to scheduled tasks. |

---

## 11. Analytics & Success Metrics

### 11.1 Key Performance Indicators

| KPI | Definition | Baseline | Target |
|-----|-----------|----------|--------|
| Scrape Success Rate | % of scheduled scrapes that complete successfully | N/A (new) | ≥99% within 90 days |
| Daily Active Users | Unique visitors per day | N/A (new) | 100+ DAU within 3 months |
| Return Visit Rate | % of users who visit 2+ times per week | N/A (new) | 30% within 3 months |
| Avg. Session Duration | Time spent per visit | N/A (new) | >2 minutes |
| Page Load Time (LCP) | Largest Contentful Paint | N/A (new) | <2 seconds |
| Archive Coverage | % of days with complete data since launch | N/A (new) | 99%+ |

### 11.2 Analytics Implementation

- Privacy-friendly analytics (e.g., Plausible, Fathom, or Cloudflare Web Analytics).
- Track: page views per date/week, search queries, sort selections, dark mode usage, bounce rate.
- Scraper monitoring: log every scrape attempt with success/failure, duration, and repos captured.

### 11.3 Experimentation Plan

- No A/B testing planned for v1; focus on shipping the core experience.
- Feature flags recommended for P1/P2 features to enable gradual rollout.

---

## 12. Launch & Rollout Plan

### 12.1 Launch Strategy

- **Phase 1 — Silent Launch:** Deploy scraper and begin collecting data immediately. Build archive depth before public launch.
- **Phase 2 — Soft Launch:** Share with developer communities (Twitter/X, Hacker News, Reddit r/programming) for initial feedback.
- **Phase 3 — Public Launch:** Full launch with refined UI, 30+ days of archived data, and P1 features enabled.

### 12.2 Go-to-Market

- Developer-focused launch: Hacker News Show HN, Reddit, Twitter/X, dev newsletters.
- SEO: date-based URLs (e.g., `/trending/2026-02-15`) are inherently discoverable.
- Content marketing: publish a "Year in Review" or "Month in Review" blog post using RepoTrend's own data.

### 12.3 Support Readiness

- GitHub Issues repository for bug reports and feature requests.
- Simple FAQ page covering data sources, update frequency, and scope.
- No dedicated support team required for v1.

---

## 13. Timeline & Milestones

### 13.1 High-Level Timeline

| Phase | Description | Duration | Target |
|-------|------------|----------|--------|
| Phase 0 | Scraper development + data schema | 1–2 weeks | Begin data collection ASAP |
| Phase 1 | Core UI (daily browse, cards, dark mode) | 2–3 weeks | Soft launch with 2+ weeks of data |
| Phase 2 | Weekly view, responsive polish, performance | 1–2 weeks | Public launch |
| Phase 3 | P1 features (streaks, badges, search, sparklines) | 2–4 weeks | Post-launch iteration |
| Phase 4 | P2 features (charts, heatmap, compare, pagination) | Ongoing | Based on user feedback |

### 13.2 Key Milestones

- **First successful scrape:** Validates the entire data pipeline.
- **30 days of data collected:** Minimum viable archive depth.
- **Soft launch:** First external users testing the product.
- **Public launch:** Full P0 feature set live and stable.
- **1,000th daily scrape:** Long-term reliability proven.

---

## 14. Dependencies & Constraints

### 14.1 External Dependencies

| Dependency | Type | Risk Level | Notes |
|-----------|------|-----------|-------|
| GitHub trending page HTML structure | Data source | High | No API; relies on HTML parsing that can break without warning. |
| Cloudflare Workers | Infrastructure | Low | Mature platform; cron triggers and D1 are stable. |
| Cloudflare D1 | Database | Medium | Still evolving; monitor for performance and limit changes. |
| Cloudflare Pages | Hosting | Low | Standard deployment platform for Astro. |

### 14.2 Constraints

- **Budget:** Minimal — leveraging Cloudflare's free/pro tiers where possible.
- **Team:** Small team (1–2 developers); scope must remain tight.
- **Data:** No historical data exists before the scraper starts running; archive begins at deployment.
- **Scope:** English-only, all-languages trending page; no user accounts or personalization in v1.

---

## 15. Risks & Mitigations

| ID | Risk | Likelihood | Impact | Mitigation |
|----|------|-----------|--------|------------|
| R-001 | GitHub changes trending page HTML, breaking the scraper | Medium | High | Build resilient parser; monitor parse failures daily; maintain fallback selectors. |
| R-002 | GitHub blocks or rate-limits scraper requests | Low | High | Use polite request patterns; respect robots.txt; add randomized delays. |
| R-003 | Low user adoption after launch | Medium | Medium | Focus on SEO (date URLs); launch on Hacker News; create shareable content. |
| R-004 | D1 performance issues as data grows | Low | Medium | Index key columns; cache hot queries in KV; plan for data archival strategy. |
| R-005 | Scraper silent failures cause data gaps | Medium | Medium | Implement health checks; alert on missing daily data; build retry logic (P2). |
| R-006 | Scope creep delays core launch | Medium | Medium | Strict P0/P1/P2 prioritization; ship must-haves first, iterate after. |

---

## 16. Open Questions & Decisions Needed

| ID | Question | Owner | Status |
|----|---------|-------|--------|
| Q-001 | Should we scrape once or twice daily? Twice captures more churn but doubles compute. | Engineering | Open |
| Q-002 | What is the D1 storage limit on our Cloudflare plan, and when will we approach it? | Engineering | Open |
| Q-003 | Should weekly aggregation rank by appearance count, total stars gained, or a composite score? | Product | Open |
| Q-004 | Do we need a terms-of-service or legal review for scraping GitHub's trending page? | Legal | Open |
| Q-005 | Which privacy-friendly analytics tool should we use (Plausible, Fathom, CF Analytics)? | Product | Open |
| Q-006 | Should the calendar heatmap (P2) use a GitHub-style contribution graph or a standard calendar? | Design | Open |
| Q-007 | How should we handle trending repos that have been deleted or made private since scraping? | Engineering | Open |

---

## 17. Appendix

### 17.1 Glossary

| Term | Definition |
|------|-----------|
| D1 | Cloudflare's serverless SQL database built on SQLite. |
| KV | Cloudflare Workers KV, a globally distributed key-value store. |
| SSR | Server-Side Rendering: HTML generated on the server per request. |
| SSG | Static Site Generation: HTML pre-built at build time. |
| LCP | Largest Contentful Paint: a Core Web Vital measuring perceived load time. |
| CLS | Cumulative Layout Shift: a Core Web Vital measuring visual stability. |
| Cron Trigger | A scheduled execution of a Cloudflare Worker at defined intervals. |
| Partial Hydration | Astro's approach of only sending JavaScript for interactive components. |
| Star Delta | The number of GitHub stars a repo gains in a single day. |
| Trending Streak | The number of consecutive days a repo appears on GitHub's trending page. |

### 17.2 References

- GitHub Trending Page: `github.com/trending`
- Astro Documentation: `docs.astro.build`
- Cloudflare Workers Documentation: `developers.cloudflare.com/workers`
- Cloudflare D1 Documentation: `developers.cloudflare.com/d1`
- Web Vitals: `web.dev/vitals`

### 17.3 Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | February 21, 2026 | [Product Manager] | Initial draft based on feature specification. |
