import { beforeAll, describe, expect, it, vi } from "vitest";
import { GET as getTrending } from "../src/pages/api/trending/[date]";
import { GET as getDates } from "../src/pages/api/dates";
import { GET as getWeeklyTrending } from "../src/pages/api/trending/week/[date]";
import { GET as getSearch } from "../src/pages/api/search";
import { GET as getCompare } from "../src/pages/api/compare";
import { GET as getLanguages } from "../src/pages/api/languages/[date]";
import { GET as getWeeklyLanguages } from "../src/pages/api/languages/week/[date]";

// ── Mock todayUTC to a fixed Wednesday for deterministic tests ────────
// 2026-02-11 is a Wednesday, so current week = Mon Feb 9 – Sun Feb 15.
const MOCK_TODAY = "2026-02-11";
vi.mock("../src/lib/dates", async () => {
	const actual = await vi.importActual<typeof import("../src/lib/dates")>("../src/lib/dates");
	return { ...actual, todayUTC: () => MOCK_TODAY };
});

// Suppress console output from API handler logging
beforeAll(() => {
	vi.spyOn(console, "log").mockImplementation(() => {});
	vi.spyOn(console, "error").mockImplementation(() => {});
	vi.spyOn(console, "warn").mockImplementation(() => {});
});

// ── Constants ─────────────────────────────────────────────────────────
const PAST_DATE = "2026-02-05";
const PAST_WEEK_DATE = "2026-02-01"; // Week: Mon Jan 26 – Sun Feb 1

// ── Types ─────────────────────────────────────────────────────────────

interface RepoRow {
	repo_owner: string;
	repo_name: string;
	description: string | null;
	language: string | null;
	language_color: string | null;
	total_stars: number;
	forks: number;
	stars_today: number;
	trending_date: string;
	scraped_at: string;
}

interface WeeklyRepoRow {
	repo_owner: string;
	repo_name: string;
	description: string | null;
	language: string | null;
	language_color: string | null;
	total_stars: number;
	forks: number;
	appearances: number;
	total_stars_gained: number;
	max_stars_today: number;
	days_in_week: number;
}

// ── Mock factories ────────────────────────────────────────────────────

/**
 * Create a mock D1Database that supports sequential query results.
 * Each `.prepare().bind().all()` chain consumes the next index.
 * Index is assigned at `prepare()` time (not at `.all()` time).
 *
 * - `queryResults` returns the same data for every query.
 * - `queryResultsByIndex` returns per-query data (index 0, 1, 2, …).
 * - `queryError` makes every `.all()` reject.
 * - `queryErrorAtIndex` makes only specific indices reject.
 */
function mockDB(
	config: {
		queryResultsByIndex?: Record<number, unknown[]>;
		queryResults?: unknown[];
		queryError?: Error;
		queryErrorAtIndex?: Record<number, Error>;
	} = {},
) {
	let queryIndex = 0;
	const calls = {
		prepare: [] as string[],
		bind: [] as unknown[][],
	};

	interface MockStatement {
		bind(...args: unknown[]): MockStatement;
		all(): Promise<{ results: unknown[]; success: boolean; meta: Record<string, unknown> }>;
	}

	const createStatement = (): MockStatement => {
		const idx = queryIndex++;
		const stmt: MockStatement = {
			bind(...args: unknown[]) {
				calls.bind.push(args);
				return stmt;
			},
			async all() {
				if (config.queryErrorAtIndex?.[idx]) throw config.queryErrorAtIndex[idx];
				if (config.queryError) throw config.queryError;
				return {
					results: config.queryResultsByIndex?.[idx] ?? config.queryResults ?? [],
					success: true,
					meta: {},
				};
			},
		};
		return stmt;
	};

	const db = {
		prepare(sql: string) {
			calls.prepare.push(sql);
			return createStatement();
		},
	} as unknown as D1Database;

	return { db, calls };
}

