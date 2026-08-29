import { describe, expect, it } from "vitest";
import {
	archivePeriodHref,
	getAdjacentArchivePeriods,
	getAvailableArchivePeriods,
} from "../src/lib/archive-navigation";

const dates = ["2026-02-09", "2026-02-10", "2026-02-12", "2026-03-02"];

describe("archive navigation", () => {
	it("finds the nearest captured daily dates", () => {
		expect(getAdjacentArchivePeriods(dates, "2026-02-10", "daily")).toEqual({
			periods: dates,
			previous: "2026-02-09",
			next: "2026-02-12",
		});
	});

	it("finds neighbors when the selected date was not captured", () => {
		expect(getAdjacentArchivePeriods(dates, "2026-02-11", "daily")).toMatchObject({
			previous: "2026-02-10",
			next: "2026-02-12",
		});
	});

	it("deduplicates daily captures into available weekly periods", () => {
		expect(getAvailableArchivePeriods(dates, "weekly")).toEqual(["2026-02-09", "2026-03-02"]);
		expect(getAdjacentArchivePeriods(dates, "2026-02-12", "weekly")).toMatchObject({
			previous: null,
			next: "2026-03-02",
		});
	});

	it("builds mode-specific canonical URLs", () => {
		expect(archivePeriodHref("2026-02-12", "daily")).toBe("/trending/2026-02-12");
		expect(archivePeriodHref("2026-02-09", "weekly")).toBe("/trending/week/2026-02-09");
	});
});
