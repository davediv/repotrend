import {
	findLatestAvailableSnapshot,
	getDateRepoCounts,
	getLanguageDistribution,
	getTrendingRepos,
	type DateRepoCount,
	type LanguageDistribution,
	type TrendingRepo,
} from "./trending";

export type DailyArchiveSelection =
	| { mode: "latest"; throughDate: string }
	| { mode: "exact"; date: string };

export interface DailyArchiveData {
	selectedDate: string;
	snapshot: DateRepoCount | null;
	repos: TrendingRepo[];
	languages: LanguageDistribution[];
	dateCounts: DateRepoCount[];
}

/** Resolve a canonical date and matching snapshot for a daily archive request. */
export function resolveDailyArchiveSelection(
	dateCounts: readonly DateRepoCount[],
	selection: DailyArchiveSelection,
): Pick<DailyArchiveData, "selectedDate" | "snapshot"> {
	if (selection.mode === "latest") {
		const snapshot = findLatestAvailableSnapshot(dateCounts, selection.throughDate);
		return {
			selectedDate: snapshot?.date ?? selection.throughDate,
			snapshot,
		};
	}

	return {
		selectedDate: selection.date,
		snapshot: dateCounts.find(({ date }) => date === selection.date) ?? null,
	};
}

/** Load the shared data model used by both `/` and `/trending/:date`. */
export async function loadDailyArchive(
	db: D1Database,
	selection: DailyArchiveSelection,
): Promise<DailyArchiveData> {
	const dateCounts = await getDateRepoCounts(db);
	const resolved = resolveDailyArchiveSelection(dateCounts, selection);

	if (!resolved.snapshot) {
		return { ...resolved, repos: [], languages: [], dateCounts };
	}

	const [repos, languages] = await Promise.all([
		getTrendingRepos(db, resolved.selectedDate),
		getLanguageDistribution(db, resolved.selectedDate).catch(() => []),
	]);

	return { ...resolved, repos, languages, dateCounts };
}
