import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseAnalyticsPayload } from "../src/lib/analytics";
import { POST as postEvent } from "../src/pages/api/events";

function eventContext(body: string, origin = "http://localhost") {
	const url = new URL("http://localhost/api/events");
	return {
		url,
		request: new Request(url, {
			method: "POST",
			headers: { "Content-Type": "application/json", Origin: origin },
			body,
		}),
		// biome-ignore lint/suspicious/noExplicitAny: minimal Astro APIContext for endpoint tests
	} as any;
}

describe("product analytics", () => {
	beforeEach(() => {
		vi.spyOn(console, "log").mockImplementation(() => {});
	});

	it("accepts only allowlisted, query-free aggregate event data", () => {
		expect(
			parseAnalyticsPayload({
				event: "comparison_complete",
				surface: "comparison_results",
				path: "/compare",
			}),
		).toEqual({
			event: "comparison_complete",
			surface: "comparison_results",
			path: "/compare",
		});
		expect(
			parseAnalyticsPayload({
				event: "search_submit",
				surface: "search_page",
				path: "/search?q=private",
			}),
		).toBeNull();
		expect(
			parseAnalyticsPayload({ event: "arbitrary_event", surface: "page", path: "/" }),
		).toBeNull();
	});

	it("logs a valid same-origin event and returns no content", async () => {
		const response = await postEvent(
			eventContext(
				JSON.stringify({
					event: "archive_date_change",
					surface: "daily_previous",
					path: "/trending/2026-02-15",
				}),
			),
		);

		expect(response.status).toBe(204);
		expect(response.headers.get("Cache-Control")).toBe("no-store");
		expect(console.log).toHaveBeenCalledWith(expect.stringContaining('"event":"product_event"'));
	});

	it("rejects malformed, unknown, oversized, and cross-origin events", async () => {
		const invalidJson = await postEvent(eventContext("not-json"));
		expect(invalidJson.status).toBe(400);

		const unknown = await postEvent(
			eventContext(JSON.stringify({ event: "unknown", surface: "page", path: "/" })),
		);
		expect(unknown.status).toBe(400);

		const oversized = await postEvent(eventContext("x".repeat(2049)));
		expect(oversized.status).toBe(413);

		const crossOrigin = await postEvent(
			eventContext(
				JSON.stringify({ event: "search_submit", surface: "header", path: "/" }),
				"https://example.com",
			),
		);
		expect(crossOrigin.status).toBe(403);
	});
});
