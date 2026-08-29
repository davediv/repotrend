import { describe, expect, it } from "vitest";
import { resolveDailyArchiveSelection } from "../src/lib/daily-archive";
import type { DateRepoCount } from "../src/lib/trending";

const snapshots: DateRepoCount[] = [
	{ date: "2026-02-13", count: 25, scraped_at: "2026-02-13T06:00:00Z" },
	{ date: "2026-02-15", count: 25, scraped_at: "2026-02-15T06:00:00Z" },
	{ date: "2026-02-14", count: 25, scraped_at: "2026-02-14T06:00:00Z" },
];

describe("resolveDailyArchiveSelection", () => {
	it("resolves the latest captured date without selecting a future snapshot", () => {
		expect(
			resolveDailyArchiveSelection(snapshots, {
				mode: "latest",
				throughDate: "2026-02-14",
			}),
		).toEqual({ selectedDate: "2026-02-14", snapshot: snapshots[2] });
	});

	it("uses the requested date for an exact archive view", () => {
		expect(resolveDailyArchiveSelection(snapshots, { mode: "exact", date: "2026-02-13" })).toEqual({
			selectedDate: "2026-02-13",
			snapshot: snapshots[0],
		});
	});

	it("preserves an uncaptured exact date for its no-data state", () => {
		expect(resolveDailyArchiveSelection(snapshots, { mode: "exact", date: "2026-02-12" })).toEqual({
			selectedDate: "2026-02-12",
			snapshot: null,
		});
	});

	it("falls back to the requested through-date when the archive is empty", () => {
		expect(resolveDailyArchiveSelection([], { mode: "latest", throughDate: "2026-02-15" })).toEqual(
			{ selectedDate: "2026-02-15", snapshot: null },
		);
	});
});
