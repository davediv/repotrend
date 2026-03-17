const TRENDING_URL = "https://github.com/trending?spoken_language_code=en";

const USER_AGENT = "RepoTrend/1.0 (+https://repotrend.dev)";

const TIMEOUT_MS = 30_000;

/**
 * Fetches the GitHub trending page HTML.
 * Throws on non-200 responses and network timeouts.
 */
export async function fetchTrendingPage(): Promise<string> {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

	try {
		const response = await fetch(TRENDING_URL, {
			signal: controller.signal,
			headers: {
				"User-Agent": USER_AGENT,
				Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
				"Accept-Language": "en-US,en;q=0.9",
			},
		});

		if (!response.ok) {
			throw new Error(
				`GitHub trending fetch failed: HTTP ${response.status} ${response.statusText}`,
			);
		}

		return await response.text();
	} catch (error) {
		if (error instanceof DOMException && error.name === "AbortError") {
			throw new Error(`GitHub trending fetch timed out after ${TIMEOUT_MS / 1000} seconds`);
		}
		throw error;
	} finally {
		clearTimeout(timeout);
	}
}

/**
 * Returns a random delay between min and max milliseconds.
 * Used to add jitter before requests to avoid rate limiting.
 */
export function randomDelay(minMs = 1000, maxMs = 3000): Promise<void> {
	const range = maxMs - minMs + 1;
	const array = new Uint32Array(1);
	crypto.getRandomValues(array);
	const ms = minMs + (array[0] % range);
	return new Promise((resolve) => setTimeout(resolve, ms));
}
