-- Migration: Add GitHub repository topics storage

ALTER TABLE trending_repos
  ADD COLUMN topics_json TEXT NOT NULL DEFAULT '[]'
  CHECK (json_valid(topics_json));
