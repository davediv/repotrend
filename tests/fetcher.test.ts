import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchTrendingPage } from "../src/lib/scraper/fetcher";

describe("fetchTrendingPage", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("requests GitHub's daily Trending page without a spoken language filter", async () => {
		const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
			new Response("<html></html>", {
				status: 200,
				headers: { "Content-Type": "text/html" },
			}),
		);

		await fetchTrendingPage();

		expect(fetchMock).toHaveBeenCalledTimes(1);
		const [url, init] = fetchMock.mock.calls[0];
		expect(url).toBe("https://github.com/trending?since=daily");
		expect(init?.headers).toMatchObject({
			"User-Agent": "RepoTrend/1.0 (+https://repotrend.dev)",
			"Accept-Language": "en-US,en;q=0.9",
		});
	});
});
