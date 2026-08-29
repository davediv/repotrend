import type { APIRoute } from "astro";
import { createArchiveService } from "../lib/archive-service";
import { repositoryPath, type RepositoryIdentity } from "../lib/repository";

export const prerender = false;

function escapeXml(s: string): string {
	return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export const GET: APIRoute = async ({ locals, site }) => {
	const origin = site?.origin ?? "https://repotrend.dev";

	let dates: string[] = [];
	let repositories: RepositoryIdentity[] = [];
	const archive = createArchiveService(locals.runtime.env);
	const [archiveIndex, repositoryIndex] = await Promise.allSettled([
		archive.getArchiveIndex(),
		archive.getRepositoryIndex(),
	]);
	if (archiveIndex.status === "fulfilled") dates = archiveIndex.value.dates;
	if (repositoryIndex.status === "fulfilled") repositories = repositoryIndex.value;

	const urls: { loc: string; lastmod?: string; changefreq: string; priority: string }[] = [];

	// Homepage
	urls.push({
		loc: `${origin}/`,
		lastmod: dates[dates.length - 1],
		changefreq: "daily",
		priority: "1.0",
	});
	for (const path of ["/trending", "/search", "/compare", "/about"]) {
		urls.push({
			loc: `${origin}${path}`,
			changefreq: path === "/about" ? "monthly" : "daily",
			priority: path === "/trending" ? "0.9" : "0.6",
		});
	}

	// Daily trending pages
	for (const date of dates) {
		urls.push({
			loc: `${origin}/trending/${date}`,
			changefreq: "never",
			priority: "0.8",
		});
	}

	for (const repository of repositories) {
		urls.push({
			loc: `${origin}${repositoryPath(repository.repo_owner, repository.repo_name)}`,
			changefreq: "daily",
			priority: "0.7",
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
