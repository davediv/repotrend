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
	topics: string[];
	dates: string[];
}

export interface SearchFilters {
	query: string;
	topic: string;
	language: string;
	from: string;
	to: string;
	page: number;
}

/** Shape of the `/api/search` JSON response. */
export interface SearchResponse {
	results: SearchResult[];
	total: number;
	query: string;
	filters: Omit<SearchFilters, "query" | "page">;
	page: number;
	page_size: number;
	total_pages: number;
}
