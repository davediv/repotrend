import type { APIRoute } from "astro";
import { archiveErrorResponse, archiveJsonResponse } from "../../lib/archive-api";
import { createArchiveService } from "../../lib/archive-service";

export const prerender = false;

export const GET: APIRoute = async ({ locals }) => {
	try {
		const { earliest, latest, dates } = await createArchiveService(
			locals.runtime.env,
		).getArchiveIndex();
		return archiveJsonResponse(
			{ earliest, latest, dates },
			200,
			"public, max-age=300, s-maxage=300",
		);
	} catch (error) {
		return archiveErrorResponse(error, "dates_query_error");
	}
};
