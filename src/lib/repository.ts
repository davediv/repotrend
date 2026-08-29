import { parseTopicsJson } from "./trending";

const OWNER_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
const REPOSITORY_PATTERN = /^[A-Za-z0-9._-]{1,100}$/;

export interface RepositoryIdentity {
	repo_owner: string;
	repo_name: string;
}

export interface RepositoryAppearance {
	date: string;
	scraped_at: string;
	rank: number | null;
	stars_gained: number;
	total_stars: number;
	forks: number;
}

export interface RepositoryArchive extends RepositoryIdentity {
	description: string | null;
	language: string | null;
	language_color: string | null;
	topics: string[];
	appearances: RepositoryAppearance[];
	appearance_count: number;
	first_appearance: string;
	latest_appearance: string;
	best_rank: number | null;
	total_stars_gained: number;
	star_change: number;
	latest_total_stars: number;
	latest_forks: number;
}

interface RepositoryHistoryRow extends RepositoryIdentity {
	description: string | null;
	language: string | null;
	language_color: string | null;
	topics_json: string | null;
	total_stars: number;
	forks: number;
	stars_today: number;
	daily_rank: number | null;
	trending_date: string;
	scraped_at: string;
}

export function isValidRepositoryPath(
	owner: string | undefined,
	repo: string | undefined,
): boolean {
	return Boolean(owner && repo && OWNER_PATTERN.test(owner) && REPOSITORY_PATTERN.test(repo));
}

export function repositoryPath(owner: string, repo: string): string {
	return `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
}

export function githubRepositoryUrl(owner: string, repo: string): string {
	return `https://github.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
}

/** Return the complete captured history for one repository, newest appearance first. */
export async function getRepositoryArchive(
	db: D1Database,
	owner: string,
	repo: string,
): Promise<RepositoryArchive | null> {
	const { results } = await db
		.prepare(
			`SELECT
				repo_owner,
				repo_name,
				description,
				language,
				language_color,
				topics_json,
				total_stars,
				forks,
				stars_today,
				daily_rank,
				trending_date,
				scraped_at
			FROM trending_repos
			WHERE repo_owner = ? AND repo_name = ?
			ORDER BY trending_date DESC`,
		)
		.bind(owner, repo)
		.all<RepositoryHistoryRow>();

	const latest = results[0];
	const earliest = results[results.length - 1];
	if (!latest || !earliest) return null;

	const appearances = results.map((row) => ({
		date: row.trending_date,
		scraped_at: row.scraped_at,
		rank: row.daily_rank,
		stars_gained: row.stars_today,
		total_stars: row.total_stars,
		forks: row.forks,
	}));
	const rankedAppearances = appearances.flatMap(({ rank }) =>
		rank !== null && rank > 0 ? [rank] : [],
	);

	return {
		repo_owner: latest.repo_owner,
		repo_name: latest.repo_name,
		description: latest.description,
		language: latest.language,
		language_color: latest.language_color,
		topics: parseTopicsJson(latest.topics_json),
		appearances,
		appearance_count: appearances.length,
		first_appearance: earliest.trending_date,
		latest_appearance: latest.trending_date,
		best_rank: rankedAppearances.length > 0 ? Math.min(...rankedAppearances) : null,
		total_stars_gained: appearances.reduce(
			(total, appearance) => total + appearance.stars_gained,
			0,
		),
		star_change: latest.total_stars - earliest.total_stars,
		latest_total_stars: latest.total_stars,
		latest_forks: latest.forks,
	};
}

/** Repository identities used for discovery surfaces such as the sitemap. */
export async function getRepositoryIdentities(db: D1Database): Promise<RepositoryIdentity[]> {
	const { results } = await db
		.prepare(
			`SELECT repo_owner, repo_name
			FROM repository_search
			ORDER BY repo_owner COLLATE NOCASE, repo_name COLLATE NOCASE`,
		)
		.all<RepositoryIdentity>();
	return results;
}
