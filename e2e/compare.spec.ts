import { expect, test } from "@playwright/test";

const comparisonUrl = "/compare?date1=2026-02-14&date2=2026-02-15";

test.describe("Compare", () => {
	test("prefills the latest two snapshots and uses a real GET form", async ({ page }) => {
		await page.goto("/compare");
		const form = page.locator("form.compare-form");
		await expect(form).toHaveAttribute("method", "get");
		await expect(form).toHaveAttribute("action", "/compare");

		const firstDate = await page.locator("#compare-date1").inputValue();
		const secondDate = await page.locator("#compare-date2").inputValue();
		expect(firstDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
		expect(secondDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
		expect(firstDate).not.toBe(secondDate);
		await expect(page.locator(".comparison-row").first()).toBeVisible();
	});

	test("renders one aligned diff with explicit statuses and deltas", async ({ page }) => {
		const response = await page.goto(comparisonUrl);
		expect(response?.headers()["cache-control"]).toContain("immutable");
		await expect(page.locator('.comparison-row[data-status="both"]')).toHaveCount(24);
		await expect(page.locator('.comparison-row[data-status="added"]')).toHaveCount(1);
		await expect(page.locator('.comparison-row[data-status="removed"]')).toHaveCount(1);
		await expect(page.locator(".comparison-status").first()).toHaveText("In both");
		await expect(page.locator(".comparison-deltas").first()).toContainText(/Rank|Moved/);

		const ids = await page
			.locator(".comparison-row h2[id]")
			.evaluateAll((elements) => elements.map((element) => element.id).filter(Boolean));
		expect(ids).toHaveLength(26);
		expect(new Set(ids).size).toBe(ids.length);
	});

	test("filters the aligned diff by added repositories", async ({ page }) => {
		await page.goto(`${comparisonUrl}&view=added`);
		await expect(page.locator(".comparison-row")).toHaveCount(1);
		const row = page.locator(".comparison-row");
		await expect(row.locator(".comparison-status")).toHaveText("Added");
		await expect(row.locator(".repo-owner")).toHaveText("openai");
		await expect(row.locator(".repo-name-text")).toHaveText("codex");
		await expect(page.getByRole("link", { name: /^Added 1$/ })).toHaveAttribute(
			"aria-current",
			"page",
		);
	});

	test("archive pages offer a contextual comparison entry point", async ({ page }) => {
		await page.goto("/trending/2026-02-15");
		const compareLink = page.getByRole("link", { name: "Compare this date" });
		await expect(compareLink).toHaveAttribute("href", "/compare?date2=2026-02-15");
		await compareLink.click();
		await expect(page).toHaveURL(/\/compare\?date2=2026-02-15/);
		await expect(page.locator("#compare-date1")).toHaveValue("2026-02-14");
		await expect(page.locator("#compare-date2")).toHaveValue("2026-02-15");
	});

	test("submits a comparison without JavaScript", async ({ browser, baseURL }) => {
		const context = await browser.newContext({ javaScriptEnabled: false });
		const page = await context.newPage();
		await page.goto(new URL("/compare", baseURL).href);
		await page.locator("#compare-date1").fill("2026-02-14");
		await page.locator("#compare-date2").fill("2026-02-15");
		await page.getByRole("button", { name: "Compare dates" }).click();
		await expect(page).toHaveURL(/date1=2026-02-14&date2=2026-02-15/);
		await expect(page.locator('.comparison-row[data-status="added"]')).toHaveCount(1);
		await context.close();
	});

	test("keeps every repository row available on mobile", async ({ page }) => {
		await page.setViewportSize({ width: 375, height: 812 });
		await page.goto(comparisonUrl);
		await expect(page.locator(".comparison-row")).toHaveCount(26);
		await expect(page.locator(".compare-mobile-toggle")).toHaveCount(0);
		const box = await page.locator(".comparison-row").first().boundingBox();
		expect(box?.width).toBeLessThanOrEqual(375);
	});
});
