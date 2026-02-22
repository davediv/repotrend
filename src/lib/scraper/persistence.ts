import type { ParsedRepo } from "./parser";

/**
 * Persists an array of parsed trending repos into the D1 `trending_repos` table.
 *
 * Uses INSERT OR REPLACE keyed on the composite unique constraint
 * (repo_owner, repo_name, trending_date) for deduplication.
 *
 * @param db - Cloudflare D1 database binding
 * @param repos - Array of parsed repos from the scraper
 * @param date - Trending date in YYYY-MM-DD format
 * @returns Number of rows inserted or replaced
 */
export async function persistRepos(
	db: D1Database,
	repos: ParsedRepo[],
	date: string,
): Promise<number> {
	if (repos.length === 0) {
		return 0;
	}

	const scrapedAt = new Date().toISOString();

	const statements = repos.map((repo) =>
		db
			.prepare(
				`INSERT OR REPLACE INTO trending_repos
          (repo_owner, repo_name, description, language, language_color, total_stars, forks, stars_today, trending_date, scraped_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			)
			.bind(
				repo.repo_owner,
				repo.repo_name,
				repo.description,
				repo.language,
				repo.language_color,
				repo.total_stars,
				repo.forks,
				repo.stars_today,
				date,
				scrapedAt,
			),
	);

	try {
		const results = await db.batch(statements);

		let rowsWritten = 0;
		for (const result of results) {
			if (result.success) {
				rowsWritten += result.meta.changes ?? 0;
			}
		}

		return rowsWritten;
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		throw new Error(`D1 persistence failed: ${message}`);
	}
}
