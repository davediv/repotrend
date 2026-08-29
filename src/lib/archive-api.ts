import { ArchiveValidationError } from "./archive-service";
import { logError } from "./log";

export function archiveJsonResponse(
	body: unknown,
	status = 200,
	cacheControl = "no-store",
): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json", "Cache-Control": cacheControl },
	});
}

export function archiveErrorResponse(
	error: unknown,
	event: string,
	context?: Record<string, unknown>,
): Response {
	if (error instanceof ArchiveValidationError) {
		return archiveJsonResponse({ error: error.message, code: error.code }, error.status);
	}

	logError(event, context)(error);
	return archiveJsonResponse({ error: "Database query failed" }, 500);
}
