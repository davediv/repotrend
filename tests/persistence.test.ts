import { describe, expect, it } from "vitest";
import { persistRepos } from "../src/lib/scraper/persistence";
import type { ParsedRepo } from "../src/lib/scraper/parser";
import {
	UNKNOWN_LANGUAGE_COLOR,
	calculateStreaks,
	detectNewEntries,
	fetchStarHistory,
	getDateRepoCounts,
	getLanguageDistribution,
	getTrendingRepos,
	getWeeklyLanguageDistribution,
	getWeeklyTrendingRepos,
	type TrendingRepo,
} from "../src/lib/trending";

// ── Constants ─────────────────────────────────────────────────────────

const TEST_DATE = "2026-02-15";
const WEEK_START = "2026-02-10";
const WEEK_END = "2026-02-16";

// ── Test helpers ──────────────────────────────────────────────────────

function sampleParsedRepo(overrides: Partial<ParsedRepo> = {}): ParsedRepo {
	return {
		repo_owner: "facebook",
		repo_name: "react",
		description: "A JavaScript library for building user interfaces",
		language: "JavaScript",
		language_color: "#f1e05a",
		total_stars: 200000,
		forks: 40000,
		stars_today: 500,
		...overrides,
	};
}

function sampleTrendingRepo(overrides: Partial<TrendingRepo> = {}): TrendingRepo {
	return { ...sampleParsedRepo(), ...overrides };
}

/**
 * Create a mock D1Database that records calls and returns configured responses.
 *
 * - `queryResults` controls what `.prepare().bind().all()` resolves to.
 * - `batchResults` controls what `.batch()` resolves to (one entry per statement).
 * - `batchError` makes `.batch()` reject with the given error.
 */
function mockDB(
	config: {
		queryResults?: any[];
		batchResults?: Array<{ success: boolean; meta: { changes?: number } }>;
		batchError?: Error;
	} = {},
) {
	const calls = {
		prepare: [] as string[],
		bind: [] as any[][],
		batchCount: 0,
	};

	const createStatement = () => {
		const stmt: any = {
			bind(...args: any[]) {
				calls.bind.push(args);
				return stmt;
			},
			async all() {
				return { results: config.queryResults ?? [], success: true, meta: {} };
			},
		};
		return stmt;
	};

	const db = {
		prepare(sql: string) {
			calls.prepare.push(sql);
			return createStatement();
		},
		async batch(stmts: any[]) {
			calls.batchCount++;
			if (config.batchError) throw config.batchError;
			return config.batchResults ?? stmts.map(() => ({ success: true, meta: { changes: 1 } }));
		},
	} as unknown as D1Database;

	return { db, calls };
}

// ── persistRepos ──────────────────────────────────────────────────────

