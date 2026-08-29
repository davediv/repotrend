-- Maintain one latest metadata row per repository plus normalized topics for search.

CREATE TABLE IF NOT EXISTS repository_search (
  repo_owner TEXT NOT NULL,
  repo_name TEXT NOT NULL,
  description TEXT,
  language TEXT,
  language_color TEXT,
  total_stars INTEGER NOT NULL DEFAULT 0,
  forks INTEGER NOT NULL DEFAULT 0,
  stars_today INTEGER NOT NULL DEFAULT 0,
  topics_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(topics_json)),
  latest_date TEXT NOT NULL,
  PRIMARY KEY (repo_owner, repo_name)
);

CREATE INDEX IF NOT EXISTS idx_repository_search_language
  ON repository_search (language COLLATE NOCASE);

CREATE INDEX IF NOT EXISTS idx_repository_search_latest_date
  ON repository_search (latest_date DESC);

CREATE TABLE IF NOT EXISTS repository_topics (
  repo_owner TEXT NOT NULL,
  repo_name TEXT NOT NULL,
  topic TEXT NOT NULL,
  PRIMARY KEY (repo_owner, repo_name, topic)
);

CREATE INDEX IF NOT EXISTS idx_repository_topics_topic
  ON repository_topics (topic COLLATE NOCASE, repo_owner, repo_name);

INSERT OR REPLACE INTO repository_search (
  repo_owner,
  repo_name,
  description,
  language,
  language_color,
  total_stars,
  forks,
  stars_today,
  topics_json,
  latest_date
)
SELECT
  repo_owner,
  repo_name,
  description,
  language,
  language_color,
  total_stars,
  forks,
  stars_today,
  topics_json,
  trending_date
FROM (
  SELECT
    trending_repos.*,
    ROW_NUMBER() OVER (
      PARTITION BY repo_owner, repo_name
      ORDER BY trending_date DESC, id DESC
    ) AS latest_rank
  FROM trending_repos
)
WHERE latest_rank = 1;

INSERT OR IGNORE INTO repository_topics (repo_owner, repo_name, topic)
SELECT
  search.repo_owner,
  search.repo_name,
  CAST(topic.value AS TEXT)
FROM repository_search AS search
INNER JOIN trending_repos AS snapshot
  ON snapshot.repo_owner = search.repo_owner
  AND snapshot.repo_name = search.repo_name
  AND snapshot.trending_date = search.latest_date
CROSS JOIN json_each(snapshot.topics_json) AS topic
WHERE topic.type = 'text';

CREATE TRIGGER IF NOT EXISTS trg_trending_repos_search_insert
AFTER INSERT ON trending_repos
BEGIN
  INSERT INTO repository_search (
    repo_owner,
    repo_name,
    description,
    language,
    language_color,
    total_stars,
    forks,
    stars_today,
    topics_json,
    latest_date
  ) VALUES (
    NEW.repo_owner,
    NEW.repo_name,
    NEW.description,
    NEW.language,
    NEW.language_color,
    NEW.total_stars,
    NEW.forks,
    NEW.stars_today,
    NEW.topics_json,
    NEW.trending_date
  )
  ON CONFLICT (repo_owner, repo_name) DO UPDATE SET
    description = excluded.description,
    language = excluded.language,
    language_color = excluded.language_color,
    total_stars = excluded.total_stars,
    forks = excluded.forks,
    stars_today = excluded.stars_today,
    topics_json = excluded.topics_json,
    latest_date = excluded.latest_date
  WHERE excluded.latest_date >= repository_search.latest_date;

  DELETE FROM repository_topics
  WHERE repo_owner = NEW.repo_owner
    AND repo_name = NEW.repo_name
    AND NEW.trending_date >= (
      SELECT latest_date
      FROM repository_search
      WHERE repo_owner = NEW.repo_owner AND repo_name = NEW.repo_name
    );

  INSERT OR IGNORE INTO repository_topics (repo_owner, repo_name, topic)
  SELECT NEW.repo_owner, NEW.repo_name, CAST(topic.value AS TEXT)
  FROM json_each(NEW.topics_json) AS topic
  WHERE topic.type = 'text'
    AND NEW.trending_date >= (
      SELECT latest_date
      FROM repository_search
      WHERE repo_owner = NEW.repo_owner AND repo_name = NEW.repo_name
    );
END;

CREATE TRIGGER IF NOT EXISTS trg_trending_repos_search_update
AFTER UPDATE OF description, language, language_color, total_stars, forks, stars_today, topics_json, trending_date
ON trending_repos
BEGIN
  INSERT INTO repository_search (
    repo_owner,
    repo_name,
    description,
    language,
    language_color,
    total_stars,
    forks,
    stars_today,
    topics_json,
    latest_date
  ) VALUES (
    NEW.repo_owner,
    NEW.repo_name,
    NEW.description,
    NEW.language,
    NEW.language_color,
    NEW.total_stars,
    NEW.forks,
    NEW.stars_today,
    NEW.topics_json,
    NEW.trending_date
  )
  ON CONFLICT (repo_owner, repo_name) DO UPDATE SET
    description = excluded.description,
    language = excluded.language,
    language_color = excluded.language_color,
    total_stars = excluded.total_stars,
    forks = excluded.forks,
    stars_today = excluded.stars_today,
    topics_json = excluded.topics_json,
    latest_date = excluded.latest_date
  WHERE excluded.latest_date >= repository_search.latest_date;

  DELETE FROM repository_topics
  WHERE repo_owner = NEW.repo_owner
    AND repo_name = NEW.repo_name
    AND NEW.trending_date >= (
      SELECT latest_date
      FROM repository_search
      WHERE repo_owner = NEW.repo_owner AND repo_name = NEW.repo_name
    );

  INSERT OR IGNORE INTO repository_topics (repo_owner, repo_name, topic)
  SELECT NEW.repo_owner, NEW.repo_name, CAST(topic.value AS TEXT)
  FROM json_each(NEW.topics_json) AS topic
  WHERE topic.type = 'text'
    AND NEW.trending_date >= (
      SELECT latest_date
      FROM repository_search
      WHERE repo_owner = NEW.repo_owner AND repo_name = NEW.repo_name
    );
END;

CREATE TRIGGER IF NOT EXISTS trg_trending_repos_search_delete
AFTER DELETE ON trending_repos
WHEN NOT EXISTS (
  SELECT 1
  FROM trending_repos
  WHERE repo_owner = OLD.repo_owner AND repo_name = OLD.repo_name
)
BEGIN
  DELETE FROM repository_topics
  WHERE repo_owner = OLD.repo_owner AND repo_name = OLD.repo_name;

  DELETE FROM repository_search
  WHERE repo_owner = OLD.repo_owner AND repo_name = OLD.repo_name;
END;
