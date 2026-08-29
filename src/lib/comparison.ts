import { repoKey, type TrendingRepo } from "./trending";

export type ComparisonStatus = "both" | "added" | "removed";
export type ComparisonView = "all" | ComparisonStatus;

export interface ComparisonSnapshot {
	repository: TrendingRepo;
	rank: number;
}

export interface ComparisonRow {
	key: string;
	status: ComparisonStatus;
	repository: TrendingRepo;
	first: ComparisonSnapshot | null;
	second: ComparisonSnapshot | null;
	/** Positive means the repository moved up in rank on the second date. */
	rankChange: number | null;
	/** Difference in total stars between the second and first snapshots. */
	starDelta: number | null;
}

export interface ComparisonCounts {
	all: number;
	both: number;
	added: number;
	removed: number;
}

export interface ComparisonSelection {
	date1: string;
	date2: string;
}

export function buildComparisonRows(
	firstRepositories: readonly TrendingRepo[],
	secondRepositories: readonly TrendingRepo[],
): ComparisonRow[] {
	const first = new Map(
		firstRepositories.map((repository, index) => [
			repoKey(repository),
			{ repository, rank: index + 1 },
		]),
	);
	const second = new Map(
		secondRepositories.map((repository, index) => [
			repoKey(repository),
			{ repository, rank: index + 1 },
		]),
	);
	const keys = [...second.keys(), ...first.keys()].filter(
		(key, index, allKeys) => allKeys.indexOf(key) === index,
	);

	return keys.map((key) => {
		const firstSnapshot = first.get(key) ?? null;
		const secondSnapshot = second.get(key) ?? null;
		const status: ComparisonStatus = firstSnapshot
			? secondSnapshot
				? "both"
				: "removed"
			: "added";
		const repository = secondSnapshot?.repository ?? firstSnapshot?.repository;
		if (!repository) {
			throw new Error(`Comparison row ${key} has no repository snapshot`);
		}

		return {
			key,
			status,
			repository,
			first: firstSnapshot,
			second: secondSnapshot,
			rankChange: firstSnapshot && secondSnapshot ? firstSnapshot.rank - secondSnapshot.rank : null,
			starDelta:
				firstSnapshot && secondSnapshot
					? secondSnapshot.repository.total_stars - firstSnapshot.repository.total_stars
					: null,
		};
	});
}

export function comparisonCounts(rows: readonly ComparisonRow[]): ComparisonCounts {
	const counts: ComparisonCounts = { all: 0, both: 0, added: 0, removed: 0 };
	for (const row of rows) {
		counts.all += 1;
		counts[row.status] += 1;
	}
	return counts;
}

export function parseComparisonView(raw: string | null): ComparisonView {
	return raw === "both" || raw === "added" || raw === "removed" ? raw : "all";
}

export function filterComparisonRows(
	rows: readonly ComparisonRow[],
	view: ComparisonView,
): ComparisonRow[] {
	return view === "all" ? [...rows] : rows.filter(({ status }) => status === view);
}

/** Resolve defaults and one-sided "Compare this date" entry points. */
export function resolveComparisonSelection(
	availableDates: readonly string[],
	requestedDate1 = "",
	requestedDate2 = "",
): ComparisonSelection {
	const dates = [...new Set(availableDates)].sort();
	const latest = dates[dates.length - 1] ?? "";
	const previous = dates[dates.length - 2] ?? "";

	if (requestedDate1 && requestedDate2) {
		return { date1: requestedDate1, date2: requestedDate2 };
	}

	if (requestedDate2) {
		const nearestBefore = [...dates].reverse().find((date) => date < requestedDate2) ?? "";
		const alternative = nearestBefore || dates.find((date) => date !== requestedDate2) || "";
		return { date1: alternative, date2: requestedDate2 };
	}

	if (requestedDate1) {
		const nearestAfter = dates.find((date) => date > requestedDate1) ?? "";
		const alternative =
			nearestAfter || [...dates].reverse().find((date) => date !== requestedDate1) || "";
		return { date1: requestedDate1, date2: alternative };
	}

	return { date1: previous, date2: latest };
}
