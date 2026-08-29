import { describe, expect, it } from "vitest";
import { escapeSearchLike, parseSearchRequest } from "../src/lib/search";

describe("parseSearchRequest", () => {
	it("allows structured filters without a text query", () => {
		const parsed = parseSearchRequest(
			new URLSearchParams("topic=react&language=TypeScript&from=2026-02-01&to=2026-02-28"),
		);

		expect(parsed.error).toBeNull();
		expect(parsed.shouldSearch).toBe(true);
		expect(parsed.filters.topic).toBe("react");
	});

	it("does not execute a one-character text query by itself", () => {
		const parsed = parseSearchRequest(new URLSearchParams("q=a"));
		expect(parsed.shouldSearch).toBe(false);
		expect(parsed.error).toBeNull();
	});

	it("rejects reversed and invalid date ranges", () => {
		expect(
			parseSearchRequest(new URLSearchParams("from=2026-03-01&to=2026-02-01")).error,
		).toContain("on or before");
		expect(parseSearchRequest(new URLSearchParams("from=2026-02-30")).error).toContain("invalid");
	});
});

describe("escapeSearchLike", () => {
	it("escapes wildcards and the SQL escape character", () => {
		expect(escapeSearchLike("100%_done\\now")).toBe("100\\%\\_done\\\\now");
	});
});
