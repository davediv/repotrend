-- Migration: Create trending_repos table and indexes

CREATE TABLE IF NOT EXISTS trending_repos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  repo_owner TEXT NOT NULL,
  repo_name TEXT NOT NULL,
  description TEXT,
  language TEXT,
  language_color TEXT,
  total_stars INTEGER NOT NULL DEFAULT 0,
  forks INTEGER NOT NULL DEFAULT 0,
  stars_today INTEGER NOT NULL DEFAULT 0,
  trending_date TEXT NOT NULL,
  scraped_at TEXT NOT NULL,
  CONSTRAINT unique_trending_repo_per_day UNIQUE (repo_owner, repo_name, trending_date)
);

CREATE INDEX IF NOT EXISTS idx_trending_repos_trending_date
  ON trending_repos (trending_date);

CREATE INDEX IF NOT EXISTS idx_trending_repos_owner_name
  ON trending_repos (repo_owner, repo_name);