/** Create a mock KVNamespace backed by a Map, tracking all put calls. */
function mockKV(entries: Record<string, string> = {}) {
	const store = new Map(Object.entries(entries));
	const puts: Array<{ key: string; value: string; options?: Record<string, unknown> }> = [];

	const kv = {
		get: async (key: string) => store.get(key) ?? null,
		put: async (key: string, value: string, options?: Record<string, unknown>) => {
			store.set(key, value);
			puts.push({ key, value, options });
		},
	} as unknown as KVNamespace;

	return { kv, puts, store };
}

/** Sample trending repo row matching the shape returned by D1 queries. */
function sampleRepo(overrides: Partial<RepoRow> = {}): RepoRow {
	return {
		repo_owner: "facebook",
		repo_name: "react",
		description: "A JavaScript library",
		language: "JavaScript",
		language_color: "#f1e05a",
		total_stars: 200000,
		forks: 40000,
		stars_today: 500,
		trending_date: PAST_DATE,
		scraped_at: "2026-02-05T06:00:00Z",
		...overrides,
	};
}

/** Sample weekly repo row including the `days_in_week` field that D1 returns. */
function weeklyRepoRow(overrides: Partial<WeeklyRepoRow> = {}): WeeklyRepoRow {
	return {
		repo_owner: "facebook",
		repo_name: "react",
		description: "A JavaScript library",
		language: "JavaScript",
		language_color: "#f1e05a",
		total_stars: 200000,
		forks: 40000,
		appearances: 5,
		total_stars_gained: 2500,
		max_stars_today: 700,
		days_in_week: 5,
		...overrides,
	};
}

/** Build a minimal Astro-like API context for handler invocation. */
function apiContext({
	params = {},
	db,
	kv,
	url,
}: {
	params?: Record<string, string | undefined>;
	db: D1Database;
	kv?: KVNamespace;
	url?: URL;
}) {
	return {
		params,
		locals: {
			runtime: {
				env: {
					DB: db,
					...(kv ? { CACHE: kv } : {}),
				},
			},
		},
		url: url ?? new URL("http://localhost"),
		// biome-ignore lint/suspicious/noExplicitAny: partial mock of Astro APIContext
	} as any;
}

/** Create a minimal context for validation tests where DB/KV are never exercised. */
function validationContext(
	overrides: { params?: Record<string, string | undefined>; url?: URL } = {},
) {
	const { db } = mockDB();
	const { kv } = mockKV();
	return apiContext({ db, kv, ...overrides });
}

// ══════════════════════════════════════════════════════════════════════
// GET /api/trending/[date]
// ══════════════════════════════════════════════════════════════════════

