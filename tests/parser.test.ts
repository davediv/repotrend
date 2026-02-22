import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseFormattedNumber, parseTrendingPage } from "../src/lib/scraper/parser";

function loadFixture(name: string): string {
	return readFileSync(resolve(import.meta.dirname, "fixtures", name), "utf-8");
}

describe("parseTrendingPage", () => {
	it("parses a full page of 25 repos", () => {
		const repos = parseTrendingPage(loadFixture("trending-full-25.html"));
		expect(repos).toHaveLength(25);
	});

	describe("standard page with 3 repos", () => {
		const repos = parseTrendingPage(loadFixture("trending-page.html"));

		it("produces a complete ParsedRepo object", () => {
			expect(repos[0]).toEqual({
				repo_owner: "facebook",
				repo_name: "react",
				description: "The library for web and native user interfaces.",
				language: "JavaScript",
				language_color: "#f1e05a",
				total_stars: 234567,
				forks: 48123,
				stars_today: 1234,
			});
		});

		it("extracts correct repo owner and name", () => {
			expect(repos[0].repo_owner).toBe("facebook");
			expect(repos[0].repo_name).toBe("react");
			expect(repos[1].repo_owner).toBe("microsoft");
			expect(repos[1].repo_name).toBe("typescript");
			expect(repos[2].repo_owner).toBe("torvalds");
			expect(repos[2].repo_name).toBe("linux");
		});

		it("extracts descriptions", () => {
			expect(repos[0].description).toBe("The library for web and native user interfaces.");
			expect(repos[1].description).toBe(
				"TypeScript is a superset of JavaScript that compiles to clean JavaScript output.",
			);
			expect(repos[2].description).toBe("Linux kernel source tree");
		});

		it("extracts programming language", () => {
			expect(repos[0].language).toBe("JavaScript");
			expect(repos[1].language).toBe("TypeScript");
			expect(repos[2].language).toBe("C");
		});

		it("extracts language color", () => {
			expect(repos[0].language_color).toBe("#f1e05a");
			expect(repos[1].language_color).toBe("#3178c6");
			expect(repos[2].language_color).toBe("#555555");
		});

		it("extracts star counts with commas", () => {
			expect(repos[0].total_stars).toBe(234567);
			expect(repos[1].total_stars).toBe(102345);
			expect(repos[2].total_stars).toBe(189012);
		});

		it("extracts fork counts", () => {
			expect(repos[0].forks).toBe(48123);
			expect(repos[1].forks).toBe(12456);
			expect(repos[2].forks).toBe(56789);
		});

		it("extracts stars-today counts", () => {
			expect(repos[0].stars_today).toBe(1234);
			expect(repos[1].stars_today).toBe(567);
			expect(repos[2].stars_today).toBe(890);
		});
	});

	describe("missing optional fields", () => {
		const repos = parseTrendingPage(loadFixture("trending-missing-fields.html"));

		it("returns null description when no p.col-9 element", () => {
			expect(repos[0].description).toBeNull();
		});

		it("returns null language when no programmingLanguage element", () => {
			expect(repos[1].language).toBeNull();
			expect(repos[1].language_color).toBeNull();
		});

		it("returns null for both description and language when missing", () => {
			expect(repos[2].description).toBeNull();
			expect(repos[2].language).toBeNull();
			expect(repos[2].language_color).toBeNull();
		});

		it("returns null description for whitespace-only p.col-9", () => {
			expect(repos[3].description).toBeNull();
		});

		it("still parses other fields when optional fields are missing", () => {
			// no-desc-repo
			expect(repos[0].repo_owner).toBe("user");
			expect(repos[0].repo_name).toBe("no-desc-repo");
			expect(repos[0].total_stars).toBe(500);
			expect(repos[0].forks).toBe(100);
			expect(repos[0].stars_today).toBe(50);

			// no-lang-repo
			expect(repos[1].repo_owner).toBe("user");
			expect(repos[1].repo_name).toBe("no-lang-repo");
			expect(repos[1].description).toBe("A repo without a programming language tag.");
			expect(repos[1].total_stars).toBe(300);

			// bare-repo (no desc, no lang)
			expect(repos[2].repo_owner).toBe("user");
			expect(repos[2].repo_name).toBe("bare-repo");
			expect(repos[2].total_stars).toBe(150);
			expect(repos[2].forks).toBe(5);
			expect(repos[2].stars_today).toBe(3);
		});
	});

	describe("star count formats", () => {
		const repos = parseTrendingPage(loadFixture("trending-star-formats.html"));

		it("parses comma-separated star counts", () => {
			expect(repos[0].total_stars).toBe(51595);
			expect(repos[0].forks).toBe(8234);
			expect(repos[0].stars_today).toBe(1234);
		});

		it("parses plain number star counts", () => {
			expect(repos[1].total_stars).toBe(456);
			expect(repos[1].forks).toBe(23);
			expect(repos[1].stars_today).toBe(89);
		});

		it("parses singular 'star today'", () => {
			expect(repos[2].stars_today).toBe(1);
		});
	});

	describe("error handling", () => {
		it("throws for empty page (no article.Box-row elements)", () => {
			expect(() => parseTrendingPage(loadFixture("trending-empty.html"))).toThrow(
				"no repository rows found",
			);
		});

		it("throws for completely empty HTML", () => {
			expect(() => parseTrendingPage("")).toThrow("no repository rows found");
		});

		it("throws for HTML with no Box-row articles", () => {
			expect(() => parseTrendingPage("<html><body><div>nothing here</div></body></html>")).toThrow(
				"no repository rows found",
			);
		});

		it("throws when article has no heading link", () => {
			const html = `<article class="Box-row"><div>no h2 link</div></article>`;
			expect(() => parseTrendingPage(html)).toThrow("missing heading link");
		});

		it("throws when heading link has no href", () => {
			const html = `<article class="Box-row"><h2><a>no href</a></h2></article>`;
			expect(() => parseTrendingPage(html)).toThrow("heading link has no href");
		});

		it("throws when href has invalid format (single segment)", () => {
			const html = `<article class="Box-row"><h2><a href="/only-one-part">bad</a></h2></article>`;
			expect(() => parseTrendingPage(html)).toThrow("Failed to parse repo name from href");
		});
	});

	describe("edge cases", () => {
		it("returns null language when programmingLanguage element has empty text", () => {
			const html = `
				<article class="Box-row">
					<h2><a href="/user/empty-lang">user / empty-lang</a></h2>
					<span itemprop="programmingLanguage">   </span>
				</article>
			`;
			const repos = parseTrendingPage(html);
			expect(repos[0].language).toBeNull();
		});

		it("returns null language_color when style has no valid hex", () => {
			const html = `
				<article class="Box-row">
					<h2><a href="/user/bad-color">user / bad-color</a></h2>
					<span class="repo-language-color" style="background-color: rgb(0,0,0)"></span>
				</article>
			`;
			const repos = parseTrendingPage(html);
			expect(repos[0].language_color).toBeNull();
		});

		it("returns null language_color when repo-language-color has no style", () => {
			const html = `
				<article class="Box-row">
					<h2><a href="/user/no-style">user / no-style</a></h2>
					<span class="repo-language-color"></span>
				</article>
			`;
			const repos = parseTrendingPage(html);
			expect(repos[0].language_color).toBeNull();
		});

		it("parses 3-digit shorthand hex color", () => {
			const html = `
				<article class="Box-row">
					<h2><a href="/user/short-hex">user / short-hex</a></h2>
					<span class="repo-language-color" style="background-color: #fff"></span>
				</article>
			`;
			const repos = parseTrendingPage(html);
			expect(repos[0].language_color).toBe("#fff");
		});

		it("returns 0 stars_today when float-sm-right span has non-matching text", () => {
			const html = `
				<article class="Box-row">
					<h2><a href="/user/no-match">user / no-match</a></h2>
					<span class="float-sm-right">built by</span>
				</article>
			`;
			const repos = parseTrendingPage(html);
			expect(repos[0].stars_today).toBe(0);
		});

		it("returns 0 for missing star/fork/stars-today elements", () => {
			const html = `
				<article class="Box-row">
					<h2><a href="/user/minimal">user / minimal</a></h2>
				</article>
			`;
			const repos = parseTrendingPage(html);
			expect(repos[0].total_stars).toBe(0);
			expect(repos[0].forks).toBe(0);
			expect(repos[0].stars_today).toBe(0);
		});
	});
});

