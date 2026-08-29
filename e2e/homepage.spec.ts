import { expect, test } from "@playwright/test";

test.describe("Homepage", () => {
	test("loads with correct page title", async ({ page }) => {
		await page.goto("/");
		await expect(page).toHaveTitle("GitHub Trending Today — RepoTrend");
	});

	test("renders header with logo and tagline", async ({ page }) => {
		await page.goto("/");
		const header = page.getByRole("banner");
		await expect(header).toBeVisible();
		await expect(header.locator(".logo")).toContainText("RepoTrend");
		await expect(header).toContainText("GitHub Trending Archive");
	});

	test("renders skip-to-content link for accessibility", async ({ page }) => {
		await page.goto("/");
		const skipLink = page.locator("a.skip-link");
		await expect(skipLink).toBeAttached();
		await expect(skipLink).toHaveAttribute("href", "#main-content");
	});

	test("renders date picker with navigation buttons", async ({ page }) => {
		await page.goto("/");
		const datePicker = page.locator(".date-picker");
		await expect(datePicker).toBeVisible();
		await expect(page.locator('.date-nav-btn[data-action="prev"]')).toBeVisible();
		await expect(page.locator('.date-nav-btn[data-action="next"]')).toBeVisible();
		await expect(page.locator(".date-display")).toBeVisible();
	});

	test("identifies today's latest available snapshot", async ({ page }) => {
		await page.goto("/");
		await expect(page.getByRole("heading", { level: 1, name: "Trending today" })).toBeVisible();
		const heading = page.locator(".snapshot-heading");
		await expect(heading).toContainText("Daily GitHub snapshot");
		await expect(heading).toContainText(/Captured at .*UTC/);
		await expect(heading.getByRole("status")).toHaveCount(0);
		await expect(page.locator(".view-toggle")).toHaveCount(0);
	});

	test("renders 25 repository cards", async ({ page }) => {
		await page.goto("/");
		const cards = page.locator(".repo-card");
		await expect(cards).toHaveCount(25);
	});

	test("repo cards show rank, name, and stars", async ({ page }) => {
		await page.goto("/");
		const firstCard = page.locator(".repo-card").first();
		await expect(firstCard.locator(".repo-rank")).toBeVisible();
		await expect(firstCard.locator(".repo-name")).toBeVisible();
		await expect(firstCard.locator(".repo-name a")).toHaveAttribute("href", /^\/repos\//);
		await expect(firstCard.locator(".repo-github-link")).toHaveAttribute(
			"href",
			/^https:\/\/github\.com\//,
		);
		await expect(firstCard.locator(".repo-meta")).toBeVisible();
	});

	test("repo cards display language with color dot", async ({ page }) => {
		await page.goto("/");
		const cardWithLanguage = page.locator(".repo-card .language-dot").first();
		await expect(cardWithLanguage).toBeVisible();
	});

	test("keeps GitHub's daily order and shows each repository once", async ({ page }) => {
		await page.goto("/");
		const owners = await page.locator(".repo-owner").allTextContents();
		const repoNames = await page.locator(".repo-name-text").allTextContents();
		const names = owners.map((owner, index) => `${owner}/${repoNames[index]}`);

		expect(names.slice(0, 3)).toEqual(["vercel/next.js", "facebook/react", "microsoft/vscode"]);
		expect(new Set(names).size).toBe(names.length);
	});

	test("does not show streak, history, weekly-frequency, or custom-sort UI", async ({ page }) => {
		await page.goto("/");
		await expect(page.locator(".streak-badge")).toHaveCount(0);
		await expect(page.locator(".new-entry-badge")).toHaveCount(0);
		await expect(page.locator(".sparkline")).toHaveCount(0);
		await expect(page.locator(".appearances-badge")).toHaveCount(0);
		await expect(page.locator("#sort-select")).toHaveCount(0);
	});

	test("renders language distribution chart", async ({ page }) => {
		await page.goto("/");
		const chart = page.locator(".language-chart");
		await expect(chart).toBeVisible();
	});

	test("puts repository results before secondary insights", async ({ page }) => {
		await page.goto("/");
		await expect(page.locator("#results ~ .archive-insights")).toBeVisible();
		await expect(page.getByRole("heading", { level: 2, name: "Insights" })).toBeVisible();
	});

	test("uses the same archive composition as dated snapshots", async ({ page }) => {
		await page.goto("/");
		await expect(page.locator(".daily-archive-page")).toHaveAttribute("data-context", "latest");
		await expect(page.locator(".calendar-heatmap")).toBeVisible();
	});

	test("renders footer with data-trust and source links", async ({ page }) => {
		await page.goto("/");
		const footer = page.locator("footer");
		await expect(footer).toBeVisible();
		await expect(footer.getByRole("link", { name: "About the data" })).toHaveAttribute(
			"href",
			"/about",
		);
		await expect(footer.getByRole("link", { name: /RepoTrend source on GitHub/ })).toHaveAttribute(
			"href",
			"https://github.com/div-vik/repotrend",
		);
	});

	test("uses semantic HTML landmarks", async ({ page }) => {
		await page.goto("/");
		await expect(page.locator("header")).toBeAttached();
		await expect(page.locator("main")).toBeAttached();
		await expect(page.locator("footer")).toBeAttached();
	});

	test("has no console errors", async ({ page }) => {
		const errors: string[] = [];
		page.on("console", (msg) => {
			if (msg.type() === "error") errors.push(msg.text());
		});
		await page.goto("/");
		await page.waitForLoadState("load");
		// Wait for SSR content to be fully rendered
		await page.locator(".repo-card").first().waitFor();
		expect(errors).toHaveLength(0);
	});
});
