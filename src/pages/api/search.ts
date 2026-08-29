import type { APIRoute } from "astro";
import { logError } from "../../lib/log";
import { parseSearchRequest, searchArchive, SEARCH_PAGE_SIZE } from "../../lib/search";
import type { SearchResponse } from "../../lib/search-types";

export const prerender = false;

function json(body: unknown, status = 200, cacheControl = "no-store"): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json", "Cache-Control": cacheControl },
	});
}

export const GET: APIRoute = async ({ url, locals }) => {
	const parsed = parseSearchRequest(url.searchParams);
	const { filters } = parsed;

	if (parsed.error) return json({ error: parsed.error }, 400);

	if (!parsed.shouldSearch) {
		const response: SearchResponse = {
			results: [],
			total: 0,
			query: filters.query,
			filters: {
				topic: filters.topic,
				language: filters.language,
				from: filters.from,
				to: filters.to,
			},
			page: 1,
			page_size: SEARCH_PAGE_SIZE,
			total_pages: 1,
		};
		return json(response, 200, "public, max-age=60, s-maxage=60");
	}

	try {
		const { results, pagination } = await searchArchive(locals.runtime.env.DB, filters);
		const response: SearchResponse = {
			results,
			total: pagination.totalItems,
			query: filters.query,
			filters: {
				topic: filters.topic,
				language: filters.language,
				from: filters.from,
				to: filters.to,
			},
			page: pagination.currentPage,
			page_size: SEARCH_PAGE_SIZE,
			total_pages: pagination.totalPages,
		};
		return json(response, 200, "public, max-age=60, s-maxage=60");
	} catch (error) {
		logError("search_query_error", {
			queryLength: filters.query.length,
			hasTopic: Boolean(filters.topic),
			hasLanguage: Boolean(filters.language),
			hasDateRange: Boolean(filters.from || filters.to),
		})(error);
		return json({ error: "Database query failed" }, 500);
	}
};
