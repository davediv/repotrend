import { defineConfig, devices } from "@playwright/test";

const executablePath = process.env.PLAYWRIGHT_EXECUTABLE_PATH;

export default defineConfig({
	testDir: "./e2e",
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 2 : 0,
	workers: process.env.CI ? 1 : undefined,
	reporter: process.env.CI ? "github" : "list",
	use: {
		baseURL: "http://localhost:4321",
		trace: "on-first-retry",
		launchOptions: executablePath ? { executablePath } : undefined,
	},
	projects: [
		{
			name: "chromium",
			use: { ...devices["Desktop Chrome"] },
			testIgnore: /mobile-governance\.spec\.ts/,
		},
		{
			name: "mobile-chromium",
			use: { ...devices["Pixel 5"] },
			testMatch: /mobile-governance\.spec\.ts/,
		},
	],
	webServer: {
		command: "npm run db:seed && npm run dev",
		url: "http://localhost:4321",
		reuseExistingServer: !process.env.CI,
		timeout: 30_000,
	},
});
