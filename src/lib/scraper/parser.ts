import { parse, type HTMLElement } from "node-html-parser";

/** Parsed representation of a single trending repository. */
export interface ParsedRepo {
  repo_owner: string;
  repo_name: string;
  description: string | null;
  language: string | null;
  language_color: string | null;
  total_stars: number;
  forks: number;
  stars_today: number;
}

/**
 * Parses the GitHub trending page HTML and extracts all trending repositories.
 *
 * @param html - Raw HTML string from the GitHub trending page
 * @returns Array of parsed repository objects
 * @throws Error if the page structure is unrecognizable (no article rows found)
 */
export function parseTrendingPage(html: string): ParsedRepo[] {
  const root = parse(html);
  const articles = root.querySelectorAll("article.Box-row");

  if (articles.length === 0) {
    throw new Error(
      "Failed to parse trending page: no repository rows found. The page structure may have changed."
    );
  }

  return articles.map(parseArticle);
}

/**
 * Parses a single article element into a ParsedRepo.
 */
function parseArticle(article: HTMLElement): ParsedRepo {
  const { owner, name } = parseRepoName(article);

  return {
    repo_owner: owner,
    repo_name: name,
    description: parseDescription(article),
    language: parseLanguage(article),
    language_color: parseLanguageColor(article),
    total_stars: parseStars(article),
    forks: parseForks(article),
    stars_today: parseStarsToday(article),
  };
}

/**
 * Extracts the repo owner and name from the article heading link.
 * The link href has the format "/owner/name".
 */
function parseRepoName(article: HTMLElement): {
  owner: string;
  name: string;
} {
  const link = article.querySelector("h2 a");
  if (!link) {
    throw new Error("Failed to parse repo: missing heading link");
  }

  const href = link.getAttribute("href");
  if (!href) {
    throw new Error("Failed to parse repo: heading link has no href");
  }

  // href is like "/PowerShell/PowerShell"
  const parts = href.replace(/^\//, "").split("/");
  if (parts.length < 2) {
    throw new Error(`Failed to parse repo name from href: ${href}`);
  }

  return { owner: parts[0], name: parts[1] };
}

/**
 * Extracts the description text, or null if not present.
 */
function parseDescription(article: HTMLElement): string | null {
  const desc = article.querySelector("p.col-9");
  if (!desc) return null;
  const text = desc.text.trim();
  return text || null;
}

/**
 * Extracts the programming language name, or null if not present.
 */
function parseLanguage(article: HTMLElement): string | null {
  const lang = article.querySelector('[itemprop="programmingLanguage"]');
  if (!lang) return null;
  const text = lang.text.trim();
  return text || null;
}

/**
 * Extracts the language color hex code from the inline style, or null.
 */
function parseLanguageColor(article: HTMLElement): string | null {
  const dot = article.querySelector("span.repo-language-color");
  if (!dot) return null;
  const style = dot.getAttribute("style") ?? "";
  const match = style.match(/background-color:\s*(#[0-9a-fA-F]{3,6})/);
  return match ? match[1] : null;
}

/**
 * Extracts the total star count from the stargazers link.
 */
function parseStars(article: HTMLElement): number {
  const link = article.querySelector('a[href$="/stargazers"]');
  if (!link) return 0;
  return parseFormattedNumber(link.text);
}

/**
 * Extracts the fork count from the forks link.
 */
function parseForks(article: HTMLElement): number {
  const link = article.querySelector('a[href$="/forks"]');
  if (!link) return 0;
  return parseFormattedNumber(link.text);
}

/**
 * Extracts the "N stars today" count from the float-right span.
 */
function parseStarsToday(article: HTMLElement): number {
  const span = article.querySelector("span.float-sm-right");
  if (!span) return 0;
  const text = span.text.trim();
  // Text is like "13 stars today" or "1,234 stars today"
  const match = text.match(/([\d,.\w]+)\s+stars?\s+today/i);
  if (!match) return 0;
  return parseFormattedNumber(match[1]);
}

/**
 * Parses a formatted number string into an integer.
 * Handles formats like "1,234", "51,595", "1.2k", "3.5k", plain "123".
 */
export function parseFormattedNumber(raw: string): number {
  const text = raw.trim();

  // Handle "k" abbreviation (e.g., "1.2k" → 1200)
  const kMatch = text.match(/^([\d.]+)k$/i);
  if (kMatch) {
    return Math.round(parseFloat(kMatch[1]) * 1000);
  }

  // Remove commas and non-digit characters (except dots), then parse
  const cleaned = text.replace(/[^0-9.]/g, "");
  const parsed = parseInt(cleaned, 10);
  return isNaN(parsed) ? 0 : parsed;
}
