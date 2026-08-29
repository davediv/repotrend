import type { APIRoute } from "astro";
import { archiveErrorResponse, archiveJsonResponse } from "../../../lib/archive-api";
import { createArchiveService, dailyArchiveCacheControl } from "../../../lib/archive-service";

export const prerender = false;

export const GET: APIRoute = async ({ params, locals }) => {
	const archive = createArchiveService(locals.runtime.env);
	let date = params.date ?? "";
	try {
		date = archive.validateDate(params.date);
		const languages = await archive.getDailyLanguages(date);
		return archiveJsonResponse(languages, 200, dailyArchiveCacheControl(date));
	} catch (error) {
		return archiveErrorResponse(error, "languages_query_error", { date });
	}
};
