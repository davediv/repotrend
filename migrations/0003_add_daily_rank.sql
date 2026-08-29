-- Preserve the order returned by GitHub's daily Trending page.

ALTER TABLE trending_repos
  ADD COLUMN daily_rank INTEGER;

WITH ranked_repos AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY trending_date
      ORDER BY id ASC
    ) AS rank_for_day
  FROM trending_repos
)
UPDATE trending_repos
SET daily_rank = (
  SELECT rank_for_day
  FROM ranked_repos
  WHERE ranked_repos.id = trending_repos.id
);

CREATE INDEX IF NOT EXISTS idx_trending_repos_date_rank
  ON trending_repos (trending_date, daily_rank);
