/** Logs a structured JSON error to stderr. */
export function logError(event: string, extra?: Record<string, unknown>) {
	return (error: unknown) => {
		const message = error instanceof Error ? error.message : String(error);
		console.error(
			JSON.stringify({
				level: "error",
				event,
				timestamp: new Date().toISOString(),
				error: message,
				...extra,
			}),
		);
	};
}
