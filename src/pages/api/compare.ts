import type { APIRoute } from "astro";
import { archiveErrorResponse, archiveJsonResponse } from "../../lib/archive-api";
import { comparisonArchiveCacheControl, createArchiveService } from "../../lib/archive-service";

export const prerender = false;

export const GET: APIRoute = async ({ url, locals }) => {
	const date1 = url.searchParams.get("date1")?.trim() ?? "";
	const date2 = url.searchParams.get("date2")?.trim() ?? "";
	try {
		const comparison = await createArchiveService(locals.runtime.env).getComparison(date1, date2);
		return archiveJsonResponse(
			{
				date1_repos: comparison.date1Repos,
				date2_repos: comparison.date2Repos,
				common: comparison.common,
				only_date1: comparison.onlyDate1,
				only_date2: comparison.onlyDate2,
			},
			200,
			comparisonArchiveCacheControl(comparison.date1, comparison.date2),
		);
	} catch (error) {
		return archiveErrorResponse(error, "compare_query_error", { date1, date2 });
	}
};
