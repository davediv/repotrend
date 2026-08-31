import { describe, expect, it } from "vitest";
import { escapeSearchLike, parseSearchRequest, searchArchive } from "../src/lib/search";
import type { SearchFilters } from "../src/lib/search-types";

describe("parseSearchRequest", () => {
	it("allows structured filters without a text query", () => {
		const parsed = parseSearchRequest(
			new URLSearchParams("topic=react&language=TypeScript&from=2026-02-01&to=2026-02-28"),
		);

		expect(parsed.error).toBeNull();
		expect(parsed.shouldSearch).toBe(true);
		expect(parsed.filters.topic).toBe("react");
	});

	it("does not execute a one-character text query by itself", () => {
		const parsed = parseSearchRequest(new URLSearchParams("q=a"));
		expect(parsed.shouldSearch).toBe(false);
		expect(parsed.error).toBeNull();
	});

	it("rejects reversed and invalid date ranges", () => {
		expect(
			parseSearchRequest(new URLSearchParams("from=2026-03-01&to=2026-02-01")).error,
		).toContain("on or before");
		expect(parseSearchRequest(new URLSearchParams("from=2026-02-30")).error).toContain("invalid");
	});
});

describe("escapeSearchLike", () => {
	it("escapes wildcards and the SQL escape character", () => {
		expect(escapeSearchLike("100%_done\\now")).toBe("100\\%\\_done\\\\now");
	});
});

describe("searchArchive", () => {
	it("returns results and their total with one database query", async () => {
		const prepared: string[] = [];
		const bindings: unknown[][] = [];
		const db = {
			prepare(sql: string) {
				prepared.push(sql);
				const statement = {
					bind(...values: unknown[]) {
						bindings.push(values);
						return statement;
					},
					async all() {
						return {
							results: [
								{
									repo_owner: "facebook",
									repo_name: "react",
									description: "UI library",
									language: "JavaScript",
									language_color: "#f1e05a",
									total_stars: 200_000,
									forks: 40_000,
									stars_today: 100,
									topics_json: '["react"]',
									dates_csv: "2026-02-15,2026-02-14",
									total: 1,
								},
							],
						};
					},
				};
				return statement;
			},
		} as unknown as D1Database;
		const filters: SearchFilters = {
			query: "react",
			topic: "",
			language: "",
			from: "",
			to: "",
			page: 1,
		};

		const result = await searchArchive(db, filters);

		expect(prepared).toHaveLength(1);
		expect(prepared[0]).toContain("stats AS");
		expect(bindings[0].slice(-2)).toEqual([20, 1]);
		expect(result.pagination).toMatchObject({ totalItems: 1, currentPage: 1 });
		expect(result.results[0]).toMatchObject({
			repo_owner: "facebook",
			repo_name: "react",
			topics: ["react"],
			dates: ["2026-02-15", "2026-02-14"],
		});
	});
});
