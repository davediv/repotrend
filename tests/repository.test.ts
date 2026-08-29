import { describe, expect, it } from "vitest";
import {
	getRepositoryArchive,
	githubRepositoryUrl,
	isValidRepositoryPath,
	repositoryPath,
} from "../src/lib/repository";

function repositoryDb(rows: unknown[]) {
	const calls = { sql: "", bindings: [] as unknown[] };
	const db = {
		prepare(sql: string) {
			calls.sql = sql;
			const statement = {
				bind(...bindings: unknown[]) {
					calls.bindings = bindings;
					return statement;
				},
				async all() {
					return { results: rows };
				},
			};
			return statement;
		},
	} as unknown as D1Database;
	return { db, calls };
}

const baseRow = {
	repo_owner: "openai",
	repo_name: "codex",
	description: "Coding agent",
	language: "Rust",
	language_color: "#dea584",
	topics_json: '["ai","developer-tools"]',
	total_stars: 120,
	forks: 12,
	stars_today: 20,
	daily_rank: 3,
	trending_date: "2026-02-15",
	scraped_at: "2026-02-15T06:00:00Z",
};

describe("repository archive", () => {
	it("builds a newest-first repository view model with historical metrics", async () => {
		const { db, calls } = repositoryDb([
			baseRow,
			{
				...baseRow,
				total_stars: 100,
				forks: 10,
				stars_today: 15,
				daily_rank: 7,
				trending_date: "2026-02-14",
				scraped_at: "2026-02-14T06:00:00Z",
			},
		]);

		const archive = await getRepositoryArchive(db, "openai", "codex");

		expect(calls.bindings).toEqual(["openai", "codex"]);
		expect(calls.sql).toContain("ORDER BY trending_date DESC");
		expect(archive).toMatchObject({
			appearance_count: 2,
			first_appearance: "2026-02-14",
			latest_appearance: "2026-02-15",
			best_rank: 3,
			total_stars_gained: 35,
			star_change: 20,
			topics: ["ai", "developer-tools"],
		});
		expect(archive?.appearances.map(({ date }) => date)).toEqual(["2026-02-15", "2026-02-14"]);
	});

	it("returns null when a repository has never been captured", async () => {
		const { db } = repositoryDb([]);
		await expect(getRepositoryArchive(db, "missing", "repo")).resolves.toBeNull();
	});

	it("validates and encodes repository destinations", () => {
		expect(isValidRepositoryPath("openai", "codex")).toBe(true);
		expect(isValidRepositoryPath("bad/owner", "repo")).toBe(false);
		expect(repositoryPath("owner name", "repo.name")).toBe("/repos/owner%20name/repo.name");
		expect(githubRepositoryUrl("openai", "codex")).toBe("https://github.com/openai/codex");
	});
});
