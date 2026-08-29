import type { APIRoute } from "astro";
import { archiveErrorResponse, archiveJsonResponse } from "../../../../lib/archive-api";
import { createArchiveService, weeklyArchiveCacheControl } from "../../../../lib/archive-service";
import { getMondayOfWeek } from "../../../../lib/dates";

export const prerender = false;

export const GET: APIRoute = async ({ params, locals }) => {
	const archive = createArchiveService(locals.runtime.env);
	let date = params.date ?? "";
	let weekStart = "";
	try {
		date = archive.validateDate(params.date);
		weekStart = getMondayOfWeek(date);
		const snapshot = await archive.getWeeklySnapshot(date);
		return archiveJsonResponse(snapshot, 200, weeklyArchiveCacheControl(weekStart));
	} catch (error) {
		return archiveErrorResponse(error, "weekly_trending_query_error", { date, weekStart });
	}
};
