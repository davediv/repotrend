/** Language distribution entry for a date or week. */
export interface LanguageDistribution {
	language: string;
	color: string;
	count: number;
	percentage: number;
}

/** Default color for repos with no language color. */
export const UNKNOWN_LANGUAGE_COLOR = "#8b949e";

/**
 * Query language distribution for a single date.
 * Groups by language name, counts repos per language,
 * and calculates percentages that sum to exactly 100%.
 */
export async function getLanguageDistribution(
	db: D1Database,
	date: string,
): Promise<LanguageDistribution[]> {
	const { results } = await db
		.prepare(
			`SELECT
				COALESCE(language, 'Unknown') AS language,
				COALESCE(MAX(language_color), ?) AS color,
				COUNT(*) AS count
			FROM trending_repos
			WHERE trending_date = ?
			GROUP BY COALESCE(language, 'Unknown')
			ORDER BY count DESC`,
		)
		.bind(UNKNOWN_LANGUAGE_COLOR, date)
		.all<{ language: string; color: string; count: number }>();

	return applyPercentages(results);
}

/**
 * Query language distribution for a Monday–Sunday week range.
 * Counts distinct repos per language (so a repo appearing on 5 days
 * counts as 1 for its language).
 */
export async function getWeeklyLanguageDistribution(
	db: D1Database,
	weekStart: string,
	weekEnd: string,
): Promise<LanguageDistribution[]> {
	const { results } = await db
		.prepare(
			`SELECT
				COALESCE(language, 'Unknown') AS language,
				COALESCE(MAX(language_color), ?) AS color,
				COUNT(DISTINCT repo_owner || '/' || repo_name) AS count
			FROM trending_repos
			WHERE trending_date >= ? AND trending_date <= ?
			GROUP BY COALESCE(language, 'Unknown')
			ORDER BY count DESC`,
		)
		.bind(UNKNOWN_LANGUAGE_COLOR, weekStart, weekEnd)
		.all<{ language: string; color: string; count: number }>();

	return applyPercentages(results);
}

/**
 * Calculate percentages using the largest-remainder method so they sum to
 * exactly 100. Works in integer tenths to avoid floating-point accumulation.
 * Each percentage is rounded to one decimal place.
 */
function applyPercentages(
	rows: { language: string; color: string; count: number }[],
): LanguageDistribution[] {
	const total = rows.reduce((sum, r) => sum + r.count, 0);
	if (total === 0) return [];

	// Work in integer tenths (1000 = 100.0%) to avoid floating-point drift
	const entries = rows.map((r) => {
		const rawTenths = (r.count / total) * 1000;
		const flooredTenths = Math.floor(rawTenths);
		return { ...r, tenths: flooredTenths, remainder: rawTenths - flooredTenths };
	});

	// Distribute leftover tenths to reach exactly 1000 (= 100.0%)
	let leftover = 1000 - entries.reduce((sum, e) => sum + e.tenths, 0);

	const sorted = entries
		.map((e, i) => ({ i, remainder: e.remainder }))
		.sort((a, b) => b.remainder - a.remainder);

	for (const { i } of sorted) {
		if (leftover <= 0) break;
		entries[i].tenths++;
		leftover--;
	}

	return entries.map(({ tenths, remainder: _, ...e }) => ({
		...e,
		percentage: tenths / 10,
	}));
}

/** One data point in a repo's star history. */
export interface StarHistoryPoint {
	date: string;
	stars_today: number;
}

/** Shape of a trending repo row from D1 (display-relevant fields). */
export interface TrendingRepo {
	repo_owner: string;
	repo_name: string;
	description: string | null;
	language: string | null;
	language_color: string | null;
	total_stars: number;
	forks: number;
	stars_today: number;
	/** Consecutive-day trending streak ending on the queried date (1 = single day). */
	streak?: number;
	/** Whether this is the repo's first appearance in the archive. */
	is_new_entry?: boolean;
	/**
	 * Chronologically-sorted history of daily star gains for this repo.
	 * Only present when the repo has 2+ days of data in the archive.
	 */
	star_history?: StarHistoryPoint[];
}

/** Shape of a weekly-aggregated trending repo. */
export interface WeeklyTrendingRepo {
	repo_owner: string;
	repo_name: string;
	description: string | null;
	language: string | null;
	language_color: string | null;
	total_stars: number;
	forks: number;
	appearances: number;
	total_stars_gained: number;
	max_stars_today: number;
}

/** Response shape for the weekly trending API. */
export interface WeeklyTrendingResponse {
	week_start: string;
	week_end: string;
	partial: boolean;
	repos: WeeklyTrendingRepo[];
}

/**
 * Query trending repos for a given date from D1, ordered by stars_today descending.
 * Throws on D1 errors — callers must handle failures.
 */
export async function getTrendingRepos(db: D1Database, date: string): Promise<TrendingRepo[]> {
	const { results } = await db
		.prepare(
			`SELECT repo_owner, repo_name, description, language, language_color,
		            total_stars, forks, stars_today
		       FROM trending_repos
		      WHERE trending_date = ?
		      ORDER BY stars_today DESC`,
		)
		.bind(date)
		.all<TrendingRepo>();
	return results;
}

