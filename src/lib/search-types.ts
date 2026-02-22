/** Shape of a single grouped search result returned by `/api/search`. */
export interface SearchResult {
	repo_owner: string;
	repo_name: string;
	description: string | null;
	language: string | null;
	language_color: string | null;
	total_stars: number;
	forks: number;
	stars_today: number;
	dates: string[];
}

/** Shape of the `/api/search` JSON response. */
export interface SearchResponse {
	results: SearchResult[];
	total: number;
	query: string;
}
