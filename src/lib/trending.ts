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
