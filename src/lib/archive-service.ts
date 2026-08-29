import {
	buildComparisonRows,
	comparisonCounts,
	type ComparisonCounts,
	type ComparisonRow,
} from "./comparison";
import {
	type DailyArchiveData,
	type DailyArchiveSelection,
	resolveDailyArchiveSelection,
} from "./daily-archive";
import { getMondayOfWeek, getSundayOfWeek, isValidDate, todayUTC } from "./dates";
import { logError, logInfo } from "./log";
import {
	getDateRepoCounts,
	getLanguageDistribution,
	getTrendingRepos,
	getWeeklyLanguageDistribution,
	getWeeklyTrendingRepos,
	type DateRepoCount,
	type LanguageDistribution,
	type TrendingRepo,
	type WeeklyTrendingResponse,
} from "./trending";

const LIVE_CACHE_TTL_SECONDS = 3600;
const INDEX_CACHE_TTL_SECONDS = 300;

const DAILY_REPOS_CACHE_VERSION = "v2";
const ARCHIVE_INDEX_CACHE_VERSION = "v1";

export interface ArchiveBindings {
	DB: D1Database;
	CACHE?: KVNamespace;
}

export interface ArchiveIndexData {
	snapshots: DateRepoCount[];
	dates: string[];
	earliest: string | null;
	latest: string | null;
}

export interface WeeklyArchiveData extends WeeklyTrendingResponse {
	languages: LanguageDistribution[];
	dateCounts: DateRepoCount[];
}

export interface ArchiveComparisonData {
	date1: string;
	date2: string;
	dateCounts: DateRepoCount[];
	date1Repos: TrendingRepo[];
	date2Repos: TrendingRepo[];
	rows: ComparisonRow[];
	counts: ComparisonCounts;
	common: TrendingRepo[];
	onlyDate1: TrendingRepo[];
	onlyDate2: TrendingRepo[];
}

export type ArchiveValidationCode =
	| "invalid_date"
	| "future_date"
	| "missing_comparison_dates"
	| "same_comparison_date"
	| "comparison_order"
	| "insufficient_snapshots"
	| "snapshot_not_found";

/** A user-correctable archive request problem shared by pages and JSON endpoints. */
export class ArchiveValidationError extends Error {
	readonly code: ArchiveValidationCode;
	readonly status: 400 | 404;

	constructor(message: string, code: ArchiveValidationCode, status: 400 | 404 = 400) {
		super(message);
		this.name = "ArchiveValidationError";
		this.code = code;
		this.status = status;
	}
}

interface CacheOptions<T> {
	key: string;
	load: () => Promise<T>;
	shouldCache: (value: T) => boolean;
	expirationTtl?: number;
	context?: Record<string, unknown>;
}

/** Browser/CDN cache policy for a daily archive resource. */
export function dailyArchiveCacheControl(date: string, today = todayUTC()): string {
	return date === today
		? "public, max-age=300, s-maxage=300"
		: "public, max-age=86400, s-maxage=86400, immutable";
}

/** Browser/CDN cache policy for a canonical Monday–Sunday archive resource. */
export function weeklyArchiveCacheControl(weekStart: string, today = todayUTC()): string {
	const weekEnd = getSundayOfWeek(weekStart);
	return weekStart <= today && today <= weekEnd
		? "public, max-age=300, s-maxage=300"
		: "public, max-age=86400, s-maxage=86400, immutable";
}

/** Browser/CDN cache policy for a pair of daily snapshots. */
export function comparisonArchiveCacheControl(
	date1: string,
	date2: string,
	today = todayUTC(),
): string {
	return date1 === today || date2 === today
		? "public, max-age=300, s-maxage=300"
		: "public, max-age=86400, s-maxage=86400, immutable";
}

/**
 * Single archive-domain gateway for SSR pages and public endpoints.
 *
 * Raw query helpers remain persistence primitives; consumers use this service so
 * validation, cache keys, freshness policy, and assembled view models cannot drift.
 */
export class ArchiveService {
	private readonly today: string;

	constructor(
		private readonly bindings: ArchiveBindings,
		options: { today?: string } = {},
	) {
		this.today = options.today ?? todayUTC();
	}

