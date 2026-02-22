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
