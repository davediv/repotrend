/** Logs a structured JSON error to stderr. */
export function logError(event: string, extra?: Record<string, unknown>) {
	return (error: unknown) => {
		const message = error instanceof Error ? error.message : String(error);
		console.error(
			JSON.stringify({
				...extra,
				level: "error",
				event,
				timestamp: new Date().toISOString(),
				error: message,
			}),
		);
	};
}

/** Logs a structured JSON warning to stderr. Used for operational events that need attention but aren't exceptions. */
export function logWarn(event: string, extra?: Record<string, unknown>): void {
	console.warn(
		JSON.stringify({
			...extra,
			level: "warn",
			event,
			timestamp: new Date().toISOString(),
		}),
	);
}

/** Logs a structured JSON info message to stdout. */
export function logInfo(event: string, extra?: Record<string, unknown>): void {
	console.log(
		JSON.stringify({
			...extra,
			level: "info",
			event,
			timestamp: new Date().toISOString(),
		}),
	);
}
