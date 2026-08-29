import { expect, test } from "@playwright/test";

test.describe("Weekly Archive", () => {
	test("daily pages do not promote a weekly-frequency view", async ({ page }) => {
		await page.goto("/trending/2026-02-12");
		await expect(page.locator(".view-toggle")).toHaveCount(0);
	});

	test("weekly view page loads with title containing week range", async ({ page }) => {
		await page.goto("/trending/week/2026-02-09");
		// Title format: "Trending Feb 9 – <formatted> — RepoTrend"
		await expect(page).toHaveTitle(/Trending.*Feb 9.*RepoTrend/);
		await expect(
			page.getByRole("heading", { level: 1, name: /GitHub Trending.*Feb 9/ }),
		).toBeVisible();
	});

	test("weekly view renders toolbar and sort dropdown", async ({ page }) => {
		await page.goto("/trending/week/2026-02-09");
		// The toolbar, date picker, and sort dropdown render regardless of D1 query result
		await expect(page.locator(".date-picker")).toBeVisible();
		await expect(page.locator("#sort-select")).toBeVisible();
		await expect(page.locator(".view-toggle")).toBeVisible();
	});

	test("weekly view normalizes non-Monday dates to Monday", async ({ page }) => {
		// 2026-02-12 is a Thursday, should redirect to Monday 2026-02-09
		await page.goto("/trending/week/2026-02-12");
		await page.waitForURL(/\/trending\/week\/2026-02-09/);
	});

	test("invalid weekly dates return the custom 404 page", async ({ page }) => {
		const response = await page.goto("/trending/week/not-a-date");

		expect(response?.status()).toBe(404);
		await expect(page).toHaveTitle("Page Not Found — RepoTrend");
		await expect(page.getByRole("heading", { level: 1 })).toHaveText("404 — Page Not Found");
	});

	test("switching from Weekly back to Daily works", async ({ page }) => {
		await page.goto("/trending/week/2026-02-09");
		const dailyBtn = page.locator(".view-toggle-btn").first();
		await expect(dailyBtn).toContainText("Daily");
		await dailyBtn.click();
		await page.waitForURL(/\/trending\/2026-02-/);
		expect(page.url()).not.toContain("/week/");
	});

	test("weekly date picker navigation buttons are visible", async ({ page }) => {
		await page.goto("/trending/week/2026-02-09");
		const prevBtn = page.locator('.date-nav-btn[data-action="prev"]');
		const nextBtn = page.locator('.date-nav-btn[data-action="next"]');
		await expect(prevBtn).toBeVisible();
		await expect(nextBtn).toBeVisible();
		await expect(nextBtn).toHaveAttribute("href", /\/trending\/week\/\d{4}-\d{2}-\d{2}/);
	});

	test("weekly view sort dropdown has weekly-specific options", async ({ page }) => {
		await page.goto("/trending/week/2026-02-09");
		const sortDropdown = page.locator("#sort-select");
		await expect(sortDropdown).toBeVisible();
		const options = sortDropdown.locator("option");
		const optionTexts = await options.allTextContents();
		// Weekly sort uses "Trending Frequency" label instead of daily "Stars Gained Today"
		expect(optionTexts.some((t) => t.includes("Trending Frequency"))).toBe(true);
	});

	test("weekly view Daily toggle has aria-current on Weekly", async ({ page }) => {
		await page.goto("/trending/week/2026-02-09");
		const weeklyBtn = page.locator(".view-toggle-btn").last();
		await expect(weeklyBtn).toHaveAttribute("aria-current", "page");
	});

	test("archive navigation preserves weekly mode and highlights the whole week", async ({
		page,
	}) => {
		await page.goto("/trending/week/2026-02-09");
		const currentWeek = page.locator('.archive-date-browser a[href="/trending/week/2026-02-09"]');
		await expect(currentWeek).toHaveAttribute("aria-current", "page");

		await page.locator(".calendar-heatmap > summary").click();
		await expect(page.locator(".calendar-heatmap .heatmap-cell.selected")).toHaveCount(7);
		const weeklyHeatmapLink = page.locator('.calendar-heatmap a[href="/trending/week/2026-02-09"]');
		await expect(weeklyHeatmapLink).toHaveCount(7);
	});
});
