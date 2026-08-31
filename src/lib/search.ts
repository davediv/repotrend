import { isValidDate } from "./dates";
import { type PaginationInfo, paginate, parsePageParam } from "./pagination";
import type { SearchFilters, SearchResult } from "./search-types";
import { parseTopicsJson } from "./trending";

export const SEARCH_PAGE_SIZE = 20;
export const MIN_SEARCH_QUERY_LENGTH = 2;
export const MAX_SEARCH_QUERY_LENGTH = 100;
const MAX_FILTER_LENGTH = 60;

export interface ParsedSearchRequest {
	filters: SearchFilters;
	shouldSearch: boolean;
	error: string | null;
}

export interface SearchArchiveResult {
	results: SearchResult[];
	pagination: PaginationInfo;
}

interface SearchRow {
	repo_owner: string;
	repo_name: string;
	description: string | null;
	language: string | null;
	language_color: string | null;
	total_stars: number;
	forks: number;
	stars_today: number;
	topics_json: string | null;
	dates_csv: string;
	total: number;
}

/** Escape SQL LIKE metacharacters (`%`, `_`, and the escape character). */
export function escapeSearchLike(value: string): string {
	return value.replace(/[%_\\]/g, "\\$&");
}

export function parseSearchRequest(searchParams: URLSearchParams): ParsedSearchRequest {
	const filters: SearchFilters = {
		query: searchParams.get("q")?.trim() ?? "",
		topic: searchParams.get("topic")?.trim() ?? "",
		language: searchParams.get("language")?.trim() ?? "",
		from: searchParams.get("from")?.trim() ?? "",
		to: searchParams.get("to")?.trim() ?? "",
		page: parsePageParam(searchParams.get("page")),
	};

	if (filters.query.length > MAX_SEARCH_QUERY_LENGTH) {
		return {
			filters,
			shouldSearch: false,
			error: `Query too long. Maximum ${MAX_SEARCH_QUERY_LENGTH} characters.`,
		};
	}

	if (filters.topic.length > MAX_FILTER_LENGTH || filters.language.length > MAX_FILTER_LENGTH) {
		return {
			filters,
			shouldSearch: false,
			error: `Filters must be ${MAX_FILTER_LENGTH} characters or fewer.`,
		};
	}

	if (filters.from && !isValidDate(filters.from)) {
		return { filters, shouldSearch: false, error: "The start date is invalid." };
	}

	if (filters.to && !isValidDate(filters.to)) {
		return { filters, shouldSearch: false, error: "The end date is invalid." };
	}

	if (filters.from && filters.to && filters.from > filters.to) {
		return {
			filters,
			shouldSearch: false,
			error: "The start date must be on or before the end date.",
		};
	}

	const hasFilter = Boolean(filters.topic || filters.language || filters.from || filters.to);
	const queryIsSearchable = filters.query.length >= MIN_SEARCH_QUERY_LENGTH;

	return {
		filters,
		shouldSearch: queryIsSearchable || hasFilter,
		error: null,
	};
}

function searchBindings(
	filters: SearchFilters,
): [
	string | null,
	string | null,
	string | null,
	string | null,
	string | null,
	string | null,
	string | null,
] {
	const escapedQuery = filters.query ? escapeSearchLike(filters.query) : null;
	return [
		escapedQuery ? `%${escapedQuery}%` : null,
		filters.topic || null,
		filters.language || null,
		filters.from || null,
		filters.to || null,
		filters.query || null,
		escapedQuery ? `${escapedQuery}%` : null,
	];
}

