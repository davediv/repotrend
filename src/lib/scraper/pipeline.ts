import { todayUTC } from "../dates";
import { logError, logInfo } from "../log";
import { fetchTrendingPage, randomDelay } from "./fetcher";
import { parseTrendingPage } from "./parser";
import { persistRepos } from "./persistence";
import { enrichReposWithTopics } from "./topics";

export type ScrapeErrorType = "fetch_error" | "parse_error" | "persist_error" | "unknown_error";

export interface ScrapeResult {
	success: boolean;
	repoCount: number;
	rowsWritten: number;
	durationMs: number;
	date: string;
	error?: string;
	errorType?: ScrapeErrorType;
}

/**
 * Orchestrates the full scrape pipeline: fetch → parse → persist.
 * Logs structured JSON at each stage for observability in Cloudflare dashboard.
 *
 * @param db - Cloudflare D1 database binding
 * @param targetDate - Optional date override (YYYY-MM-DD). Defaults to today (UTC).
 * @returns Structured result with success/failure details and metrics
 */
export async function runScrapePipeline(
	db: D1Database,
	targetDate?: string,
): Promise<ScrapeResult> {
	const start = Date.now();
	const date = targetDate ?? todayUTC();

	logInfo("scrape_start", { date });

	try {
		await randomDelay();

		// Stage 1: Fetch
		let html: string;
		try {
			html = await fetchTrendingPage();
		} catch (error) {
			throw Object.assign(error instanceof Error ? error : new Error(String(error)), {
				_scrapeErrorType: "fetch_error" as const,
			});
		}

		// Stage 2: Parse
		let repos: ReturnType<typeof parseTrendingPage>;
		try {
			repos = parseTrendingPage(html);
		} catch (error) {
			throw Object.assign(error instanceof Error ? error : new Error(String(error)), {
				_scrapeErrorType: "parse_error" as const,
			});
		}

		// Stage 3: Enrich with GitHub topics (best-effort, non-fatal)
		try {
			repos = await enrichReposWithTopics(repos);
		} catch (error) {
			logError("repo_topics_enrichment_error", { date })(error);
		}

		// Stage 4: Persist
		let rowsWritten: number;
		try {
			rowsWritten = await persistRepos(db, repos, date);
		} catch (error) {
			throw Object.assign(error instanceof Error ? error : new Error(String(error)), {
				_scrapeErrorType: "persist_error" as const,
			});
		}

		const durationMs = Date.now() - start;
		const reposWithTopics = repos.filter((r) => (r.topics?.length ?? 0) > 0).length;

		logInfo("scrape_success", {
			date,
			repoCount: repos.length,
			rowsWritten,
			reposWithTopics,
			durationMs,
		});

		return {
			success: true,
			repoCount: repos.length,
			rowsWritten,
			durationMs,
			date,
		};
	} catch (error) {
		const durationMs = Date.now() - start;
		const message = error instanceof Error ? error.message : String(error);
		const errorType: ScrapeErrorType =
			(error as { _scrapeErrorType?: ScrapeErrorType })._scrapeErrorType ?? "unknown_error";

		logError("scrape_failure", { date, durationMs, errorType })(new Error(message));

		return {
			success: false,
			repoCount: 0,
			rowsWritten: 0,
			durationMs,
			date,
			error: message,
			errorType,
		};
	}
}