describe("GET /api/trending/[date]", () => {
	describe("validation", () => {
		it("returns 400 for invalid date format", async () => {
			const res = await getTrending(validationContext({ params: { date: "not-a-date" } }));
			expect(res.status).toBe(400);
			expect(((await res.json()) as { error: string }).error).toContain("Invalid date format");
		});

		it("returns 400 for missing date param", async () => {
			const res = await getTrending(validationContext({ params: {} }));
			expect(res.status).toBe(400);
		});

		it("returns 400 for semantically invalid date like Feb 30", async () => {
			const res = await getTrending(validationContext({ params: { date: "2026-02-30" } }));
			expect(res.status).toBe(400);
		});
	});

	describe("cache behavior", () => {
		it("returns cached data on KV hit without querying D1", async () => {
			const cached = JSON.stringify([sampleRepo()]);
			const { db, calls } = mockDB();
			const { kv } = mockKV({ [`trending:${PAST_DATE}`]: cached });

			const res = await getTrending(apiContext({ params: { date: PAST_DATE }, db, kv }));
			expect(res.status).toBe(200);
			expect(await res.json()).toEqual([sampleRepo()]);
			expect(calls.prepare).toHaveLength(0);
		});

		it("queries D1 and populates KV on cache miss", async () => {
			const repos = [sampleRepo()];
			const { db } = mockDB({ queryResultsByIndex: { 0: repos } });
			const { kv, puts } = mockKV();

			await getTrending(apiContext({ params: { date: PAST_DATE }, db, kv }));
			expect(puts.length).toBeGreaterThanOrEqual(1);
			expect(puts[0].key).toBe(`trending:${PAST_DATE}`);
		});

		it("does not cache empty results", async () => {
			const { db } = mockDB();
			const { kv, puts } = mockKV();

			await getTrending(apiContext({ params: { date: PAST_DATE }, db, kv }));
			expect(puts).toHaveLength(0);
		});

		it("uses immutable Cache-Control for historical dates", async () => {
			const { db } = mockDB();
			const { kv } = mockKV();
			const res = await getTrending(apiContext({ params: { date: PAST_DATE }, db, kv }));
			expect(res.headers.get("Cache-Control")).toContain("immutable");
		});

		it("uses short-lived Cache-Control for today", async () => {
			const { db } = mockDB();
			const { kv } = mockKV();
			const res = await getTrending(apiContext({ params: { date: MOCK_TODAY }, db, kv }));

			const cc = res.headers.get("Cache-Control") ?? "";
			expect(cc).toContain("max-age=300");
			expect(cc).not.toContain("immutable");
		});

		it("sets TTL on KV put for today", async () => {
			const { db } = mockDB({ queryResultsByIndex: { 0: [sampleRepo()] } });
			const { kv, puts } = mockKV();

			await getTrending(apiContext({ params: { date: MOCK_TODAY }, db, kv }));
			expect(puts[0].options).toEqual({ expirationTtl: 3600 });
		});

		it("omits TTL on KV put for historical dates", async () => {
			const { db } = mockDB({ queryResultsByIndex: { 0: [sampleRepo()] } });
			const { kv, puts } = mockKV();

			await getTrending(apiContext({ params: { date: PAST_DATE }, db, kv }));
			expect(puts[0].options).toBeUndefined();
		});
	});

	describe("response", () => {
		it("returns JSON array of repos with Content-Type header", async () => {
			const repos = [
				sampleRepo(),
				sampleRepo({ repo_owner: "microsoft", repo_name: "typescript", stars_today: 300 }),
			];
			const { db } = mockDB({ queryResultsByIndex: { 0: repos } });
			const { kv } = mockKV();

			const res = await getTrending(apiContext({ params: { date: PAST_DATE }, db, kv }));
			expect(res.status).toBe(200);
			expect(res.headers.get("Content-Type")).toBe("application/json");
			expect(await res.json()).toHaveLength(2);
		});

		it("returns empty array for date with no data", async () => {
			const { db } = mockDB();
			const { kv } = mockKV();
			const res = await getTrending(apiContext({ params: { date: PAST_DATE }, db, kv }));

			expect(res.status).toBe(200);
			expect(await res.json()).toEqual([]);
		});

		it("includes enrichment defaults when enrichment queries return empty", async () => {
			const { db } = mockDB({ queryResultsByIndex: { 0: [sampleRepo()] } });
			const { kv } = mockKV();
			const res = await getTrending(apiContext({ params: { date: PAST_DATE }, db, kv }));

			const body = (await res.json()) as Array<{ streak: number; is_new_entry: boolean }>;
			expect(body[0].streak).toBe(1);
			expect(body[0].is_new_entry).toBe(false);
		});
	});

	describe("error handling", () => {
		it("returns 500 with no-store Cache-Control on D1 query failure", async () => {
			const { db } = mockDB({ queryErrorAtIndex: { 0: new Error("D1 timeout") } });
			const { kv } = mockKV();
			const res = await getTrending(apiContext({ params: { date: PAST_DATE }, db, kv }));

			expect(res.status).toBe(500);
			const body = (await res.json()) as { error: string; detail: string };
			expect(body.error).toBe("Database query failed");
			expect(body.detail).toBe("D1 timeout");
			expect(res.headers.get("Cache-Control")).toBe("no-store");
		});

		it("returns repos even when enrichment queries fail", async () => {
			const { db } = mockDB({
				queryResultsByIndex: { 0: [sampleRepo()] },
				queryErrorAtIndex: {
					1: new Error("streak fail"),
					2: new Error("new-entry fail"),
					3: new Error("history fail"),
				},
			});
			const { kv } = mockKV();
			const res = await getTrending(apiContext({ params: { date: PAST_DATE }, db, kv }));

			expect(res.status).toBe(200);
			const body = (await res.json()) as Array<{ repo_owner: string }>;
			expect(body).toHaveLength(1);
			expect(body[0].repo_owner).toBe("facebook");
		});
	});
});

