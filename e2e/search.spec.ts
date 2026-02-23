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
		await page.goto("/search?q=react");
		const searchInput = page.locator("#search-page-input");
		await expect(searchInput).toBeVisible();
		await expect(searchInput).toHaveValue("react");

		// Wait for results to load (client-side fetch with debounce)
		await page.waitForSelector(
			"#search-results .search-result-card, #search-results .search-empty",
			{
				timeout: 5000,
			},
		);
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
		await expect(empty).toContainText("No repos found");
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
});
