import { todayUTC } from "../dates";
import { logError, logInfo, logWarn } from "../log";
import { runScrapePipeline, type ScrapeResult } from "./pipeline";

const MAX_RETRIES = 2;
const RETRY_KV_PREFIX = "scrape_retry:";
/** TTL for retry count keys: 48 hours in seconds. */
const RETRY_TTL_SECONDS = 48 * 60 * 60;

/** Check whether D1 already has trending data for a given date. */
async function hasDataForDate(db: D1Database, date: string): Promise<boolean> {
	const row = await db
		.prepare("SELECT 1 FROM trending_repos WHERE trending_date = ? LIMIT 1")
		.bind(date)
		.first();
	return row !== null;
}

/** Read the current retry attempt count from KV (0 if no key). */
async function getRetryCount(kv: KVNamespace, date: string): Promise<number> {
	const val = await kv.get(`${RETRY_KV_PREFIX}${date}`);
	if (val === null) return 0;
	const parsed = Number(val);
	return Number.isFinite(parsed) ? parsed : 0;
}

/** Persist an updated retry count in KV with a 48-hour TTL. */
async function setRetryCount(kv: KVNamespace, date: string, count: number): Promise<void> {
	await kv.put(`${RETRY_KV_PREFIX}${date}`, String(count), {
		expirationTtl: RETRY_TTL_SECONDS,
	});
}

/** Delete the retry count key on successful recovery. */
async function clearRetryCount(kv: KVNamespace, date: string): Promise<void> {
	await kv.delete(`${RETRY_KV_PREFIX}${date}`);
}

export interface RetryAwareScrapeResult extends ScrapeResult {
	skipped: boolean;
	skipReason?: "already_has_data" | "max_retries_exceeded";
	attempt?: number;
	recovered?: boolean;
}

/**
 * Retry-aware scrape wrapper.
 *
 * Because GitHub's trending page only shows the current day's data (there is
 * no historical API), retries are only meaningful within the same UTC day.
 * The cron should be configured to fire multiple times per day (e.g.,
 * `0 6,18 * * *`) so that same-day retries are actually triggered.
 * Cross-day recovery is not possible — a missed day becomes a confirmed gap.
 *
 * Flow:
 * 1. Checks if today already has data → skips if so.
 * 2. Reads the retry attempt count from KV.
 * 3. If attempts >= MAX_RETRIES, marks the day as a confirmed gap.
 * 4. Otherwise runs the scrape pipeline.
 * 5. On success after prior failures, logs as a recovered scrape.
 * 6. On failure, increments the retry count.
 */
export async function runScrapeWithRetry(
	db: D1Database,
	kv: KVNamespace,
): Promise<RetryAwareScrapeResult> {
	const date = todayUTC();

	// 1. Skip if data already exists
	if (await hasDataForDate(db, date)) {
		logInfo("scrape_skipped", { date, reason: "already_has_data" });
		return {
			success: true,
			skipped: true,
			skipReason: "already_has_data",
			repoCount: 0,
			rowsWritten: 0,
			durationMs: 0,
			date,
		};
	}

	// 2. Check retry count (fail open on KV errors so the scrape still runs)
	let retryCount: number;
	try {
		retryCount = await getRetryCount(kv, date);
	} catch (error) {
		logError("retry_kv_read_error", { date })(error);
		retryCount = 0;
	}
	const attempt = retryCount + 1;

	if (retryCount >= MAX_RETRIES) {
		logWarn("scrape_gap_confirmed", {
			date,
			attempts: retryCount,
			reason: "max_retries_exceeded",
		});
		return {
			success: false,
			skipped: true,
			skipReason: "max_retries_exceeded",
			attempt: retryCount,
			repoCount: 0,
			rowsWritten: 0,
			durationMs: 0,
			date,
			error: `Max retries (${MAX_RETRIES}) exceeded for ${date}`,
		};
	}

	// 3. Run the scrape pipeline
	const result = await runScrapePipeline(db, date);
	const recovered = result.success && retryCount > 0;

	if (result.success) {
		// Clean up retry counter on success
		if (retryCount > 0) {
			try {
				await clearRetryCount(kv, date);
			} catch (error) {
				logError("retry_kv_clear_error", { date })(error);
			}
		}

		if (recovered) {
			logInfo("scrape_recovered", { date, attempt, repoCount: result.repoCount });
		}
	} else {
		// Increment retry count on failure
		try {
			await setRetryCount(kv, date, attempt);
		} catch (error) {
			logError("retry_kv_write_error", { date, attempt })(error);
		}

		logError("scrape_retry_failed", {
			date,
			attempt,
			maxRetries: MAX_RETRIES,
			errorType: result.errorType,
		})(new Error(result.error ?? "unknown"));
	}

	return { ...result, skipped: false, attempt, recovered };
}
