import { afterEach, describe, expect, it, vi } from "vitest";
import { onRequest } from "../src/middleware";

function middlewareContext(pathname: string): Parameters<typeof onRequest>[0] {
	return {
		url: new URL(pathname, "https://repotrend.dev"),
	} as unknown as Parameters<typeof onRequest>[0];
}

function expectResponse(response: unknown): asserts response is Response {
	expect(response).toBeInstanceOf(Response);
}

afterEach(() => {
	vi.restoreAllMocks();
});

describe("error-status middleware contract", () => {
	it("returns a safe HTML 500 response for unhandled page errors", async () => {
		vi.spyOn(console, "error").mockImplementation(() => {});

		const response = await onRequest(middlewareContext("/trending/2026-02-15"), async () => {
			throw new Error("database credentials leaked here");
		});
		expectResponse(response);
		const body = await response.text();

		expect(response.status).toBe(500);
		expect(response.headers.get("Content-Type")).toBe("text/html; charset=utf-8");
		expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
		expect(body).toContain("Something went wrong");
		expect(body).not.toContain("database credentials leaked here");
	});

	it("returns a safe JSON 500 response for unhandled API errors", async () => {
		vi.spyOn(console, "error").mockImplementation(() => {});

		const response = await onRequest(middlewareContext("/api/trending/2026-02-15"), async () => {
			throw new Error("database unavailable");
		});
		expectResponse(response);

		expect(response.status).toBe(500);
		expect(response.headers.get("Content-Type")).toBe("application/json");
		expect(await response.json()).toEqual({ error: "Internal server error" });
	});

	it("preserves downstream 404 responses and applies security headers", async () => {
		const response = await onRequest(middlewareContext("/missing"), async () => {
			return new Response("Not Found", { status: 404 });
		});
		expectResponse(response);

		expect(response.status).toBe(404);
		expect(response.headers.get("X-Frame-Options")).toBe("DENY");
		expect(await response.text()).toBe("Not Found");
	});
});
