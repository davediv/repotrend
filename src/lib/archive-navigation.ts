import { getMondayOfWeek } from "./dates";

export type ArchiveViewMode = "daily" | "weekly";

export interface AdjacentArchivePeriods {
	periods: string[];
	previous: string | null;
	next: string | null;
}

/** Return the unique available daily dates or weekly Monday periods in chronological order. */
export function getAvailableArchivePeriods(
	availableDates: readonly string[],
	viewMode: ArchiveViewMode,
): string[] {
	const periods = availableDates.map((date) =>
		viewMode === "weekly" ? getMondayOfWeek(date) : date,
	);
	return [...new Set(periods)].sort();
}

/** Find the nearest captured periods on either side of the current period. */
export function getAdjacentArchivePeriods(
	availableDates: readonly string[],
	currentDate: string,
	viewMode: ArchiveViewMode,
): AdjacentArchivePeriods {
	const periods = getAvailableArchivePeriods(availableDates, viewMode);
	const currentPeriod = viewMode === "weekly" ? getMondayOfWeek(currentDate) : currentDate;
	let previous: string | null = null;
	let next: string | null = null;

	for (const period of periods) {
		if (period < currentPeriod) previous = period;
		if (period > currentPeriod) {
			next = period;
			break;
		}
	}

	return { periods, previous, next };
}

/** Build the canonical archive URL for a daily date or weekly Monday period. */
export function archivePeriodHref(period: string, viewMode: ArchiveViewMode): string {
	return viewMode === "weekly" ? `/trending/week/${period}` : `/trending/${period}`;
}
