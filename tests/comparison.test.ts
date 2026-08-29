import { describe, expect, it } from "vitest";
import {
	buildComparisonRows,
	comparisonCounts,
	filterComparisonRows,
	resolveComparisonSelection,
} from "../src/lib/comparison";
import type { TrendingRepo } from "../src/lib/trending";

function repository(owner: string, name: string, totalStars: number): TrendingRepo {
	return {
		repo_owner: owner,
		repo_name: name,
		description: null,
		language: "TypeScript",
		language_color: "#3178c6",
		total_stars: totalStars,
		forks: 10,
		stars_today: 5,
	};
}

describe("buildComparisonRows", () => {
	it("aligns shared, added, and removed repositories with deltas", () => {
		const shared = repository("org", "shared", 100);
		const removed = repository("org", "removed", 50);
		const added = repository("org", "added", 75);
		const rows = buildComparisonRows([removed, shared], [{ ...shared, total_stars: 125 }, added]);

		expect(comparisonCounts(rows)).toEqual({ all: 3, both: 1, added: 1, removed: 1 });
		const sharedRow = rows.find(({ status }) => status === "both");
		expect(sharedRow?.rankChange).toBe(1);
		expect(sharedRow?.starDelta).toBe(25);
		expect(filterComparisonRows(rows, "added")).toHaveLength(1);
	});
});

describe("resolveComparisonSelection", () => {
	const dates = ["2026-02-09", "2026-02-10", "2026-02-12"];

	it("prefills the latest two available snapshots", () => {
		expect(resolveComparisonSelection(dates)).toEqual({
			date1: "2026-02-10",
			date2: "2026-02-12",
		});
	});

	it("pairs a contextual second date with its nearest previous snapshot", () => {
		expect(resolveComparisonSelection(dates, "", "2026-02-10")).toEqual({
			date1: "2026-02-09",
			date2: "2026-02-10",
		});
	});
});
