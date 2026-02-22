import { fetchTrendingPage, randomDelay } from "./fetcher";
import { parseTrendingPage } from "./parser";
import { persistRepos } from "./persistence";

export interface ScrapeResult {
  success: boolean;
  repoCount: number;
  rowsWritten: number;
  durationMs: number;
  date: string;
  error?: string;
}

/**
 * Orchestrates the full scrape pipeline: fetch → parse → persist.
 *
 * @param db - Cloudflare D1 database binding
 * @returns Structured result with success/failure details and metrics
 */
export async function runScrapePipeline(
  db: D1Database,
): Promise<ScrapeResult> {
  const start = Date.now();
  const date = new Date().toISOString().split("T")[0];

  try {
    await randomDelay();

    const html = await fetchTrendingPage();
    const repos = parseTrendingPage(html);
    const rowsWritten = await persistRepos(db, repos, date);

    const durationMs = Date.now() - start;

    console.log(
      JSON.stringify({
        level: "info",
        event: "scrape_success",
        date,
        repoCount: repos.length,
        rowsWritten,
        durationMs,
      }),
    );

    return {
      success: true,
      repoCount: repos.length,
      rowsWritten,
      durationMs,
      date,
    };
  } catch (error) {
    const durationMs = Date.now() - start;
    const message = error instanceof Error ? error.message : String(error);

    console.error(
      JSON.stringify({
        level: "error",
        event: "scrape_failure",
        date,
        durationMs,
        error: message,
      }),
    );

    return {
      success: false,
      repoCount: 0,
      rowsWritten: 0,
      durationMs,
      date,
      error: message,
    };
  }
}
