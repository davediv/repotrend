import { expect, test } from "@playwright/test";

async function expectTracked(events: Array<Record<string, unknown>>, name: string): Promise<void> {
	await expect.poll(() => events.some((event) => event.event === name)).toBe(true);
}

test.describe("Data trust and governance", () => {
	test("footer leads to a complete data-methodology page", async ({ page }) => {
		await page.goto("/");
		const aboutLink = page.getByRole("link", { name: "About the data" });
		await expect(aboutLink).toHaveAttribute("href", "/about");
		await aboutLink.click();

		await expect(page).toHaveTitle("About the Data — RepoTrend");
		for (const heading of [
			"Source and scope",
			"Capture schedule and timezone",
			"Ranking and rollups",
			"What the metrics mean",
			"Completeness and known limits",
			"Product measurement and privacy",
		]) {
			await expect(page.getByRole("heading", { name: heading })).toBeVisible();
		}
		await expect(page.getByText("06:00 UTC")).toBeVisible();
		await expect(page.getByText(/do not include search terms/)).toBeVisible();
	});

	test("primary navigation is operable in keyboard order", async ({ page }) => {
		await page.goto("/");
		await page.keyboard.press("Tab");
		await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
		await page.keyboard.press("Tab");
		await expect(page.locator(".logo")).toBeFocused();
		await page.keyboard.press("Tab");
		await expect(page.getByRole("link", { name: "Today" })).toBeFocused();
		await page.keyboard.press("Tab");
		await expect(page.getByRole("link", { name: "Archive", exact: true })).toBeFocused();
		await page.keyboard.press("Enter");
		await expect(page).toHaveURL(/\/trending$/);
	});

	test("trust and retry links work without JavaScript", async ({ browser, baseURL }) => {
		const context = await browser.newContext({ javaScriptEnabled: false });
		const page = await context.newPage();
		await page.goto(new URL("/route-that-does-not-exist", baseURL).href);
		const recovery = page.getByRole("link", { name: "View latest snapshot" });
		await expect(recovery).toHaveAttribute("href", "/");

		await page.goto(new URL("/", baseURL).href);
		await page.getByRole("link", { name: "About the data" }).click();
		await expect(page.getByRole("heading", { level: 1, name: "About the data" })).toBeVisible();
		await context.close();
	});

	test("emits the five allowlisted journey signals without query content", async ({ page }) => {
		const events: Array<Record<string, unknown>> = [];
		await page.route("**/api/events", async (route) => {
			const body = route.request().postData();
			if (body) events.push(JSON.parse(body) as Record<string, unknown>);
			await route.fulfill({ status: 204 });
		});

		await page.goto("/compare?date1=2026-02-14&date2=2026-02-15");
		await expectTracked(events, "comparison_complete");

		await page.goto("/trending/2026-02-08");
		await expectTracked(events, "empty_state_view");

		await page.goto("/trending/2026-02-15");
		await page.getByRole("link", { name: "Previous available date" }).click();
		await expectTracked(events, "archive_date_change");

		await page.goto("/");
		await page
			.getByRole("search", { name: "Search trending repos" })
			.getByRole("searchbox")
			.fill("react");
		await page
			.getByRole("search", { name: "Search trending repos" })
			.getByRole("searchbox")
			.press("Enter");
		await expectTracked(events, "search_submit");

		await page.goto("/repos/facebook/react");
		const github = page.getByRole("link", { name: /Open on GitHub/ });
		await github.evaluate((element) => {
			element.addEventListener("click", (event) => event.preventDefault(), {
				capture: true,
				once: true,
			});
			(element as HTMLElement).click();
		});
		await expectTracked(events, "outbound_github_click");
		const searchEvent = events.find((event) => event.event === "search_submit");
		expect(searchEvent).toEqual({
			event: "search_submit",
			surface: "header",
			path: "/",
		});

		for (const event of events) {
			expect(Object.keys(event).sort()).toEqual(["event", "path", "surface"]);
			expect(String(event.path)).not.toContain("?");
		}
	});
});