describe("parseFormattedNumber", () => {
	it("parses plain integers", () => {
		expect(parseFormattedNumber("123")).toBe(123);
		expect(parseFormattedNumber("0")).toBe(0);
		expect(parseFormattedNumber("1")).toBe(1);
	});

	it("parses comma-separated numbers", () => {
		expect(parseFormattedNumber("1,234")).toBe(1234);
		expect(parseFormattedNumber("51,595")).toBe(51595);
		expect(parseFormattedNumber("1,234,567")).toBe(1234567);
	});

	it("parses k-abbreviated numbers", () => {
		expect(parseFormattedNumber("1.2k")).toBe(1200);
		expect(parseFormattedNumber("3.5k")).toBe(3500);
		expect(parseFormattedNumber("10k")).toBe(10000);
		expect(parseFormattedNumber("1.5K")).toBe(1500);
	});

	it("handles whitespace", () => {
		expect(parseFormattedNumber("  123  ")).toBe(123);
		expect(parseFormattedNumber("  1,234  ")).toBe(1234);
		expect(parseFormattedNumber("  1.2k  ")).toBe(1200);
	});

	it("returns 0 for non-numeric strings", () => {
		expect(parseFormattedNumber("")).toBe(0);
		expect(parseFormattedNumber("abc")).toBe(0);
		expect(parseFormattedNumber("   ")).toBe(0);
	});

	it("handles numbers with surrounding whitespace/newlines", () => {
		expect(parseFormattedNumber("\n 234,567\n ")).toBe(234567);
	});

	it("truncates bare decimal without k suffix via parseInt", () => {
		expect(parseFormattedNumber("1.5")).toBe(1);
	});
});
