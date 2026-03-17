import { escapeHTML, formatNumber } from "./format";
import type { TrendingRepo } from "./trending";

export interface TelegramConfig {
	botToken: string;
	chatId: string;
	/** Numeric thread/topic ID for Telegram group supergroups. */
	threadId?: number;
}

/**
 * Extract Telegram config from Worker env bindings.
 * Returns null if required secrets (BOT_TOKEN, CHAT_ID) are not set,
 * allowing callers to skip notification gracefully.
 */
export function getTelegramConfig(env: {
	TELEGRAM_BOT_TOKEN?: string;
	TELEGRAM_CHAT_ID?: string;
	TELEGRAM_THREAD_ID?: string;
}): TelegramConfig | null {
	const { TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, TELEGRAM_THREAD_ID } = env;
	if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return null;

	const threadId = TELEGRAM_THREAD_ID ? Number(TELEGRAM_THREAD_ID) : undefined;
	return {
		botToken: TELEGRAM_BOT_TOKEN,
		chatId: TELEGRAM_CHAT_ID,
		threadId: Number.isFinite(threadId) ? threadId : undefined,
	};
}

/**
 * Send a message via the Telegram Bot API.
 * Uses HTML parse mode — callers must ensure `text` is properly HTML-escaped.
 * Throws on network or API error.
 */
const BOT_TOKEN_RE = /^[0-9]+:[A-Za-z0-9_-]{35}$/;

export async function sendTelegramMessage(config: TelegramConfig, text: string): Promise<void> {
	if (!BOT_TOKEN_RE.test(config.botToken)) {
		throw new Error("Invalid Telegram bot token format");
	}

	const url = `https://api.telegram.org/bot${config.botToken}/sendMessage`;

	const body: Record<string, unknown> = {
		chat_id: config.chatId,
		text,
		parse_mode: "HTML",
		link_preview_options: { is_disabled: true },
	};

	if (config.threadId !== undefined) {
		body.message_thread_id = config.threadId;
	}

	const response = await fetch(url, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	});

	if (!response.ok) {
		throw new Error(`Telegram API error: HTTP ${response.status}`);
	}
}

/**
 * Format a list of trending repos into a Telegram HTML message.
 * Shows: rank, owner/repo link, language, stars today, description.
 */
export function formatTrendingMessage(repos: TrendingRepo[], date: string): string {
	const timeUTC = new Date().toISOString().slice(11, 16);
	const header = `📈 <b>GitHub Trending — ${escapeHTML(date)}</b>\n${repos.length} repos · ${timeUTC} UTC`;

	if (repos.length === 0) return header;

	const lines = repos.map((repo, i) => {
		const repoLink = `https://github.com/${repo.repo_owner}/${repo.repo_name}`;
		const nameHtml = `<a href="${repoLink}">${escapeHTML(repo.repo_owner)}/${escapeHTML(repo.repo_name)}</a>`;

		const meta: string[] = [];
		if (repo.language) meta.push(escapeHTML(repo.language));
		meta.push(`⭐ ${formatNumber(repo.stars_today)} today`);

		const descHtml = repo.description ? `\n   ${escapeHTML(repo.description)}` : "";

		return `${i + 1}. ${nameHtml} · ${meta.join(" · ")}${descHtml}`;
	});

	return `${header}\n\n${lines.join("\n\n")}`;
}

/**
 * Format a failure alert for a scrape error.
 */
export function formatFailureMessage(
	date: string,
	errorType: string,
	errorMessage: string,
	attempt?: number,
): string {
	const attemptInfo = attempt !== undefined ? ` · attempt ${attempt}` : "";
	return (
		`❌ <b>Scrape Failed — ${escapeHTML(date)}</b>\n` +
		`Type: <code>${escapeHTML(errorType)}</code>${attemptInfo}\n` +
		`Error: ${escapeHTML(errorMessage)}`
	);
}
