/** Format a number with locale-appropriate separators (e.g. 12345 → "12,345"). */
export function formatNumber(n: number): string {
	return n.toLocaleString("en-US");
}

/** Validate that a string is a valid CSS hex color (#RGB or #RRGGBB). */
export function sanitizeHexColor(color: string | null): string | null {
	if (!color) return null;
	return /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(color) ? color : null;
}

/** Escape HTML special characters to prevent XSS in dynamically rendered HTML. */
export function escapeHTML(str: string): string {
	return str
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}
