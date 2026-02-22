import type { APIRoute } from "astro";
import { getMondayOfWeek, getSundayOfWeek, isValidDate, todayUTC } from "../../../../lib/dates";
import { getWeeklyTrendingRepos, type WeeklyTrendingResponse } from "../../../../lib/trending";

export const prerender = false;

/** KV cache TTL for weeks containing today (1 hour). */
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
	const cacheKey = `trending:week:${weekStart}`;
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

	// 2. Query D1 for weekly aggregation (includes days_in_week count)
	let repos: Awaited<ReturnType<typeof getWeeklyTrendingRepos>>["repos"];
	let daysWithData: number;
	try {
		const result = await getWeeklyTrendingRepos(db, weekStart, weekEnd);
		repos = result.repos;
		daysWithData = result.daysWithData;
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		return new Response(JSON.stringify({ error: "Database query failed", detail: message }), {
			status: 500,
			headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
		});
	}

	// 3. Determine if this is a partial week.
	// Partial if the week extends into the future OR has fewer than 7 days of data.
	const weekNotFinished = weekEnd > today;
	const partial = weekNotFinished || daysWithData < 7;

	const response: WeeklyTrendingResponse = {
		week_start: weekStart,
		week_end: weekEnd,
		partial,
		repos,
	};

	const json = JSON.stringify(response);

	// 4. Populate KV cache (skip empty results to allow future backfills)
	if (repos.length > 0) {
		try {
			await kv.put(
				cacheKey,
				json,
				isCurrentWeek ? { expirationTtl: CURRENT_WEEK_TTL_SECONDS } : undefined,
			);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			console.error(
				JSON.stringify({
					level: "error",
					event: "cache_put_error",
					timestamp: new Date().toISOString(),
					weekStart,
					cacheKey,
					error: message,
				}),
			);
		}
	}

	return new Response(json, {
		status: 200,
		headers: { "Content-Type": "application/json", "Cache-Control": cacheControl },
	});
};
