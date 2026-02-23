import { type Page, expect, test } from "@playwright/test";

/** Clear stored theme preference and reload for a clean test state. */
async function resetTheme(page: Page): Promise<void> {
	await page.goto("/");
	await page.evaluate(() => localStorage.removeItem("repotrend-theme"));
	await page.reload();
}

test.describe("Dark Mode", () => {
	test("theme toggle button exists in header", async ({ page }) => {
		await page.goto("/");
		const toggleBtn = page.locator("#theme-toggle");
		await expect(toggleBtn).toBeVisible();
		await expect(toggleBtn).toHaveAttribute("aria-label", /mode/i);
	});

	test("clicking toggle enables dark mode", async ({ page }) => {
		await resetTheme(page);

		const html = page.locator("html");
		const toggleBtn = page.locator("#theme-toggle");

		const hadDarkBefore = await html.evaluate((el) => el.classList.contains("dark"));
		await toggleBtn.click();

		const hasDarkAfter = await html.evaluate((el) => el.classList.contains("dark"));
		expect(hasDarkAfter).toBe(!hadDarkBefore);
	});

	test("dark mode persists in localStorage", async ({ page }) => {
		await resetTheme(page);

		const toggleBtn = page.locator("#theme-toggle");
		await toggleBtn.click();

		const storedTheme = await page.evaluate(() => localStorage.getItem("repotrend-theme"));
		expect(storedTheme).toBeTruthy();
		expect(["dark", "light"]).toContain(storedTheme);
	});

	test("dark mode persists after page reload", async ({ page }) => {
		await page.goto("/");
		await page.evaluate(() => localStorage.setItem("repotrend-theme", "dark"));
		await page.reload();

		const html = page.locator("html");
		await expect(html).toHaveClass(/dark/);
	});

	test("light mode persists after page reload", async ({ page }) => {
		await page.goto("/");
		await page.evaluate(() => localStorage.setItem("repotrend-theme", "light"));
		await page.reload();

		const html = page.locator("html");
		const hasDark = await html.evaluate((el) => el.classList.contains("dark"));
		expect(hasDark).toBe(false);
	});

	test("toggling twice returns to original state", async ({ page }) => {
		await resetTheme(page);

		const html = page.locator("html");
		const toggleBtn = page.locator("#theme-toggle");

		const initialDark = await html.evaluate((el) => el.classList.contains("dark"));
		await toggleBtn.click();
		await toggleBtn.click();
		const finalDark = await html.evaluate((el) => el.classList.contains("dark"));

		expect(finalDark).toBe(initialDark);
	});

	test("dark mode toggle updates aria-label", async ({ page }) => {
		await page.goto("/");
		await page.evaluate(() => localStorage.setItem("repotrend-theme", "light"));
		await page.reload();

		const toggleBtn = page.locator("#theme-toggle");
		const labelBefore = await toggleBtn.getAttribute("aria-label");

		await toggleBtn.click();
		const labelAfter = await toggleBtn.getAttribute("aria-label");

		expect(labelBefore).not.toBe(labelAfter);
	});

	test("dark mode applies to repo cards", async ({ page }) => {
		await page.goto("/");
		await page.evaluate(() => localStorage.setItem("repotrend-theme", "dark"));
		await page.reload();

		const card = page.locator(".repo-card").first();
		await expect(card).toBeVisible();

		const bgColor = await card.evaluate((el) => getComputedStyle(el).backgroundColor);
		const match = bgColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
		expect(match).not.toBeNull();
		const [, r, g, b] = match!.map(Number);
		expect(r).toBeLessThan(100);
		expect(g).toBeLessThan(100);
		expect(b).toBeLessThan(100);
	});
});
