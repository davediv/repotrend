import type { TrendingRepo, WeeklyTrendingRepo } from "./trending";

/** Valid sort keys for trending repo lists. */
export type SortKey = "stars_today" | "total_stars" | "alpha";

/** All valid sort keys (used for validation). */
const VALID_SORT_KEYS = new Set<string>(["stars_today", "total_stars", "alpha"]);

/** Default sort key when none specified. */
export const DEFAULT_SORT: SortKey = "stars_today";

/** Sort option definition. */
export interface SortOption {
	value: SortKey;
	label: string;
}

/** Labels for the daily view sort dropdown. */
export const DAILY_SORT_OPTIONS: SortOption[] = [
	{ value: "stars_today", label: "Stars Gained Today" },
	{ value: "total_stars", label: "Total Stars" },
	{ value: "alpha", label: "Alphabetical (A\u2013Z)" },
];

/** Labels for the weekly view sort dropdown. */
export const WEEKLY_SORT_OPTIONS: SortOption[] = [
	{ value: "stars_today", label: "Trending Frequency" },
	{ value: "total_stars", label: "Total Stars" },
	{ value: "alpha", label: "Alphabetical (A\u2013Z)" },
];

/** Parse and validate a sort parameter from a URL query string. */
export function parseSortParam(raw: string | null): SortKey {
	if (raw && VALID_SORT_KEYS.has(raw)) return raw as SortKey;
	return DEFAULT_SORT;
}

/** Shared base type for repos with common sortable fields. */
type RepoBase = { repo_owner: string; repo_name: string; total_stars: number };

/** Compare two repos alphabetically by full name (owner/name). */
function compareAlpha(a: RepoBase, b: RepoBase): number {
	const nameA = `${a.repo_owner}/${a.repo_name}`.toLowerCase();
	const nameB = `${b.repo_owner}/${b.repo_name}`.toLowerCase();
	return nameA.localeCompare(nameB);
}

/** Generic repo sorter parameterised on the default-sort comparator. */
function sortRepos<T extends RepoBase>(
	repos: T[],
	sort: SortKey,
	defaultComparator: (a: T, b: T) => number,
): T[] {
	switch (sort) {
		case "stars_today":
			repos.sort(defaultComparator);
			break;
		case "total_stars":
			repos.sort((a, b) => b.total_stars - a.total_stars);
			break;
		case "alpha":
			repos.sort(compareAlpha);
			break;
	}
	return repos;
}

/** Sort daily trending repos in place. Returns the same array for convenience. */
export function sortDailyRepos(repos: TrendingRepo[], sort: SortKey): TrendingRepo[] {
	return sortRepos(repos, sort, (a, b) => b.stars_today - a.stars_today);
}

/** Sort weekly trending repos in place. Returns the same array for convenience. */
export function sortWeeklyRepos(repos: WeeklyTrendingRepo[], sort: SortKey): WeeklyTrendingRepo[] {
	return sortRepos(
		repos,
		sort,
		(a, b) => b.appearances - a.appearances || b.total_stars_gained - a.total_stars_gained,
	);
}