const SEARCH_CTE = `WITH appearances AS (
	SELECT
		repo_owner,
		repo_name,
		GROUP_CONCAT(DISTINCT trending_date) AS dates_csv,
		MAX(trending_date) AS latest_appearance
	FROM trending_repos
	WHERE (?4 IS NULL OR trending_date >= ?4)
		AND (?5 IS NULL OR trending_date <= ?5)
	GROUP BY repo_owner, repo_name
),
matched AS (
	SELECT
		repository.repo_owner,
		repository.repo_name,
		repository.description,
		repository.language,
		repository.language_color,
		repository.total_stars,
		repository.forks,
		repository.stars_today,
		repository.topics_json,
		appearances.dates_csv,
		appearances.latest_appearance,
		CASE
			WHEN ?1 IS NULL THEN 0
			WHEN LOWER(repository.repo_owner || '/' || repository.repo_name) = LOWER(?6) THEN 0
			WHEN LOWER(repository.repo_name) = LOWER(?6) THEN 1
			WHEN repository.repo_name LIKE ?7 ESCAPE '\\' THEN 2
			WHEN repository.repo_owner LIKE ?1 ESCAPE '\\'
				OR repository.repo_name LIKE ?1 ESCAPE '\\' THEN 3
			WHEN EXISTS (
				SELECT 1 FROM repository_topics AS query_topic
				WHERE query_topic.repo_owner = repository.repo_owner
					AND query_topic.repo_name = repository.repo_name
					AND query_topic.topic LIKE ?1 ESCAPE '\\'
			) THEN 4
			ELSE 5
		END AS relevance
	FROM repository_search AS repository
	INNER JOIN appearances
		ON appearances.repo_owner = repository.repo_owner
		AND appearances.repo_name = repository.repo_name
	WHERE (
		?1 IS NULL
		OR repository.repo_owner LIKE ?1 ESCAPE '\\'
		OR repository.repo_name LIKE ?1 ESCAPE '\\'
		OR repository.description LIKE ?1 ESCAPE '\\'
		OR EXISTS (
			SELECT 1 FROM repository_topics AS query_topic
			WHERE query_topic.repo_owner = repository.repo_owner
				AND query_topic.repo_name = repository.repo_name
				AND query_topic.topic LIKE ?1 ESCAPE '\\'
		)
	)
	AND (
		?2 IS NULL
		OR EXISTS (
			SELECT 1 FROM repository_topics AS exact_topic
			WHERE exact_topic.repo_owner = repository.repo_owner
				AND exact_topic.repo_name = repository.repo_name
				AND exact_topic.topic = ?2 COLLATE NOCASE
		)
	)
	AND (?3 IS NULL OR repository.language = ?3 COLLATE NOCASE)
)`;

/** Search the normalized repository index and paginate unique repositories on the server. */
export async function searchArchive(
	db: D1Database,
	filters: SearchFilters,
): Promise<SearchArchiveResult> {
	const bindings = searchBindings(filters);
	const { results: rows } = await db
		.prepare(
			`${SEARCH_CTE},
			stats AS (
				SELECT COUNT(*) AS total
				FROM matched
			)
			SELECT
				matched.repo_owner,
				matched.repo_name,
				matched.description,
				matched.language,
				matched.language_color,
				matched.total_stars,
				matched.forks,
				matched.stars_today,
				matched.topics_json,
				matched.dates_csv,
				stats.total
			FROM matched
			CROSS JOIN stats
			ORDER BY relevance ASC, latest_appearance DESC, total_stars DESC
			LIMIT ?8
			OFFSET MIN(
				(?9 - 1) * ?8,
				MAX(
					0,
					CAST(((SELECT total FROM stats) - 1) / ?8 AS INTEGER) * ?8
				)
			)`,
		)
		.bind(...bindings, SEARCH_PAGE_SIZE, filters.page)
		.all<SearchRow>();
	const total = Number(rows[0]?.total ?? 0);
	const pagination = paginate(total, filters.page, SEARCH_PAGE_SIZE);

	return {
		results: rows.map(({ topics_json, dates_csv, total: _, ...repository }) => ({
			...repository,
			topics: parseTopicsJson(topics_json),
			dates: dates_csv
				.split(",")
				.filter(Boolean)
				.sort((a, b) => b.localeCompare(a)),
		})),
		pagination,
	};
}

/** Languages available as exact search facets. */
export async function getSearchLanguages(db: D1Database): Promise<string[]> {
	const { results } = await db
		.prepare(
			`SELECT DISTINCT language
			FROM repository_search
			WHERE language IS NOT NULL AND language <> ''
			ORDER BY language COLLATE NOCASE ASC`,
		)
		.all<{ language: string }>();
	return results.map(({ language }) => language);
}
