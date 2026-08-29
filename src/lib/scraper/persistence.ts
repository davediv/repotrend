import type { ParsedRepo } from "./parser";

function toTopicsJson(topics: string[] | undefined): string {
	if (!Array.isArray(topics)) return "[]";
	const normalized = topics
		.filter((topic): topic is string => typeof topic === "string")
		.map((topic) => topic.trim().toLowerCase())
		.filter((topic) => topic.length > 0);
	return JSON.stringify([...new Set(normalized)]);
}

/**
 * Persists an ordered daily snapshot into the D1 `trending_repos` table.
 *
 * The input order is GitHub's ranking order. Repositories are deduplicated by
 * owner/name, then the previous snapshot for the date is atomically replaced so
 * stale repositories cannot remain after a same-day refresh.
 *
 * @param db - Cloudflare D1 database binding
 * @param repos - Array of parsed repos from the scraper
 * @param date - Trending date in YYYY-MM-DD format
 * @returns Number of unique snapshot rows inserted
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
	const seen = new Set<string>();
	const uniqueRepos = repos.filter((repo) => {
		const key = `${repo.repo_owner}/${repo.repo_name}`.toLowerCase();
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});

	const deletePreviousSnapshot = db
		.prepare("DELETE FROM trending_repos WHERE trending_date = ?")
		.bind(date);
	const insertStatements = uniqueRepos.map((repo, index) =>
		db
			.prepare(
				`INSERT INTO trending_repos
          (repo_owner, repo_name, description, language, language_color, total_stars, forks, stars_today, trending_date, scraped_at, topics_json, daily_rank)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
				toTopicsJson(repo.topics),
				index + 1,
			),
	);

	try {
		const results = await db.batch([deletePreviousSnapshot, ...insertStatements]);

		let rowsWritten = 0;
		for (const result of results.slice(1)) {
			if (!result.success) throw new Error("D1 snapshot insert failed");
			rowsWritten += result.meta.changes ?? 0;
		}

		return rowsWritten;
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		throw new Error(`D1 persistence failed: ${message}`);
	}
}
