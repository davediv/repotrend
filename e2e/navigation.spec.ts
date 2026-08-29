import { expect, test } from "@playwright/test";

test.describe("Global navigation", () => {
	test("exposes the primary product areas separately from search", async ({ page }) => {
		await page.goto("/");
		const navigation = page.getByRole("navigation", { name: "Primary" });

		await expect(navigation.getByRole("link", { name: "Today" })).toHaveAttribute("href", "/");
		await expect(navigation.getByRole("link", { name: "Archive" })).toHaveAttribute(
			"href",
			"/trending",
		);
		await expect(navigation.getByRole("link", { name: "Compare" })).toHaveAttribute(
			"href",
			"/compare",
		);
		await expect(navigation.getByRole("search")).toHaveCount(0);
		await expect(page.getByRole("search", { name: "Search trending repos" })).toBeVisible();
	});

	test("marks the active product area", async ({ page }) => {
		const cases = [
			{ path: "/", active: "Today" },
			{ path: "/trending", active: "Archive" },
			{ path: "/trending/2026-02-15", active: "Archive" },
			{ path: "/compare", active: "Compare" },
		];

		for (const { path, active } of cases) {
			await page.goto(path);
			const navigation = page.getByRole("navigation", { name: "Primary" });
			await expect(navigation.getByRole("link", { name: active })).toHaveAttribute(
				"aria-current",
				"page",
			);
			await expect(navigation.locator('[aria-current="page"]')).toHaveCount(1);
		}
	});

	test("archive hub exposes daily and weekly entry points", async ({ page }) => {
		await page.goto("/trending");

		await expect(page.getByRole("heading", { level: 1, name: "Archive" })).toBeVisible();
		await expect(page.getByRole("link", { name: /Latest daily snapshot/ })).toHaveAttribute(
			"href",
			/^\/trending\/\d{4}-\d{2}-\d{2}$/,
		);
		await expect(page.getByRole("link", { name: /Weekly rollups/ })).toHaveAttribute(
			"href",
			/^\/trending\/week\/\d{4}-\d{2}-\d{2}$/,
		);
		await expect(page.locator(".snapshot-list a").first()).toBeVisible();
	});

	test("keeps all primary destinations usable on mobile", async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 844 });
		await page.goto("/");
		const links = page.getByRole("navigation", { name: "Primary" }).getByRole("link");

		await expect(links).toHaveCount(3);
		for (const link of await links.all()) {
			await expect(link).toBeVisible();
			const box = await link.boundingBox();
			expect(box?.height).toBeGreaterThanOrEqual(44);
		}
	});
});