describe("persistRepos", () => {
	describe("empty input", () => {
		it("returns 0 for empty repo list without calling batch", async () => {
			const { db, calls } = mockDB();
			const count = await persistRepos(db, [], TEST_DATE);
			expect(count).toBe(0);
			expect(calls.batchCount).toBe(0);
		});
	});

	describe("SQL and parameter binding", () => {
		it("prepares one statement per repo", async () => {
			const repos = [
				sampleParsedRepo({ repo_owner: "a", repo_name: "b" }),
				sampleParsedRepo({ repo_owner: "c", repo_name: "d" }),
				sampleParsedRepo({ repo_owner: "e", repo_name: "f" }),
			];
			const { db, calls } = mockDB();
			await persistRepos(db, repos, TEST_DATE);
			expect(calls.prepare).toHaveLength(3);
		});

		it("uses INSERT OR REPLACE SQL for deduplication", async () => {
			const { db, calls } = mockDB();
			await persistRepos(db, [sampleParsedRepo()], TEST_DATE);
			expect(calls.prepare[0]).toContain("INSERT OR REPLACE");
		});

		it("binds correct parameters including date and scraped_at", async () => {
			const repo = sampleParsedRepo({
				repo_owner: "torvalds",
				repo_name: "linux",
				description: "Linux kernel",
				language: "C",
				language_color: "#555555",
				total_stars: 180000,
				forks: 55000,
				stars_today: 300,
			});
			const { db, calls } = mockDB();
			await persistRepos(db, [repo], TEST_DATE);

			expect(calls.bind).toHaveLength(1);
			const [owner, name, desc, lang, color, stars, forks, starsToday, date, scrapedAt] =
				calls.bind[0];
			expect(owner).toBe("torvalds");
			expect(name).toBe("linux");
			expect(desc).toBe("Linux kernel");
			expect(lang).toBe("C");
			expect(color).toBe("#555555");
			expect(stars).toBe(180000);
			expect(forks).toBe(55000);
			expect(starsToday).toBe(300);
			expect(date).toBe(TEST_DATE);
			expect(scrapedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
		});

		it("handles null optional fields (description, language, language_color)", async () => {
			const repo = sampleParsedRepo({
				description: null,
				language: null,
				language_color: null,
			});
			const { db, calls } = mockDB();
			await persistRepos(db, [repo], TEST_DATE);

			const [, , desc, lang, color] = calls.bind[0];
			expect(desc).toBeNull();
			expect(lang).toBeNull();
			expect(color).toBeNull();
		});
	});

	describe("batch result counting", () => {
		it("inserts repos and returns correct row count", async () => {
			const repos = [
				sampleParsedRepo(),
				sampleParsedRepo({ repo_owner: "microsoft", repo_name: "typescript" }),
			];
			const { db } = mockDB({
				batchResults: [
					{ success: true, meta: { changes: 1 } },
					{ success: true, meta: { changes: 1 } },
				],
			});
			const count = await persistRepos(db, repos, TEST_DATE);
			expect(count).toBe(2);
		});

		it("sums changes from batch results", async () => {
			const repos = [
				sampleParsedRepo({ repo_owner: "a", repo_name: "b" }),
				sampleParsedRepo({ repo_owner: "c", repo_name: "d" }),
			];
			const { db } = mockDB({
				batchResults: [
					{ success: true, meta: { changes: 1 } },
					{ success: true, meta: { changes: 0 } },
				],
			});
			const count = await persistRepos(db, repos, TEST_DATE);
			expect(count).toBe(1);
		});

		it("does not count changes from failed batch results", async () => {
			const repos = [
				sampleParsedRepo({ repo_owner: "a", repo_name: "b" }),
				sampleParsedRepo({ repo_owner: "c", repo_name: "d" }),
			];
			const { db } = mockDB({
				batchResults: [
					{ success: true, meta: { changes: 1 } },
					{ success: false, meta: { changes: 0 } },
				],
			});
			const count = await persistRepos(db, repos, TEST_DATE);
			expect(count).toBe(1);
		});

		it("treats undefined meta.changes as 0", async () => {
			const { db } = mockDB({
				batchResults: [{ success: true, meta: {} }],
			});
			const count = await persistRepos(db, [sampleParsedRepo()], TEST_DATE);
			expect(count).toBe(0);
		});
	});

	describe("error handling", () => {
		it("wraps D1 batch errors with descriptive message", async () => {
			const { db } = mockDB({ batchError: new Error("D1 connection lost") });
			await expect(persistRepos(db, [sampleParsedRepo()], TEST_DATE)).rejects.toThrow(
				"D1 persistence failed: D1 connection lost",
			);
		});

		it("wraps non-Error thrown values", async () => {
			const { db } = mockDB();
			(db as any).batch = async () => {
				throw "unknown failure";
			};
			await expect(persistRepos(db, [sampleParsedRepo()], TEST_DATE)).rejects.toThrow(
				"D1 persistence failed: unknown failure",
			);
		});
	});
});

// ── getTrendingRepos ──────────────────────────────────────────────────

describe("getTrendingRepos", () => {
	it("returns repos for a given date", async () => {
		const { db } = mockDB({
			queryResults: [
				sampleTrendingRepo({ stars_today: 500 }),
				sampleTrendingRepo({
					repo_owner: "microsoft",
					repo_name: "typescript",
					stars_today: 300,
				}),
			],
		});
		const repos = await getTrendingRepos(db, TEST_DATE);
		expect(repos).toHaveLength(2);
		expect(repos[0].repo_owner).toBe("facebook");
		expect(repos[1].repo_name).toBe("typescript");
	});

	it("returns empty array when no data exists", async () => {
		const { db } = mockDB({ queryResults: [] });
		const repos = await getTrendingRepos(db, "2026-01-01");
		expect(repos).toEqual([]);
	});

	it("binds the date parameter", async () => {
		const { db, calls } = mockDB();
		await getTrendingRepos(db, TEST_DATE);
		expect(calls.bind).toHaveLength(1);
		expect(calls.bind[0]).toEqual([TEST_DATE]);
	});

	it("uses SELECT with ORDER BY stars_today DESC", async () => {
		const { db, calls } = mockDB();
		await getTrendingRepos(db, TEST_DATE);
		expect(calls.prepare[0]).toContain("ORDER BY stars_today DESC");
	});
});

// ── calculateStreaks ──────────────────────────────────────────────────

describe("calculateStreaks", () => {
	it("calculates consecutive-day streak", async () => {
		const repos = [sampleTrendingRepo()];
		const { db } = mockDB({
			queryResults: [
				{ repo_owner: "facebook", repo_name: "react", trending_date: "2026-02-15" },
				{ repo_owner: "facebook", repo_name: "react", trending_date: "2026-02-14" },
				{ repo_owner: "facebook", repo_name: "react", trending_date: "2026-02-13" },
			],
		});
		await calculateStreaks(db, TEST_DATE, repos);
		expect(repos[0].streak).toBe(3);
	});

	it("returns streak = 1 for single-day appearance", async () => {
		const repos = [sampleTrendingRepo()];
		const { db } = mockDB({
			queryResults: [{ repo_owner: "facebook", repo_name: "react", trending_date: TEST_DATE }],
		});
		await calculateStreaks(db, TEST_DATE, repos);
		expect(repos[0].streak).toBe(1);
	});

	it("breaks streak at gap in dates", async () => {
		const repos = [sampleTrendingRepo()];
		const { db } = mockDB({
			queryResults: [
				{ repo_owner: "facebook", repo_name: "react", trending_date: "2026-02-15" },
				{ repo_owner: "facebook", repo_name: "react", trending_date: "2026-02-14" },
				{ repo_owner: "facebook", repo_name: "react", trending_date: "2026-02-12" },
			],
		});
		await calculateStreaks(db, TEST_DATE, repos);
		expect(repos[0].streak).toBe(2);
	});

	it("does not query for empty repos array", async () => {
		const { db, calls } = mockDB();
		await calculateStreaks(db, TEST_DATE, []);
		expect(calls.prepare).toHaveLength(0);
	});

	it("defaults to streak = 1 when no history rows returned for a repo", async () => {
		const repos = [sampleTrendingRepo()];
		const { db } = mockDB({ queryResults: [] });
		await calculateStreaks(db, TEST_DATE, repos);
		expect(repos[0].streak).toBe(1);
	});

	it("calculates streaks for multiple repos independently", async () => {
		const repos = [
			sampleTrendingRepo({ repo_owner: "a", repo_name: "x" }),
			sampleTrendingRepo({ repo_owner: "b", repo_name: "y" }),
		];
		const { db } = mockDB({
			queryResults: [
				{ repo_owner: "a", repo_name: "x", trending_date: "2026-02-15" },
				{ repo_owner: "a", repo_name: "x", trending_date: "2026-02-14" },
				{ repo_owner: "a", repo_name: "x", trending_date: "2026-02-13" },
				{ repo_owner: "b", repo_name: "y", trending_date: TEST_DATE },
			],
		});
		await calculateStreaks(db, TEST_DATE, repos);
		expect(repos[0].streak).toBe(3);
		expect(repos[1].streak).toBe(1);
	});

	it("handles long consecutive streaks", async () => {
		const repos = [sampleTrendingRepo()];
		const dates = Array.from({ length: 10 }, (_, i) => {
			const d = new Date(`${TEST_DATE}T00:00:00Z`);
			d.setUTCDate(d.getUTCDate() - i);
			return {
				repo_owner: "facebook",
				repo_name: "react",
				trending_date: d.toISOString().slice(0, 10),
			};
		});
		const { db } = mockDB({ queryResults: dates });
		await calculateStreaks(db, TEST_DATE, repos);
		expect(repos[0].streak).toBe(10);
	});

	it("binds date twice and lookback date", async () => {
		const { db, calls } = mockDB();
		await calculateStreaks(db, TEST_DATE, [sampleTrendingRepo()]);
		expect(calls.bind).toHaveLength(1);
		expect(calls.bind[0][0]).toBe(TEST_DATE);
		expect(calls.bind[0][1]).toBe(TEST_DATE);
		expect(calls.bind[0][2]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
	});
});

// ── detectNewEntries ──────────────────────────────────────────────────

describe("detectNewEntries", () => {
	it("flags repos with no prior appearances as new entries", async () => {
		const repos = [sampleTrendingRepo({ repo_owner: "new", repo_name: "project" })];
		const { db } = mockDB({
			queryResults: [{ repo_owner: "new", repo_name: "project" }],
		});
		await detectNewEntries(db, TEST_DATE, repos);
		expect(repos[0].is_new_entry).toBe(true);
	});

	it("marks repos with prior appearances as not new", async () => {
		const repos = [sampleTrendingRepo()];
		const { db } = mockDB({ queryResults: [] });
		await detectNewEntries(db, TEST_DATE, repos);
		expect(repos[0].is_new_entry).toBe(false);
	});

	it("handles mixed new and existing repos", async () => {
		const repos = [
			sampleTrendingRepo({ repo_owner: "old", repo_name: "repo" }),
			sampleTrendingRepo({ repo_owner: "brand", repo_name: "new" }),
		];
		const { db } = mockDB({
			queryResults: [{ repo_owner: "brand", repo_name: "new" }],
		});
		await detectNewEntries(db, TEST_DATE, repos);
		expect(repos[0].is_new_entry).toBe(false);
		expect(repos[1].is_new_entry).toBe(true);
	});

	it("does not query for empty repos array", async () => {
		const { db, calls } = mockDB();
		await detectNewEntries(db, TEST_DATE, []);
		expect(calls.prepare).toHaveLength(0);
	});

	it("binds date parameter twice", async () => {
		const { db, calls } = mockDB();
		await detectNewEntries(db, TEST_DATE, [sampleTrendingRepo()]);
		expect(calls.bind).toHaveLength(1);
		expect(calls.bind[0]).toEqual([TEST_DATE, TEST_DATE]);
	});
});

// ── fetchStarHistory ──────────────────────────────────────────────────

describe("fetchStarHistory", () => {
	it("attaches history for repos with 2+ data points", async () => {
		const repos = [sampleTrendingRepo()];
		const { db } = mockDB({
			queryResults: [
				{ repo_owner: "facebook", repo_name: "react", date: "2026-02-14", stars_today: 400 },
				{ repo_owner: "facebook", repo_name: "react", date: TEST_DATE, stars_today: 500 },
			],
		});
		await fetchStarHistory(db, TEST_DATE, repos);
		expect(repos[0].star_history).toEqual([
			{ date: "2026-02-14", stars_today: 400 },
			{ date: TEST_DATE, stars_today: 500 },
		]);
	});

	it("does not attach history for repos with only 1 data point", async () => {
		const repos = [sampleTrendingRepo()];
		const { db } = mockDB({
			queryResults: [
				{ repo_owner: "facebook", repo_name: "react", date: TEST_DATE, stars_today: 500 },
			],
		});
		await fetchStarHistory(db, TEST_DATE, repos);
		expect(repos[0].star_history).toBeUndefined();
	});

	it("does not query for empty repos array", async () => {
		const { db, calls } = mockDB();
		await fetchStarHistory(db, TEST_DATE, []);
		expect(calls.prepare).toHaveLength(0);
	});

	it("handles multiple repos with different history lengths", async () => {
		const repos = [
			sampleTrendingRepo({ repo_owner: "a", repo_name: "x" }),
			sampleTrendingRepo({ repo_owner: "b", repo_name: "y" }),
		];
		const { db } = mockDB({
			queryResults: [
				{ repo_owner: "a", repo_name: "x", date: "2026-02-13", stars_today: 100 },
				{ repo_owner: "a", repo_name: "x", date: "2026-02-14", stars_today: 200 },
				{ repo_owner: "a", repo_name: "x", date: TEST_DATE, stars_today: 300 },
				{ repo_owner: "b", repo_name: "y", date: TEST_DATE, stars_today: 50 },
			],
		});
		await fetchStarHistory(db, TEST_DATE, repos);
		expect(repos[0].star_history).toHaveLength(3);
		expect(repos[1].star_history).toBeUndefined();
	});

	it("binds date and lookback date", async () => {
		const { db, calls } = mockDB();
		await fetchStarHistory(db, TEST_DATE, [sampleTrendingRepo()]);
		expect(calls.bind).toHaveLength(1);
		expect(calls.bind[0][0]).toBe(TEST_DATE);
		expect(calls.bind[0][1]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
	});
});

// ── getWeeklyTrendingRepos ────────────────────────────────────────────

describe("getWeeklyTrendingRepos", () => {
	it("returns aggregated weekly data with daysWithData", async () => {
		const { db } = mockDB({
			queryResults: [
				{
					repo_owner: "facebook",
					repo_name: "react",
					description: "React",
					language: "JavaScript",
					language_color: "#f1e05a",
					total_stars: 200000,
					forks: 40000,
					appearances: 5,
					total_stars_gained: 2500,
					max_stars_today: 700,
					days_in_week: 5,
				},
			],
		});
		const result = await getWeeklyTrendingRepos(db, WEEK_START, WEEK_END);
		expect(result.daysWithData).toBe(5);
		expect(result.repos).toHaveLength(1);
		expect(result.repos[0].appearances).toBe(5);
		expect(result.repos[0].total_stars_gained).toBe(2500);
		expect(result.repos[0].max_stars_today).toBe(700);
	});

	it("strips days_in_week from repo objects", async () => {
		const { db } = mockDB({
			queryResults: [
				{
					repo_owner: "a",
					repo_name: "b",
					description: null,
					language: null,
					language_color: null,
					total_stars: 100,
					forks: 10,
					appearances: 1,
					total_stars_gained: 50,
					max_stars_today: 50,
					days_in_week: 3,
				},
			],
		});
		const result = await getWeeklyTrendingRepos(db, WEEK_START, WEEK_END);
		expect((result.repos[0] as any).days_in_week).toBeUndefined();
	});

	it("returns 0 daysWithData and empty repos when no data", async () => {
		const { db } = mockDB({ queryResults: [] });
		const result = await getWeeklyTrendingRepos(db, "2026-01-01", "2026-01-07");
		expect(result.daysWithData).toBe(0);
		expect(result.repos).toEqual([]);
	});
});

// ── getLanguageDistribution ───────────────────────────────────────────

describe("getLanguageDistribution", () => {
	it("returns language distribution with percentages summing to 100", async () => {
		const { db } = mockDB({
			queryResults: [
				{ language: "JavaScript", color: "#f1e05a", count: 10 },
				{ language: "Python", color: "#3572A5", count: 8 },
				{ language: "Rust", color: "#dea584", count: 7 },
			],
		});
		const dist = await getLanguageDistribution(db, TEST_DATE);
		expect(dist).toHaveLength(3);

		const totalPct = dist.reduce((sum, d) => sum + d.percentage, 0);
		expect(totalPct).toBe(100);

		expect(dist[0].language).toBe("JavaScript");
		expect(dist[0].count).toBe(10);
	});

	it("applies largest-remainder rounding so percentages sum to exactly 100", async () => {
		const { db } = mockDB({
			queryResults: [
				{ language: "Go", color: "#00ADD8", count: 1 },
				{ language: "Rust", color: "#dea584", count: 1 },
				{ language: "Zig", color: "#ec915c", count: 1 },
			],
		});
		const dist = await getLanguageDistribution(db, TEST_DATE);
		// Integer tenths (percentage * 10) must sum to exactly 1000
		const totalTenths = dist.reduce((sum, d) => sum + Math.round(d.percentage * 10), 0);
		expect(totalTenths).toBe(1000);
		// One entry gets the extra tenth: 33.4 vs 33.3
		const pcts = dist.map((d) => d.percentage).sort((a, b) => b - a);
		expect(pcts[0]).toBeCloseTo(33.4, 1);
		expect(pcts[1]).toBeCloseTo(33.3, 1);
	});

	it("returns empty array when no data", async () => {
		const { db } = mockDB({ queryResults: [] });
		const dist = await getLanguageDistribution(db, "2026-01-01");
		expect(dist).toEqual([]);
	});

	it("preserves color values from query results", async () => {
		const { db } = mockDB({
			queryResults: [{ language: "Go", color: "#00ADD8", count: 5 }],
		});
		const dist = await getLanguageDistribution(db, TEST_DATE);
		expect(dist[0].color).toBe("#00ADD8");
	});

	it("binds UNKNOWN_LANGUAGE_COLOR and date", async () => {
		const { db, calls } = mockDB();
		await getLanguageDistribution(db, TEST_DATE);
		expect(calls.bind).toHaveLength(1);
		expect(calls.bind[0]).toEqual([UNKNOWN_LANGUAGE_COLOR, TEST_DATE]);
	});
});

// ── getWeeklyLanguageDistribution ─────────────────────────────────────

describe("getWeeklyLanguageDistribution", () => {
	it("returns distribution for a week range", async () => {
		const { db } = mockDB({
			queryResults: [
				{ language: "TypeScript", color: "#3178c6", count: 12 },
				{ language: "Python", color: "#3572A5", count: 8 },
			],
		});
		const dist = await getWeeklyLanguageDistribution(db, WEEK_START, WEEK_END);
		expect(dist).toHaveLength(2);
		expect(dist[0].language).toBe("TypeScript");
	});

	it("binds UNKNOWN_LANGUAGE_COLOR, weekStart, and weekEnd", async () => {
		const { db, calls } = mockDB();
		await getWeeklyLanguageDistribution(db, WEEK_START, WEEK_END);
		expect(calls.bind).toHaveLength(1);
		expect(calls.bind[0][0]).toBe(UNKNOWN_LANGUAGE_COLOR);
		expect(calls.bind[0][1]).toBe(WEEK_START);
		expect(calls.bind[0][2]).toBe(WEEK_END);
	});
});

// ── getDateRepoCounts ─────────────────────────────────────────────────

describe("getDateRepoCounts", () => {
	it("returns date-count pairs", async () => {
		const { db } = mockDB({
			queryResults: [
				{ date: "2026-02-13", count: 25 },
				{ date: "2026-02-14", count: 25 },
				{ date: TEST_DATE, count: 20 },
			],
		});
		const counts = await getDateRepoCounts(db);
		expect(counts).toHaveLength(3);
		expect(counts[0]).toEqual({ date: "2026-02-13", count: 25 });
		expect(counts[2]).toEqual({ date: TEST_DATE, count: 20 });
	});

	it("returns empty array when no data", async () => {
		const { db } = mockDB({ queryResults: [] });
		const counts = await getDateRepoCounts(db);
		expect(counts).toEqual([]);
	});

	it("does not call bind and issues exactly one prepare", async () => {
		const { db, calls } = mockDB();
		await getDateRepoCounts(db);
		expect(calls.prepare).toHaveLength(1);
		expect(calls.bind).toHaveLength(0);
	});
});
