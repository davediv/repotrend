import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { parseTrendingPage } from "../src/lib/scraper/parser";
import { runScrapePipeline } from "../src/lib/scraper/pipeline";
import { runScrapeWithRetry } from "../src/lib/scraper/retry";
import { getTrendingRepos, type TrendingRepo } from "../src/lib/trending";
import { GET as getTrending } from "../src/pages/api/trending/[date]";

// ── Mock todayUTC to a fixed date ────────────────────────────────────
const MOCK_TODAY = "2026-02-20";
vi.mock("../src/lib/dates", async () => {
	const actual = await vi.importActual<typeof import("../src/lib/dates")>("../src/lib/dates");
	return { ...actual, todayUTC: () => MOCK_TODAY };
});

// ── Mock the fetcher to avoid real HTTP requests ─────────────────────
vi.mock("../src/lib/scraper/fetcher", () => ({
	fetchTrendingPage: vi.fn(),
	randomDelay: vi.fn().mockResolvedValue(undefined),
}));

// Avoid live GitHub API calls for topic enrichment in integration tests.
vi.mock("../src/lib/scraper/topics", () => ({
	enrichReposWithTopics: vi.fn(async (repos) => repos),
}));

import { fetchTrendingPage } from "../src/lib/scraper/fetcher";

const mockedFetch = vi.mocked(fetchTrendingPage);

// Suppress console output during tests
beforeAll(() => {
	vi.spyOn(console, "log").mockImplementation(() => {});
	vi.spyOn(console, "error").mockImplementation(() => {});
	vi.spyOn(console, "warn").mockImplementation(() => {});
});

// ── Fixtures ─────────────────────────────────────────────────────────
function loadFixture(name: string): string {
	return readFileSync(resolve(import.meta.dirname, "fixtures", name), "utf-8");
}

// ── Mock factories ───────────────────────────────────────────────────

/**
 * Mock D1Database supporting both batch() for persistence and sequential
 * prepare().bind().all() chains for read queries.
 *
 * `first()` uses a separate counter from `all()` so that hasDataForDate()
 * checks don't shift the index for subsequent query results.
 *
 * - `batchResults`: controls what batch() returns (one entry per statement).
 * - `queryResultsByIndex`: per-query results for sequential .all() calls.
 * - `batchError`: makes batch() reject.
 * - `queryError`: makes all .all() reject.
 * - `firstResult`: controls what .first() returns (for retry hasDataForDate check).
 */
function mockDB(
	config: {
		batchResults?: Array<{ success: boolean; meta: { changes?: number } }>;
		batchError?: Error;
		queryResultsByIndex?: Record<number, unknown[]>;
		queryResults?: unknown[];
		queryError?: Error;
		firstResult?: unknown;
	} = {},
) {
	let allIndex = 0;
	const calls = {
		prepare: [] as string[],
		bind: [] as unknown[][],
		batchCount: 0,
	};

	interface MockStatement {
		bind(...args: unknown[]): MockStatement;
		all(): Promise<{ results: unknown[]; success: boolean; meta: Record<string, unknown> }>;
		first(): Promise<unknown>;
	}

	const createStatement = (): MockStatement => {
		const stmt: MockStatement = {
			bind(...args: unknown[]) {
				calls.bind.push(args);
				return stmt;
			},
			async all() {
				const idx = allIndex++;
				if (config.queryError) throw config.queryError;
				return {
					results: config.queryResultsByIndex?.[idx] ?? config.queryResults ?? [],
					success: true,
					meta: {},
				};
			},
			async first() {
				return config.firstResult ?? null;
			},
		};
		return stmt;
	};

	const db = {
		prepare(sql: string) {
			calls.prepare.push(sql);
			return createStatement();
		},
		async batch(stmts: unknown[]) {
			calls.batchCount++;
			if (config.batchError) throw config.batchError;
			return (
				config.batchResults ??
				(stmts as unknown[]).map(() => ({ success: true, meta: { changes: 1 } }))
			);
		},
	} as unknown as D1Database;

	return { db, calls };
}

/** Create a mock KVNamespace backed by a Map, tracking all put/delete calls. */
function mockKV(entries: Record<string, string> = {}) {
	const store = new Map(Object.entries(entries));
	const puts: Array<{ key: string; value: string; options?: Record<string, unknown> }> = [];
	const deletes: string[] = [];

	const kv = {
		get: async (key: string) => store.get(key) ?? null,
		put: async (key: string, value: string, options?: Record<string, unknown>) => {
			store.set(key, value);
			puts.push({ key, value, options });
		},
		delete: async (key: string) => {
			store.delete(key);
			deletes.push(key);
		},
	} as unknown as KVNamespace;

	return { kv, puts, deletes, store };
}

