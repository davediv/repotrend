/** Default number of items per page. */
export const PAGE_SIZE = 25;

/** Computed pagination state. */
export interface PaginationInfo {
	/** Current page number (1-based). */
	currentPage: number;
	/** Total number of pages. */
	totalPages: number;
	/** Total number of items across all pages. */
	totalItems: number;
	/** Items for the current page. */
	startIndex: number;
	/** One past the last item index for the current page. */
	endIndex: number;
}

/**
 * Parse and validate a page number from a URL query parameter.
 * Returns 1 for missing or non-numeric values. Upper-bound clamping
 * is handled by `paginate()` so callers don't need to pre-compute totalPages.
 */
export function parsePageParam(raw: string | null): number {
	if (!raw) return 1;
	const n = Number.parseInt(raw, 10);
	if (!Number.isFinite(n) || n < 1) return 1;
	return n;
}

/** Calculate pagination info for a given total item count and page number. */
export function paginate(totalItems: number, page: number): PaginationInfo {
	const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));
	const currentPage = Math.max(1, Math.min(page, totalPages));
	const startIndex = (currentPage - 1) * PAGE_SIZE;
	const endIndex = Math.min(startIndex + PAGE_SIZE, totalItems);

	return { currentPage, totalPages, totalItems, startIndex, endIndex };
}

/**
 * Generate the array of page numbers to display in the pagination control.
 * Always includes first/last pages and pages around the current page,
 * using `null` to represent ellipsis gaps.
 */
export function pageNumbers(currentPage: number, totalPages: number): (number | null)[] {
	if (totalPages <= 7) {
		return Array.from({ length: totalPages }, (_, i) => i + 1);
	}

	const pages: (number | null)[] = [1];

	if (currentPage > 3) {
		pages.push(null);
	}

	const start = Math.max(2, currentPage - 1);
	const end = Math.min(totalPages - 1, currentPage + 1);

	for (let i = start; i <= end; i++) {
		pages.push(i);
	}

	if (currentPage < totalPages - 2) {
		pages.push(null);
	}

	pages.push(totalPages);

	return pages;
}
