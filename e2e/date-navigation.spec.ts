import { expect, test } from "@playwright/test";

test.describe("Date Navigation", () => {
	test("navigates to a specific date via URL", async ({ page }) => {
		await page.goto("/trending/2026-02-15");
		await expect(page).toHaveTitle(/February 15, 2026/);
		const cards = page.locator(".repo-card");
		await expect(cards).toHaveCount(25);
	});

	test("date picker shows the correct date from URL", async ({ page }) => {
		await page.goto("/trending/2026-02-12");
		const dateDisplay = page.locator(".date-display");
		await expect(dateDisplay).toContainText("February 12, 2026");
	});

	test("initializes navigation from SSR data without refetching archive dates", async ({
		page,
	}) => {
		let dateApiRequests = 0;
		page.on("request", (request) => {
			if (new URL(request.url()).pathname === "/api/dates") dateApiRequests++;
		});

		await page.goto("/trending/2026-02-12");
		await expect(page.locator('.date-nav-btn[data-action="prev"]')).toBeEnabled();
		expect(dateApiRequests).toBe(0);
	});

	test("previous button navigates to earlier date", async ({ page }) => {
		await page.goto("/trending/2026-02-15");
		// The SSR-provided archive dates enable navigation without another request.
		const prevBtn = page.locator('.date-nav-btn[data-action="prev"]');
		await expect(prevBtn).toBeEnabled({ timeout: 5000 });
		await prevBtn.click();
		await page.waitForURL(/\/trending\/2026-02-14/);
		await expect(page.locator(".date-display")).toContainText("February 14, 2026");
	});

	test("next button navigates to later date", async ({ page }) => {
		await page.goto("/trending/2026-02-09");
		// The SSR-provided archive dates enable navigation without another request.
		const nextBtn = page.locator('.date-nav-btn[data-action="next"]');
		await expect(nextBtn).toBeEnabled({ timeout: 5000 });
		await nextBtn.click();
		await page.waitForURL(/\/trending\/2026-02-10/);
		await expect(page.locator(".date-display")).toContainText("February 10, 2026");
	});

	test("URL is deep-linkable and shareable", async ({ page }) => {
		await page.goto("/trending/2026-02-11");
		await expect(page).toHaveTitle(/February 11, 2026/);
		const cards = page.locator(".repo-card");
		await expect(cards).toHaveCount(25);
		await expect(page.locator(".date-display")).toContainText("February 11, 2026");
	});

	test("today's dated URL resolves to the canonical homepage", async ({ page }) => {
		const today = new Date().toISOString().slice(0, 10);
		await page.goto(`/trending/${today}`);

		await expect(page).toHaveURL("/");
		await expect(page.locator(".daily-archive-page")).toHaveAttribute("data-context", "latest");
		await expect(
			page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Today" }),
		).toHaveAttribute("aria-current", "page");
	});

	test("daily pages share one archive composition", async ({ page }) => {
		for (const path of ["/", "/trending/2026-02-15"]) {
			await page.goto(path);
			await expect(page.locator(".daily-archive-page")).toBeVisible();
			await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
			await expect(page.locator(".snapshot-heading")).toBeVisible();
			await expect(page.locator(".date-picker")).toBeVisible();
			await expect(page.locator(".language-chart")).toBeVisible();
			await expect(page.locator(".calendar-heatmap")).toBeVisible();
			await expect(page.locator(".card-list-results")).toBeVisible();
			await expect(page.locator(".card-list-results ~ .archive-insights")).toBeVisible();
		}
	});

	test("invalid date format returns the custom 404 page", async ({ page }) => {
		const response = await page.goto("/trending/not-a-date");

		expect(response?.status()).toBe(404);
		await expect(page).toHaveTitle("Page Not Found — RepoTrend");
		await expect(page.getByRole("heading", { level: 1 })).toHaveText("404 — Page Not Found");
		await expect(page.locator(".error-container")).toHaveCount(0);
	});

	test("impossible and future dates return 404", async ({ page }) => {
		for (const date of ["2026-02-30", "2999-01-01"]) {
			const response = await page.goto(`/trending/${date}`);
			expect(response?.status()).toBe(404);
			await expect(page.getByRole("heading", { level: 1 })).toHaveText("404 — Page Not Found");
		}
	});

	test("valid dates without a capture return a specific no-data state", async ({ page }) => {
		const response = await page.goto("/trending/2026-02-08");

		expect(response?.status()).toBe(200);
		await expect(page).toHaveTitle(/February 8, 2026/);
		await expect(page.getByRole("status")).toContainText(
			"No GitHub Trending snapshot was captured for February 8, 2026",
		);
		await expect(page.getByText("Something went wrong")).toHaveCount(0);
	});

	test("unknown routes return the custom 404 page", async ({ page }) => {
		const response = await page.goto("/route-that-does-not-exist");

		expect(response?.status()).toBe(404);
		await expect(page).toHaveTitle("Page Not Found — RepoTrend");
		await expect(page.getByRole("heading", { level: 1 })).toHaveText("404 — Page Not Found");
	});

	test("cards are ranked 1 through 25", async ({ page }) => {
		await page.goto("/trending/2026-02-15");
		const ranks = page.locator(".repo-rank");
		await expect(ranks).toHaveCount(25);
		await expect(ranks.first()).toContainText("1");
		await expect(ranks.last()).toContainText("25");
	});

	test("daily archive preserves the captured GitHub order", async ({ page }) => {
		await page.goto("/trending/2026-02-15");

		const owners = await page.locator(".repo-owner").allTextContents();
		expect(owners.slice(0, 3)).toEqual(["vercel", "facebook", "microsoft"]);
		await expect(page.locator("#sort-select")).toHaveCount(0);
	});

	test("calendar heatmap day links navigate to date", async ({ page }) => {
		await page.goto("/trending/2026-02-15");
		await page.locator(".calendar-heatmap > summary").click();
		const heatmapLink = page.locator('.calendar-heatmap a[href*="/trending/2026-02-12"]');
		await expect(heatmapLink.first()).toBeVisible({ timeout: 5000 });
		await heatmapLink.first().click();
		await page.waitForURL(/\/trending\/2026-02-12/);
		await expect(page.locator(".date-display")).toContainText("February 12, 2026");
	});

	test("offers large, grouped links for every available date", async ({ page }) => {
		await page.goto("/trending/2026-02-15");
		const dateLink = page.locator('.archive-date-browser a[href="/trending/2026-02-12"]');
		await expect(dateLink).toBeVisible();
		const box = await dateLink.boundingBox();
		expect(box?.height).toBeGreaterThanOrEqual(44);
	});
});