// ══════════════════════════════════════════════════════════════════════
// GET /api/dates
// ══════════════════════════════════════════════════════════════════════

describe("GET /api/dates", () => {
	it("returns dates with correct response shape", async () => {
		const { db, calls } = mockDB({
			queryResults: [
				{ trending_date: "2026-02-01" },
				{ trending_date: "2026-02-02" },
				{ trending_date: "2026-02-05" },
			],
		});
		const res = await getDates(apiContext({ db }));

		expect(res.status).toBe(200);
		expect(res.headers.get("Content-Type")).toBe("application/json");
		const body = (await res.json()) as {
			earliest: string | null;
			latest: string | null;
			dates: string[];
		};
		expect(body.earliest).toBe("2026-02-01");
		expect(body.latest).toBe("2026-02-05");
		expect(body.dates).toEqual(["2026-02-01", "2026-02-02", "2026-02-05"]);
		expect(calls.prepare).toHaveLength(1);
		expect(calls.bind).toHaveLength(0);
	});

	it("returns null earliest/latest for empty archive", async () => {
		const { db } = mockDB({ queryResults: [] });
		const res = await getDates(apiContext({ db }));

		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			earliest: string | null;
			latest: string | null;
			dates: string[];
		};
		expect(body.earliest).toBeNull();
		expect(body.latest).toBeNull();
		expect(body.dates).toEqual([]);
	});

	it("returns 500 with no-store Cache-Control on D1 error", async () => {
		const { db } = mockDB({ queryError: new Error("DB unavailable") });
		const res = await getDates(apiContext({ db }));

		expect(res.status).toBe(500);
		const body = (await res.json()) as { error: string; detail: string };
		expect(body.error).toBe("Database query failed");
		expect(body.detail).toBe("DB unavailable");
		expect(res.headers.get("Cache-Control")).toBe("no-store");
	});

	it("includes Cache-Control header on success", async () => {
		const { db } = mockDB({ queryResults: [] });
		const res = await getDates(apiContext({ db }));
		expect(res.headers.get("Cache-Control")).toContain("max-age=300");
	});
});

// ══════════════════════════════════════════════════════════════════════
// GET /api/trending/week/[date]
// ══════════════════════════════════════════════════════════════════════

