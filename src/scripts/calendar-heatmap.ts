import { formatWeekRange, getMondayOfWeek, parseDate, toDateString } from "../lib/dates";
import type { DateRepoCount } from "../lib/trending";

const DOW_LABELS = ["Mon", "", "Wed", "", "Fri", "", ""];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const monthFormatter = new Intl.DateTimeFormat("en-US", { month: "short" });
const tooltipFormatter = new Intl.DateTimeFormat("en-US", {
	month: "short",
	day: "numeric",
	year: "numeric",
});

interface Cell {
	date: string;
	count: number;
}

function parseDateCounts(value: string | undefined): DateRepoCount[] {
	if (!value) return [];

	const parsed: unknown = JSON.parse(value);
	if (!Array.isArray(parsed)) return [];

	return parsed.filter(
		(item): item is DateRepoCount =>
			typeof item === "object" &&
			item !== null &&
			"date" in item &&
			typeof item.date === "string" &&
			DATE_RE.test(item.date) &&
			"count" in item &&
			typeof item.count === "number" &&
			Number.isFinite(item.count),
	);
}

function intensityLevel(count: number): number {
	if (count === 0) return 0;
	if (count <= 6) return 1;
	if (count <= 12) return 2;
	if (count <= 18) return 3;
	return 4;
}

function tooltip(date: string, count: number): string {
	const formatted = tooltipFormatter.format(parseDate(date));
	return count === 0
		? `No data on ${formatted}`
		: `${count} ${count === 1 ? "repo" : "repos"} on ${formatted}`;
}

function createLabeledSpan(className: string, text: string): HTMLSpanElement {
	const element = document.createElement("span");
	element.className = className;
	element.textContent = text;
	return element;
}

function buildWeeks(dateCounts: DateRepoCount[]): Cell[][] {
	const countMap = new Map(dateCounts.map(({ date, count }) => [date, count]));
	const latest = parseDate(dateCounts[dateCounts.length - 1].date);
	const startDate = parseDate(getMondayOfWeek(dateCounts[0].date));
	const endDate = new Date(latest);
	const endDayOfWeek = endDate.getDay();
	if (endDayOfWeek !== 0) endDate.setDate(endDate.getDate() + (7 - endDayOfWeek));

	const weeks: Cell[][] = [];
	const cursor = new Date(startDate);
	while (cursor <= endDate) {
		const week: Cell[] = [];
		for (let day = 0; day < 7; day++) {
			const date = toDateString(cursor);
			week.push({ date, count: countMap.get(date) ?? 0 });
			cursor.setDate(cursor.getDate() + 1);
		}
		weeks.push(week);
	}
	return weeks;
}

function buildHeatmapBody(
	weeks: Cell[][],
	selectedDate: string | undefined,
	viewMode: "daily" | "weekly",
): HTMLElement {
	const body = document.createElement("div");
	body.className = "heatmap-body";

	const dayLabels = document.createElement("div");
	dayLabels.className = "dow-labels";
	dayLabels.setAttribute("aria-hidden", "true");
	for (const label of DOW_LABELS) {
		dayLabels.appendChild(createLabeledSpan("dow-label", label));
	}
	body.appendChild(dayLabels);

	const scrollContainer = document.createElement("div");
	scrollContainer.className = "heatmap-scroll";

	const monthRow = document.createElement("div");
	monthRow.className = "month-row";
	monthRow.style.gridTemplateColumns = `repeat(${weeks.length}, var(--cell-size))`;
	let previousMonth = -1;
	for (let index = 0; index < weeks.length; index++) {
		const date = parseDate(weeks[index][0].date);
		if (date.getMonth() === previousMonth) continue;
		previousMonth = date.getMonth();
		const label = createLabeledSpan("month-label", monthFormatter.format(date));
		label.style.gridColumn = String(index + 1);
		monthRow.appendChild(label);
	}
	scrollContainer.appendChild(monthRow);

	const grid = document.createElement("div");
	grid.className = "cell-grid";
	grid.setAttribute("aria-label", "Archive activity by date");
	const selectedPeriod = selectedDate
		? viewMode === "weekly"
			? getMondayOfWeek(selectedDate)
			: selectedDate
		: undefined;

	for (const cell of weeks.flat()) {
		const destinationDate = viewMode === "weekly" ? getMondayOfWeek(cell.date) : cell.date;
		const tip = tooltip(cell.date, cell.count);
		const element = document.createElement(cell.count > 0 ? "a" : "span");
		element.className = `heatmap-cell level-${intensityLevel(cell.count)}`;
		if (destinationDate === selectedPeriod) element.classList.add("selected");
		element.title = tip;
		element.dataset.date = cell.date;

		if (element instanceof HTMLAnchorElement) {
			const href =
				viewMode === "weekly"
					? `/trending/week/${destinationDate}`
					: `/trending/${destinationDate}`;
			const label =
				viewMode === "weekly"
					? `${tip}. View weekly rollup for ${formatWeekRange(destinationDate)}.`
					: `${tip}. View daily snapshot.`;
			element.setAttribute("href", href);
			element.setAttribute("aria-label", label);
		} else {
			element.setAttribute("aria-hidden", "true");
		}
		grid.appendChild(element);
	}

	scrollContainer.appendChild(grid);
	body.appendChild(scrollContainer);
	return body;
}

function buildLegend(): HTMLElement {
	const legend = document.createElement("div");
	legend.className = "heatmap-legend";
	legend.setAttribute("aria-hidden", "true");
	legend.appendChild(createLabeledSpan("legend-text", "Less"));
	for (let level = 0; level <= 4; level++) {
		legend.appendChild(createLabeledSpan(`legend-cell level-${level}`, ""));
	}
	legend.appendChild(createLabeledSpan("legend-text", "More"));
	return legend;
}

export function renderCalendarHeatmap(heatmap: HTMLDetailsElement): void {
	if (heatmap.dataset.rendered === "true") return;

	const visualization = heatmap.querySelector<HTMLElement>(".heatmap-visualization");
	if (!visualization) return;

	const dateCounts = parseDateCounts(heatmap.dataset.dateCounts);
	if (dateCounts.length === 0) {
		throw new Error("Archive activity data is missing or invalid");
	}

	const viewMode = heatmap.dataset.viewMode === "weekly" ? "weekly" : "daily";
	const weeks = buildWeeks(dateCounts);
	visualization.replaceChildren(
		buildHeatmapBody(weeks, heatmap.dataset.selectedDate, viewMode),
		buildLegend(),
	);
	heatmap.dataset.rendered = "true";
}
