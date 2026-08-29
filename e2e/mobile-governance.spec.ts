import { expect, test } from "@playwright/test";

test.describe("Mobile core journeys", () => {
	test("moves from discovery to repository history without horizontal page overflow", async ({
		page,
	}) => {
		for (const path of ["/", "/trending", "/search?q=react", "/repos/facebook/react"]) {
			await page.goto(path);
			expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
				await page.evaluate(() => window.innerWidth),
			);
		}
		await expect(page.getByRole("link", { name: /Open on GitHub/ })).toBeVisible();
	});

	test("keeps primary navigation and comparison controls reachable", async ({ page }) => {
		await page.goto("/compare?date1=2026-02-14&date2=2026-02-15");
		await expect(page.getByRole("navigation", { name: "Primary" }).getByRole("link")).toHaveCount(
			3,
		);
		await expect(page.getByRole("button", { name: "Compare dates" })).toBeVisible();
		await expect(page.locator(".comparison-row").first()).toBeVisible();
		expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
			await page.evaluate(() => window.innerWidth),
		);
	});
});