	validateDate(value: string | undefined, label = "Date"): string {
		if (!value || !isValidDate(value)) {
			throw new ArchiveValidationError("Invalid date format. Expected YYYY-MM-DD.", "invalid_date");
		}
		if (value > this.today) {
			throw new ArchiveValidationError(`${label} cannot be in the future.`, "future_date");
		}
		return value;
	}

	validateComparisonDates(
		date1: string | undefined,
		date2: string | undefined,
	): {
		date1: string;
		date2: string;
	} {
		if (!date1 || !date2) {
			throw new ArchiveValidationError(
				"Both date1 and date2 query parameters are required in YYYY-MM-DD format.",
				"missing_comparison_dates",
			);
		}
		if (!isValidDate(date1) || !isValidDate(date2)) {
			throw new ArchiveValidationError(
				"Both date1 and date2 query parameters are required in YYYY-MM-DD format.",
				"invalid_date",
			);
		}
		this.validateDate(date1, "date1");
		this.validateDate(date2, "date2");
		if (date1 === date2) {
			throw new ArchiveValidationError(
				"date1 and date2 must be different dates.",
				"same_comparison_date",
			);
		}
		if (date1 > date2) {
			throw new ArchiveValidationError("date1 must be earlier than date2.", "comparison_order");
		}
		return { date1, date2 };
	}

	async getArchiveIndex(): Promise<ArchiveIndexData> {
		return this.cached({
			key: `archive:index:${ARCHIVE_INDEX_CACHE_VERSION}`,
			expirationTtl: INDEX_CACHE_TTL_SECONDS,
			shouldCache: ({ snapshots }) => snapshots.length > 0,
			load: async () => {
				const snapshots = await getDateRepoCounts(this.bindings.DB);
				const dates = snapshots.map(({ date }) => date);
				return {
					snapshots,
					dates,
					earliest: dates[0] ?? null,
					latest: dates[dates.length - 1] ?? null,
				};
			},
		});
	}

	async getDailyRepos(rawDate: string): Promise<TrendingRepo[]> {
		const date = this.validateDate(rawDate);
		const isLive = date === this.today;
		return this.cached({
			key: `trending:daily:${DAILY_REPOS_CACHE_VERSION}:${date}`,
			expirationTtl: isLive ? LIVE_CACHE_TTL_SECONDS : undefined,
			shouldCache: (repos) => repos.length > 0,
			context: { date, resource: "daily_repositories" },
			load: () => getTrendingRepos(this.bindings.DB, date),
		});
	}

	async getDailyLanguages(rawDate: string): Promise<LanguageDistribution[]> {
		const date = this.validateDate(rawDate);
		const isLive = date === this.today;
		return this.cached({
			key: `languages:${date}`,
			expirationTtl: isLive ? LIVE_CACHE_TTL_SECONDS : undefined,
			shouldCache: (languages) => languages.length > 0,
			context: { date, resource: "daily_languages" },
			load: () => getLanguageDistribution(this.bindings.DB, date),
		});
	}

	async getDailyArchive(selection: DailyArchiveSelection): Promise<DailyArchiveData> {
		if (selection.mode === "latest") {
			this.validateDate(selection.throughDate);
		} else {
			this.validateDate(selection.date);
		}

		const { snapshots } = await this.getArchiveIndex();
		const resolved = resolveDailyArchiveSelection(snapshots, selection);

		if (!resolved.snapshot) {
			return { ...resolved, repos: [], languages: [], dateCounts: snapshots };
		}

		const [repos, languages] = await Promise.all([
			this.getDailyRepos(resolved.selectedDate),
			this.getDailyLanguages(resolved.selectedDate),
		]);

		return { ...resolved, repos, languages, dateCounts: snapshots };
	}

	async getWeeklySnapshot(rawDate: string): Promise<WeeklyTrendingResponse> {
		const date = this.validateDate(rawDate);
		const weekStart = getMondayOfWeek(date);
		const weekEnd = getSundayOfWeek(weekStart);
		const isCurrentWeek = weekStart <= this.today && this.today <= weekEnd;

		return this.cached({
			key: `trending:week:${weekStart}`,
			expirationTtl: isCurrentWeek ? LIVE_CACHE_TTL_SECONDS : undefined,
			shouldCache: ({ repos }) => repos.length > 0,
			context: { weekStart, resource: "weekly_repositories" },
			load: async () => {
				const result = await getWeeklyTrendingRepos(this.bindings.DB, weekStart, weekEnd);
				return {
					week_start: weekStart,
					week_end: weekEnd,
					partial: weekEnd > this.today || result.daysWithData < 7,
					repos: result.repos,
				};
			},
		});
	}

