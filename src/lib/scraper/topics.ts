import { logError, logWarn } from "../log";
import type { ParsedRepo } from "./parser";

const GITHUB_REPO_API_BASE = "https://api.github.com/repos";
const USER_AGENT =
	"RepoTrend/1.0 (+https://github.com/div-vik/repotrend; contact via repository issues)";
const TOPICS_FETCH_CONCURRENCY = 4;

interface RepoDetailsResponse {
	topics?: unknown;
}

function normalizeTopics(raw: unknown): string[] {
	if (!Array.isArray(raw)) return [];

	const deduped = new Set<string>();
	for (const entry of raw) {
		if (typeof entry !== "string") continue;
		const topic = entry.trim().toLowerCase();
		if (topic.length > 0) deduped.add(topic);
	}
	return [...deduped];
}

async function fetchRepoTopics(owner: string, repo: string): Promise<string[]> {
	const url = `${GITHUB_REPO_API_BASE}/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
	const response = await fetch(url, {
		headers: {
			Accept: "application/vnd.github+json",
			"X-GitHub-Api-Version": "2022-11-28",
			"User-Agent": USER_AGENT,
		},
	});

	if (response.status === 404) {
		return [];
	}

	if (!response.ok) {
		throw new Error(`GitHub repo API failed with HTTP ${response.status} ${response.statusText}`);
	}

	const json = (await response.json()) as RepoDetailsResponse;
	return normalizeTopics(json.topics);
}

/**
 * Enrich parsed trending repos with GitHub topics.
 *
 * Topics are best-effort: a failure on one (or all) repos does not fail the scrape.
 */
export async function enrichReposWithTopics(repos: ParsedRepo[]): Promise<ParsedRepo[]> {
	if (repos.length === 0) return repos;

	let failedCount = 0;

	for (let i = 0; i < repos.length; i += TOPICS_FETCH_CONCURRENCY) {
		const chunk = repos.slice(i, i + TOPICS_FETCH_CONCURRENCY);
		await Promise.all(
			chunk.map(async (repo) => {
				try {
					repo.topics = await fetchRepoTopics(repo.repo_owner, repo.repo_name);
				} catch (error) {
					failedCount++;
					repo.topics = [];
					logError("repo_topics_fetch_error", {
						repo: `${repo.repo_owner}/${repo.repo_name}`,
					})(error);
				}
			}),
		);
	}

	if (failedCount > 0) {
		logWarn("repo_topics_fetch_partial", {
			repoCount: repos.length,
			failedCount,
		});
	}

	return repos;
}
