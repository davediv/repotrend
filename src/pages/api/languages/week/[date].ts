import type { APIRoute } from "astro";
import { getMondayOfWeek, getSundayOfWeek, isValidDate, todayUTC } from "../../../../lib/dates";
import { logError } from "../../../../lib/log";
import { type LanguageDistribution, getWeeklyLanguageDistribution } from "../../../../lib/trending";

export const prerender = false;

/** KV cache TTL for current week's language data (1 hour). */
const CURRENT_WEEK_TTL_SECONDS = 3600;

export const GET: APIRoute = async ({ params, locals }) => {
	const { date } = params;

	if (!date || !isValidDate(date)) {
		return new Response(JSON.stringify({ error: "Invalid date format. Expected YYYY-MM-DD." }), {
			status: 400,
			headers: { "Content-Type": "application/json" },
		});
	}

	const weekStart = getMondayOfWeek(date);
	const weekEnd = getSundayOfWeek(weekStart);

	const { DB: db, CACHE: kv } = locals.runtime.env;
	const cacheKey = `languages:week:${weekStart}`;
	const today = todayUTC();
	const isCurrentWeek = weekStart <= today && today <= weekEnd;
	const cacheControl = isCurrentWeek
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
				weekStart,
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
			weekStart,
			cacheKey,
		}),
	);

	// 2. Query D1
	let results: LanguageDistribution[];
	try {
		results = await getWeeklyLanguageDistribution(db, weekStart, weekEnd);
	} catch (error) {
		logError("weekly_languages_query_error", { weekStart, weekEnd })(error);
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
			await kv.put(
				cacheKey,
				json,
				isCurrentWeek ? { expirationTtl: CURRENT_WEEK_TTL_SECONDS } : undefined,
			);
		} catch (error) {
			logError("cache_put_error", { weekStart, cacheKey })(error);
		}
	}

	return new Response(json, {
		status: 200,
		headers: { "Content-Type": "application/json", "Cache-Control": cacheControl },
	});
};
