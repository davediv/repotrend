export const ANALYTICS_EVENTS = [
	"search_submit",
	"archive_date_change",
	"empty_state_view",
	"comparison_complete",
	"outbound_github_click",
] as const;

export type AnalyticsEventName = (typeof ANALYTICS_EVENTS)[number];

export interface AnalyticsPayload {
	event: AnalyticsEventName;
	surface: string;
	path: string;
}

const eventNames = new Set<string>(ANALYTICS_EVENTS);
const SURFACE_PATTERN = /^[a-z0-9_-]{1,40}$/;

export function parseAnalyticsPayload(value: unknown): AnalyticsPayload | null {
	if (!value || typeof value !== "object" || Array.isArray(value)) return null;
	const payload = value as Record<string, unknown>;
	if (typeof payload.event !== "string" || !eventNames.has(payload.event)) return null;
	if (typeof payload.surface !== "string" || !SURFACE_PATTERN.test(payload.surface)) return null;
	if (
		typeof payload.path !== "string" ||
		!payload.path.startsWith("/") ||
		payload.path.includes("?") ||
		payload.path.length > 200
	) {
		return null;
	}

	return payload as unknown as AnalyticsPayload;
}