describe("GET /api/trending/week/[date]", () => {
	describe("validation", () => {
		it("returns 400 for invalid date format", async () => {
			const res = await getWeeklyTrending(validationContext({ params: { date: "abc" } }));
			expect(res.status).toBe(400);
			expect(((await res.json()) as { error: string }).error).toContain("Invalid date format");
		});

		it("returns 400 for missing date param", async () => {
			const res = await getWeeklyTrending(validationContext({ params: {} }));
			expect(res.status).toBe(400);
		});
	});

	describe("cache behavior", () => {
		it("returns cached data on KV hit without querying D1", async () => {
			// Current week: date 2026-02-11 → Monday = 2026-02-09
			const cached = JSON.stringify({
				week_start: "2026-02-09",
				week_end: "2026-02-15",
				partial: true,
				repos: [],
			});
			const { db, calls } = mockDB();
			const { kv } = mockKV({ "trending:week:2026-02-09": cached });

			const res = await getWeeklyTrending(apiContext({ params: { date: MOCK_TODAY }, db, kv }));
			expect(res.status).toBe(200);
			expect(calls.prepare).toHaveLength(0);
		});

		it("queries D1 and populates KV on cache miss", async () => {
			const { db } = mockDB({ queryResults: [weeklyRepoRow()] });
			const { kv, puts } = mockKV();

			await getWeeklyTrending(apiContext({ params: { date: PAST_WEEK_DATE }, db, kv }));
			expect(puts.length).toBeGreaterThanOrEqual(1);
			// Past week date 2026-02-01 → Monday = 2026-01-26
			expect(puts[0].key).toBe("trending:week:2026-01-26");
		});

		it("uses immutable Cache-Control for past weeks", async () => {
			const { db } = mockDB({ queryResults: [] });
			const { kv } = mockKV();
			const res = await getWeeklyTrending(apiContext({ params: { date: PAST_WEEK_DATE }, db, kv }));
			expect(res.headers.get("Cache-Control")).toContain("immutable");
		});

		it("uses short-lived Cache-Control for current week", async () => {
			const { db } = mockDB({ queryResults: [] });
			const { kv } = mockKV();
			const res = await getWeeklyTrending(apiContext({ params: { date: MOCK_TODAY }, db, kv }));

			const cc = res.headers.get("Cache-Control") ?? "";
			expect(cc).toContain("max-age=300");
			expect(cc).not.toContain("immutable");
		});
	});

	describe("response shape", () => {
		it("includes week_start, week_end, partial, and repos", async () => {
			const { db } = mockDB({ queryResults: [weeklyRepoRow()] });
			const { kv } = mockKV();
			const res = await getWeeklyTrending(apiContext({ params: { date: PAST_WEEK_DATE }, db, kv }));

			const body = (await res.json()) as {
				week_start: string;
				week_end: string;
				partial: boolean;
				repos: Array<{ appearances: number }>;
			};
			expect(body.week_start).toBe("2026-01-26");
			expect(body.week_end).toBe("2026-02-01");
			expect(body).toHaveProperty("partial");
			expect(body.repos).toHaveLength(1);
			expect(body.repos[0].appearances).toBe(5);
			expect(body.repos[0]).not.toHaveProperty("days_in_week");
		});

		it("sets partial=true when week extends into the future (current week)", async () => {
			// Current week: weekEnd 2026-02-15 > today 2026-02-11 → weekNotFinished = true
			const { db } = mockDB({ queryResults: [weeklyRepoRow({ days_in_week: 3 })] });
			const { kv } = mockKV();
			const res = await getWeeklyTrending(apiContext({ params: { date: MOCK_TODAY }, db, kv }));

			expect(((await res.json()) as { partial: boolean }).partial).toBe(true);
		});

		it("sets partial=false when past week has 7 days of data", async () => {
			const { db } = mockDB({ queryResults: [weeklyRepoRow({ days_in_week: 7 })] });
			const { kv } = mockKV();
			const res = await getWeeklyTrending(apiContext({ params: { date: PAST_WEEK_DATE }, db, kv }));

			expect(((await res.json()) as { partial: boolean }).partial).toBe(false);
		});
	});

	describe("error handling", () => {
		it("returns 500 with no-store Cache-Control on D1 query failure", async () => {
			const { db } = mockDB({ queryError: new Error("D1 read error") });
			const { kv } = mockKV();
			const res = await getWeeklyTrending(apiContext({ params: { date: PAST_DATE }, db, kv }));

			expect(res.status).toBe(500);
			expect(((await res.json()) as { error: string }).error).toBe("Database query failed");
			expect(res.headers.get("Cache-Control")).toBe("no-store");
		});
	});
});

// ══════════════════════════════════════════════════════════════════════
// GET /api/search
// ══════════════════════════════════════════════════════════════════════

