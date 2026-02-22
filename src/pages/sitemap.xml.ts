import type { APIRoute } from "astro";
import { getMondayOfWeek } from "../lib/dates";

export const prerender = false;

function escapeXml(s: string): string {
	return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export const GET: APIRoute = async ({ locals, site }) => {
	const origin = site?.origin ?? "https://repotrend.dev";
	const db = locals.runtime.env.DB;

	let dates: string[] = [];
	try {
		const { results } = await db
			.prepare(
				`SELECT DISTINCT trending_date
				 FROM trending_repos
				 ORDER BY trending_date ASC`,
			)
			.all<{ trending_date: string }>();
		dates = results.map((r) => r.trending_date);
	} catch {
		// Return a minimal sitemap with just the homepage on DB failure
	}

	// Collect unique week Mondays from all dates
	const weekMondays = new Set<string>();
	for (const date of dates) {
		weekMondays.add(getMondayOfWeek(date));
	}

	const urls: { loc: string; lastmod?: string; changefreq: string; priority: string }[] = [];

	// Homepage
	urls.push({
		loc: `${origin}/`,
		lastmod: dates[dates.length - 1],
		changefreq: "daily",
		priority: "1.0",
	});

	// Daily trending pages
	for (const date of dates) {
		urls.push({
			loc: `${origin}/trending/${date}`,
			changefreq: "never",
			priority: "0.8",
		});
	}

	// Weekly trending pages
	for (const monday of [...weekMondays].sort()) {
		urls.push({
			loc: `${origin}/trending/week/${monday}`,
			changefreq: "weekly",
			priority: "0.6",
		});
	}

	const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
	.map(
		(u) => `  <url>
    <loc>${escapeXml(u.loc)}</loc>${u.lastmod ? `\n    <lastmod>${escapeXml(u.lastmod)}</lastmod>` : ""}
    <changefreq>${escapeXml(u.changefreq)}</changefreq>
    <priority>${escapeXml(u.priority)}</priority>
  </url>`,
	)
	.join("\n")}
</urlset>`;

	return new Response(xml, {
		status: 200,
		headers: {
			"Content-Type": "application/xml",
			"Cache-Control": "public, max-age=3600, s-maxage=3600",
		},
	});
};
