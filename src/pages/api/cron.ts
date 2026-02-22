import type { APIRoute } from "astro";
import { logError } from "../../lib/log";
import { runScrapeWithRetry } from "../../lib/scraper/retry";

export const prerender = false;

export const GET: APIRoute = async ({ request, locals }) => {
	if (request.headers.get("X-Cron-Source") !== "scheduled") {
		return new Response(JSON.stringify({ error: "Forbidden" }), {
			status: 403,
			headers: { "Content-Type": "application/json" },
		});
	}

	const env = locals.runtime.env;

	try {
		const result = await runScrapeWithRetry(env.DB, env.CACHE);
		const isOk = result.success || (result.skipped && result.skipReason !== "max_retries_exceeded");
		const status = isOk ? 200 : 500;
		return new Response(JSON.stringify(result), {
			status,
			headers: { "Content-Type": "application/json" },
		});
	} catch (error) {
		logError("scrape_unhandled_error")(error);
		return new Response(JSON.stringify({ error: "Internal scrape error" }), {
			status: 500,
			headers: { "Content-Type": "application/json" },
		});
	}
};
