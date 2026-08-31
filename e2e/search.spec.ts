import { expect, test } from "@playwright/test";

test.describe("Search", () => {
	test("search form exists in header", async ({ page }) => {
		await page.goto("/");
		const searchForm = page.locator('form[role="search"]');
		await expect(searchForm).toBeVisible();
		const searchInput = page.locator("#header-search");
		await expect(searchInput).toBeVisible();
		await expect(searchInput).toHaveAttribute("placeholder", /search/i);
	});

	test("submitting search navigates to search page", async ({ page }) => {
		await page.goto("/");
		const searchInput = page.locator("#header-search");
		await searchInput.fill("react");
		await searchInput.press("Enter");
		await page.waitForURL(/\/search\?q=react/);
	});

	test("search page renders with input and results", async ({ page }) => {
		let apiRequests = 0;
		page.on("request", (request) => {
			if (new URL(request.url()).pathname === "/api/search") apiRequests++;
		});
		const response = await page.goto("/search?q=react");
		expect(response?.headers()["cache-control"]).toContain("max-age=60");
		const searchInput = page.locator("#search-page-input");
		await expect(searchInput).toBeVisible();
		await expect(searchInput).toHaveValue("react");
		await expect(page.locator("#search-results .search-result-card").first()).toBeVisible();
		expect(apiRequests).toBe(0);
	});

	test("search results show matching repos", async ({ page }) => {
		await page.goto("/search?q=react");
		await page.waitForSelector("#search-results .search-result-card", { timeout: 5000 });

		const results = page.locator(".search-result-card");
		const count = await results.count();
		expect(count).toBeGreaterThan(0);

		const firstResult = results.first();
		const text = await firstResult.textContent();
		expect(text?.toLowerCase()).toContain("react");
	});

	test("search results show trending dates as links", async ({ page }) => {
		await page.goto("/search?q=next.js");
		await page.waitForSelector("#search-results .search-result-card", { timeout: 5000 });

		const dateLinks = page.locator(".search-result-card a[href*='/trending/']");
		const count = await dateLinks.count();
		expect(count).toBeGreaterThan(0);
	});

	test("clicking a date link in results navigates to that date", async ({ page }) => {
		await page.goto("/search?q=next.js");
		await page.waitForSelector("#search-results .search-result-card", { timeout: 5000 });

		const dateLink = page.locator(".search-result-card a[href*='/trending/2026-02-']").first();
		await expect(dateLink).toBeVisible({ timeout: 5000 });
		await dateLink.click();
		await page.waitForURL(/\/trending\/2026-02-/);
	});

	test("empty search results show appropriate message", async ({ page }) => {
		await page.goto("/search?q=zzz_nonexistent_repo_xyz");
		await page.waitForSelector(
			"#search-results .search-empty, #search-results .search-result-card",
			{
				timeout: 5000,
			},
		);

		const empty = page.locator(".search-empty");
		await expect(empty).toBeVisible();
		await expect(empty).toContainText("No repositories found");
	});

	test("search input is keyboard accessible and functional", async ({ page }) => {
		await page.goto("/");
		const searchInput = page.locator("#header-search");
		await searchInput.focus();
		await expect(searchInput).toBeFocused();
		// Verify the focused input accepts keyboard input
		await page.keyboard.type("test");
		await expect(searchInput).toHaveValue("test");
	});

	test("search with short query does not show results", async ({ page }) => {
		await page.goto("/search?q=a");
		const searchInput = page.locator("#search-page-input");
		await expect(searchInput).toHaveValue("a");

		// The search page shows a "too short" empty state for queries < 2 characters
		await page.waitForSelector("#search-results .search-empty", { timeout: 5000 });
		const results = page.locator(".search-result-card");
		await expect(results).toHaveCount(0);
	});

	test("server-renders shared search URLs without JavaScript", async ({ browser, baseURL }) => {
		const context = await browser.newContext({ javaScriptEnabled: false });
		const page = await context.newPage();
		await page.goto(new URL("/search?q=react", baseURL).href);
		const result = page.locator(".search-result-card").first();
		await expect(result.locator(".repo-owner")).toHaveText("facebook");
		await expect(result.locator(".repo-name-text")).toHaveText("react");
		await context.close();
	});

	test("topic links run an exact topic search", async ({ page }) => {
		await page.goto("/");
		const topicLink = page.locator('a.topic-tag[href="/search?topic=react"]').first();
		await expect(topicLink).toBeVisible();
		await topicLink.click();
		await expect(page).toHaveURL(/\/search\?topic=react/);
		const result = page.locator(".search-result-card").first();
		await expect(result.locator(".repo-owner")).toHaveText("facebook");
		await expect(result.locator(".repo-name-text")).toHaveText("react");
		await expect(page.locator('input[name="topic"]')).toHaveValue("react");
	});

	test("supports language and date-range filters with server pagination", async ({ page }) => {
		await page.goto("/search?language=Rust");
		await expect(page.locator(".search-result-card")).toHaveCount(4);
		await expect(page.locator(".language-filter")).toHaveText(["Rust", "Rust", "Rust", "Rust"]);

		await page.goto("/search?from=2026-02-09&to=2026-02-15");
		await expect(page.locator(".search-result-card")).toHaveCount(20);
		await expect(page.locator(".results-count")).toContainText("of 26 matching repositories");
		await expect(page.locator(".pagination-next")).toHaveAttribute("href", /page=2/);

		await page.goto("/search?from=2026-02-09&to=2026-02-15&page=999");
		await expect(page.locator(".search-result-card")).toHaveCount(6);
		await expect(page.locator(".results-count")).toContainText(
			"Showing 21–26 of 26 matching repositories",
		);
	});

	test("waits for explicit submission before running a text search", async ({ page }) => {
		await page.goto("/search");
		const searchInput = page.locator("#search-page-input");
		await searchInput.fill("next.js");
		await page.waitForTimeout(800);
		await expect(page).toHaveURL(/\/search$/);
		await expect(searchInput).toBeFocused();
		await expect(searchInput).toHaveValue("next.js");

		await searchInput.press("Enter");
		await expect(page).toHaveURL(/\/search\?q=next\.js/, { timeout: 5000 });
		const result = page.locator(".search-result-card").first();
		await expect(result.locator(".repo-owner")).toHaveText("vercel");
		await expect(result.locator(".repo-name-text")).toHaveText("next.js");
	});
});