describe("GET /api/search", () => {
	describe("validation", () => {
		it("returns empty results for query shorter than 2 characters", async () => {
			const { db } = mockDB();
			const url = new URL("http://localhost/api/search?q=a");
			const res = await getSearch(apiContext({ db, url }));

			expect(res.status).toBe(200);
			const body = (await res.json()) as { results: unknown[]; total: number; query: string };
			expect(body.results).toEqual([]);
			expect(body.total).toBe(0);
			expect(body.query).toBe("a");
		});

		it("returns empty results for missing query", async () => {
			const { db } = mockDB();
			const url = new URL("http://localhost/api/search");
			const res = await getSearch(apiContext({ db, url }));

			expect(res.status).toBe(200);
			expect(((await res.json()) as { results: unknown[] }).results).toEqual([]);
		});

		it("returns 400 for query longer than 100 characters", async () => {
			const { db } = mockDB();
			const longQuery = "a".repeat(101);
			const url = new URL(`http://localhost/api/search?q=${longQuery}`);
			const res = await getSearch(apiContext({ db, url }));

			expect(res.status).toBe(400);
			expect(((await res.json()) as { error: string }).error).toContain("Query too long");
		});
	});

	describe("search results", () => {
		it("groups rows by repo with dates array", async () => {
			const rows = [
				sampleRepo({ trending_date: "2026-02-05" }),
				sampleRepo({ trending_date: "2026-02-04" }),
				sampleRepo({ trending_date: "2026-02-03" }),
			];
			const { db } = mockDB({ queryResults: rows });
			const url = new URL("http://localhost/api/search?q=react");
			const res = await getSearch(apiContext({ db, url }));

			const body = (await res.json()) as {
				results: Array<{ repo_owner: string; repo_name: string; dates: string[] }>;
				total: number;
			};
			expect(body.results).toHaveLength(1);
			expect(body.results[0].repo_owner).toBe("facebook");
			expect(body.results[0].repo_name).toBe("react");
			expect(body.results[0].dates).toEqual(["2026-02-05", "2026-02-04", "2026-02-03"]);
			expect(body.total).toBe(1);
		});

		it("limits results to 50 unique repos", async () => {
			const rows = Array.from({ length: 60 }, (_, i) => ({
				repo_owner: "org",
				repo_name: `repo-${i}`,
				description: "Description",
				language: "JavaScript",
				language_color: "#f1e05a",
				total_stars: 100,
				forks: 10,
				stars_today: 10,
				trending_date: "2026-02-05",
			}));
			const { db } = mockDB({ queryResults: rows });
			const url = new URL("http://localhost/api/search?q=repo");
			const res = await getSearch(apiContext({ db, url }));

			const body = (await res.json()) as { total: number; results: unknown[] };
			expect(body.total).toBe(50);
			expect(body.results).toHaveLength(50);
		});

		it("includes Cache-Control header on results", async () => {
			const { db } = mockDB({ queryResults: [] });
			const url = new URL("http://localhost/api/search?q=react");
			const res = await getSearch(apiContext({ db, url }));
			expect(res.headers.get("Cache-Control")).toContain("max-age=60");
		});
	});

	describe("error handling", () => {
		it("returns 500 with no-store Cache-Control on D1 error", async () => {
			const { db } = mockDB({ queryError: new Error("query failed") });
			const url = new URL("http://localhost/api/search?q=react");
			const res = await getSearch(apiContext({ db, url }));

			expect(res.status).toBe(500);
			expect(((await res.json()) as { error: string }).error).toBe("Database query failed");
			expect(res.headers.get("Cache-Control")).toBe("no-store");
		});
	});
});

// ══════════════════════════════════════════════════════════════════════
// GET /api/compare
// ══════════════════════════════════════════════════════════════════════