	async getWeeklyLanguages(rawDate: string): Promise<LanguageDistribution[]> {
		const date = this.validateDate(rawDate);
		const weekStart = getMondayOfWeek(date);
		const weekEnd = getSundayOfWeek(weekStart);
		const isCurrentWeek = weekStart <= this.today && this.today <= weekEnd;

		return this.cached({
			key: `languages:week:${weekStart}`,
			expirationTtl: isCurrentWeek ? LIVE_CACHE_TTL_SECONDS : undefined,
			shouldCache: (languages) => languages.length > 0,
			context: { weekStart, resource: "weekly_languages" },
			load: () => getWeeklyLanguageDistribution(this.bindings.DB, weekStart, weekEnd),
		});
	}

	async getWeeklyArchive(rawDate: string): Promise<WeeklyArchiveData> {
		const date = this.validateDate(rawDate);
		const [snapshot, languages, archiveIndex] = await Promise.all([
			this.getWeeklySnapshot(date),
			this.getWeeklyLanguages(date),
			this.getArchiveIndex(),
		]);
		return { ...snapshot, languages, dateCounts: archiveIndex.snapshots };
	}

	async getComparison(
		rawDate1: string | undefined,
		rawDate2: string | undefined,
		archiveIndex?: ArchiveIndexData,
	): Promise<ArchiveComparisonData> {
		const { date1, date2 } = this.validateComparisonDates(rawDate1, rawDate2);
		const index = archiveIndex ?? (await this.getArchiveIndex());

		if (index.dates.length < 2) {
			throw new ArchiveValidationError(
				"At least two captured snapshots are needed before dates can be compared.",
				"insufficient_snapshots",
				404,
			);
		}
		if (!index.dates.includes(date1) || !index.dates.includes(date2)) {
			throw new ArchiveValidationError(
				"Both dates must have a captured GitHub Trending snapshot.",
				"snapshot_not_found",
				404,
			);
		}

		const [date1Repos, date2Repos] = await Promise.all([
			this.getDailyRepos(date1),
			this.getDailyRepos(date2),
		]);
		const rows = buildComparisonRows(date1Repos, date2Repos);

		return {
			date1,
			date2,
			dateCounts: index.snapshots,
			date1Repos,
			date2Repos,
			rows,
			counts: comparisonCounts(rows),
			common: rows.flatMap((row) =>
				row.status === "both" && row.first ? [row.first.repository] : [],
			),
			onlyDate1: rows.flatMap((row) =>
				row.status === "removed" && row.first ? [row.first.repository] : [],
			),
			onlyDate2: rows.flatMap((row) =>
				row.status === "added" && row.second ? [row.second.repository] : [],
			),
		};
	}

	private async cached<T>({
		key,
		load,
		shouldCache,
		expirationTtl,
		context = {},
	}: CacheOptions<T>): Promise<T> {
		const kv = this.bindings.CACHE;
		if (kv) {
			try {
				const cached = await kv.get(key);
				if (cached !== null) {
					try {
						const value = JSON.parse(cached) as T;
						logInfo("archive_cache_hit", { ...context, cacheKey: key });
						return value;
					} catch (error) {
						logError("archive_cache_parse_error", { ...context, cacheKey: key })(error);
					}
				}
				logInfo("archive_cache_miss", { ...context, cacheKey: key });
			} catch (error) {
				logError("archive_cache_get_error", { ...context, cacheKey: key })(error);
			}
		}

		const value = await load();
		if (kv && shouldCache(value)) {
			try {
				await kv.put(key, JSON.stringify(value), expirationTtl ? { expirationTtl } : undefined);
			} catch (error) {
				logError("archive_cache_put_error", { ...context, cacheKey: key })(error);
			}
		}

		return value;
	}
}

export function createArchiveService(
	bindings: ArchiveBindings,
	options?: { today?: string },
): ArchiveService {
	return new ArchiveService(bindings, options);
}
