import type { APIRoute } from "astro";
import { isValidDate, todayUTC } from "../../../lib/dates";
import { logError } from "../../../lib/log";
import { type LanguageDistribution, getLanguageDistribution } from "../../../lib/trending";

export const prerender = false;

/** KV cache TTL for today's language data (1 hour). */
const TODAY_TTL_SECONDS = 3600;

export const GET: APIRoute = async ({ params, locals }) => {
	const { date } = params;

	if (!date || !isValidDate(date)) {
		return new Response(JSON.stringify({ error: "Invalid date format. Expected YYYY-MM-DD." }), {
			status: 400,
			headers: { "Content-Type": "application/json" },
		});
	}

	const { DB: db, CACHE: kv } = locals.runtime.env;
	const cacheKey = `languages:${date}`;
	const isToday = date === todayUTC();
	const cacheControl = isToday
		? "public, max-age=300, s-maxage=300"
		: "public, max-age=86400, s-maxage=86400, immutable";

	// 1. Check KV cache
	const cached = await kv.get(cacheKey);
	if (cached !== null) {
		console.log(
			JSON.stringify({
				level: "info",
				event: "cache_hit",
				timestamp: new Date().toISOString(),
				date,
				cacheKey,
			}),
		);
		return new Response(cached, {
			status: 200,
			headers: { "Content-Type": "application/json", "Cache-Control": cacheControl },
		});
	}

	console.log(
		JSON.stringify({
			level: "info",
			event: "cache_miss",
			timestamp: new Date().toISOString(),
			date,
			cacheKey,
		}),
	);

	// 2. Query D1
	let results: LanguageDistribution[];
	try {
		results = await getLanguageDistribution(db, date);
	} catch (error) {
		logError("languages_query_error", { date })(error);
		const message = error instanceof Error ? error.message : String(error);
		return new Response(JSON.stringify({ error: "Database query failed", detail: message }), {
			status: 500,
			headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
		});
	}

	// 3. Populate KV cache (skip empty results to allow future backfills)
	const json = JSON.stringify(results);
	if (results.length > 0) {
		try {
			await kv.put(cacheKey, json, isToday ? { expirationTtl: TODAY_TTL_SECONDS } : undefined);
		} catch (error) {
			logError("cache_put_error", { date, cacheKey })(error);
		}
	}

	return new Response(json, {
		status: 200,
		headers: { "Content-Type": "application/json", "Cache-Control": cacheControl },
	});
};
