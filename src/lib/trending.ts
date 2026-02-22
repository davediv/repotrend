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