/** Result from `getWeeklyTrendingRepos` including the number of distinct days with data. */
export interface WeeklyQueryResult {
	repos: WeeklyTrendingRepo[];
	daysWithData: number;
}

/**
 * Query weekly-aggregated trending repos for a Monday–Sunday range from D1.
 * Repos are ranked by frequency of appearance (days trending), then by total stars gained.
 * Uses the latest metadata (description, total_stars, forks) from the most recent appearance.
 * Also returns `daysWithData` — the count of distinct dates with data in the range.
 * Throws on D1 errors — callers must handle failures.
 */
export async function getWeeklyTrendingRepos(
	db: D1Database,
	weekStart: string,
	weekEnd: string,
): Promise<WeeklyQueryResult> {
	const { results } = await db
		.prepare(
			`SELECT
				repo_owner,
				repo_name,
				description,
				language,
				language_color,
				total_stars,
				forks,
				appearances,
				total_stars_gained,
				max_stars_today,
				days_in_week
			FROM (
				SELECT
					repo_owner,
					repo_name,
					description,
					language,
					language_color,
					total_stars,
					forks,
					COUNT(*) OVER (PARTITION BY repo_owner, repo_name) AS appearances,
					SUM(stars_today) OVER (PARTITION BY repo_owner, repo_name) AS total_stars_gained,
					MAX(stars_today) OVER (PARTITION BY repo_owner, repo_name) AS max_stars_today,
					COUNT(DISTINCT trending_date) OVER () AS days_in_week,
					ROW_NUMBER() OVER (PARTITION BY repo_owner, repo_name ORDER BY trending_date DESC) AS rn
				FROM trending_repos
				WHERE trending_date >= ? AND trending_date <= ?
			)
			WHERE rn = 1
			ORDER BY appearances DESC, total_stars_gained DESC`,
		)
		.bind(weekStart, weekEnd)
		.all<WeeklyTrendingRepo & { days_in_week: number }>();

	const daysWithData = results[0]?.days_in_week ?? 0;
	const repos = results.map(({ days_in_week: _, ...repo }) => repo);

	return { repos, daysWithData };
}

/** Max number of days to look back when calculating streaks. */
const STREAK_LOOKBACK_DAYS = 60;

/** Max number of days of star history to include for sparkline charts. */
const STAR_HISTORY_LOOKBACK_DAYS = 365;

/**
 * Fetch trending repos for a date with streak, new-entry, and star-history data included.
 * Wraps `getTrendingRepos` + enrichment functions into a single call.
 * All enrichment errors are non-fatal — repos are returned without enrichment on failure.
 */
export async function getTrendingReposWithStreaks(
	db: D1Database,
	date: string,
): Promise<TrendingRepo[]> {
	const repos = await getTrendingRepos(db, date);
	try {
		await calculateStreaks(db, date, repos);
	} catch {
		// Non-fatal: repos are still valid without streaks
	}
	try {
		await detectNewEntries(db, date, repos);
	} catch {
		// Non-fatal: repos are still valid without new-entry flags
	}
	try {
		await fetchStarHistory(db, date, repos);
	} catch {
		// Non-fatal: repos are still valid without star history
	}
	return repos;
}

/**
 * Fetch star-gain history (up to STAR_HISTORY_LOOKBACK_DAYS) for the given repos.
 * Mutates each repo in-place by setting the `star_history` property.
 *
 * `star_history` is only set for repos with 2+ days of data; repos with a single
 * appearance receive no `star_history` property.
 *
 * `date` identifies the repo set via an indexed JOIN (one bind vs. a dynamic IN-list
 * for ~25 repos). History is bounded to STAR_HISTORY_LOOKBACK_DAYS to keep query
 * cost and KV payload size predictable as the archive grows.
 * Results are sorted chronologically (oldest first).
 */
export async function fetchStarHistory(
	db: D1Database,
	date: string,
	repos: TrendingRepo[],
): Promise<void> {
	if (repos.length === 0) return;

	const lookbackDate = daysAgo(date, STAR_HISTORY_LOOKBACK_DAYS);

	const { results } = await db
		.prepare(
			`SELECT h.repo_owner, h.repo_name, h.trending_date AS date, h.stars_today
			   FROM trending_repos h
			  INNER JOIN trending_repos t
			     ON h.repo_owner = t.repo_owner AND h.repo_name = t.repo_name
			  WHERE t.trending_date = ?
			    AND h.trending_date >= ?
			  ORDER BY h.repo_owner, h.repo_name, h.trending_date ASC`,
		)
		.bind(date, lookbackDate)
		.all<{ repo_owner: string; repo_name: string; date: string; stars_today: number }>();

	// Group history points by repo key
	const historyByRepo = new Map<string, StarHistoryPoint[]>();
	for (const row of results) {
		const key = `${row.repo_owner}/${row.repo_name}`;
		let points = historyByRepo.get(key);
		if (!points) {
			points = [];
			historyByRepo.set(key, points);
		}
		points.push({ date: row.date, stars_today: row.stars_today });
	}

	// Only attach history for repos with 2+ data points
	for (const repo of repos) {
		const key = `${repo.repo_owner}/${repo.repo_name}`;
		const points = historyByRepo.get(key);
		if (points && points.length >= 2) {
			repo.star_history = points;
		}
	}
}

