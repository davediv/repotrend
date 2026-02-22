/** Format a number with locale-appropriate separators (e.g. 12345 → "12,345"). */
export function formatNumber(n: number): string {
	return n.toLocaleString("en-US");
}

/** Validate that a string is a valid CSS hex color (#RGB or #RRGGBB). */
export function sanitizeHexColor(color: string | null): string | null {
	if (!color) return null;
	return /^#[0-9a-fA-F]{3,6}$/.test(color) ? color : null;
}
