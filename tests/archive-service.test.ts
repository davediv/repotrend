import { beforeAll, describe, expect, it, vi } from "vitest";
import { ArchiveValidationError, createArchiveService } from "../src/lib/archive-service";

beforeAll(() => {
	vi.spyOn(console, "log").mockImplementation(() => {});
	vi.spyOn(console, "error").mockImplementation(() => {});
});

function cacheStore() {
	const values = new Map<string, string>();
	const puts: string[] = [];
	const kv = {
		get: async (key: string) => values.get(key) ?? null,
		put: async (key: string, value: string) => {
			values.set(key, value);
			puts.push(key);
		},
	} as unknown as KVNamespace;
	return { kv, puts, values };
}

function archiveDatabase() {
	const prepared: string[] = [];
	const db = {
		prepare(sql: string) {
			prepared.push(sql);
			const statement = {
				bind() {
					return statement;
				},
				async all() {
					if (sql.includes("GROUP BY trending_date")) {
						return {
							results: [{ date: "2026-02-14", count: 1, scraped_at: "2026-02-14T06:00:00Z" }],
						};
					}
					if (sql.includes("ORDER BY daily_rank")) {
						return {
							results: [
								{
									repo_owner: "openai",
									repo_name: "codex",
									description: "Coding agent",
									language: "Rust",
									language_color: "#dea584",
									total_stars: 100,
									forks: 10,
									stars_today: 20,
									daily_rank: 1,
									topics_json: '["ai"]',
								},
							],
						};
					}
					return {
						results: [{ language: "Rust", color: "#dea584", count: 1 }],
					};
				},
			};
			return statement;
		},
	} as unknown as D1Database;
	return { db, prepared };
}

describe("ArchiveService", () => {
	it("shares cached daily view models across independent consumers", async () => {
		const { db, prepared } = archiveDatabase();
		const { kv, puts } = cacheStore();
		const firstConsumer = createArchiveService({ DB: db, CACHE: kv }, { today: "2026-02-15" });

		const first = await firstConsumer.getDailyArchive({ mode: "exact", date: "2026-02-14" });
		expect(first.repos[0]).toMatchObject({ repo_owner: "openai", topics: ["ai"] });
		expect(first.languages[0].percentage).toBe(100);
		expect(puts).toEqual([
			"archive:index:v1",
			"trending:daily:v2:2026-02-14",
			"languages:2026-02-14",
		]);

		const unavailableDb = {
			prepare() {
				throw new Error("D1 should not be read after the shared cache is populated");
			},
		} as unknown as D1Database;
		const secondConsumer = createArchiveService(
			{ DB: unavailableDb, CACHE: kv },
			{ today: "2026-02-15" },
		);
		const second = await secondConsumer.getDailyArchive({ mode: "exact", date: "2026-02-14" });

		expect(second).toEqual(first);
		expect(prepared).toHaveLength(3);
	});

	it("uses one comparison validation contract before any data access", async () => {
		const unavailableDb = {
			prepare() {
				throw new Error("validation should happen before data access");
			},
		} as unknown as D1Database;
		const archive = createArchiveService({ DB: unavailableDb }, { today: "2026-02-15" });

		const error = await archive.getComparison("2026-02-15", "2026-02-14").catch((reason) => reason);
		expect(error).toBeInstanceOf(ArchiveValidationError);
		expect(error).toMatchObject({ code: "comparison_order", status: 400 });
	});
});
