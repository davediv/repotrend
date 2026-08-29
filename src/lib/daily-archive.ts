import {
	findLatestAvailableSnapshot,
	type DateRepoCount,
	type LanguageDistribution,
	type TrendingRepo,
} from "./trending";

export type DailyArchiveSelection =
	| { mode: "latest"; throughDate: string }
	| { mode: "exact"; date: string };

export type ArchiveResourceState = "ready" | "unavailable";

export interface ArchiveSupportState {
	languages: ArchiveResourceState;
	dateIndex: ArchiveResourceState;
}

export interface DailyArchiveData {
	selectedDate: string;
	snapshot: DateRepoCount | null;
	repos: TrendingRepo[];
	languages: LanguageDistribution[];
	dateCounts: DateRepoCount[];
	support: ArchiveSupportState;
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
