import { expect, test } from "@playwright/test";

test.describe("Homepage", () => {
	test("loads with correct page title", async ({ page }) => {
		await page.goto("/");
		await expect(page).toHaveTitle("RepoTrend — GitHub Trending Archive");
	});

	test("renders header with logo and tagline", async ({ page }) => {
		await page.goto("/");
		const header = page.locator("header");
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

	test("renders view toggle with Daily and Weekly options", async ({ page }) => {
		await page.goto("/");
		const viewToggle = page.locator(".view-toggle");
		await expect(viewToggle).toBeVisible();
		await expect(viewToggle.locator(".view-toggle-btn")).toHaveCount(2);
		await expect(viewToggle.locator(".view-toggle-btn").first()).toContainText("Daily");
		await expect(viewToggle.locator(".view-toggle-btn").last()).toContainText("Weekly");
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
		await expect(firstCard.locator(".repo-name a")).toHaveAttribute(
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

	test("renders language distribution chart", async ({ page }) => {
		await page.goto("/");
		const chart = page.locator(".language-chart");
		await expect(chart).toBeVisible();
	});

	test("renders calendar heatmap", async ({ page }) => {
		await page.goto("/");
		const heatmap = page.locator(".calendar-heatmap");
		await expect(heatmap).toBeVisible();
	});

	test("renders sort dropdown", async ({ page }) => {
		await page.goto("/");
		const sortDropdown = page.locator("#sort-select");
		await expect(sortDropdown).toBeVisible();
	});

	test("renders footer with attribution links", async ({ page }) => {
		await page.goto("/");
		const footer = page.locator("footer");
		await expect(footer).toBeVisible();
		await expect(footer).toContainText("Built with");
		await expect(footer).toContainText("GitHub");
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
