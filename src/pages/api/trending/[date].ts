import type { APIRoute } from "astro";
import { isValidDate, todayUTC } from "../../../lib/dates";
import { logError } from "../../../lib/log";
import { parseTopicsJson, type TrendingRepo } from "../../../lib/trending";

export const prerender = false;

/** Seconds in one hour – used as TTL for today's cache entry. */
const TODAY_TTL_SECONDS = 3600;

interface TrendingRow extends TrendingRepo {
	topics_json: string | null;
	trending_date: string;
	scraped_at: string;
}

export const GET: APIRoute = async ({ params, locals }) => {
	const { date } = params;

	if (!date || !isValidDate(date)) {
		return new Response(JSON.stringify({ error: "Invalid date format. Expected YYYY-MM-DD." }), {
			status: 400,
			headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
		});
	}

	const { DB: db, CACHE: kv } = locals.runtime.env;
	// Versioned because v2 is a pure daily snapshot in GitHub's source order.
	const cacheKey = `trending:daily:v2:${date}`;
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

	// 2. Fall through to D1
	let rows: TrendingRow[];
	try {
		({ results: rows } = await db
			.prepare(
				`SELECT repo_owner, repo_name, description, language, language_color,
				        total_stars, forks, stars_today, daily_rank, topics_json, trending_date, scraped_at
				   FROM trending_repos
				  WHERE trending_date = ?
				  ORDER BY daily_rank ASC, id ASC`,
			)
			.bind(date)
			.all<TrendingRow>());
	} catch (error) {
		logError("trending_query_error", { date })(error);
		return new Response(JSON.stringify({ error: "Database query failed" }), {
			status: 500,
			headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
		});
	}
	const results: TrendingRepo[] = rows.map(({ topics_json, ...row }) => ({
		...row,
		topics: parseTopicsJson(topics_json),
	}));

	// 3. Populate KV cache (skip empty results to allow a later same-day scrape)
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
