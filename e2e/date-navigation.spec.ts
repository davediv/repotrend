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

	test("previous button navigates to earlier date", async ({ page }) => {
		await page.goto("/trending/2026-02-15");
		// Wait for /api/dates to load so buttons become enabled
		const prevBtn = page.locator('.date-nav-btn[data-action="prev"]');
		await expect(prevBtn).toBeEnabled({ timeout: 5000 });
		await prevBtn.click();
		await page.waitForURL(/\/trending\/2026-02-14/);
		await expect(page.locator(".date-display")).toContainText("February 14, 2026");
	});

	test("next button navigates to later date", async ({ page }) => {
		await page.goto("/trending/2026-02-09");
		// Wait for /api/dates to load so buttons become enabled
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

	test("invalid date format shows error page", async ({ page }) => {
		await page.goto("/trending/not-a-date");
		// Invalid date triggers the global error boundary middleware
		const errorContainer = page.locator(".error-container");
		await expect(errorContainer).toBeVisible();
		await expect(errorContainer).toContainText("Something went wrong");
	});

	test("cards are ranked 1 through 25", async ({ page }) => {
		await page.goto("/trending/2026-02-15");
		const ranks = page.locator(".repo-rank");
		await expect(ranks).toHaveCount(25);
		await expect(ranks.first()).toContainText("1");
		await expect(ranks.last()).toContainText("25");
	});

	test("sort dropdown reorders cards", async ({ page }) => {
		await page.goto("/trending/2026-02-15");

		await page.locator("#sort-select").selectOption("total_stars");
		await page.waitForURL(/sort=total_stars/);

		// After sorting by total_stars, the first card should be facebook/react (221,005 stars)
		const firstOwner = await page.locator(".repo-owner").first().textContent();
		expect(firstOwner).toBe("facebook");
	});

	test("calendar heatmap day links navigate to date", async ({ page }) => {
		await page.goto("/trending/2026-02-15");
		const heatmapLink = page.locator('.calendar-heatmap a[href*="/trending/2026-02-12"]');
		await expect(heatmapLink.first()).toBeVisible({ timeout: 5000 });
		await heatmapLink.first().click();
		await page.waitForURL(/\/trending\/2026-02-12/);
		await expect(page.locator(".date-display")).toContainText("February 12, 2026");
	});
});
