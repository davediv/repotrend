import { expect, test } from "@playwright/test";

test.describe("Repository archive", () => {
	test("snapshot cards lead to an internal history page", async ({ page }) => {
		await page.goto("/trending/2026-02-15");
		const repositoryLink = page.getByRole("link", { name: "facebook/react" }).first();
		await expect(repositoryLink).toHaveAttribute("href", "/repos/facebook/react");
		await repositoryLink.click();

		await expect(page).toHaveURL(/\/repos\/facebook\/react$/);
		await expect(page.getByRole("heading", { level: 1 })).toContainText("facebook/react");
	});

	test("shows repository metadata, archive summary, and every appearance link", async ({
		page,
	}) => {
		const response = await page.goto("/repos/facebook/react");
		expect(response?.headers()["cache-control"]).toContain("max-age=300");

		await expect(page).toHaveTitle(/facebook\/react Trending History/);
		await expect(page.getByRole("heading", { name: "Archive summary" })).toBeVisible();
		await expect(page.getByText("Captured daily star gains")).toBeVisible();
		await expect(page.getByRole("heading", { name: "Captured appearances" })).toBeVisible();

		const rows = page.locator(".appearance-history tbody tr");
		expect(await rows.count()).toBeGreaterThanOrEqual(7);
		await expect(rows.first().getByRole("link")).toHaveAttribute(
			"href",
			/\/trending\/\d{4}-\d{2}-\d{2}/,
		);
		await expect(rows.last().getByRole("link")).toHaveAttribute("href", "/trending/2026-02-09");
	});

	test("keeps Open on GitHub as the primary external action", async ({ page }) => {
		await page.goto("/repos/facebook/react");
		const github = page.getByRole("link", { name: /Open on GitHub/ });

		await expect(github).toHaveAttribute("href", "https://github.com/facebook/react");
		await expect(github).toHaveAttribute("target", "_blank");
		await expect(github).toHaveClass(/github-action/);
	});

	test("search and comparison results use the same internal destination", async ({ page }) => {
		await page.goto("/search?q=react");
		await expect(page.getByRole("link", { name: "facebook/react" }).first()).toHaveAttribute(
			"href",
			"/repos/facebook/react",
		);

		await page.goto("/compare?date1=2026-02-14&date2=2026-02-15");
		await expect(page.getByRole("link", { name: "facebook/react" }).first()).toHaveAttribute(
			"href",
			"/repos/facebook/react",
		);
	});

	test("unknown and malformed repository paths return 404", async ({ page }) => {
		for (const path of ["/repos/unknown/missing", "/repos/bad%20owner/repo"]) {
			const response = await page.goto(path);
			expect(response?.status()).toBe(404);
			await expect(page.getByRole("heading", { level: 1 })).toHaveText("404 — Page Not Found");
		}
	});

	test("repository histories are included in sitemap discovery", async ({ request }) => {
		const response = await request.get("/sitemap.xml");
		expect(response.status()).toBe(200);
		expect(await response.text()).toContain("https://repotrend.dev/repos/facebook/react");
	});

	test("history navigation works without JavaScript and fits a mobile viewport", async ({
		browser,
		baseURL,
	}) => {
		const context = await browser.newContext({
			javaScriptEnabled: false,
			viewport: { width: 375, height: 800 },
		});
		const page = await context.newPage();
		await page.goto(new URL("/repos/facebook/react", baseURL).href);
		expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
			375,
		);

		const historyLink = page.locator('.appearance-history tbody a[href="/trending/2026-02-15"]');
		await historyLink.click();
		await expect(page).toHaveURL(/\/trending\/2026-02-15$/);
		await context.close();
	});
});