/** Build a minimal Astro-like API context for handler invocation. */
function apiContext({
	params = {},
	db,
	kv,
	url,
	request,
}: {
	params?: Record<string, string | undefined>;
	db: D1Database;
	kv?: KVNamespace;
	url?: URL;
	request?: Request;
}) {
	return {
		params,
		request,
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

// ── Pipeline test helpers ────────────────────────────────────────────

/** Set up a mocked pipeline run: load fixture, mock fetch, create DB, run pipeline. */
async function runPipelineWithFixture(fixture = "trending-page.html") {
	const html = loadFixture(fixture);
	mockedFetch.mockResolvedValueOnce(html);
	const { db, calls } = mockDB();
	const result = await runScrapePipeline(db, MOCK_TODAY);
	return { html, db, calls, result };
}

/** Parse fixture and build D1 row objects as they would appear after persistence. */
function buildStoredRows(fixture = "trending-page.html") {
	const parsed = parseTrendingPage(loadFixture(fixture));
	const storedRows = parsed.map((r) => ({
		...r,
		trending_date: MOCK_TODAY,
		scraped_at: "2026-02-20T06:00:00Z",
	}));
	return { parsed, storedRows };
}

// ══════════════════════════════════════════════════════════════════════
// TEST-P5-004: Full scrape pipeline integration tests
// ══════════════════════════════════════════════════════════════════════

describe("TEST-P5-004: Full scrape pipeline integration", () => {
	describe("fetch → parse → persist flow", () => {
		it("parses fixture HTML and persists 3 repos via runScrapePipeline", async () => {
			const { result, calls } = await runPipelineWithFixture();

			expect(result.success).toBe(true);
			expect(result.repoCount).toBe(3);
			expect(result.rowsWritten).toBe(3);
			expect(result.date).toBe(MOCK_TODAY);
			expect(result.durationMs).toBeGreaterThanOrEqual(0);
			expect(result.error).toBeUndefined();
			expect(result.errorType).toBeUndefined();

			// Verify batch was called once with 3 statements
			expect(calls.batchCount).toBe(1);
			expect(calls.prepare).toHaveLength(3);
		});

		it("parses fixture HTML and persists 25 repos from full page", async () => {
			const { result, calls } = await runPipelineWithFixture("trending-full-25.html");

			expect(result.success).toBe(true);
			expect(result.repoCount).toBe(25);
			expect(result.rowsWritten).toBe(25);
			expect(calls.batchCount).toBe(1);
			expect(calls.prepare).toHaveLength(25);
		});

		it("binds correct parsed data to persistence layer", async () => {
			const { calls } = await runPipelineWithFixture();

			// First repo: facebook/react
			const [owner, name, desc, lang, color, stars, forks, starsToday, date, scrapedAt] =
				calls.bind[0];
			expect(owner).toBe("facebook");
			expect(name).toBe("react");
			expect(desc).toBe("The library for web and native user interfaces.");
			expect(lang).toBe("JavaScript");
			expect(color).toBe("#f1e05a");
			expect(stars).toBe(234567);
			expect(forks).toBe(48123);
			expect(starsToday).toBe(1234);
			expect(date).toBe(MOCK_TODAY);
			expect(scrapedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);

			// Second repo: microsoft/typescript
			expect(calls.bind[1][0]).toBe("microsoft");
			expect(calls.bind[1][1]).toBe("typescript");
			expect(calls.bind[1][5]).toBe(102345);
			expect(calls.bind[1][7]).toBe(567);

			// Third repo: torvalds/linux
			expect(calls.bind[2][0]).toBe("torvalds");
			expect(calls.bind[2][1]).toBe("linux");
			expect(calls.bind[2][5]).toBe(189012);
			expect(calls.bind[2][7]).toBe(890);
		});

		it("uses INSERT OR REPLACE SQL for all statements", async () => {
			const { calls } = await runPipelineWithFixture();

			for (const sql of calls.prepare) {
				expect(sql).toContain("INSERT OR REPLACE");
			}
		});

		it("defaults to todayUTC() when no targetDate is provided", async () => {
			const html = loadFixture("trending-page.html");
			mockedFetch.mockResolvedValueOnce(html);

			const { db, calls } = mockDB();
			const result = await runScrapePipeline(db);

			expect(result.date).toBe(MOCK_TODAY);
			for (const bindArgs of calls.bind) {
				expect(bindArgs[8]).toBe(MOCK_TODAY);
			}
		});
	});

	describe("parser output → persistence input consistency", () => {
		it("parser output matches persistence parameter expectations", () => {
			const html = loadFixture("trending-page.html");
			const repos = parseTrendingPage(html);

			expect(repos).toHaveLength(3);

			for (const repo of repos) {
				expect(repo).toHaveProperty("repo_owner");
				expect(repo).toHaveProperty("repo_name");
				expect(repo).toHaveProperty("description");
				expect(repo).toHaveProperty("language");
				expect(repo).toHaveProperty("language_color");
				expect(repo).toHaveProperty("total_stars");
				expect(repo).toHaveProperty("forks");
				expect(repo).toHaveProperty("stars_today");
				expect(typeof repo.repo_owner).toBe("string");
				expect(typeof repo.repo_name).toBe("string");
				expect(typeof repo.total_stars).toBe("number");
				expect(typeof repo.forks).toBe("number");
				expect(typeof repo.stars_today).toBe("number");
			}
		});

		it("persistence receives exactly the parsed repos unchanged", async () => {
			const html = loadFixture("trending-page.html");
			const expectedRepos = parseTrendingPage(html);

			mockedFetch.mockResolvedValueOnce(html);
			const { db, calls } = mockDB();
			await runScrapePipeline(db, MOCK_TODAY);

			for (let i = 0; i < expectedRepos.length; i++) {
				const repo = expectedRepos[i];
				const bound = calls.bind[i];
				expect(bound[0]).toBe(repo.repo_owner);
				expect(bound[1]).toBe(repo.repo_name);
				expect(bound[2]).toBe(repo.description);
				expect(bound[3]).toBe(repo.language);
				expect(bound[4]).toBe(repo.language_color);
				expect(bound[5]).toBe(repo.total_stars);
				expect(bound[6]).toBe(repo.forks);
				expect(bound[7]).toBe(repo.stars_today);
			}
		});
	});

	describe("persisted data → API query flow", () => {
		it("repos stored by pipeline are queryable via getTrendingRepos", async () => {
			const { parsed } = buildStoredRows();

			const storedRepos: TrendingRepo[] = parsed.map((r) => ({
				repo_owner: r.repo_owner,
				repo_name: r.repo_name,
				description: r.description,
				language: r.language,
				language_color: r.language_color,
				total_stars: r.total_stars,
				forks: r.forks,
				stars_today: r.stars_today,
			}));

			const { db } = mockDB({ queryResults: storedRepos });
			const results = await getTrendingRepos(db, MOCK_TODAY);

			expect(results).toHaveLength(3);
			expect(results[0].repo_owner).toBe("facebook");
			expect(results[0].repo_name).toBe("react");
			expect(results[0].total_stars).toBe(234567);
			expect(results[0].stars_today).toBe(1234);
			expect(results[1].repo_owner).toBe("microsoft");
			expect(results[2].repo_owner).toBe("torvalds");
		});

		it("API endpoint returns data matching what pipeline would store", async () => {
			const { storedRows } = buildStoredRows();

			const { db } = mockDB({ queryResultsByIndex: { 0: storedRows } });
			const { kv } = mockKV();

			const res = await getTrending(apiContext({ params: { date: MOCK_TODAY }, db, kv }));

			expect(res.status).toBe(200);
			const body = await res.json();
			expect(body).toHaveLength(3);

			expect(body[0].repo_owner).toBe("facebook");
			expect(body[0].repo_name).toBe("react");
			expect(body[0].description).toBe("The library for web and native user interfaces.");
			expect(body[0].language).toBe("JavaScript");
			expect(body[0].total_stars).toBe(234567);
			expect(body[0].stars_today).toBe(1234);
			expect(body[0].forks).toBe(48123);

			expect(body[1].repo_owner).toBe("microsoft");
			expect(body[1].repo_name).toBe("typescript");
			expect(body[1].total_stars).toBe(102345);

			expect(body[2].repo_owner).toBe("torvalds");
			expect(body[2].repo_name).toBe("linux");
			expect(body[2].total_stars).toBe(189012);
		});

		it("API enriches repos with default streak and is_new_entry when enrichment queries return empty", async () => {
			const { storedRows } = buildStoredRows();

			const { db } = mockDB({ queryResultsByIndex: { 0: storedRows } });
			const { kv } = mockKV();

			const res = await getTrending(apiContext({ params: { date: MOCK_TODAY }, db, kv }));

			const body = await res.json();
			for (const repo of body) {
				expect(repo.streak).toBe(1);
				expect(repo.is_new_entry).toBe(false);
			}
		});
	});

	describe("error propagation through pipeline stages", () => {
		it("returns fetch_error when HTTP request fails", async () => {
			mockedFetch.mockRejectedValueOnce(new Error("Network timeout"));

			const { db } = mockDB();
			const result = await runScrapePipeline(db, MOCK_TODAY);

			expect(result.success).toBe(false);
			expect(result.errorType).toBe("fetch_error");
			expect(result.error).toContain("Network timeout");
			expect(result.repoCount).toBe(0);
			expect(result.rowsWritten).toBe(0);
		});

		it("returns parse_error when HTML is malformed", async () => {
			mockedFetch.mockResolvedValueOnce("<html><body>No articles here</body></html>");

			const { db } = mockDB();
			const result = await runScrapePipeline(db, MOCK_TODAY);

			expect(result.success).toBe(false);
			expect(result.errorType).toBe("parse_error");
			expect(result.error).toContain("no repository rows found");
		});

		it("returns persist_error when D1 batch fails", async () => {
			const html = loadFixture("trending-page.html");
			mockedFetch.mockResolvedValueOnce(html);

			const { db } = mockDB({ batchError: new Error("D1 write timeout") });
			const result = await runScrapePipeline(db, MOCK_TODAY);

			expect(result.success).toBe(false);
			expect(result.errorType).toBe("persist_error");
			expect(result.error).toContain("D1 persistence failed");
		});

		it("never calls persistence when parser fails", async () => {
			mockedFetch.mockResolvedValueOnce("<html><body></body></html>");

			const { db, calls } = mockDB();
			await runScrapePipeline(db, MOCK_TODAY);

			expect(calls.batchCount).toBe(0);
		});
	});

	describe("retry-aware pipeline integration", () => {
		it("skips scrape when data already exists for today", async () => {
			const { db } = mockDB({ firstResult: { 1: 1 } });
			const { kv } = mockKV();

			const result = await runScrapeWithRetry(db, kv);

			expect(result.skipped).toBe(true);
			expect(result.skipReason).toBe("already_has_data");
			expect(result.success).toBe(true);
		});

		it("runs pipeline when no data exists and succeeds", async () => {
			const html = loadFixture("trending-page.html");
			mockedFetch.mockResolvedValueOnce(html);

			const { db } = mockDB({ firstResult: null });
			const { kv } = mockKV();

			const result = await runScrapeWithRetry(db, kv);

			expect(result.skipped).toBe(false);
			expect(result.success).toBe(true);
			expect(result.repoCount).toBe(3);
			expect(result.attempt).toBe(1);
		});

		it("increments retry count in KV on failure", async () => {
			mockedFetch.mockRejectedValueOnce(new Error("GitHub down"));

			const { db } = mockDB({ firstResult: null });
			const { kv, puts } = mockKV();

			const result = await runScrapeWithRetry(db, kv);

			expect(result.success).toBe(false);
			expect(result.attempt).toBe(1);

			const retryPut = puts.find((p) => p.key === `scrape_retry:${MOCK_TODAY}`);
			expect(retryPut).toBeDefined();
			expect(retryPut?.value).toBe("1");
			expect(retryPut?.options).toHaveProperty("expirationTtl");
		});

		it("stops retrying after max attempts", async () => {
			const { db } = mockDB({ firstResult: null });
			const { kv } = mockKV({ [`scrape_retry:${MOCK_TODAY}`]: "3" });

			const result = await runScrapeWithRetry(db, kv);

			expect(result.skipped).toBe(true);
			expect(result.skipReason).toBe("max_retries_exceeded");
			expect(result.success).toBe(false);
		});

		it("marks recovery when succeeding after prior failures", async () => {
			const html = loadFixture("trending-page.html");
			mockedFetch.mockResolvedValueOnce(html);

			const { db } = mockDB({ firstResult: null });
			const { kv, deletes } = mockKV({ [`scrape_retry:${MOCK_TODAY}`]: "1" });

			const result = await runScrapeWithRetry(db, kv);

			expect(result.success).toBe(true);
			expect(result.recovered).toBe(true);
			expect(result.attempt).toBe(2);

			expect(deletes).toContain(`scrape_retry:${MOCK_TODAY}`);
		});
	});

	describe("cron API endpoint integration", () => {
		let getCron: typeof import("../src/pages/api/cron")["GET"];

		beforeAll(async () => {
			const mod = await import("../src/pages/api/cron");
			getCron = mod.GET;
		});

		it("rejects requests without X-Cron-Source header", async () => {
			const { db } = mockDB({ firstResult: null });
			const { kv } = mockKV();

			const request = new Request("http://localhost/api/cron", { headers: {} });
			const res = await getCron(apiContext({ db, kv, request }));

			expect(res.status).toBe(403);
		});

		it("returns 200 when scrape succeeds via cron endpoint", async () => {
			const html = loadFixture("trending-page.html");
			mockedFetch.mockResolvedValueOnce(html);

			const { db } = mockDB({ firstResult: null });
			const { kv } = mockKV();

			const request = new Request("http://localhost/api/cron", {
				headers: { "X-Cron-Source": "scheduled" },
			});
			const res = await getCron(apiContext({ db, kv, request }));

			expect(res.status).toBe(200);
			const body = await res.json();
			expect(body.success).toBe(true);
			expect(body.repoCount).toBe(3);
		});

		it("returns 200 when data already exists (skip)", async () => {
			const { db } = mockDB({ firstResult: { 1: 1 } });
			const { kv } = mockKV();

			const request = new Request("http://localhost/api/cron", {
				headers: { "X-Cron-Source": "scheduled" },
			});
			const res = await getCron(apiContext({ db, kv, request }));

			expect(res.status).toBe(200);
			const body = await res.json();
			expect(body.skipped).toBe(true);
		});

		it("returns 500 when max retries exceeded", async () => {
			const { db } = mockDB({ firstResult: null });
			const { kv } = mockKV({ [`scrape_retry:${MOCK_TODAY}`]: "3" });

			const request = new Request("http://localhost/api/cron", {
				headers: { "X-Cron-Source": "scheduled" },
			});
			const res = await getCron(apiContext({ db, kv, request }));

			expect(res.status).toBe(500);
			const body = await res.json();
			expect(body.skipped).toBe(true);
			expect(body.skipReason).toBe("max_retries_exceeded");
		});
	});

	describe("end-to-end: scrape → query → API response", () => {
		it("full pipeline: fixture HTML → parse → persist → query → API returns correct data", async () => {
			const html = loadFixture("trending-page.html");
			const parsed = parseTrendingPage(html);

			// Step 1: Run the pipeline (fetch mocked, persistence mocked)
			mockedFetch.mockResolvedValueOnce(html);
			const { db: pipelineDb, calls: pipelineCalls } = mockDB();
			const pipelineResult = await runScrapePipeline(pipelineDb, MOCK_TODAY);

			expect(pipelineResult.success).toBe(true);
			expect(pipelineResult.repoCount).toBe(3);

			// Step 2: Verify the data bound to D1 matches parsed output
			expect(pipelineCalls.bind).toHaveLength(3);
			for (let i = 0; i < parsed.length; i++) {
				expect(pipelineCalls.bind[i][0]).toBe(parsed[i].repo_owner);
				expect(pipelineCalls.bind[i][1]).toBe(parsed[i].repo_name);
				expect(pipelineCalls.bind[i][5]).toBe(parsed[i].total_stars);
				expect(pipelineCalls.bind[i][7]).toBe(parsed[i].stars_today);
			}

			// Step 3: Simulate D1 returning stored data, verify API response
			const { storedRows } = buildStoredRows();
			const { db: apiDb } = mockDB({ queryResultsByIndex: { 0: storedRows } });
			const { kv } = mockKV();

			const apiRes = await getTrending(apiContext({ params: { date: MOCK_TODAY }, db: apiDb, kv }));

			expect(apiRes.status).toBe(200);
			const apiBody = await apiRes.json();
			expect(apiBody).toHaveLength(3);

			// Verify complete data round-trip
			for (let i = 0; i < parsed.length; i++) {
				expect(apiBody[i].repo_owner).toBe(parsed[i].repo_owner);
				expect(apiBody[i].repo_name).toBe(parsed[i].repo_name);
				expect(apiBody[i].description).toBe(parsed[i].description);
				expect(apiBody[i].language).toBe(parsed[i].language);
				expect(apiBody[i].language_color).toBe(parsed[i].language_color);
				expect(apiBody[i].total_stars).toBe(parsed[i].total_stars);
				expect(apiBody[i].forks).toBe(parsed[i].forks);
				expect(apiBody[i].stars_today).toBe(parsed[i].stars_today);
			}
		});
	});
});