describe("GET /api/compare", () => {
	describe("validation", () => {
		it("returns 400 when date1 is missing", async () => {
			const res = await getCompare(
				validationContext({ url: new URL("http://localhost/api/compare?date2=2026-02-05") }),
			);
			expect(res.status).toBe(400);
			expect(((await res.json()) as { error: string }).error).toContain("Both date1 and date2");
		});

		it("returns 400 when date2 is missing", async () => {
			const res = await getCompare(
				validationContext({ url: new URL("http://localhost/api/compare?date1=2026-02-05") }),
			);
			expect(res.status).toBe(400);
		});

		it("returns 400 for invalid date format", async () => {
			const res = await getCompare(
				validationContext({
					url: new URL("http://localhost/api/compare?date1=bad&date2=2026-02-05"),
				}),
			);
			expect(res.status).toBe(400);
		});

		it("returns 400 when date1 and date2 are the same", async () => {
			const res = await getCompare(
				validationContext({
					url: new URL("http://localhost/api/compare?date1=2026-02-05&date2=2026-02-05"),
				}),
			);
			expect(res.status).toBe(400);
			expect(((await res.json()) as { error: string }).error).toContain("must be different");
		});
	});

	describe("comparison results", () => {
		it("returns common, only_date1, and only_date2 sets", async () => {
			const repoA = sampleRepo({ repo_owner: "a", repo_name: "shared" });
			const repoB = sampleRepo({ repo_owner: "b", repo_name: "only-d1" });
			const repoC = sampleRepo({ repo_owner: "c", repo_name: "only-d2" });

			const { db } = mockDB({
				queryResultsByIndex: {
					0: [repoA, repoB], // date1 repos
					1: [repoA, repoC], // date2 repos
				},
			});
			const url = new URL("http://localhost/api/compare?date1=2026-02-04&date2=2026-02-05");
			const res = await getCompare(apiContext({ db, url }));

			expect(res.status).toBe(200);
			const body = (await res.json()) as {
				date1_repos: unknown[];
				date2_repos: unknown[];
				common: Array<{ repo_owner: string }>;
				only_date1: Array<{ repo_name: string }>;
				only_date2: Array<{ repo_name: string }>;
			};
			expect(body.date1_repos).toHaveLength(2);
			expect(body.date2_repos).toHaveLength(2);
			expect(body.common).toHaveLength(1);
			expect(body.common[0].repo_owner).toBe("a");
			expect(body.only_date1).toHaveLength(1);
			expect(body.only_date1[0].repo_name).toBe("only-d1");
			expect(body.only_date2).toHaveLength(1);
			expect(body.only_date2[0].repo_name).toBe("only-d2");
		});

		it("uses immutable Cache-Control when both dates are historical", async () => {
			const { db } = mockDB({ queryResultsByIndex: { 0: [], 1: [] } });
			const url = new URL("http://localhost/api/compare?date1=2026-02-04&date2=2026-02-05");
			const res = await getCompare(apiContext({ db, url }));
			expect(res.headers.get("Cache-Control")).toContain("immutable");
		});

		it("uses short-lived Cache-Control when one date is today", async () => {
			const { db } = mockDB({ queryResultsByIndex: { 0: [], 1: [] } });
			const url = new URL(`http://localhost/api/compare?date1=${MOCK_TODAY}&date2=2026-02-05`);
			const res = await getCompare(apiContext({ db, url }));

			const cc = res.headers.get("Cache-Control") ?? "";
			expect(cc).toContain("max-age=300");
			expect(cc).not.toContain("immutable");
		});
	});

	describe("error handling", () => {
		it("returns 500 with no-store Cache-Control on D1 error", async () => {
			const { db } = mockDB({ queryError: new Error("connection lost") });
			const url = new URL("http://localhost/api/compare?date1=2026-02-04&date2=2026-02-05");
			const res = await getCompare(apiContext({ db, url }));

			expect(res.status).toBe(500);
			expect(((await res.json()) as { error: string }).error).toBe("Database query failed");
			expect(res.headers.get("Cache-Control")).toBe("no-store");
		});
	});
});

// ══════════════════════════════════════════════════════════════════════
// GET /api/languages/[date]
// ══════════════════════════════════════════════════════════════════════

