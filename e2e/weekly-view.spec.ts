import { expect, test } from "@playwright/test";

test.describe("Weekly View", () => {
	test("clicking Weekly toggle navigates to weekly URL", async ({ page }) => {
		await page.goto("/trending/2026-02-12");
		const weeklyBtn = page.locator(".view-toggle-btn").last();
		await expect(weeklyBtn).toContainText("Weekly");
		await weeklyBtn.click();
		await page.waitForURL(/\/trending\/week\//);
	});

	test("weekly view page loads with title containing week range", async ({ page }) => {
		await page.goto("/trending/week/2026-02-09");
		// Title format: "Trending Feb 9 – <formatted> — RepoTrend"
		await expect(page).toHaveTitle(/Trending.*Feb 9.*RepoTrend/);
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
});
