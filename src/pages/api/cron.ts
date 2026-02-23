import type { APIRoute } from "astro";
import { logError } from "../../lib/log";
import { runScrapeWithRetry } from "../../lib/scraper/retry";
import {
	formatFailureMessage,
	formatTrendingMessage,
	getTelegramConfig,
	sendTelegramMessage,
} from "../../lib/telegram";
import { getTrendingRepos } from "../../lib/trending";

export const prerender = false;

export const GET: APIRoute = async ({ request, locals }) => {
	if (request.headers.get("X-Cron-Source") !== "scheduled") {
		return new Response(JSON.stringify({ error: "Forbidden" }), {
			status: 403,
			headers: { "Content-Type": "application/json" },
		});
	}

	const env = locals.runtime.env;
	const telegramConfig = getTelegramConfig(env);

	try {
		const result = await runScrapeWithRetry(env.DB, env.CACHE);
		const isOk = result.success || (result.skipped && result.skipReason !== "max_retries_exceeded");
		const status = isOk ? 200 : 500;

		// Send Telegram notification (non-fatal)
		if (telegramConfig) {
			try {
				if (result.success && !result.skipped) {
					const repos = await getTrendingRepos(env.DB, result.date);
					const message = formatTrendingMessage(repos, result.date);
					await sendTelegramMessage(telegramConfig, message);
				} else if (!result.skipped) {
					const message = formatFailureMessage(
						result.date,
						result.errorType ?? "unknown_error",
						result.error ?? "Unknown error",
						result.attempt,
					);
					await sendTelegramMessage(telegramConfig, message);
				}
			} catch (telegramError) {
				logError("telegram_notification_error")(telegramError);
			}
		}

		return new Response(JSON.stringify(result), {
			status,
			headers: { "Content-Type": "application/json" },
		});
	} catch (error) {
		logError("scrape_unhandled_error")(error);

		if (telegramConfig) {
			try {
				const date = new Date().toISOString().slice(0, 10);
				const msg = formatFailureMessage(
					date,
					"unhandled_error",
					error instanceof Error ? error.message : String(error),
				);
				await sendTelegramMessage(telegramConfig, msg);
			} catch (telegramError) {
				logError("telegram_notification_error")(telegramError);
			}
		}

		return new Response(JSON.stringify({ error: "Internal scrape error" }), {
			status: 500,
			headers: { "Content-Type": "application/json" },
		});
	}
};