/**
 * Calculate consecutive-day trending streaks for the given repos on a specific date.
 * Mutates each repo in-place by setting the `streak` property.
 *
 * A streak counts backward from `date`: if a repo appeared on Feb 15, 14, 13 but
 * not Feb 12, its streak on Feb 15 is 3. A single-day appearance yields streak = 1.
 *
 * Uses a single indexed query over the (`repo_owner`, `repo_name`) and
 * `trending_date` indexes for efficient lookups.
 */
export async function calculateStreaks(
	db: D1Database,
	date: string,
	repos: TrendingRepo[],
): Promise<void> {
	if (repos.length === 0) return;

	const lookbackDate = daysAgo(date, STREAK_LOOKBACK_DAYS);

	// Fetch appearance dates for all repos trending on `date`, looking back up to
	// STREAK_LOOKBACK_DAYS. The INNER JOIN limits history rows to only the repos
	// present on the target date.
	const { results } = await db
		.prepare(
			`SELECT h.repo_owner, h.repo_name, h.trending_date
			   FROM trending_repos h
			  INNER JOIN trending_repos t
			     ON h.repo_owner = t.repo_owner AND h.repo_name = t.repo_name
			  WHERE t.trending_date = ?
			    AND h.trending_date <= ?
			    AND h.trending_date >= ?
			  ORDER BY h.repo_owner, h.repo_name, h.trending_date DESC`,
		)
		.bind(date, date, lookbackDate)
		.all<{ repo_owner: string; repo_name: string; trending_date: string }>();

	// Group appearance dates by repo key
	const datesByRepo = new Map<string, string[]>();
	for (const row of results) {
		const key = `${row.repo_owner}/${row.repo_name}`;
		let dates = datesByRepo.get(key);
		if (!dates) {
			dates = [];
			datesByRepo.set(key, dates);
		}
		dates.push(row.trending_date);
	}

	// Compute streak for each repo (minimum 1 since the repo is trending on the target date)
	for (const repo of repos) {
		const key = `${repo.repo_owner}/${repo.repo_name}`;
		const dates = datesByRepo.get(key);
		repo.streak = dates ? Math.max(1, consecutiveStreak(dates, date)) : 1;
	}
}

/**
 * Detect first-time trending repos for the given date.
 * Mutates each repo in-place by setting the `is_new_entry` property.
 *
 * A repo is a "new entry" if it has no prior appearance in the archive
 * (i.e., no row exists with `trending_date < date` for that repo).
 *
 * Uses NOT EXISTS with short-circuit evaluation — for repos with prior
 * appearances the subquery stops at the first match, avoiding a full
 * history scan. Only returns repos that ARE new entries; all others
 * are set to `false`.
 */
export async function detectNewEntries(
	db: D1Database,
	date: string,
	repos: TrendingRepo[],
): Promise<void> {
	if (repos.length === 0) return;

	const { results } = await db
		.prepare(
			`SELECT repo_owner, repo_name
			   FROM trending_repos
			  WHERE trending_date = ?
			    AND NOT EXISTS (
			        SELECT 1 FROM trending_repos h
			         WHERE h.repo_owner = trending_repos.repo_owner
			           AND h.repo_name = trending_repos.repo_name
			           AND h.trending_date < ?
			    )`,
		)
		.bind(date, date)
		.all<{ repo_owner: string; repo_name: string }>();

	const newEntries = new Set<string>();
	for (const row of results) {
		newEntries.add(`${row.repo_owner}/${row.repo_name}`);
	}

	for (const repo of repos) {
		const key = `${repo.repo_owner}/${repo.repo_name}`;
		repo.is_new_entry = newEntries.has(key);
	}
}

/**
 * Count consecutive days backward from `targetDate` in a descending-sorted date array.
 * Expects `sortedDatesDesc` to contain YYYY-MM-DD strings in descending order,
 * starting from `targetDate`.
 */
function consecutiveStreak(sortedDatesDesc: string[], targetDate: string): number {
	let streak = 0;
	let expected = targetDate;
	for (const date of sortedDatesDesc) {
		if (date === expected) {
			streak++;
			expected = previousDay(expected);
		} else if (date < expected) {
			break;
		}
	}
	return streak;
}

/** Return the YYYY-MM-DD string for the day before `dateStr`. */
function previousDay(dateStr: string): string {
	const d = new Date(`${dateStr}T00:00:00Z`);
	d.setUTCDate(d.getUTCDate() - 1);
	return d.toISOString().slice(0, 10);
}

/** Return the YYYY-MM-DD string for `n` days before `dateStr`. */
function daysAgo(dateStr: string, n: number): string {
	const d = new Date(`${dateStr}T00:00:00Z`);
	d.setUTCDate(d.getUTCDate() - n);
	return d.toISOString().slice(0, 10);
}