describe("GET /api/languages/[date]", () => {
	it("returns 400 for invalid date format", async () => {
		const res = await getLanguages(validationContext({ params: { date: "invalid" } }));
		expect(res.status).toBe(400);
	});

	it("returns cached data on KV hit", async () => {
		const cached = JSON.stringify([
			{ language: "Go", color: "#00ADD8", count: 5, percentage: 100 },
		]);
		const { db, calls } = mockDB();
		const { kv } = mockKV({ [`languages:${PAST_DATE}`]: cached });

		const res = await getLanguages(apiContext({ params: { date: PAST_DATE }, db, kv }));
		expect(res.status).toBe(200);
		expect(calls.prepare).toHaveLength(0);
	});

	it("queries D1 and returns language distribution on cache miss", async () => {
		const { db } = mockDB({
			queryResults: [
				{ language: "JavaScript", color: "#f1e05a", count: 15 },
				{ language: "Python", color: "#3572A5", count: 10 },
			],
		});
		const { kv, puts } = mockKV();
		const res = await getLanguages(apiContext({ params: { date: PAST_DATE }, db, kv }));

		expect(res.status).toBe(200);
		const body = (await res.json()) as Array<{ language: string }>;
		expect(body).toHaveLength(2);
		expect(body[0].language).toBe("JavaScript");
		expect(body[0]).toHaveProperty("percentage");
		expect(puts[0].key).toBe(`languages:${PAST_DATE}`);
	});

	it("returns 500 with no-store Cache-Control on D1 error", async () => {
		const { db } = mockDB({ queryError: new Error("D1 error") });
		const { kv } = mockKV();
		const res = await getLanguages(apiContext({ params: { date: PAST_DATE }, db, kv }));

		expect(res.status).toBe(500);
		expect(((await res.json()) as { error: string }).error).toBe("Database query failed");
		expect(res.headers.get("Cache-Control")).toBe("no-store");
	});
});

// ══════════════════════════════════════════════════════════════════════
// GET /api/languages/week/[date]
// ══════════════════════════════════════════════════════════════════════

describe("GET /api/languages/week/[date]", () => {
	it("returns 400 for invalid date format", async () => {
		const res = await getWeeklyLanguages(validationContext({ params: { date: "xyz" } }));
		expect(res.status).toBe(400);
	});

	it("returns cached data on KV hit", async () => {
		const cached = JSON.stringify([
			{ language: "Rust", color: "#dea584", count: 8, percentage: 100 },
		]);
		const { db, calls } = mockDB();
		// Past week date 2026-02-01 → Monday = 2026-01-26
		const { kv } = mockKV({ "languages:week:2026-01-26": cached });

		const res = await getWeeklyLanguages(apiContext({ params: { date: PAST_WEEK_DATE }, db, kv }));
		expect(res.status).toBe(200);
		expect(calls.prepare).toHaveLength(0);
	});

	it("queries D1 and returns weekly language distribution on cache miss", async () => {
		const { db } = mockDB({
			queryResults: [
				{ language: "TypeScript", color: "#3178c6", count: 12 },
				{ language: "Go", color: "#00ADD8", count: 8 },
			],
		});
		const { kv, puts } = mockKV();
		const res = await getWeeklyLanguages(apiContext({ params: { date: PAST_WEEK_DATE }, db, kv }));

		expect(res.status).toBe(200);
		const body = (await res.json()) as Array<{ language: string }>;
		expect(body).toHaveLength(2);
		expect(body[0].language).toBe("TypeScript");
		expect(puts[0].key).toBe("languages:week:2026-01-26");
	});

	it("returns 500 with no-store Cache-Control on D1 error", async () => {
		const { db } = mockDB({ queryError: new Error("weekly lang error") });
		const { kv } = mockKV();
		const res = await getWeeklyLanguages(apiContext({ params: { date: PAST_WEEK_DATE }, db, kv }));

		expect(res.status).toBe(500);
		expect(((await res.json()) as { error: string }).error).toBe("Database query failed");
		expect(res.headers.get("Cache-Control")).toBe("no-store");
	});
});
