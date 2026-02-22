import type { APIRoute } from "astro";
import { logError } from "../../lib/log";
import type { SearchResult } from "../../lib/search-types";

export const prerender = false;

/** Maximum number of grouped repo results to return. */
const MAX_RESULTS = 50;

/** Minimum query length to execute a search. */
const MIN_QUERY_LENGTH = 2;

/** Maximum query length to prevent expensive full-table scans. */
const MAX_QUERY_LENGTH = 100;

/**
 * Hard cap on rows fetched from D1 to prevent resource exhaustion.
 * Allows enough rows for grouping (~15 dates per repo × 50 repos).
 */
const SQL_ROW_LIMIT = 750;

interface SearchRow {
	repo_owner: string;
	repo_name: string;
	description: string | null;
	language: string | null;
	language_color: string | null;
	total_stars: number;
	forks: number;
	stars_today: number;
	trending_date: string;
}

/** Escape SQL LIKE metacharacters (`%` and `_`) with backslash. */
function escapeLike(value: string): string {
	return value.replace(/[%_\\]/g, "\\$&");
}

export const GET: APIRoute = async ({ url, locals }) => {
	const query = url.searchParams.get("q")?.trim() ?? "";

	if (query.length < MIN_QUERY_LENGTH) {
		return new Response(JSON.stringify({ results: [], total: 0, query }), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		});
	}

	if (query.length > MAX_QUERY_LENGTH) {
		return new Response(
			JSON.stringify({ error: `Query too long. Maximum ${MAX_QUERY_LENGTH} characters.` }),
			{
				status: 400,
				headers: { "Content-Type": "application/json" },
			},
		);
	}

	const db = locals.runtime.env.DB;
	const escaped = escapeLike(query);
	const likePattern = `%${escaped}%`;
	const startsWithPattern = `${escaped}%`;

	// Search across repo_owner, repo_name, and description using LIKE.
	// Note: LIKE '%...%' (leading wildcard) forces a full table scan in SQLite/D1.
	// Mitigated by SQL_ROW_LIMIT cap, 60s cache TTL, and MAX_QUERY_LENGTH.
	// Consider SQLite FTS5 if table grows beyond ~100k rows.
	// Relevance ordering:
	//   1. Exact repo name match (owner/name = query)
	//   2. Repo name starts with query
	//   3. Owner or name contains query
	//   4. Description-only match
	// Within each tier, order by most recent appearance and highest stars.
	let rows: SearchRow[];
	try {
		({ results: rows } = await db
			.prepare(
				`SELECT
					repo_owner, repo_name, description, language, language_color,
					total_stars, forks, stars_today, trending_date
				FROM trending_repos
				WHERE repo_owner LIKE ?1 ESCAPE '\\'
					OR repo_name LIKE ?1 ESCAPE '\\'
					OR description LIKE ?1 ESCAPE '\\'
				ORDER BY
					CASE
						WHEN repo_owner || '/' || repo_name = ?2 THEN 0
						WHEN repo_name = ?2 THEN 1
						WHEN repo_name LIKE ?3 ESCAPE '\\' THEN 2
						WHEN repo_owner LIKE ?1 ESCAPE '\\' OR repo_name LIKE ?1 ESCAPE '\\' THEN 3
						ELSE 4
					END,
					trending_date DESC,
					stars_today DESC
				LIMIT ?4`,
			)
			.bind(likePattern, query, startsWithPattern, SQL_ROW_LIMIT)
			.all<SearchRow>());
	} catch (error) {
		logError("search_query_error", { query })(error);
		const message = error instanceof Error ? error.message : String(error);
		return new Response(JSON.stringify({ error: "Database query failed", detail: message }), {
			status: 500,
			headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
		});
	}

	// Group rows by repo, collecting dates and keeping the latest metadata.
	// Rows are sorted by relevance then trending_date DESC, so the first
	// row for each repo has the most recent metadata.
	const repoMap = new Map<string, SearchResult>();
	for (const row of rows) {
		const key = `${row.repo_owner}/${row.repo_name}`;
		const existing = repoMap.get(key);
		if (existing) {
			existing.dates.push(row.trending_date);
		} else {
			if (repoMap.size >= MAX_RESULTS) continue;
			repoMap.set(key, {
				repo_owner: row.repo_owner,
				repo_name: row.repo_name,
				description: row.description,
				language: row.language,
				language_color: row.language_color,
				total_stars: row.total_stars,
				forks: row.forks,
				stars_today: row.stars_today,
				dates: [row.trending_date],
			});
		}
	}

	const results = Array.from(repoMap.values());

	return new Response(JSON.stringify({ results, total: results.length, query }), {
		status: 200,
		headers: {
			"Content-Type": "application/json",
			"Cache-Control": "public, max-age=60, s-maxage=60",
		},
	});
};
