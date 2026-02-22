import type { APIRoute } from "astro";
import { isValidDate, todayUTC } from "../../lib/dates";
import { logError } from "../../lib/log";
import { getTrendingRepos, type TrendingRepo } from "../../lib/trending";

export const prerender = false;

function repoKey(r: TrendingRepo): string {
	return `${r.repo_owner}/${r.repo_name}`;
}

export const GET: APIRoute = async ({ url, locals }) => {
	const date1 = url.searchParams.get("date1")?.trim() ?? "";
	const date2 = url.searchParams.get("date2")?.trim() ?? "";

	if (!date1 || !date2 || !isValidDate(date1) || !isValidDate(date2)) {
		return new Response(
			JSON.stringify({
				error: "Both date1 and date2 query parameters are required in YYYY-MM-DD format.",
			}),
			{ status: 400, headers: { "Content-Type": "application/json" } },
		);
	}

	if (date1 === date2) {
		return new Response(
			JSON.stringify({
				error: "date1 and date2 must be different dates.",
			}),
			{ status: 400, headers: { "Content-Type": "application/json" } },
		);
	}

	const db = locals.runtime.env.DB;

	let date1Repos: TrendingRepo[];
	let date2Repos: TrendingRepo[];
	try {
		[date1Repos, date2Repos] = await Promise.all([
			getTrendingRepos(db, date1),
			getTrendingRepos(db, date2),
		]);
	} catch (error) {
		logError("compare_query_error", { date1, date2 })(error);
		const message = error instanceof Error ? error.message : String(error);
		return new Response(JSON.stringify({ error: "Database query failed", detail: message }), {
			status: 500,
			headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
		});
	}

	const date1Keys = new Set(date1Repos.map(repoKey));
	const date2Keys = new Set(date2Repos.map(repoKey));

	const common = date1Repos.filter((r) => date2Keys.has(repoKey(r)));
	const onlyDate1 = date1Repos.filter((r) => !date2Keys.has(repoKey(r)));
	const onlyDate2 = date2Repos.filter((r) => !date1Keys.has(repoKey(r)));

	console.log(
		JSON.stringify({
			level: "info",
			event: "compare_query",
			timestamp: new Date().toISOString(),
			date1,
			date2,
			date1_count: date1Repos.length,
			date2_count: date2Repos.length,
			common_count: common.length,
		}),
	);

	const today = todayUTC();
	const isHistorical = date1 !== today && date2 !== today;
	const cacheControl = isHistorical
		? "public, max-age=86400, s-maxage=86400, immutable"
		: "public, max-age=300, s-maxage=300";

	return new Response(
		JSON.stringify({
			date1_repos: date1Repos,
			date2_repos: date2Repos,
			common,
			only_date1: onlyDate1,
			only_date2: onlyDate2,
		}),
		{
			status: 200,
			headers: { "Content-Type": "application/json", "Cache-Control": cacheControl },
		},
	);
};
