import type { APIRoute } from "astro";
import { parseAnalyticsPayload } from "../../lib/analytics";
import { logInfo } from "../../lib/log";

export const prerender = false;

const MAX_BODY_LENGTH = 2048;

function errorResponse(error: string, status: number): Response {
	return new Response(JSON.stringify({ error }), {
		status,
		headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
	});
}

export const POST: APIRoute = async ({ request, url }) => {
	const origin = request.headers.get("Origin");
	if (origin && origin !== url.origin) return errorResponse("Origin not allowed", 403);

	let text: string;
	try {
		text = await request.text();
	} catch {
		return errorResponse("Invalid request body", 400);
	}
	if (text.length > MAX_BODY_LENGTH) return errorResponse("Request body too large", 413);

	let raw: unknown;
	try {
		raw = JSON.parse(text);
	} catch {
		return errorResponse("Invalid JSON", 400);
	}
	const payload = parseAnalyticsPayload(raw);
	if (!payload) return errorResponse("Invalid analytics event", 400);

	logInfo("product_event", {
		action: payload.event,
		surface: payload.surface,
		path: payload.path,
	});
	return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
};
