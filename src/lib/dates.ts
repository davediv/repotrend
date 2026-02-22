const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Validate that a string is a real YYYY-MM-DD calendar date. */
export function isValidDate(value: string): boolean {
	if (!DATE_RE.test(value)) return false;
	const [year, month, day] = value.split("-").map(Number);
	const d = new Date(year, month - 1, day);
	return d.getFullYear() === year && d.getMonth() === month - 1 && d.getDate() === day;
}

/** Return today's date as YYYY-MM-DD in UTC. */
export function todayUTC(): string {
	const now = new Date();
	const y = now.getUTCFullYear();
	const m = String(now.getUTCMonth() + 1).padStart(2, "0");
	const d = String(now.getUTCDate()).padStart(2, "0");
	return `${y}-${m}-${d}`;
}

/** Format a YYYY-MM-DD string into a human-readable date like "February 22, 2026". */
export function formatDateDisplay(dateStr: string): string {
	const [year, month, day] = dateStr.split("-").map(Number);
	const date = new Date(year, month - 1, day);
	return new Intl.DateTimeFormat("en-US", {
		year: "numeric",
		month: "long",
		day: "numeric",
	}).format(date);
}

/** Convert a Date object to a YYYY-MM-DD string using local-time getters. */
export function toDateString(date: Date): string {
	const y = date.getFullYear();
	const m = String(date.getMonth() + 1).padStart(2, "0");
	const d = String(date.getDate()).padStart(2, "0");
	return `${y}-${m}-${d}`;
}

/** Return the Monday of the ISO week containing the given YYYY-MM-DD date. */
export function getMondayOfWeek(dateStr: string): string {
	const [year, month, day] = dateStr.split("-").map(Number);
	const d = new Date(year, month - 1, day);
	const dayOfWeek = d.getDay();
	// getDay(): 0=Sun, 1=Mon, ..., 6=Sat → offset to Monday
	const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
	d.setDate(d.getDate() + diff);
	return toDateString(d);
}

/** Return the Sunday (end) of the ISO week given the Monday date string. */
export function getSundayOfWeek(mondayStr: string): string {
	const [year, month, day] = mondayStr.split("-").map(Number);
	return toDateString(new Date(year, month - 1, day + 6));
}

/** Format a week range for display, e.g. "Feb 10 – Feb 16, 2026". */
export function formatWeekRange(dateStr: string): string {
	const monday = getMondayOfWeek(dateStr);
	const sunday = getSundayOfWeek(monday);
	const [my, mm, md] = monday.split("-").map(Number);
	const [sy, sm, sd] = sunday.split("-").map(Number);
	const monDate = new Date(my, mm - 1, md);
	const sunDate = new Date(sy, sm - 1, sd);

	const crossYear = my !== sy;
	const monFmt = new Intl.DateTimeFormat("en-US", {
		month: "short",
		day: "numeric",
		...(crossYear && { year: "numeric" }),
	});
	const sunFmt =
		my === sy && mm === sm
			? new Intl.DateTimeFormat("en-US", { day: "numeric", year: "numeric" })
			: new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });

	return `${monFmt.format(monDate)} – ${sunFmt.format(sunDate)}`;
}
